// ── Bot helpers: shared utilities extracted from index.ts ──

import https from "https";
import { PrismaClient } from "@prisma/client";
import { textToSpeech } from "../services/ttsService";
import { NotebookLMBridge } from "../services/notebooklmBridge";

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
