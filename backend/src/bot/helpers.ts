// ── Bot helpers: shared utilities extracted from index.ts ──

import https from "https";
import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { textToSpeech } from "../services/ttsService";
import { NotebookLMBridge } from "../services/notebooklmBridge";
import { BotContext } from "./types";
import { findTreeByChat } from "./treeResolver";

// ── Background job: fire-and-forget with error propagation ──────────────
// Replaces setTimeout(() => { (async () => { try {...} catch{...} })(); }, 0)
// with proper error logging + optional user-facing fallback message.
//
// Usage:
//   backgroundJob(bot, chatId, async () => { ... work ... }, "❌ Falló, intentá de nuevo");
//
// For delayed execution, pass delayMs > 0 (replaces setTimeout with delay).

export function backgroundJob(
  bot: Bot<BotContext>,
  chatId: number | string | undefined,
  job: () => Promise<void>,
  fallbackMsg?: string,
  delayMs = 0,
): void {
  const run = () => {
    job().catch((err: any) => {
      console.error("[background] Job failed:", err?.stack || err?.message || err);
      if (fallbackMsg && chatId !== undefined) {
        bot.api.sendMessage(chatId, fallbackMsg).catch(() => {});
      }
    });
  };

  if (delayMs > 0) {
    setTimeout(run, delayMs).unref?.();
  } else {
    process.nextTick(run);
  }
}

// ── NotebookLM Bridge singleton for bot commands ──────────────
let _notebooklmBridge: NotebookLMBridge | null = null;

export async function getBotNotebookLMBridge(): Promise<NotebookLMBridge> {
  if (!_notebooklmBridge) {
    _notebooklmBridge = new NotebookLMBridge();
  }
  return _notebooklmBridge;
}

// ── IPv4 fetch wrapper: undici (Node fetch) no respeta dns.setDefaultResultOrder ──
// para api.telegram.org. Usamos https.get con family:4 como fallback.
export function httpsDownload(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

// ── TTS: generate voice buffer for a text response ──────────────────────

export async function generateVoice(text: string, lang?: string): Promise<Buffer | null> {
  try {
    return await textToSpeech(text, lang);
  } catch (err: any) {
    console.warn("[TTS] Voice generation failed:", err.message);
    return null; // non-blocking — text still gets sent
  }
}

/** Resolve user language for TTS voice selection. Returns null if not found. */
export async function getUserLanguage(prisma: PrismaClient, telegramId: number): Promise<string | undefined> {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(telegramId) },
      select: { language: true },
    });
    return user?.language ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Simple keyword extraction for onboarding ───────────────────────────

export function extractSimpleKeywords(text: string): string[] {
  const commonKeywords: Record<string, string[]> = {
    agricultura: ['agricultura', 'cultivo', 'campo', 'siembra', 'cosecha'],
    tecnologia: ['software', 'tech', 'app', 'web', 'datos', 'ia'],
    salud: ['salud', 'médico', 'clínica', 'paciente'],
    educacion: ['educación', 'escuela', 'curso', 'enseñar'],
    musica: ['música', 'banda', 'componer', 'tocar'],
    comercio: ['vender', 'venta', 'comercio', 'tienda'],
    construccion: ['construir', 'obra', 'edificar'],
    comida: ['comida', 'restaurante', 'cocina', 'alimento'],
    arte: ['arte', 'diseño', 'dibujo', 'pintar'],
    comunidad: ['vecinos', 'comunidad', 'barrio', 'junta'],
  };

  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(commonKeywords)) {
    if (keywords.some(k => lower.includes(k))) {
      found.push(category);
    }
  }
  return found;
}

// ── Message counter per tree: track intro message for new member welcomes ──
export const treeMessageCounter = new Map<string, number>();

// T3: Parent tree selector state — maps "psel:<idx>" → {childId, parentId}
export const parentTreeSelectors = new Map<string, Map<string, string>>();

/** Resuelve el idioma desde el Tree (usado en grupo en vez de resolveUserLanguage). */
export async function resolveTreeLanguage(prisma: PrismaClient, treeId: string): Promise<string | null> {
  try {
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { language: true },
    });
    return tree?.language ?? null;
  } catch {
    return null;
  }
}

// RG5: Compute tree depth by walking parentTreeId chain (root = depth 0)
export async function getTreeDepth(prisma: PrismaClient, treeId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = treeId;
  while (currentId) {
    const tree = await (prisma as any).tree.findUnique({
      where: { id: currentId },
      select: { parentTreeId: true },
    });
    if (!tree?.parentTreeId) break;
    currentId = tree.parentTreeId;
    depth++;
  }
  return depth;
}

export async function trackBotMessage(
  prisma: PrismaClient,
  treeId: string,
  messageId: number
): Promise<void> {
  const count = (treeMessageCounter.get(treeId) ?? 0) + 1;
  treeMessageCounter.set(treeId, count);

  if (count === 2 || count === 3) {
    try {
      await (prisma as any).tree.update({
        where: { id: treeId },
        data: { introMessageId: BigInt(messageId) },
      });
      console.log(
        `[Telegram Bot] Intro message #${count} saved for tree ${treeId}: msg_id=${messageId}`
      );
    } catch (err: any) {
      console.warn(
        `[Telegram Bot] Failed to save introMessageId for tree ${treeId}:`,
        err.message
      );
    }
  }
}

// ── Admin check helper: verifies group context → tree → user → ADMIN role ──
// Returns {tree, user} if the caller is an admin of the tree linked to the chat.
// Returns null if any check fails — the user has already been replied with an error.

export async function requireTreeAdmin(
  prisma: PrismaClient,
  ctx: BotContext
): Promise<{ tree: any; user: any } | null> {
  // 1. Group-only guard
  const chatType = ctx.chat?.type;
  if (chatType !== "group" && chatType !== "supergroup") {
    await ctx.reply("⚠️ Este comando solo funciona en grupos.");
    return null;
  }

  const chatId = ctx.chat?.id.toString();
  if (!chatId) return null;

  // 2. Tree lookup
  const tree = await findTreeByChat(prisma, chatId);
  if (!tree) {
    await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
    return null;
  }

  // 3. User lookup by Telegram ID
  const tgUser = ctx.from;
  if (!tgUser) return null;
  const user = await (prisma as any).user.findUnique({
    where: { telegramUserId: BigInt(tgUser.id) },
    select: { id: true },
  });
  if (!user) {
    await ctx.reply("⚠️ No tienes una cuenta vinculada.");
    return null;
  }

  // 4. Admin membership check
  const adminMember = await (prisma as any).treeMember.findFirst({
    where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
  });
  if (!adminMember) {
    await ctx.reply("⚠️ Solo el admin del árbol puede usar este comando.");
    return null;
  }

  return { tree, user };
}
