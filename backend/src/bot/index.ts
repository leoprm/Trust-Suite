import https from "https";
import { spawn } from "child_process";
import { promises as fsPromises } from "fs";
import { Bot, session, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext, BotSessionData } from "./types";
import { handleMessage, extractCommandText } from "./commands";
import { handleNaturalMessage, showLanguageSelector, handleLanguageCallback, resolveUserLanguage } from "./messages";
import { handleDM, handleProfileCallback } from "./dm";
import { analyzeMessage } from "./analyzer";
import { registerReactionHandler, handleNeedPollAnswer } from "./voting";
import { findTreeByChat } from "./treeResolver";
import {
  sendSatisfactionPoll,
  handleSatisfactionPollAnswer,
  handleSatisfactionCommentReply,
} from "./satisfaction";
import { recoverPendingApprovals } from "./approval";
import { checkPaymentAccess } from "./payment";
import { checkRateLimit } from "./rateLimiter";
import { initPaymentService, computePaymentObligations, formatPagarResult } from "../services/telegramBotService";
import { formatForChannel, sendViaTelegram } from "./channelAdapter";
import { textToSpeech } from "../services/ttsService";
import { TreeSandbox } from "../services/treeSandbox";
import { initI18n, t } from "./i18n";
import { routeToHermes, shouldAriRespond } from "./hermesBridge";
import { parseDeadline } from "./deadlineParser";
import { checkTodoReminders } from "./todoReminders";
import { detectNaturalAddIntent } from "./todoNaturalAdd";
import { NotebookLMBridge } from "../services/notebooklmBridge";

// ── NotebookLM Bridge singleton for bot commands ──────────────
let _notebooklmBridge: NotebookLMBridge | null = null;

async function getBotNotebookLMBridge(): Promise<NotebookLMBridge> {
  if (!_notebooklmBridge) {
    _notebooklmBridge = new NotebookLMBridge();
  }
  return _notebooklmBridge;
}

import {
  handleTrabajar,
  handlePerfil,
  handleTareas,
  handleWorkerCallback,
  handleWorkerTextContinuation,
  workerHelpMessage,
} from "./worker";
import { summarizeTodo } from "./formatters";
import { checkMemberLimit, shouldRejectInvite, isTreeBlocked } from "./antiDdos";
import { syncAllMembers } from "./telegramClient";
import { appendToDailyLog } from "../lib/dailyLog";

// ── IPv4 fetch wrapper: undici (Node fetch) no respeta dns.setDefaultResultOrder ──
// para api.telegram.org. Usamos https.get con family:4 como fallback.
function httpsDownload(url: string): Promise<Buffer> {
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

async function generateVoice(text: string, lang?: string): Promise<Buffer | null> {
  try {
    return await textToSpeech(text, lang);
  } catch (err: any) {
    console.warn("[TTS] Voice generation failed:", err.message);
    return null; // non-blocking — text still gets sent
  }
}

/** Resolve user language for TTS voice selection. Returns null if not found. */
async function getUserLanguage(prisma: PrismaClient, telegramId: number): Promise<string | undefined> {
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

function extractSimpleKeywords(text: string): string[] {
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
const treeMessageCounter = new Map<string, number>();

// T3: Parent tree selector state — maps "psel:<idx>" → {childId, parentId}
const parentTreeSelectors = new Map<string, Map<string, string>>();

async function trackBotMessage(
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

export async function createBot(prisma: PrismaClient): Promise<Bot<BotContext> | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";

  if (!token) {
    console.warn(
      "[Telegram Bot] TELEGRAM_BOT_TOKEN no configurado — el bot no se iniciará."
    );
    return null;
  }

  const bot = new Bot<BotContext>(token);

  // ── Session middleware ──────────────────────────────────────────────────
  bot.use(
    session({
      initial(): BotSessionData {
        return { userId: null, authenticatedAt: null, awaitingEvidenceTaskId: null, awaitingEvidenceBotMsgId: null, onboardingStep: null, onboardingTreeId: null, dmTreeId: null, awaitingLinkFile: null, awaitingLinkTreeId: null };
      },
    })
  );

  // ── Comandos ───────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const lang = await resolveUserLanguage(prisma, ctx);
    if (!lang) {
      // No language set → show language selector first
      await showLanguageSelector(ctx);
      return;
    }
    await ctx.reply(t("common.welcome", lang) + "\n\n" + t("common.welcome_detail", lang));
  });

  bot.command("language", async (ctx) => {
    await showLanguageSelector(ctx);
  });

  bot.command("help", async (ctx) => {
      await ctx.reply(
        "Comandos disponibles:\n" +
          "/start — Iniciar el bot\n" +
          "/login — Vincular tu cuenta de Trust Maker\n" +
          "/cuota — Ver tu cuota mensual\n" +
          "/pagar — Ver pagos pendientes\n" +
          "/trabajar — Registrarte como trabajador\n" +
          "/perfil — Editar tu perfil de trabajador\n" +
          "/tareas — Ver tareas disponibles\n" +
          "/ask <pregunta> — Preguntar al NotebookLM del árbol\n" +
          "/podcast — Generar podcast del árbol\n" +
          "/help — Mostrar esta ayuda\n\n" +
          "En grupos, menciona @TrustMakerBot:\n" +
          "  @TrustMakerBot /info\n" +
          "  @TrustMakerBot /lista necesidades\n" +
          "  @TrustMakerBot /crea necesidad \"título\" — descripción\n" +
          "  @TrustMakerBot /ideas para \"título\"\n" +
          "  @TrustMakerBot /vota <id>\n\n" +
          "También puedes conversar naturalmente mencionando al bot."
      );
  });

  // ── /cuota: mostrar cuota mensual ──────────────────────────────────────
  bot.command("cuota", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.reply("⚠️ No se pudo identificar tu cuenta de Telegram.");
      return;
    }

    const telegramId = BigInt(tgUser.id);
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: telegramId },
      select: { id: true },
    });

    if (!user) {
      await ctx.reply(
        "⚠️ No tienes una cuenta vinculada. Usa /start para vincularte a Trust Maker."
      );
      return;
    }

    const memberships = await (prisma as any).treeMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: {
        tree: { select: { name: true, icono: true } },
      },
    });

    if (memberships.length === 0) {
      await ctx.reply("🌳 No eres miembro activo de ningún árbol.");
      return;
    }

    const lines: string[] = ["💰 *Tu cuota mensual*:\n"];
    for (const m of memberships) {
      const fee = m.monthlyFee ?? 0;
      const icono = m.tree.icono ?? "🌳";
      const statusEmoji: Record<string, string> = {
        GRACE: "🆕",
        ACTIVE: "✅",
        DELINQUENT: "⚠️",
        BLOCKED: "🚫",
      };
      const emoji = statusEmoji[m.paymentStatus] ?? "❓";
      lines.push(
        `${icono} *${m.tree.name}*: ${fee} CLP/mes ${emoji}`
      );
    }
    lines.push("", "Usa /pagar para ver cómo pagar.");

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  // ── /pagar: mostrar info de pago (centralizado + individual) ──────────
  bot.command("pagar", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.reply(t("common:not_identified", "es"));
      return;
    }

    // Resolve user language for i18n
    const lng = await resolveUserLanguage(prisma, ctx) ?? "es";

    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });

    if (!user) {
      await ctx.reply(
        lng === "en"
          ? "⚠️ No account linked. Use /start to link your Trust Maker account."
          : "⚠️ No tienes una cuenta vinculada. Usa /start para vincularte a Trust Maker.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const result = await computePaymentObligations(tgUser.id);
    if (!result) {
      await ctx.reply(
        "⚠️ Error al calcular tus obligaciones de pago. Intenta más tarde.",
      );
      return;
    }

    const message = formatPagarResult(result, lng);
    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  // ── /pause: admin only — pause tree agent ─────────────────────────────
  bot.command("pause", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔕 /pause solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /pause.");
      return;
    }

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { paused: true },
    });
    await ctx.reply("🔕 Ari está en pausa. Solo admin puede reactivarla con /unpause");
  });

  // ── /unpause: admin only — unpause tree agent ─────────────────────────
  bot.command("unpause", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔔 /unpause solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /unpause.");
      return;
    }

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { paused: false },
    });
    await ctx.reply("🔔 Ari está de vuelta.");
  });

  // ── /reset: admin only — reset agent message queue and state ─────────
  bot.command("reset", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔄 /reset solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /reset.");
      return;
    }

    // Reset AI member states to IDLE (clear message queue)
    await (prisma as any).treeMember.updateMany({
      where: { treeId: tree.id, isAI: true },
      data: { aiStatus: "IDLE" },
    });
    await ctx.reply("🔄 Cola limpiada. Ari está lista.");
  });

  // ── /modo: admin only — change interactionMode ────────────────────────
  bot.command("modo", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("⚙️ /modo solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /modo.");
      return;
    }

    // Parse mode argument
    const raw = ctx.message?.text?.split(/\s+/, 2)[1]?.trim().toLowerCase();
    const modeMap: Record<string, string> = {
      máxima: "MAXIMUM", maxima: "MAXIMUM", maximum: "MAXIMUM",
      media: "MEDIUM", medium: "MEDIUM",
      mínima: "MINIMUM", minima: "MINIMUM", minimum: "MINIMUM",
    };
    const mode = raw ? modeMap[raw] : undefined;

    if (!mode) {
      await ctx.reply(
        "⚙️ Modos disponibles:\n" +
        "• máxima / maximum — Ari interviene siempre\n" +
        "• media / medium — Ari interviene a veces\n" +
        "• mínima / minimum — Ari solo si la mencionan"
      );
      return;
    }

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { interactionMode: mode },
    });
    const label = raw === "maxima" ? "máxima" : raw === "minima" ? "mínima" : raw;
    await ctx.reply(`⚙️ Modo cambiado a *${label}*.`);
  });

  bot.command("tree", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;

    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start.");
      return;
    }

    const allMemberships = await (prisma as any).treeMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { tree: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "desc" },
    });

    if (allMemberships.length === 0) {
      await ctx.reply("🌳 No eres miembro activo de ningún árbol.");
      return;
    }

    // If argument provided, switch to that tree
    const arg = ctx.message?.text?.split(/\s+/, 2)[1]?.trim().toLowerCase();
    if (arg) {
      const match = allMemberships.find((m: any) =>
        m.tree.name.toLowerCase().includes(arg)
      );
      if (match) {
        (ctx as BotContext).session.dmTreeId = match.tree.id;
        await ctx.reply(`🌳 Cambiado a *${match.tree.name}*.`);
        return;
      }
      await ctx.reply(`⚠️ No se encontró un árbol que coincida con "${arg}".`);
      return;
    }

    // No argument — show selector
    const buttons = allMemberships.map((m: any) => [{
      text: `🌳 ${m.tree.name}`,
      callback_data: `dm_tree:${m.tree.id}`,
    }]);
    await ctx.reply("🌳 Selecciona tu árbol para DMs:", {
      reply_markup: { inline_keyboard: buttons },
    });
  });

  // ── Worker commands (DM only) ────────────────────────────────────────────
  bot.command("trabajar", async (ctx) => {
    await handleTrabajar(prisma, ctx as BotContext);
  });

  bot.command("perfil", async (ctx) => {
    await handlePerfil(prisma, ctx as BotContext);
  });

  bot.command("tareas", async (ctx) => {
    await handleTareas(prisma, ctx as BotContext);
  });

  bot.command("hilt", async (ctx) => {
    const lng = ctx.from?.language_code === "en" ? "en" : "es";
    await ctx.reply(workerHelpMessage(lng));
  });

  // ── /ask: pregunta al NotebookLM del árbol ───────────────────────────
  bot.command("ask", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔍 /ask solo funciona en grupos vinculados a un árbol.");
      return;
    }

    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    // Extract question (everything after "/ask")
    const raw = ctx.message?.text || "";
    const question = raw.replace(/^\/ask(?:@\w+)?\s*/, "").trim();
    if (!question) {
      await ctx.reply("🔍 Uso: /ask <pregunta>\n\nEjemplo: /ask ¿Qué dice el documento sobre sostenibilidad?");
      return;
    }

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const bridge = await getBotNotebookLMBridge();
      const result = await bridge.ask(tree.id, question);

      const citations = result.citations || [];
      let reply = `📚 *Respuesta:*\n${result.answer}`;

      if (citations.length > 0) {
        reply += "\n\n📖 *Fuentes:*";
        for (const c of citations.slice(0, 5)) {
          const sourceLabel = c.text
            ? (c.text.length > 80 ? c.text.slice(0, 80) + "..." : c.text)
            : c.sourceId;
          reply += `\n• ${sourceLabel}`;
        }
      } else {
        reply += "\n\n⚠️ No hay fuentes en el notebook de este árbol.";
      }

      await ctx.reply(reply, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.error("[Bot /ask] Error:", err?.message || err);
      const msg = err?.message || "Error desconocido";
      if (msg.includes("No notebook found")) {
        await ctx.reply("⚠️ Este árbol no tiene un notebook creado aún. Añade fuentes primero con /source.");
      } else {
        await ctx.reply(`❌ Error al consultar NotebookLM: ${msg.slice(0, 200)}`);
      }
    }
  });

  // ── /podcast: genera un podcast del árbol ────────────────────────────
  bot.command("podcast", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🎙️ /podcast solo funciona en grupos vinculados a un árbol.");
      return;
    }

    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    try {
      const bridge = await getBotNotebookLMBridge();
      const genResult = await bridge.generatePodcast(tree.id);

      await ctx.reply(
        `🎙️ *Generando podcast...* te aviso cuando esté listo.\n\n` +
        `⏳ Task: \`${genResult.taskId}\``,
        { parse_mode: "Markdown" },
      );

      // Poll every 15s for up to 10 minutes
      const MAX_POLLS = 40; // 10 min
      const POLL_INTERVAL_MS = 15_000;
      let pollCount = 0;

      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const status = await bridge.pollPodcast(tree.id, genResult.taskId);

          if (status.isFailed) {
            clearInterval(pollInterval);
            await ctx.reply("❌ La generación del podcast falló. Intenta de nuevo más tarde.");
            return;
          }

          if (status.isComplete && status.url) {
            clearInterval(pollInterval);
            await ctx.replyWithChatAction("upload_document");

            // Download the audio
            const outputPath = `/tmp/tm-podcast-${tree.id}-${genResult.taskId}.mp3`;
            const dl = await bridge.downloadPodcast(tree.id, genResult.taskId, outputPath);

            try {
              const { InputFile } = await import("grammy");
              const audioFile = new InputFile(dl.path);
              await ctx.replyWithAudio(audioFile, {
                title: `Podcast: ${tree.name}`,
                caption: `🎙️ Podcast generado para *${tree.name}*`,
                parse_mode: "Markdown",
              });
              await ctx.reply("✅ ¡Podcast listo!");
            } catch (sendErr: any) {
              console.error("[Bot /podcast] Send error:", sendErr?.message || sendErr);
              await ctx.reply(
                `✅ Podcast generado pero no pude enviarlo.\n📁 Archivo: ${dl.path}`,
              );
            }
            return;
          }

          if (pollCount >= MAX_POLLS) {
            clearInterval(pollInterval);
            await ctx.reply(
              "⏰ El podcast está tardando más de lo esperado. " +
              `Puedes verificarlo luego con la task \`${genResult.taskId}\`.`,
              { parse_mode: "Markdown" },
            );
          }
        } catch (pollErr: any) {
          console.error("[Bot /podcast] Poll error:", pollErr?.message || pollErr);
          // Don't clear interval on transient errors
        }
      }, POLL_INTERVAL_MS);

      // Safety: clear interval after 12 min regardless
      setTimeout(() => clearInterval(pollInterval), 12 * 60_000);

    } catch (err: any) {
      console.error("[Bot /podcast] Error:", err?.message || err);
      const msg = err?.message || "Error desconocido";
      if (msg.includes("No notebook found")) {
        await ctx.reply("⚠️ Este árbol no tiene un notebook creado aún. Añade fuentes primero con /source.");
      } else {
        await ctx.reply(`❌ Error al iniciar podcast: ${msg.slice(0, 200)}`);
      }
    }
  });

  // ── Welcome / rejoin messages ─────────────────────────────────────────

  function rejoinMessage(treeName: string): string {
    return `🌳 ¡He vuelto! El árbol "${treeName}" sigue activo.`;
  }

  /**
   * Resuelve el idioma desde el Tree (usado en grupo en vez de resolveUserLanguage).
   * Retorna el language del árbol, o null si no está configurado (nuevo árbol sin selector aún).
   */
  async function resolveTreeLanguage(prisma: PrismaClient, treeId: string): Promise<string | null> {
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

  /** Track Ari's 2nd/3rd message per tree — used as welcome-reply anchor. */
  const _introCounts = new Map<string, number>();
  async function trackIntroMessage(
    prisma: PrismaClient,
    treeId: string,
    messageId: number,
  ) {
    const count = (_introCounts.get(treeId) || 0) + 1;
    _introCounts.set(treeId, count);
    if (count === 2 || count === 3) {
      // Save if not already set
      const tree = await (prisma as any).tree.findUnique({
        where: { id: treeId },
        select: { introMessageId: true },
      });
      if (!tree?.introMessageId) {
        await (prisma as any).tree.update({
          where: { id: treeId },
          data: { introMessageId: BigInt(messageId) },
        });
      }
    }
  }

  // ── Onboarding multi-step: flujo de configuración del árbol ──────────
  // Paso 1: objetivos → Paso 2: subárbol? (inline buttons) → Paso 3: payment mode → Paso 4: árbol padre → Paso 5: WhatsApp

  async function handleOnboardingResponse(ctx: any, prisma: PrismaClient) {
    const session = (ctx as BotContext).session;
    const text: string | undefined = ctx.message.text?.trim();

    // Resolve language: prefer tree.language for groups, user.language for DMs
    let lang: string | null = null;
    const chatType = ctx.chat?.type;

    // ── Guard: solo el creador del grupo puede responder al onboarding ──
    if (chatType === "group" || chatType === "supergroup") {
      const chatId = ctx.chat.id.toString();
      const tree = await (prisma as any).tree.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, onboardingInviterId: true },
      });
      if (tree?.onboardingInviterId) {
        const inviterId = Number(tree.onboardingInviterId);
        if (ctx.from?.id !== inviterId) {
          return; // ignorar silenciosamente — no es el creador
        }
      }
    }

    if ((chatType === "group" || chatType === "supergroup") && session.onboardingTreeId) {
      lang = await resolveTreeLanguage(prisma, session.onboardingTreeId);
    }
    if (!lang) {
      lang = await resolveUserLanguage(prisma, ctx);
    }
    // Fallback: default to Spanish
    if (!lang) lang = "es";

    // Resolver el árbol si no está en sesión (primera respuesta)
    if (!session.onboardingTreeId) {
      const chatId = ctx.chat.id.toString();
      const tree = await (prisma as any).tree.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!tree) {
        return ctx.reply('❌ ' + t('errors.tree_not_found', lang));
      }
      session.onboardingTreeId = tree.id;
      session.onboardingStep = 1;
    }

    const step = session.onboardingStep;

    if (step === 1) {
      // ── Paso 1: Guardar objetivos ──────────────────────────────────────
      if (!text || text.length < 10) {
        return ctx.reply(t('onboarding.org_tell_more', lang), {
          reply_markup: { force_reply: true, input_field_placeholder: t('onboarding.org_placeholder_detail', lang) },
        });
      }

      const treeId = session.onboardingTreeId;

      // Guardar descripción y objetivos
      await (prisma as any).tree.update({
        where: { id: treeId },
        data: { description: text, objectives: text },
      });

      // Extraer keywords para feedback
      const keywords = extractSimpleKeywords(text);

      let step1Msg = t('onboarding.org_configured', lang) + '\n\n' +
        t('onboarding.org_understood', lang) + '\n' +
        `_"${text}"_\n\n`;

      if (keywords.length > 0) {
        step1Msg += t('onboarding.org_skills_detected', lang, { skills: keywords.slice(0, 5).join(', ') }) + '\n\n';
      }

      // T23: recomendar estructura
      if (text.length > 30) {
        try {
          const recommender = await import('../services/treeRecommenderService');
          if (recommender.generateRecommendationForNewTree) {
            const recommendation = await recommender.generateRecommendationForNewTree(text);
            if (recommendation) {
              await new Promise(r => setTimeout(r, 2000));
              await ctx.reply(recommendation, { parse_mode: 'Markdown' });
            }
          }
        } catch { /* not implemented yet */ }
      }

      // T26: recomendar tech stack
      if (text.length > 20) {
        try {
          const techStack = await import('../services/techStackService');
          if (techStack.recommendTechStack && techStack.formatTechStackRecommendation) {
            const ranked = await techStack.recommendTechStack(text);
            if (ranked.length > 0) {
              const successful = await import('../services/treeRecommenderService');
              const allTrees = await successful.findSuccessfulTrees();
              const similar = await successful.findSimilarTrees(text, allTrees);
              const formatted = techStack.formatTechStackRecommendation(ranked, similar.length);
              if (formatted) {
                await new Promise(r => setTimeout(r, 1500));
                await ctx.reply(formatted, { parse_mode: 'Markdown' });
              }
            }
          }
        } catch { /* not implemented yet */ }
      }

      // Paso 2 → payment mode (T7: subtree question movida al early pick)
      session.onboardingStep = 3;
      await new Promise(r => setTimeout(r, 1000));
      await ctx.reply(step1Msg + t('onboarding.payment_mode_question', lang), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: t('onboarding.payment_mode_centralized', lang), callback_data: 'onboarding:payment_centralized' },
            { text: t('onboarding.payment_mode_individual', lang), callback_data: 'onboarding:payment_individual' },
          ]],
        },
      });
      return;
    }

    if (step === 4) {
      // ── Paso 4: WhatsApp group ID (T7: renumerado de step 5) ───────────
      if (!text || text === '/skip') {
        // Skip WhatsApp
        session.onboardingStep = null;
        session.onboardingTreeId = null;
        await ctx.reply(t('onboarding.whatsapp_skipped', lang) + '\n\n' + t('onboarding.onboarding_complete', lang), {
          parse_mode: 'Markdown',
        });
        return;
      }

      // Guardar WhatsApp group ID
      await (prisma as any).tree.update({
        where: { id: session.onboardingTreeId },
        data: { whatsappGroupId: text },
      });

      session.onboardingStep = null;
      session.onboardingTreeId = null;
      await ctx.reply(t('onboarding.whatsapp_saved', lang) + '\n\n' + t('onboarding.onboarding_complete', lang), {
        parse_mode: 'Markdown',
      });
      return;
    }
  }

  // ── Grupo: auto-crear árbol cuando el bot es agregado ─────────────────
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;

    if (chat.type === "group" || chat.type === "supergroup") {
      // ── Ari removed from group → schedule tree deletion in 60 min ──────
        if (newStatus === "kicked" || newStatus === "left") {
        const chatId = chat.id.toString();
        try {
          await (prisma as any).tree.updateMany({
            where: { telegramChatId: chatId },
            data: { pendingDeletionAt: new Date(Date.now() + 60 * 60 * 1000) },
          });
          console.log(`[Telegram Bot] Ari removed from ${chatId}, tree scheduled for deletion in 60 min`);
        } catch (err: any) {
          console.error(`[Telegram Bot] Error scheduling deletion for ${chatId}:`, err.message);
        }
        return;
      }

      if (newStatus === "member" || newStatus === "administrator") {
        const chatId = chat.id.toString();
        const adderId = ctx.update.my_chat_member.from.id.toString();
        try {
          // ── Admin bypass ──────────────────────────────────────────────
          const TRUSTMAKER_ADMIN_TELEGRAM_ID = process.env.TRUSTMAKER_ADMIN_TELEGRAM_ID
            || process.env.BETA_ADMIN_TELEGRAM_IDS?.split(",")[0]?.trim()
            || "7516190425";

          const isBetaAdmin = adderId === TRUSTMAKER_ADMIN_TELEGRAM_ID;

          // ── Gate: capacity limit (MAX_TREES) — DISABLED para fase beta ──
          // Código original preservado. Reactivar: descomentar y quitar if(false)
          if (false) {
          const MAX_TREES = parseInt(process.env.MAX_TREES || "5", 10);
          const treeCount = await (prisma as any).tree.count({
            where: { telegramChatId: { not: null } },
          });

          if (!isBetaAdmin && treeCount >= MAX_TREES) {
            // Check if tree already exists (rejoin case — don't block re-adds)
            const existingTree = await (prisma as any).tree.findUnique({
              where: { telegramChatId: chatId },
            });
            if (existingTree) {
              // Rejoin: existing tree, cancel pending deletion, sync adder as member
              await (prisma as any).tree.update({
                where: { id: existingTree.id },
                data: { pendingDeletionAt: null, standby: false, leaveAttempts: 0 },
              });

              // Sync the adder as TreeMember (in case it was lost)
              try {
                const tgId = BigInt(adderId);
                let adderUser = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
                if (!adderUser) {
                  adderUser = await prisma.user.create({
                    data: { username: `tg_${adderId}`, telegramUserId: tgId, firstName: ctx.update.my_chat_member.from.first_name || null, language: null },
                  });
                }
                await prisma.treeMember.upsert({
                  where: { userId_treeId: { userId: adderUser.id, treeId: existingTree.id } },
                  create: { userId: adderUser.id, treeId: existingTree.id, role: "ADMIN" },
                  update: { status: "ACTIVE", role: "ADMIN" },
                });
              } catch (memberErr: any) {
                console.error(`[Telegram Bot] Error syncing adder member on rejoin:`, memberErr.message);
              }

              // Sync ALL group members via MTProto
              try {
                const synced = await syncAllMembers(chat.id, existingTree.id, ctx.update.my_chat_member.from.id);
                console.log(`[Telegram Bot] Synced ${synced} members for tree ${existingTree.id}`);
              } catch (syncErr: any) {
                console.error("[Telegram Bot] Member sync failed:", syncErr?.message || syncErr);
              }

              await ctx.api.sendMessage(chatId, rejoinMessage(existingTree.name), {
                parse_mode: "Markdown",
              });
              return;
            }

            // No slots — reject with friendly message
            const fallbackLang = "es";
            const CAREERS_URL = process.env.CAREERS_URL || "https://trustmaker.app/careers";
            const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "hello@trustmaker.app";

            const msg = t("common.beta_closed", fallbackLang, {
              careersUrl: CAREERS_URL,
              contactEmail: CONTACT_EMAIL,
            });
            await ctx.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });

            // Optional: save to waitlist
            try {
              await (prisma as any).waitlist.create({
                data: {
                  treeName: chat.title || `Grupo ${chatId}`,
                  telegramChatId: chatId,
                  contactUserId: adderId,
                },
              });
            } catch (wlErr: any) {
              console.warn("[Telegram Bot] Waitlist save failed:", wlErr.message);
            }

            console.log(
              `[Telegram Bot] Capacity gate: rejected group ${chatId} (${chat.title || "unnamed"}) — ${treeCount}/${MAX_TREES} trees`
            );
            return;
          }
          } // END if(false) — DISABLED

          // ── Gate: 1 group per user during beta ──────────────────────────
          // Check if the adder already administers a tree
          const adderTgId = BigInt(adderId);
          const adderUser = await (prisma as any).user.findUnique({
            where: { telegramUserId: adderTgId },
            select: { id: true },
          });

          if (adderUser) {
            const adminTrees = await (prisma as any).treeMember.count({
              where: {
                userId: adderUser.id,
                role: "ADMIN",
                status: "ACTIVE",
              },
            });

            // ── Gate: 1 group per user during beta — DISABLED ──
            // Código original preservado
            if (false) {
            const MAX_USER_TREES = parseInt(process.env.MAX_TREES_PER_USER || "2", 10);
            if (!isBetaAdmin && adminTrees >= MAX_USER_TREES) {
              // Check if tree already exists (rejoin to same tree)
              const existingTree = await (prisma as any).tree.findUnique({
                where: { telegramChatId: chatId },
              });
              if (!existingTree) {
                const fallbackLang = "es";
                const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "hello@trustmaker.app";

                const msg = t("common.one_tree_per_user", fallbackLang, {
                  contactEmail: CONTACT_EMAIL,
                });
                await ctx.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });
                console.log(
                  `[Telegram Bot] 1-per-user gate: rejected group ${chatId} — user ${adderId} already admins a tree`
                );
                return;
              }
            }
            } // END if(false) — DISABLED
          }

          // Check if tree already exists for this group
          let tree = await (prisma as any).tree.findUnique({
            where: { telegramChatId: chatId },
          });
          let isNewTree = false;
          if (!tree) {
            tree = await (prisma as any).tree.create({
              data: {
                name: chat.title || `Grupo ${chatId}`,
                telegramChatId: chatId,
                description: `Árbol automático para el grupo de Telegram "${chat.title || chatId}"`,
                icono: "💬",
                admissionPolicy: "INVITE_ONLY",
              },
            });
            console.log(
              `[Telegram Bot] Árbol creado: "${tree.name}" (${tree.id}) para grupo ${chatId}`
            );

            // SPEC-4: auto-create sandbox — non-blocking
            try {
              TreeSandbox.create(tree.id).catch((err: any) =>
                console.error("[Telegram Bot] Sandbox auto-create failed:", err?.message || err)
              );
            } catch {
              // Non-blocking
            }
            isNewTree = true;
          }

          // ── Anti-DDoS: reject blocked/standby trees ──────────────────
          if (!isNewTree) {
            const inviteCheck = await shouldRejectInvite(prisma, chatId);
            if (inviteCheck.reject) {
              console.log(
                `[antiDdos] Rejecting invite to ${chatId}: ${inviteCheck.reason}`,
              );
              await ctx.api.leaveChat(chatId);
              return;
            }
          }

          // Auto-add the user who invited the bot
          try {
            // Resolve or create user by telegram ID
            const tgId = BigInt(adderId);
            let user = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
            if (!user) {
              user = await prisma.user.create({
                data: { username: `tg_${adderId}`, telegramUserId: tgId, firstName: ctx.from?.first_name || null, language: null },
              });
            }
            await prisma.treeMember.upsert({
              where: { userId_treeId: { userId: user.id, treeId: tree.id } },
              update: { status: "ACTIVE" },
              create: { userId: user.id, treeId: tree.id, status: "ACTIVE", role: "ADMIN" },
            });
            console.log(
              `[Telegram Bot] Miembro agregado: ${user.username || adderId} al árbol ${tree.id}`
            );
          } catch (memberErr: any) {
            console.error(`[Telegram Bot] Error al agregar miembro ${adderId}:`, memberErr.message);
          }

          // Sync ALL group members via MTProto
          try {
            const synced = await syncAllMembers(chat.id, tree.id, ctx.update.my_chat_member.from.id);
            console.log(`[Telegram Bot] Synced ${synced} members for tree ${tree.id}`);
          } catch (syncErr: any) {
            console.error("[Telegram Bot] Member sync failed:", syncErr?.message || syncErr);
          }

          // Send welcome / rejoin message
          try {
            if (isNewTree) {
              // Send language selector FIRST, then subtree question
              await ctx.api.sendMessage(
                chatId,
                "\uD83C\uDF10 Select your language / Selecciona tu idioma",
                {
                  reply_markup: {
                    inline_keyboard: [[
                      {
                        text: "\uD83C\uDDFA\uD83C\uDDF8 English",
                        callback_data: "lang_group:en:" + tree.id,
                      },
                      {
                        text: "\uD83C\uDDF2\uD83C\uDDFD Español",
                        callback_data: "lang_group:es:" + tree.id,
                      },
                    ]],
                  },
                }
              );
            } else {
              // Rejoin: existing tree, cancel any pending deletion
              await (prisma as any).tree.update({
                where: { id: tree!.id },
                data: { pendingDeletionAt: null, standby: false },
              });
              await ctx.api.sendMessage(chatId, rejoinMessage(tree!.name), {
                parse_mode: "Markdown",
              });
            }
          } catch (msgErr: any) {
            console.error(`[Telegram Bot] Error al enviar mensaje de bienvenida:`, msgErr.message);
          }
        } catch (err: any) {
          console.error(`[Telegram Bot] Error al crear árbol para grupo ${chatId}:`, err.message);
        }
      }
    }
  });

  // ── New member welcome: greet members joining the group ─────────────────
  bot.on("chat_member", async (ctx) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newMember = ctx.chatMember.new_chat_member;

    // ── Human left → check if last human, schedule tree deletion ─────────
    if (
      (newMember.status === "left" || newMember.status === "kicked") &&
      !newMember.user.is_bot
    ) {
      const chatId = chat.id.toString();
      try {
        const tree = await (prisma as any).tree.findUnique({
          where: { telegramChatId: chatId },
          select: { id: true },
        });
        if (!tree) return;

        // Count remaining human members (Ari included)
        const humanCount = await prisma.treeMember.count({
          where: { treeId: tree.id, status: "ACTIVE", isAI: false },
        });
        if (humanCount <= 1) {
          // Last human leaving → schedule deletion in 60 min
          await (prisma as any).tree.update({
            where: { id: tree.id },
            data: { pendingDeletionAt: new Date(Date.now() + 60 * 60 * 1000) },
          });
          console.log(`[Telegram Bot] Last human left ${chatId}, tree ${tree.id} scheduled for deletion in 60 min`);
        }
      } catch (err: any) {
        console.error(`[Telegram Bot] Error checking last-human for ${chat.id}:`, err.message);
      }
      return;
    }

    // Only greet on join (left/kicked → member)
    if (
      (oldStatus !== "left" && oldStatus !== "kicked") ||
      newMember.status !== "member"
    ) {
      return;
    }

    // Don't greet the bot itself
    if (newMember.user.is_bot) return;

    const chatId = chat.id.toString();
    // Mention with @username if available; first_name otherwise (user spec)
    const newUserName = newMember.user.username
      ? "@" + newMember.user.username
      : newMember.user.first_name || "nuevo miembro";

    try {
      // Find tree for this group
      const tree = await (prisma as any).tree.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true, introMessageId: true, language: true },
      });

      if (!tree) return; // Not a TrustMaker group

      const lang = tree.language || "es";
      const welcomeText = t("common.welcome_new_member", lang, { name: newUserName });

      if (tree.introMessageId) {
        // Reply to the intro message with reply_parameters (modern API)
        await ctx.api.sendMessage(chatId, welcomeText, {
          reply_parameters: { message_id: Number(tree.introMessageId) },
          parse_mode: "Markdown",
        });
      } else {
        // No intro saved — send normal welcome
        await ctx.api.sendMessage(chatId, welcomeText, {
          parse_mode: "Markdown",
        });
      }
    } catch (err: any) {
      console.error(
        `[Telegram Bot] Error greeting new member in group ${chatId}:`,
        err.message,
      );
    }
  });

  // ── Rate limiter: DISABLED ────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgUser = ctx.from;
    if (!tgUser) return next();

    // Rate limiter disabled — always allow

    // Keep firstName in sync (fire-and-forget)
    if (tgUser.first_name) {
      prisma.user.updateMany({
        where: { telegramUserId: BigInt(tgUser.id), firstName: { not: tgUser.first_name } },
        data: { firstName: tgUser.first_name },
      }).catch(() => {});
    }

    // ── Hook point: typing semaphore (not yet implemented) ──────────────
    // Future: await typingSemaphore.acquire(ctx);

    return next();
  });

  // ── Onboarding reply handler: detecta respuestas al force_reply ──
  // Se ejecuta antes del handler normal de mensajes. Si es respuesta al
  // force_reply de "¿Qué tipo de organización son...", captura y guarda.
  bot.on("message:text", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg)) return next();

    // Check if this is a reply to the onboarding question
    const session = (ctx).session; if (msg.reply_to_message?.from?.id === ctx.me.id && session.onboardingStep > 0) {
      await handleOnboardingResponse(ctx, prisma);
      return;
    }

    return next();
  });

  // ── DM: Mensajes privados (perfil personal, comandos, concierge) ────
  bot.on("message:text", async (ctx, next) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "private") return next();

    // Worker flow continuation (text responses for /trabajar steps or /perfil edits)
    const bctx = ctx as BotContext;
    const text = ctx.message?.text?.trim();
    if (text) {
      // Worker text continuation (perfil edit flow: steps 100-102)
      if (await handleWorkerTextContinuation(prisma, bctx)) return;
      // Worker onboarding flow (trabajar steps: 1-5)
      if (await handleTrabajar(prisma, bctx)) return;
      // Worker profile command
      if (await handlePerfil(prisma, bctx)) return;
      // Worker tasks command
      if (await handleTareas(prisma, bctx)) return;
    }

    if (process.env.HERMES_BRIDGE_ENABLED === "true") {
      // ── Hermes Bridge: enrutar DM al agente ───────────────────────────
      const msg = ctx.message;
      if (!msg || !("text" in msg) || !msg.text) return;
      const text = msg.text.trim();
      const tgUser = ctx.from;
      if (!tgUser) return;

      // Find first active tree membership
      const user = await (prisma as any).user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true, username: true, language: true },
      });
      if (!user) {
        await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start en un grupo para vincularte a Trust Maker.");
        return;
      }

      // Find all active tree memberships for this user
      const allMemberships = await (prisma as any).treeMember.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { tree: { select: { id: true, name: true } } },
        orderBy: { lastDmAt: "desc" },
      });

      if (allMemberships.length === 0) {
        await ctx.reply("🌳 No eres miembro activo de ningún árbol. Únete a un grupo de Trust Maker para empezar.");
        return;
      }

      // Resolve treeId: use session preference, or auto-pick if only 1 tree
      const session = (ctx as BotContext).session;
      let treeId: string;
      let treeName: string;

      if (session.dmTreeId) {
        // Verify the stored tree is still active
        const valid = allMemberships.find((m: any) => m.tree.id === session.dmTreeId);
        if (valid) {
          treeId = valid.tree.id;
          treeName = valid.tree.name;
        } else {
          // Stored tree no longer valid, fall through to auto-pick
          session.dmTreeId = null;
        }
      }

      if (!session.dmTreeId) {
        if (allMemberships.length === 1) {
          treeId = allMemberships[0].tree.id;
          treeName = allMemberships[0].tree.name;
          session.dmTreeId = treeId;
        } else {
          // Multiple trees — show selector
          const buttons = allMemberships.map((m: any) => [{
            text: `🌳 ${m.tree.name}`,
            callback_data: `dm_tree:${m.tree.id}`,
          }]);
          await ctx.reply(
            "🌳 Estás en varios árboles. ¿En cuál quieres hablar con Ari?",
            { reply_markup: { inline_keyboard: buttons } },
          );
          return;
        }
      }

      const userId = tgUser.id.toString();
      const displayName = tgUser.first_name || userId;
      const fullMessage = `${displayName}: ${text}`;

      // Track last DM interaction for auto-select
      (prisma as any).treeMember.updateMany({
        where: { userId: user.id, treeId, status: "ACTIVE" },
        data: { lastDmAt: new Date() },
      }).catch(() => {}); // fire-and-forget

      // Keep typing indicator alive during potentially long API call
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      ctx.replyWithChatAction("typing").catch(() => {});

      let response;
      try {
        response = await routeToHermes(
        fullMessage, treeId, userId, undefined, displayName,
        ctx.chat?.id, msg.message_id,
      );
      } finally {
        clearInterval(typingInterval);
      }
      if (response) {
        // Queue: saturation or position
        if (response.saturationMessage) {
          await ctx.reply(response.saturationMessage);
          return;
        }
        if (response.queued) {
          await ctx.reply(
            `🔄 Ari está procesando otro mensaje. Estás en la posición ${response.queuePosition} de la cola.`,
          );
          return;
        }
        await ctx.reply(response.text!, { parse_mode: "Markdown" });

        // TTS: only for voice messages (DM text → no audio)
      } else {
        await ctx.reply("⚠️ El agente no está disponible en este momento. Intenta de nuevo más tarde.");
      }
      return;
    }

    await handleDM(prisma, ctx as BotContext);
    // Don't call next() — DM handled, group handler won't fire
  });

  // ── Mensajes de texto: comandos @TrustMakerBot + conversación natural ──
  bot.on("message:text", async (ctx) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg) || !msg.text) return;

    const chatType = ctx.chat?.type;
    // Skip DM — already handled above
    if (chatType === "private") return;

    const chatId = ctx.chat?.id.toString();

    // ── Anti-DDoS: skip blocked trees ────────────────────────────────
    if (chatId) {
      const ddosTree = await findTreeByChat(prisma, chatId);
      if (ddosTree) {
        if (await isTreeBlocked(prisma, ddosTree.id)) {
          return; // silently drop — tree is blocked for 3 months
        }
        // Fire-and-forget: check member limit on every message
        checkMemberLimit(prisma, bot as any, ddosTree.id).catch((err: Error) => {
          console.error("[antiDdos] checkMemberLimit error:", err.message);
        });

        // ── Pause gate: if tree is paused, block all messages except /unpause and /reset ──
        if ((ddosTree as any).paused) {
          const cmdText = extractCommandText(msg.text);
          const isUnpauseReset = /^\/(unpause|reset)\b/.test(msg.text)
            || (cmdText !== null && /^\/(unpause|reset)\b/.test(cmdText));
          if (!isUnpauseReset) {
            await ctx.reply("🔕 Ari está en pausa.");
            return;
          }
        }
      }
    }

    // 1. Análisis pasivo: fire-and-forget para todo mensaje de grupo
    if (chatId) {
      analyzeMessage(prisma, ctx, chatId).catch((err: Error) => {
        console.error("[analyzer] Unhandled rejection:", err.message);
      });
    }

    // ── Todo scanner: detect /todo anywhere in group messages ──
    const todoMatch = msg.text.match(/\/todo\b\s*(.*)/i);
    if (todoMatch && chatId && chatType !== "private") {
      const todoText = todoMatch[1]?.trim();
      const tree = await findTreeByChat(prisma, chatId);
      if (tree) {
        if (!todoText) {
          // Show ranked list — urgent unassigned first, then by likes
          const todos = await (prisma as any).todo.findMany({
            where: { treeId: tree.id, status: "PENDING" },
            orderBy: { likeCount: "desc" },
            take: 20,
          });
          if (todos.length === 0) {
            await ctx.reply("📋 No hay tareas pendientes. Agrega una con /todo <texto>");
          } else {
            const now = new Date();
            // Sort: unassigned tasks with deadline <6h first, then by likes
            const sorted = [...todos].sort((a: any, b: any) => {
              const aUrgent = a.deadline && !a.assignedTo
                && new Date(a.deadline).getTime() - now.getTime() < 6 * 3600_000 ? 1 : 0;
              const bUrgent = b.deadline && !b.assignedTo
                && new Date(b.deadline).getTime() - now.getTime() < 6 * 3600_000 ? 1 : 0;
              if (aUrgent !== bUrgent) return bUrgent - aUrgent;
              return (b.likeCount ?? 0) - (a.likeCount ?? 0);
            });
            const list = sorted.map((t: any, i: number) => {
              let suffix = "";
              if (t.deadline) {
                const dl = new Date(t.deadline);
                const isOverdue = dl < now;
                const isUrgent = !isOverdue && !t.assignedTo
                  && dl.getTime() - now.getTime() < 6 * 3600_000;
                const dateStr = dl.toLocaleDateString("es-CL", {
                  day: "numeric", month: "short",
                });
                suffix = isOverdue ? ` ⚠️ vencía ${dateStr}`
                  : isUrgent ? ` 🚨 ${dateStr}`
                  : ` 📅 ${dateStr}`;
              }
              const assigned = t.assignedToName ? ` 🔒 ${t.assignedToName}` : "";
              return `${i + 1}. ${t.summary}${suffix}${assigned}${t.likeCount ? ` (${t.likeCount} 👍)` : ""}`;
            }).join("\n");
            await ctx.reply(`📋 *Tareas pendientes:*\n\n${list}`, { parse_mode: "Markdown" });
          }
        } else {
          // Add todo item — parse deadline from text
          const deadline = parseDeadline(todoText);
          const summary = summarizeTodo(todoText);
          const todo = await (prisma as any).todo.create({
            data: {
              treeId: tree.id,
              chatId: BigInt(chatId),
              messageId: BigInt(msg.message_id),
              createdBy: BigInt(ctx.from?.id || 0),
              createdByName: ctx.from?.first_name || null,
              text: todoText,
              summary,
              deadline: deadline || undefined,
            },
          });
          await ctx.react("✅");
        }
      }
      return; // Don't continue to command/natural processing
    }

    // ── Natural language todo add: detectar "anota X", "agrega X a la lista", etc. ──
    // Solo si el mensaje menciona a @Ari y NO contiene /todo
    if (chatId) {
      const addIntent = detectNaturalAddIntent(msg.text);
      if (addIntent) {
        const tree = await findTreeByChat(prisma, chatId);
        if (tree) {
          // Resolve tree language for i18n
          let lng = "es";
          try {
            const treeData = await (prisma as any).tree.findUnique({
              where: { id: tree.id },
              select: { language: true },
            });
            if (treeData?.language) lng = treeData.language;
          } catch { /* fallback es */ }

          // Check for duplicate: exact summary match in PENDING todos
          const existing = await (prisma as any).todo.findFirst({
            where: {
              treeId: tree.id,
              status: "PENDING",
              summary: addIntent,
            },
          });
          if (existing) {
            await ctx.reply(
              lng === "en"
                ? "📋 That task is already on the list"
                : "📋 Esa tarea ya está en la lista",
            );
            return;
          }

          // Parse deadline from text
          const deadline = parseDeadline(addIntent);
          const summary = addIntent.length > 80 ? summarizeTodo(addIntent) : addIntent;
          await (prisma as any).todo.create({
            data: {
              treeId: tree.id,
              chatId: BigInt(chatId),
              messageId: BigInt(msg.message_id),
              createdBy: BigInt(ctx.from?.id || 0),
              createdByName: ctx.from?.first_name || null,
              text: addIntent,
              summary,
              deadline: deadline || undefined,
            },
          });

          try { await ctx.react("✅"); } catch { /* react may not be available */ }

          const replyText = lng === "en"
            ? `Added to list: '${summary}'`
            : `Agregado a la lista: '${summary}'`;
          await ctx.reply(replyText);

          return; // Don't continue to claim/unclaim/command processing
        }
      }
    }

    // ── Todo claim/unclaim: detectar frases de asignación/liberación ──
    // Priority: /todo > add NL > claim/unclaim > completar > comando normal
    if (chatId) {
      const tree = await findTreeByChat(prisma, chatId);
      if (tree) {
        // Resolve tree language for i18n
        let lng = "es";
        try {
          const treeData = await (prisma as any).tree.findUnique({
            where: { id: tree.id },
            select: { language: true },
          });
          if (treeData?.language) lng = treeData.language;
        } catch { /* fallback es */ }

        const pendingTodos = await (prisma as any).todo.findMany({
          where: { treeId: tree.id, status: "PENDING" },
          orderBy: { likeCount: "desc" },
          take: 50,
        });

        if (pendingTodos.length > 0) {
          const replyMsgText = msg.reply_to_message?.text
            || msg.reply_to_message?.caption;
          const isReplyBot =
            msg.reply_to_message?.from?.username === "TrustMakerBot"
            || msg.reply_to_message?.from?.is_bot === true;

          const {
            detectClaim, detectUnclaim, checkUrgency,
            formatTimeRemaining, formatDeadlineTime,
            hasClaimLanguage, hasUnclaimLanguage,
          } = await import("./todoCompletion");

          const todos = pendingTodos.map((t: any) => ({
            id: t.id,
            summary: t.summary,
            text: t.text,
            createdByName: t.createdByName,
            status: t.status,
            messageId: t.messageId,
            assignedTo: t.assignedTo,
            assignedToName: t.assignedToName,
            deadline: t.deadline,
            likeCount: t.likeCount,
          }));

          const tgUser = ctx.from;
          const tgUserId = tgUser ? BigInt(tgUser.id) : null;
          const tgUserName = tgUser?.first_name || tgUser?.username || "alguien";

          // ── CLAIM ──────────────────────────────────────────
          if (hasClaimLanguage(msg.text)) {
            const claimResult = detectClaim(
              msg.text, todos, isReplyBot ?? false, replyMsgText,
            );

            if (claimResult) {
              const todo = claimResult.todo;

              // Already claimed by someone else → warn
              if (todo.assignedTo && todo.assignedTo !== tgUserId) {
                const assignee = todo.assignedToName || "alguien";
                await ctx.reply(
                  lng === "en"
                    ? `👀 That task is already assigned to ${assignee}`
                    : `👀 Esa tarea ya la tiene asignada ${assignee}`,
                );
                return;
              }

              // Already claimed by same user → notify
              if (todo.assignedTo === tgUserId) {
                await ctx.reply(
                  lng === "en"
                    ? "👀 You already claimed that task"
                    : "👀 Ya te habías apuntado a esa tarea",
                );
                return;
              }

              // Assign
              await (prisma as any).todo.update({
                where: { id: todo.id },
                data: {
                  assignedTo: tgUserId,
                  assignedToName: tgUserName,
                },
              });

              try { await ctx.react("👍"); } catch { /* react may not be available */ }

              await ctx.reply(
                lng === "en"
                  ? `👍 ${tgUserName} volunteered for '*${todo.summary}*'`
                  : `👍 ${tgUserName} se apuntó a '*${todo.summary}*'`,
                { parse_mode: "Markdown" },
              );
              return;
            }
          }

          // ── UNCLAIM ────────────────────────────────────────
          if (hasUnclaimLanguage(msg.text)) {
            const unclaimResult = detectUnclaim(
              msg.text, todos, isReplyBot ?? false, replyMsgText,
            );

            if (unclaimResult) {
              const todo = unclaimResult.todo;

              // Not assigned to anyone
              if (!todo.assignedTo) {
                await ctx.reply(
                  lng === "en"
                    ? "🤷 That task isn't assigned to anyone"
                    : "🤷 Esa tarea no está asignada a nadie",
                );
                return;
              }

              // Not assigned to this user — only release your own
              if (todo.assignedTo !== tgUserId) {
                const assignee = todo.assignedToName || "alguien";
                await ctx.reply(
                  lng === "en"
                    ? `🤷 That task is assigned to ${assignee}, not you`
                    : `🤷 Esa tarea está asignada a ${assignee}, no a ti`,
                );
                return;
              }

              // Check urgency before releasing
              const urgency = checkUrgency(todo.deadline);

              // Release
              await (prisma as any).todo.update({
                where: { id: todo.id },
                data: {
                  assignedTo: null,
                  assignedToName: null,
                },
              });

              try { await ctx.react("🔄"); } catch { /* react may not be available */ }

              await ctx.reply(
                lng === "en"
                  ? `🔄 ${tgUserName} dropped '*${todo.summary}*'`
                  : `🔄 ${tgUserName} se bajó de '*${todo.summary}*'`,
                { parse_mode: "Markdown" },
              );

              // ── URGENCY ESCALATION ────────────────────────
              if (urgency) {
                const timeFmt = formatDeadlineTime(urgency.deadlineDate, lng);
                const remainingFmt = formatTimeRemaining(urgency.hoursRemaining, lng);

                // Get tree member count
                let memberCount = 0;
                try {
                  memberCount = await (prisma as any).treeMember.count({
                    where: { treeId: tree.id, status: "ACTIVE" },
                  });
                } catch { /* fallback */ }

                if (memberCount < 15 && memberCount > 0) {
                  // Get member Telegram IDs for mentions
                  let members: any[] = [];
                  try {
                    members = await (prisma as any).treeMember.findMany({
                      where: { treeId: tree.id, status: "ACTIVE" },
                      include: {
                        user: { select: { telegramUserId: true, username: true } },
                      },
                      take: 15,
                    });
                  } catch { /* fallback */ }

                  // Build mention string
                  const mentionNames: string[] = [];
                  for (const m of members) {
                    const u = m.user;
                    if (u?.telegramUserId && BigInt(u.telegramUserId) !== tgUserId) {
                      mentionNames.push(`[${u.username || "miembro"}](tg://user?id=${u.telegramUserId})`);
                    }
                  }

                  const mentions = mentionNames.slice(0, 14).join(" "); // max 14 mentions
                  await ctx.reply(
                    (lng === "en"
                      ? `🚨 Urgent! ${tgUserName} can't do '*${todo.summary}*' by ${timeFmt} (${remainingFmt}). Who can take it? ${mentions}`
                      : `🚨 ¡Urgente! ${tgUserName} no puede '*${todo.summary}*' para ${timeFmt} (${remainingFmt}). ¿Quién puede hacerla? ${mentions}`),
                    { parse_mode: "Markdown" },
                  );
                } else {
                  // Large group — no individual mentions
                  await ctx.reply(
                    lng === "en"
                      ? `🚨 Urgent! ${tgUserName} can't do '*${todo.summary}*' by ${timeFmt} (${remainingFmt}). Anyone from the group?`
                      : `🚨 ¡Urgente! ${tgUserName} no puede '*${todo.summary}*' para ${timeFmt} (${remainingFmt}). ¿Alguien del grupo puede hacerla?`,
                    { parse_mode: "Markdown" },
                  );
                }
              }

              return;
            }
          }
        }
      }
    }

    // ── Todo completion: detectar lenguaje de completitud natural ──
    // Solo si NO contiene /todo (el scanner tiene prioridad)
    if (chatId) {
      const tree = await findTreeByChat(prisma, chatId);
      if (tree) {
        const pendingTodos = await (prisma as any).todo.findMany({
          where: { treeId: tree.id, status: "PENDING" },
          orderBy: { likeCount: "desc" },
          take: 50,
        });

        if (pendingTodos.length > 0) {
          const replyMsgText = msg.reply_to_message?.text
            || msg.reply_to_message?.caption;
          const isReplyBot =
            msg.reply_to_message?.from?.username === "TrustMakerBot"
            || msg.reply_to_message?.from?.is_bot === true;

          const { detectCompletion } = await import("./todoCompletion");
          const result = detectCompletion(
            msg.text,
            pendingTodos.map((t: any) => ({
              id: t.id,
              summary: t.summary,
              text: t.text,
              createdByName: t.createdByName,
              status: t.status,
              messageId: t.messageId,
            })),
            isReplyBot ?? false,
            replyMsgText,
          );

          if (result) {
            if (result.ambiguous && result.ambiguous.length > 1) {
              // Ambiguity: ask for clarification
              const options = result.ambiguous
                .map((t: any, i: number) => `${i + 1}) ${t.summary}`)
                .join("\n");
              await ctx.reply(
                `🤔 ¿Te refieres a...\n\n${options}\n\n_Responde con el número._`,
                { parse_mode: "Markdown" },
              );
              return;
            }

            // Mark as DONE
            await (prisma as any).todo.update({
              where: { id: result.todoId },
              data: { status: "DONE" },
            });

            // React
            try {
              await ctx.react("🎉");
            } catch { /* react may not be available */ }

            // Reply with stats
            const remaining = pendingTodos.length - 1;
            const name = result.createdByName || "Alguien";
            const msgText = `✅ ¡${name} completó *${result.summary}*!\n\n📋 Quedan ${remaining} pendiente${remaining !== 1 ? "s" : ""}`;
            await ctx.reply(msgText, { parse_mode: "Markdown" });
            return;
          }
        }
      }
    }

    // 2. Verificar si el mensaje menciona al bot o es reply o es comando directo
    // Priority: reply to bot → direct command → mention (@TrustMakerBot)
    let cmdText: string | null = null;
    let isReplyToBot = false;

    // Check 1: reply a un mensaje del bot
    if (
      msg.reply_to_message &&
      (msg.reply_to_message.from?.username === "TrustMakerBot" ||
       msg.reply_to_message.from?.is_bot === true)
    ) {
      cmdText = msg.text.trim();
      isReplyToBot = true;
    }

    // Check 2-3: comando directo (/) o mención (@TrustMakerBot)
    if (cmdText === null) {
      cmdText = extractCommandText(msg.text);
    }

    // ── Interaction Mode Gate ─────────────────────────────────────────
    // Reads tree.interactionMode to throttle proactive engagement.
    // MINIMUM → only reply + @tag pass. MEDIUM → reply/tag/name pass
    // but conversation window is skipped. MAXIMUM → full behavior.
    let interactionMode = "MAXIMUM";
    if (chatId) {
      const modeTree = await findTreeByChat(prisma, chatId);
      interactionMode = modeTree?.interactionMode || "MAXIMUM";
    }

    // MINIMUM: only reply and @tag pass through; block everything else
    if (interactionMode === "MINIMUM") {
      const isTagged = /@Ari\b|@TrustMakerBot\b/i.test(msg.text || "");
      if (!isReplyToBot && !isTagged && !cmdText?.startsWith("/")) {
        cmdText = null;
      }
    }

    // MEDIUM: detect name-mentions ("Ari" without @) alongside reply/tag
    const isNamed = interactionMode === "MEDIUM" && /\bAri\b/i.test(msg.text || "");
    if (isNamed && cmdText === null) {
      cmdText = msg.text.trim();
    }

    // ── Conversation Window: proactive engagement (Hermes Bridge) ────
    // Runs BEFORE the cmdText null gate to decide if Ari should join
    // ambient conversation via keyword scanning or active window state.
    // The LLM decides whether to actually respond — we just gate the routing.
    let isConversationWindow = false;
    if (interactionMode !== "MINIMUM" && interactionMode !== "MEDIUM") {
      if (process.env.HERMES_BRIDGE_ENABLED === "true" && chatId) {
        const {
          conversationWindows,
          scanForKeywordMatch: hbScan,
        } = await import("./hermesBridge");

        // 1. Tagged/reply → open/renew window (Hermes Bridge routes it below)
        if (isReplyToBot && cmdText !== null) {
          conversationWindows.resetWindow(chatId);
          isConversationWindow = true;
        }

        // 2. Active conversation window → always route to Ari (LLM decides)
        if (!isConversationWindow && conversationWindows.hasActiveWindow(chatId) && cmdText === null) {
          conversationWindows.tickWindow(chatId);
          // Still active after tick? → route
          if (conversationWindows.hasActiveWindow(chatId)) {
            cmdText = msg.text.trim();
            isConversationWindow = true;
          }
        }

        // 3. No active window → scan for engagement keywords
        if (!isConversationWindow && cmdText === null) {
          const keyword = hbScan(msg.text);
          if (keyword) {
            conversationWindows.openWindow(chatId, keyword);
            cmdText = msg.text.trim();
            isConversationWindow = true;
          }
        }
      }
    }

    // 3. Si no hay comando ni mención → verificar si es conversación 1:1
    if (cmdText === null || cmdText === "") {
      // One-on-one mode: if tree has only 1 active member, respond to everything
      if (chatId) {
        const soloTree = await findTreeByChat(prisma, chatId!);
        if (soloTree) {
          const memberCount = await (prisma as any).treeMember.count({
            where: { treeId: soloTree.id, status: "ACTIVE" },
          });
          if (memberCount <= 1) {
            cmdText = msg.text.trim();
          }
        }
      }
    }
    if (cmdText === null || cmdText === "") return;

    // 3.5 Payment check: verificar acceso antes de procesar
    if (chatId) {
      const paymentResult = await checkPaymentAccess(prisma, ctx, chatId, cmdText);
      if (paymentResult.blocked) {
        await ctx.reply(paymentResult.reply, { parse_mode: "Markdown" });
        return;
      }
    }

    // ── Hermes Bridge: si está habilitado, enrutar al agente con decisión previa ──
    if (process.env.HERMES_BRIDGE_ENABLED === "true") {
      const tree = await findTreeByChat(prisma, chatId!);
      if (!tree) {
        await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol de Trust Maker.");
        return;
      }

      const displayName = ctx.from?.first_name || ctx.from?.id.toString() || "alguien";

      // ── Prepend display name so the agent knows who is speaking ──────
      const fullMessage = `${displayName}: ${cmdText}`;

      // ── MEDIUM: skip shouldAriRespond, route directly to Hermes ──────
      if (interactionMode === "MEDIUM") {
        const userId = ctx.from?.id.toString() || "0";
        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("typing").catch(() => {});
        }, 4000);
        ctx.replyWithChatAction("typing").catch(() => {});
        try {
          const response = await routeToHermes(
            fullMessage, tree.id, userId, undefined, displayName,
            ctx.chat?.id, msg.message_id,
          );
          clearInterval(typingInterval);
          if (response) {
            if (response.saturationMessage) {
              await ctx.reply(response.saturationMessage);
              return;
            }
            if (response.queued) {
              await ctx.reply(
                `🔄 Ari está procesando otro mensaje. Estás en la posición ${response.queuePosition} de la cola.`,
              );
              return;
            }
            if (response.text) {
              let sentMsg: any;
              try {
                sentMsg = await ctx.reply(response.text, { parse_mode: "Markdown" });
              } catch (markdownErr: any) {
                if (markdownErr.message?.includes("can't parse entities")) {
                  sentMsg = await ctx.reply(response.text);
                } else {
                  throw markdownErr;
                }
              }
              if (sentMsg?.message_id) {
                trackIntroMessage(prisma, tree.id, sentMsg.message_id).catch(() => {});
              }
            }
          }
        } catch (err: any) {
          clearInterval(typingInterval);
          console.error("[HermesBridge] MEDIUM routeToHermes threw:", err.message);
        }
        return;
      }

      // Determine explicit triggers for the decision filter
      const isReplyToBot = !!(
        msg.reply_to_message &&
        (msg.reply_to_message.from?.username === "TrustMakerBot" ||
         msg.reply_to_message.from?.is_bot === true)
      );
      // Check if Ari is mentioned/tagged by name (case-insensitive)
      const isTagged = /@Ari\b|@TrustMakerBot\b/i.test(msg.text);

      // Fetch recent messages for decision context (same query, different mapping)
      let recentMessages: { senderName: string; content: string }[] = [];
      try {
        const rawMessages = await (prisma as any).chatMessage.findMany({
          where: { treeId: tree.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { content: true },
        });
        // Parse "DisplayName: message" format stored in chatMessage.content
        recentMessages = rawMessages
          .reverse()
          .map((m: any) => {
            const content = m.content ?? "";
            const colonIdx = content.indexOf(": ");
            if (colonIdx > 0) {
              return {
                senderName: content.slice(0, colonIdx),
                content: content.slice(colonIdx + 2),
              };
            }
            return { senderName: "", content };
          });
      } catch { /* non-critical */ }

      // ── Decision gate: should Ari respond? ──────────────────────────
      // Keep typing indicator alive during potentially long API call
      const typingInterval2 = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      ctx.replyWithChatAction("typing").catch(() => {});
      let decision;
      try {
        decision = await shouldAriRespond(
          fullMessage,
          tree.id,
          recentMessages,
          isReplyToBot,
          isTagged,
        );
      } catch (err: any) {
        clearInterval(typingInterval2);
        console.error("[HermesBridge] shouldAriRespond threw:", err.message);
        // On error, fall through to silent — better than spamming
        return;
      }

      clearInterval(typingInterval2);

      if (!decision.shouldRespond) {
        // Ari decided to stay silent — no message sent
        return;
      }

      // ── Ari responded — reset conversation window ────────────────────
      try {
        const { conversationWindows } = await import("./hermesBridge");
        conversationWindows.resetWindow(tree.id);
      } catch { /* best-effort */ }

      // ── Ari responded — send the text ───────────────────────────────
      if (decision.text) {
        let sentMsg: any;
        try {
          sentMsg = await ctx.reply(decision.text, { parse_mode: "Markdown" });
        } catch (markdownErr: any) {
          if (markdownErr.message?.includes("can't parse entities")) {
            sentMsg = await ctx.reply(decision.text);
          } else {
            throw markdownErr;
          }
        }

        // Track Ari's intro message ID (2nd or 3rd msg per tree → reply anchor)
        if (sentMsg?.message_id) {
          trackIntroMessage(prisma, tree.id, sentMsg.message_id).catch(() => {});
        }
      }
      return;
    }

    // If reply-to-bot and not using Hermes Bridge: prepend mention so
    // handleNaturalMessage/handleMessage can parse it (they call
    // extractCommandText internally which needs a mention or / prefix).
    if (isReplyToBot) {
      (msg as any).text = `@TrustMakerBot ${cmdText}`;
    }

    // 4. Si menciona — rutear a comando o conversación natural
    const isCommand = cmdText.startsWith("/");
    const isHelpAlias = /^(help|ayuda)$/i.test(cmdText);

    if (isCommand || isHelpAlias) {
      // ── Modo comando ──
      const result = await handleMessage(prisma, ctx);

      if (result) {
        // Send text immediately (non-blocking for voice)
        const messages = formatForChannel(
          { text: result.text, react: result.react },
          "telegram",
        );
        await sendViaTelegram(ctx, messages);

        if (result.react) {
          try {
            await ctx.react("❤");
          } catch {
            // React API may not be available (older Telegram clients / bot API)
          }
        }

        // TTS: only for voice messages (text commands → no audio)
      }
    } else {
      // ── Modo conversación natural (SPEC-2) ──
      const naturalResult = await handleNaturalMessage(prisma, ctx);
      if (naturalResult) {
        // Send text immediately (non-blocking for voice)
        const messages = formatForChannel(
          { text: naturalResult.text },
          "telegram",
        );
        await sendViaTelegram(ctx, messages);

        // TTS: only for voice messages (text → no audio)
      }
    }

    // ── Daily conversation log ───────────────────────────────────────
    if (chatId && chatType !== "private") {
      try {
        const logTree = await findTreeByChat(prisma, chatId);
        if (logTree) {
          appendToDailyLog(
            logTree.id,
            new Date(msg.date * 1000),
            ctx.from?.first_name || "Unknown",
            msg.text,
          );
        }
      } catch { /* silent — dailyLog is best-effort */ }
    }
  });

  // ── Mensajes de voz: transcribir + detectar interpelación ──────────────
  // T29: El bot escucha todo pero solo responde si lo mencionan.
  // Flujo: 1) Descargar .ogg vía getFile 2) POST /api/audio/transcribe
  // 3) Verificar si el texto contiene @TrustMakerBot 4) Si sí → pipeline concierge
  bot.on("message:voice", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.voice) return;

    const chatId = ctx.chat?.id.toString();
    const fileId = msg.voice.file_id;

    // Show typing indicator while transcribing
    ctx.replyWithChatAction("typing").catch(() => {});

    try {
      // 1. Download .ogg from Telegram
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[Voice] Telegram returned no file_path for", fileId);
        return;
      }

      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      // Silent save: guardar la nota de voz en filesystem del árbol
      if (chatId && (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup")) {
        try {
          const voiceTree = await findTreeByChat(prisma, chatId);
          if (voiceTree) {
            const TREES_BASE = process.env.SANDBOX_BASE_DIR || "/home/leo/trees";
            const rawName = ctx.from?.first_name
              || ctx.from?.username
              || ctx.from?.id.toString()
              || "unknown";
            const senderName = rawName
              .replace(/[^a-zA-Z0-9_\-\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1 ]/g, "")
              .trim()
              .replace(/\s+/g, "_")
              .slice(0, 64) || "unknown";
            const today = new Date().toISOString().slice(0, 10);
            const voiceFileName = `voice_${Date.now()}.ogg`;
            const dir = `${TREES_BASE}/${voiceTree.id}/media/${senderName}`;
            await fsPromises.mkdir(dir, { recursive: true });
            const destFile = `${dir}/${today}_${voiceFileName}`;
            await fsPromises.writeFile(destFile, fileBuffer);
            console.log(`[Voice] Media saved: ${destFile}`);
          }
        } catch (_saveErr: any) {
          console.error("[Voice] Silent save error:", _saveErr.message || _saveErr);
        }
      }

      // 2. POST to /api/audio/transcribe
      const blob = new Blob([fileBuffer], {
        type: msg.voice.mime_type || "audio/ogg",
      });
      const formData = new FormData();
      formData.append("audio", blob, "voice.ogg");

      const apiKey = process.env.HERMES_API_SERVER_KEY ?? "";
      const transcribeResp = await fetch(
        "http://localhost:3100/api/audio/transcribe",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        },
      );

      if (!transcribeResp.ok) {
        console.error(
          "[Voice] Transcription endpoint returned:",
          transcribeResp.status,
        );
        return;
      }

      const data = (await transcribeResp.json()) as any;
      const transcribedText: string = data?.text ?? "";
      if (!transcribedText.trim()) return;

      // ── Daily conversation log (audio) ──────────────────────────
      if (chatId) {
        try {
          const logVoiceTree = await findTreeByChat(prisma, chatId);
          if (logVoiceTree) {
            appendToDailyLog(
              logVoiceTree.id,
              new Date(msg.date * 1000),
              ctx.from?.first_name || "Unknown",
              transcribedText.trim(),
              true,
            );
          }
        } catch { /* silent — dailyLog is best-effort */ }
      }

      // 3. Solo responder si el audio menciona a Ari.
      //    "Ari" es corto y la transcripción lo captura bien con variaciones mínimas.
      const ariMatch = transcribedText.match(/\b(ari|ari[,!?]?|Ari)\b/i);
      if (!ariMatch) {
        console.log(
          `[Voice] No "Ari" mention — ignoring. Text: "${transcribedText.substring(0, 80)}"`,
        );
        return;
      }
      const cleanText = transcribedText.trim();
      if (!cleanText) return;

      console.log(
        `[Voice] Transcribed + detected mention → routing: "${cleanText.substring(0, 80)}"`,
      );

      // 5. Route through concierge pipeline (same as text messages)
      // 5a. Payment check
      if (chatId) {
        const paymentResult = await checkPaymentAccess(
          prisma,
          ctx,
          chatId,
          cleanText,
        );
        if (paymentResult.blocked) {
          await ctx.reply(paymentResult.reply, { parse_mode: "Markdown" });
          return;
        }
      }

      // 5b. Simulate a text message so the existing handlers work.
      //     Prepend @TrustMakerBot mention so extractCommandText + handleNaturalMessage
      //     can parse it (they require a leading mention to identify the message as addressed).
      const originalText = (msg as any).text;
      (msg as any).text = `@TrustMakerBot ${cleanText}`;

      try {
        const isCommand = cleanText.startsWith("/");
        const isHelpAlias = /^(help|ayuda)$/i.test(cleanText);

        if (isCommand || isHelpAlias) {
          const result = await handleMessage(prisma, ctx);
          if (result) {
            // Send text immediately
            const messages = formatForChannel(
              { text: result.text, react: result.react },
              "telegram",
            );
            await sendViaTelegram(ctx, messages);
            if (result.react) {
              try { await ctx.react("❤"); } catch {}
            }
            // Voice: fire-and-forget
            const voiceLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
            generateVoice(result.text, voiceLang).then((vb) => {
              if (vb) {
                const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
                sendViaTelegram(ctx, vmsgs).catch(() => {});
              }
            });
          }
        } else {
          const naturalResult = await handleNaturalMessage(prisma, ctx);
          if (naturalResult) {
            // Send text immediately
            const messages = formatForChannel(
              { text: naturalResult.text },
              "telegram",
            );
            await sendViaTelegram(ctx, messages);
            // Voice: fire-and-forget
            const voiceNatLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
            generateVoice(naturalResult.text, voiceNatLang).then((vb) => {
              if (vb) {
                const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
                sendViaTelegram(ctx, vmsgs).catch(() => {});
              }
            });
          }
        }
      } finally {
        // Restore original message state (voice messages have no text)
        if (originalText === undefined) {
          delete (msg as any).text;
        } else {
          (msg as any).text = originalText;
        }
      }
    } catch (err: any) {
      console.error("[Voice] Handler error:", err.message || err);
    }
  });

  // ── Evidencia: fotos y documentos ──────────────────────────────────────
  // Handlers for photo and document uploads as task evidence.
  // When the bot previously asked a user for evidence, it sets
  // session.awaitingEvidenceTaskId + awaitingEvidenceBotMsgId.
  // These handlers detect the upload, download the file from Telegram,
  // and POST it to POST /api/tasks/:id/evidence.

  const EVIDENCE_API_URL = "http://localhost:3100/api/tasks";
  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

  async function handleEvidenceUpload(
    ctx: BotContext,
    fileId: string,
    fileName: string,
    mimeType: string,
    taskId: string,
    prisma: PrismaClient,
  ): Promise<string | null> {
    try {
      // 1. Get file path from Telegram
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[Evidence] Telegram returned no file_path for", fileId);
        return null;
      }

      // 2. Download file from Telegram
      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      // 3. POST to evidence endpoint as multipart
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append("file", blob, fileName);

      const evidenceResp = await fetch(`${EVIDENCE_API_URL}/${taskId}/evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_SERVER_KEY}`,
        },
        body: formData,
      });

      if (!evidenceResp.ok) {
        const errText = await evidenceResp.text();
        console.error("[Evidence] API rejected upload:", evidenceResp.status, errText);
        return null;
      }

      const data = await evidenceResp.json() as any;
      return data.evidenceUrl ?? null;
    } catch (err: any) {
      console.error("[Evidence] Upload exception:", err.message || err);
      return null;
    }
  }

  // ── Auto-save: guardar archivo en sandbox del árbol (modo no-evidencia) ──────

  async function saveToSandbox(
    ctx: BotContext,
    fileId: string,
    fileName: string,
    treeId: string,
  ): Promise<string | null> {
    try {
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[Sandbox] Telegram returned no file_path for", fileId);
        return null;
      }

      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      const formData = new FormData();
      formData.append("file", new Blob([fileBuffer as unknown as ArrayBufferView]), fileName);

      const resp = await fetch(
        `http://localhost:3100/api/trees/${treeId}/sandbox/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${API_SERVER_KEY}` },
          body: formData,
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("[Sandbox] Upload rejected:", resp.status, errText);
        return null;
      }

      const data = (await resp.json()) as any;
      return data.path ?? null;
    } catch (err: any) {
      console.error("[Sandbox] Upload exception:", err.message || err);
      return null;
    }
  }

  // ── Silent media save: fire-and-forget directo a filesystem ────────────
  // Descarga el archivo de Telegram y lo guarda en
  //   TREES_BASE/<treeId>/media/<senderName>/<YYYY-MM-DD>_<filename>
  // Sin preguntar, sin botones, sin esperar respuesta.
  async function silentSaveMedia(
    ctx: BotContext,
    fileId: string,
    fileName: string,
    treeId: string,
  ): Promise<void> {
    try {
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[MediaSave] Telegram returned no file_path for", fileId);
        return;
      }

      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      const TREES_BASE = process.env.SANDBOX_BASE_DIR || "/home/leo/trees";
      const rawName = ctx.from?.first_name
        || ctx.from?.username
        || ctx.from?.id.toString()
        || "unknown";
      const senderName = rawName
        .replace(/[^a-zA-Z0-9_\-\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1 ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 64) || "unknown";

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const dir = `${TREES_BASE}/${treeId}/media/${senderName}`;
      await fsPromises.mkdir(dir, { recursive: true });

      const destFile = `${dir}/${today}_${fileName}`;
      await fsPromises.writeFile(destFile, fileBuffer);
      console.log(`[MediaSave] Saved: ${destFile}`);
    } catch (err: any) {
      console.error("[MediaSave] Error:", err.message || err);
      // Fire-and-forget: never throw to caller
    }
  }

  // ── Auto-index: fire-and-forget CLIP indexing after media save ──────────

  function spawnClipIndex(treeId: string): void {
    try {
      const scriptPath = require("path").join(__dirname, "..", "..", "lib", "clip_index.py");
      const sandboxDir = process.env.SANDBOX_BASE_DIR || "/home/leo/trees";
      const child = spawn("python3", [scriptPath, "index", treeId, "--media-root", sandboxDir], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log(`[ClipIndex] Spawned fire-and-forget index for tree ${treeId} (pid ${child.pid})`);
    } catch (err: any) {
      console.error("[ClipIndex] Spawn error:", err.message || err);
    }
  }

  bot.on("message:photo", async (ctx) => {
    console.log("[Photo] Handler triggered");
    const msg = ctx.message;
    if (!msg?.photo || msg.photo.length === 0) { console.log("[Photo] No photo data"); return; }

    const session = ctx.session;
    const taskId = session.awaitingEvidenceTaskId;

    // Must be awaiting evidence
    if (!taskId) {
      // Silent save: guardar en filesystem del árbol sin preguntar
      const chatId2 = ctx.chat?.id.toString();
      if (chatId2 && (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup")) {
        try {
          const tree2 = await findTreeByChat(prisma, chatId2);
          if (tree2) {
            const photo = msg.photo[msg.photo.length - 1];
            const fileId = photo.file_id;
            const fileName = `photo_${Date.now()}.jpg`;
            silentSaveMedia(ctx, fileId, fileName, tree2.id);
            spawnClipIndex(tree2.id);
          }
        } catch (_err: any) {
          console.error("[Photo] Silent save error:", _err.message || _err);
        }
      }
      return;
    }

    // Check reply-to matches the bot message that requested evidence (if set)
    const botMsgId = session.awaitingEvidenceBotMsgId;
    const repliedTo = msg.reply_to_message?.message_id;
    if (botMsgId && repliedTo !== botMsgId) return;

    // Highest resolution photo is the last element
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    await ctx.replyWithChatAction("upload_document");

    const fileName = `photo_${Date.now()}.jpg`;
    const evidenceUrl = await handleEvidenceUpload(
      ctx as BotContext, fileId, fileName, "image/jpeg", taskId, prisma,
    );

    // Clear awaiting state
    session.awaitingEvidenceTaskId = null;
    session.awaitingEvidenceBotMsgId = null;

    if (evidenceUrl) {
      await ctx.reply(
        "✅ Evidencia recibida. La foto fue registrada para la tarea.",
        { reply_to_message_id: msg.message_id },
      );
    } else {
      await ctx.reply(
        "⚠️ No se pudo procesar la foto como evidencia. Intenta de nuevo o contacta al administrador.",
        { reply_to_message_id: msg.message_id },
      );
    }
  });

  bot.on("message:document", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.document) return;

    const session = ctx.session;
    const taskId = session.awaitingEvidenceTaskId;

    // Must be awaiting evidence
    if (!taskId) {
      // Silent save: guardar en filesystem del árbol sin preguntar
      const chatId2 = ctx.chat?.id.toString();
      if (chatId2 && (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup")) {
        try {
          const tree2 = await findTreeByChat(prisma, chatId2);
          if (tree2) {
            const doc = msg.document;
            const fileId = doc.file_id;
            const fileName = doc.file_name ?? `document_${Date.now()}`;
            silentSaveMedia(ctx, fileId, fileName, tree2.id);
          }
        } catch (_err: any) {
          console.error("[Document] Silent save error:", _err.message || _err);
        }
      }
      return;
    }

    // Check reply-to matches the bot message that requested evidence (if set)
    const botMsgId = session.awaitingEvidenceBotMsgId;
    const repliedTo = msg.reply_to_message?.message_id;
    if (botMsgId && repliedTo !== botMsgId) return;

    const doc = msg.document;
    const fileId = doc.file_id;
    const fileName = doc.file_name ?? `document_${Date.now()}`;
    const mimeType = doc.mime_type ?? "application/octet-stream";

    await ctx.replyWithChatAction("upload_document");

    const evidenceUrl = await handleEvidenceUpload(
      ctx as BotContext, fileId, fileName, mimeType, taskId, prisma,
    );

    // Clear awaiting state
    session.awaitingEvidenceTaskId = null;
    session.awaitingEvidenceBotMsgId = null;

    if (evidenceUrl) {
      await ctx.reply(
        `✅ Evidencia recibida. El documento "${fileName}" fue registrado para la tarea.`,
        { reply_to_message_id: msg.message_id },
      );
    } else {
      await ctx.reply(
        "⚠️ No se pudo procesar el documento como evidencia. Intenta de nuevo o contacta al administrador.",
        { reply_to_message_id: msg.message_id },
      );
    }
  });

  // ── Video & audio: guardado silencioso (mismo patrón que photo/document) ──

  bot.on("message:video", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.video) return;

    const chatId2 = ctx.chat?.id.toString();
    if (!chatId2 || (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup")) return;

    try {
      const tree2 = await findTreeByChat(prisma, chatId2);
      if (tree2) {
        const video = msg.video;
        const fileId = video.file_id;
        const fileName = video.file_name ?? `video_${Date.now()}.mp4`;
        silentSaveMedia(ctx, fileId, fileName, tree2.id);
      }
    } catch (_err: any) {
      console.error("[Video] Silent save error:", _err.message || _err);
    }
  });

  bot.on("message:audio", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.audio) return;

    const chatId2 = ctx.chat?.id.toString();
    if (!chatId2 || (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup")) return;

    try {
      const tree2 = await findTreeByChat(prisma, chatId2);
      if (tree2) {
        const audio = msg.audio;
        const fileId = audio.file_id;
        const fileName = audio.file_name ?? `audio_${Date.now()}.mp3`;
        silentSaveMedia(ctx, fileId, fileName, tree2.id);
      }
    } catch (_err: any) {
      console.error("[Audio] Silent save error:", _err.message || _err);
    }
  });

  // ── Reaction handler (votos con reacciones) ─────────────────────────
  registerReactionHandler(bot);

  // ── Kanban Vote DM Handler ──────────────────────────────────────────
  async function handleKanbanVote(
    prisma: PrismaClient,
    ctx: BotContext,
    proposalId: string,
    vote: "yes" | "no",
  ) {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.answerCallbackQuery({ text: "⚠️ No se pudo identificar tu cuenta" });
      return;
    }

    try {
      // Resolve user by telegramUserId
      const user = await (prisma as any).user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true },
      });
      if (!user) {
        await ctx.answerCallbackQuery({ text: "⚠️ No tienes cuenta vinculada. Usa /start" });
        return;
      }

      // Verify proposal exists and is OPEN
      const proposal = await (prisma as any).kanbanProposal.findUnique({
        where: { id: proposalId },
      });
      if (!proposal) {
        await ctx.answerCallbackQuery({ text: "⚠️ Propuesta no encontrada" });
        return;
      }
      if (proposal.status !== "OPEN") {
        await ctx.answerCallbackQuery({
          text: `⚠️ La propuesta ya está ${proposal.status === "APPROVED" ? "APROBADA" : "RECHAZADA"}`,
        });
        return;
      }
      if (new Date() > new Date(proposal.expiresAt)) {
        await ctx.answerCallbackQuery({ text: "⚠️ La votación ya ha expirado" });
        return;
      }

      // Verify user is active member of the tree
      const member = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: user.id, treeId: proposal.treeId } },
      });
      if (!member || member.status !== "ACTIVE") {
        await ctx.answerCallbackQuery({ text: "⚠️ No eres miembro activo de este árbol" });
        return;
      }

      // Tree threshold check: trees with ≤voteThreshold members skip voting → direct execution
      const tree = await (prisma as any).tree.findUnique({
        where: { id: proposal.treeId },
        select: { voteThreshold: true },
      });
      const memberCount = await prisma.treeMember.count({
        where: { treeId: proposal.treeId, status: "ACTIVE" },
      });
      if (memberCount <= (tree?.voteThreshold ?? 20)) {
        // Direct execution — auto-approve without voting
        await (prisma as any).kanbanProposal.update({
          where: { id: proposalId },
          data: { status: "APPROVED", resolvedAt: new Date() },
        });
        await ctx.answerCallbackQuery({ text: "⚡ Árbol pequeño — ejecución directa, propuesta aprobada" });
        return;
      }

      // Prevent double vote (unique constraint on proposalId+userId)
      const existingVote = await (prisma as any).kanbanVote.findUnique({
        where: { proposalId_userId: { proposalId, userId: user.id } },
      });
      if (existingVote) {
        const prevLabel = existingVote.vote === "yes" ? "Sí" : "No";
        await ctx.answerCallbackQuery({ text: `⚠️ Ya votaste (${prevLabel})` });
        return;
      }

      // Record the vote
      await (prisma as any).kanbanVote.create({
        data: { proposalId, userId: user.id, vote },
      });

      // Increment counter
      const updateData =
        vote === "yes"
          ? { votesYes: { increment: 1 } }
          : { votesNo: { increment: 1 } };
      await (prisma as any).kanbanProposal.update({
        where: { id: proposalId },
        data: updateData,
      });

      // Edit DM to show vote confirmation and remove buttons
      const voteLabel = vote === "yes" ? "Sí" : "No";
      const voteEmoji = vote === "yes" ? "✅" : "❌";
      try {
        await ctx.editMessageText(
          `${ctx.callbackQuery?.message?.text ?? ""}\n\n${voteEmoji} Tu voto: ${voteLabel} registrado. Resultado en el grupo cuando cierre la votación.`,
          { reply_markup: undefined },
        );
      } catch {
        // Non-fatal — vote is already recorded; edit may fail if message text is unchanged or too old
        await ctx.answerCallbackQuery({ text: `${voteEmoji} Tu voto: ${voteLabel} registrado` });
        return;
      }

      await ctx.answerCallbackQuery({ text: `${voteEmoji} Tu voto: ${voteLabel} registrado` });
    } catch (err: any) {
      // Prisma unique constraint violation → double vote (race condition safety net)
      if (err?.code === "P2002") {
        await ctx.answerCallbackQuery({ text: "⚠️ Ya votaste en esta propuesta" });
        return;
      }
      console.error("[kanban:vote] DM handler error:", err.message);
      await ctx.answerCallbackQuery({ text: "⚠️ Error al registrar voto" });
    }
  }

  // ── DM: Inline button callbacks (perfil skills/tasks/costs, language selector) ──
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) {
      await ctx.answerCallbackQuery();
      return;
    }

    // DM tree selector callback
    if (data.startsWith("dm_tree:")) {
      const treeId = data.slice(8); // remove "dm_tree:"
      const session = (ctx as BotContext).session;
      session.dmTreeId = treeId;

      // Verify membership
      const tgUser = ctx.from;
      if (!tgUser) { await ctx.answerCallbackQuery(); return; }
      const user = await (prisma as any).user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true },
      });
      if (!user) { await ctx.answerCallbackQuery({ text: "⚠️ Sin cuenta" }); return; }
      const member = await (prisma as any).treeMember.findFirst({
        where: { userId: user.id, treeId, status: "ACTIVE" },
        include: { tree: { select: { name: true } } },
      });
      if (!member) {
        await ctx.answerCallbackQuery({ text: "⚠️ No eres miembro de ese árbol" });
        session.dmTreeId = null;
        return;
      }

      await ctx.editMessageText(`🌳 Hablando con Ari en *${member.tree.name}*.`);
      return;
    }

    // Language selector callbacks (DM)
    if (data === "lang:en" || data === "lang:es") {
      const lang = data === "lang:en" ? "en" : "es";
      await handleLanguageCallback(prisma, ctx, lang);
      return;
    }

    // Language selector callbacks (group welcome)
    if (data.startsWith("lang_group:")) {
      const parts = data.split(":");
      // parts = ["lang_group", "en"|"es", "treeId"]
      if (parts.length >= 3) {
        const lang = parts[1];
        const treeId = parts.slice(2).join(":"); // treeId may contain ':' if UUID
        if (lang === "en" || lang === "es") {
          await ctx.answerCallbackQuery();

          // Save language to tree
          try {
            await (prisma as any).tree.update({
              where: { id: treeId },
              data: { language: lang },
            });
          } catch (err: any) {
            console.error("[lang_group] Failed to update tree language:", err.message);
          }

          // Edit selector message to confirm
          try {
            await ctx.editMessageText(t("common.language_selected", lang), {
              reply_markup: undefined,
            });
          } catch {
            // Ok if edit fails
          }

          // Send welcome message in the selected language
          const welcomeMsg = await ctx.reply(t("onboarding.welcome_group", lang), {
            parse_mode: "Markdown",
          });
          trackBotMessage(prisma, treeId, welcomeMsg.message_id);

          // Send subtree question after brief pause
          await new Promise(r => setTimeout(r, 1500));
          await ctx.reply(
            "¿Es este un sub-árbol?",
            {
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: "\uD83C\uDF3F Sí, es sub-árbol",
                    callback_data: "osub_y:" + treeId,
                  },
                  {
                    text: "\uD83C\uDF33 No, es independiente",
                    callback_data: "osub_n:" + treeId,
                  },
                ]],
              },
            }
          );

          // Set onboarding session state
          const session = (ctx as BotContext).session;
          session.onboardingTreeId = treeId;
          session.onboardingStep = 1;

          // Guardar el creador del grupo como único autorizado para onboarding
          try {
            const admins = await ctx.getChatAdministrators();
            const creator = admins.find((a: any) => a.status === "creator");
            const inviterId = creator ? BigInt(creator.user.id) : BigInt(ctx.from.id);
            await (prisma as any).tree.update({
              where: { id: treeId },
              data: { onboardingInviterId: inviterId },
            });
          } catch {
            // Fallback: usar quien seleccionó el idioma
            await (prisma as any).tree.update({
              where: { id: treeId },
              data: { onboardingInviterId: BigInt(ctx.from.id) },
            });
          }
        }
      }
      return;
    }

    // T2: Early subtree question callbacks (group onboarding, before language selector)
    if (data.startsWith("osub_y:") || data.startsWith("osub_n:")) {
      const isYes = data.startsWith("osub_y:");
      const treeId = data.split(":")[1]; // treeId follows the prefix

      // Validate treeId is present (session may not be available in my_chat_member context)
      if (!treeId) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Remove inline keyboard from the question message
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }

      if (!isYes) {
        // No → language already selected, go to org question
        await ctx.answerCallbackQuery();

        // Read language from tree
        let lang = "es";
        try {
          const t = await (prisma as any).tree.findUnique({
            where: { id: treeId },
            select: { language: true },
          });
          if (t?.language) lang = t.language;
        } catch { /* default es */ }

        await ctx.reply(
          t("onboarding.org_question", lang) + "\n\n" +
          t("onboarding.org_examples", lang) + "\n\n" +
          "_" + t("onboarding.org_prompt", lang) + "_",
          {
            parse_mode: "Markdown",
            reply_markup: {
              force_reply: true,
              input_field_placeholder: t("onboarding.org_placeholder", lang),
            },
          }
        );

        // Set onboarding session state for org reply handling
        const session = (ctx as BotContext).session;
        session.onboardingTreeId = treeId;
        session.onboardingStep = 1;
        return;
      }

      // Yes → fetch user's memberships and show parent tree selector
      await ctx.answerCallbackQuery();

      const tgId = ctx.from!.id;
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgId) },
        select: { id: true },
      });

      if (!user) {
        await ctx.api.sendMessage(ctx.chat!.id, "⚠️ No se encontró tu cuenta. Continuando con el selector de idioma...");
        return;
      }

      const memberships = await prisma.treeMember.findMany({
        where: {
          userId: user.id,
          status: "ACTIVE",
          treeId: { not: treeId }, // exclude current tree
        },
          include: {
            tree: { select: { id: true, name: true, icono: true, createdAt: true } },
          },
          orderBy: { tree: { createdAt: 'desc' } },
        take: 50, // show all trees
      });

      if (memberships.length === 0) {
        await ctx.api.sendMessage(
          ctx.chat!.id,
          "No tienes otros árboles donde seas miembro. Continuando...",
        );

        // Language already selected, go to org question
        let lang = "es";
        try {
          const t = await (prisma as any).tree.findUnique({
            where: { id: treeId },
            select: { language: true },
          });
          if (t?.language) lang = t.language;
        } catch { /* default es */ }

        await ctx.reply(
          t("onboarding.org_question", lang) + "\n\n" +
          t("onboarding.org_examples", lang) + "\n\n" +
          "_" + t("onboarding.org_prompt", lang) + "_",
          {
            parse_mode: "Markdown",
            reply_markup: {
              force_reply: true,
              input_field_placeholder: t("onboarding.org_placeholder", lang),
            },
          }
        );

        const session = (ctx as BotContext).session;
        session.onboardingTreeId = treeId;
        session.onboardingStep = 1;
        return;
      }

      // T3: Parent tree selector — inline keyboard with tree icon + name
      // Use short callback_data: "psel:<idx>" with idx referencing memberships array
      const parentMap = new Map<string, string>();
      const keyboard = memberships.map((m, i) => {
        const key = `psel:${i}`;
        parentMap.set(key, JSON.stringify({ childId: treeId, parentId: m.tree.id }));
        return [{
          text: `${m.tree.icono || "\uD83C\uDF33"} ${m.tree.name}`,
          callback_data: key, // ~7 chars, well within 64-byte limit
        }];
      });
      // Store mapping keyed by chatId for retrieval in callback handler
      parentTreeSelectors.set(ctx.chat!.id.toString(), parentMap);

      try {
        await ctx.api.sendMessage(
          ctx.chat!.id,
          "Selecciona el árbol padre:",
          { reply_markup: { inline_keyboard: keyboard } },
        );
      } catch (err: any) {
        console.error("[parent_selector] sendMessage error:", err.message);
        await ctx.api.sendMessage(ctx.chat!.id, "⚠️ Error al mostrar el selector. Continuando con el idioma...");
      }
      return;
    }

    // T3: Parent tree selection callback (subtree early onboarding)
    if (data.startsWith("psel:")) {
      const chatId = ctx.chat!.id.toString();
      const chatMap = parentTreeSelectors.get(chatId);
      if (!chatMap) {
        await ctx.answerCallbackQuery({ text: "Selector expirado. Reintenta." });
        return;
      }
      const payload = chatMap.get(data);
      if (!payload) {
        await ctx.answerCallbackQuery({ text: "Opción no encontrada." });
        return;
      }
      const { childId, parentId } = JSON.parse(payload) as { childId: string; parentId: string };

      const tgId = ctx.from!.id;
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgId) },
        select: { id: true },
      });

      if (!user) {
        await ctx.editMessageText(
          "⚠️ No se encontró tu cuenta. Contacta a @TrustHelpDeskBot.",
          { reply_markup: undefined },
        );
        await ctx.answerCallbackQuery();
        return;
      }

      const parentMembership = await prisma.treeMember.findFirst({
        where: {
          userId: user.id,
          treeId: parentId,
          status: "ACTIVE",
        },
      });

      if (!parentMembership) {
        await ctx.editMessageText(
          "⚠️ No eres miembro activo de ese árbol. Selecciona otro o continúa con el selector de idioma.",
          { reply_markup: undefined },
        );
        await ctx.answerCallbackQuery();
        return;
      }

      // Link child tree to parent
      try {
        await (prisma as any).tree.update({
          where: { id: childId },
          data: { parentTreeId: parentId },
        });

        // T4: Notify parent chat about new sub-tree linkage
        const parentTree = await (prisma as any).tree.findUnique({
          where: { id: parentId },
          select: { telegramChatId: true, name: true },
        });
        const childTree = await (prisma as any).tree.findUnique({
          where: { id: childId },
          select: { name: true },
        });

        if (parentTree?.telegramChatId && childTree) {
          const bridgeMsg = `🌿 *Nuevo sub-árbol vinculado:* 🌳 ${childTree.name}\nAhora las IAs de ambos árboles pueden colaborar.`;
          try {
            await ctx.api.sendMessage(parentTree.telegramChatId, bridgeMsg, {
              parse_mode: "Markdown",
            });
          } catch (sendErr: any) {
            console.error("[parent_select] Failed to notify parent chat:", sendErr.message);
          }
        }

        await ctx.editMessageText("✅ Vinculado como sub-árbol.", { reply_markup: undefined });
      } catch (err: any) {
        console.error("[parent_select] Failed to link parent tree:", err.message);
        await ctx.editMessageText("❌ Error al vincular. Intenta de nuevo.", { reply_markup: undefined });
      }
      await ctx.answerCallbackQuery();

      // Language already selected, go to org question
      let lang = "es";
      try {
        const t = await (prisma as any).tree.findUnique({
          where: { id: childId },
          select: { language: true },
        });
        if (t?.language) lang = t.language;
      } catch { /* default es */ }

      await ctx.reply(
        t("onboarding.org_question", lang) + "\n\n" +
        t("onboarding.org_examples", lang) + "\n\n" +
        "_" + t("onboarding.org_prompt", lang) + "_",
        {
          parse_mode: "Markdown",
          reply_markup: {
            force_reply: true,
            input_field_placeholder: t("onboarding.org_placeholder", lang),
          },
        }
      );

      const session = (ctx as BotContext).session;
      session.onboardingTreeId = childId;
      session.onboardingStep = 1;
      return;
    }

    // Onboarding multi-step callbacks (Paso 3: payment mode)
    if (data === "onboarding:payment_centralized" || data === "onboarding:payment_individual") {
      const session = (ctx as BotContext).session;
      if (!session.onboardingTreeId || session.onboardingStep !== 3) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Resolve language
      let lang: string | null = null;
      const chatType = ctx.chat?.type;
      if ((chatType === "group" || chatType === "supergroup") && session.onboardingTreeId) {
        lang = await resolveTreeLanguage(prisma, session.onboardingTreeId);
      }
      if (!lang) {
        lang = await resolveUserLanguage(prisma, ctx);
      }
      if (!lang) lang = "es";

      // Remove inline keyboard from the question message
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }

      const paymentMode: "CENTRALIZED" | "INDIVIDUAL" =
        data === "onboarding:payment_centralized" ? "CENTRALIZED" : "INDIVIDUAL";

      if (paymentMode === "CENTRALIZED") {
        // Find the user to set as sponsor
        const tgId = BigInt(ctx.from!.id);
        const sponsorUser = await prisma.user.findUnique({
          where: { telegramUserId: tgId },
          select: { id: true },
        });

        await (prisma as any).tree.update({
          where: { id: session.onboardingTreeId },
          data: {
            paymentMode: "CENTRALIZED",
            sponsorId: sponsorUser?.id || null,
          },
        });

        await ctx.reply(t("onboarding.payment_mode_centralized_selected", lang) +
          "\n\n💳 Configura tu método de pago con /pagar", {
            parse_mode: "Markdown",
          });

        // Centralized: done with onboarding (no parent code or WhatsApp for now)
        session.onboardingStep = null;
        session.onboardingTreeId = null;
        await new Promise(r => setTimeout(r, 500));
        await ctx.reply(t("onboarding.onboarding_complete", lang), {
          parse_mode: "Markdown",
        });
      } else {
        // Individual mode
        await (prisma as any).tree.update({
          where: { id: session.onboardingTreeId },
          data: { paymentMode: "INDIVIDUAL" },
        });

        await ctx.reply(t("onboarding.payment_mode_individual_selected", lang), {
          parse_mode: "Markdown",
        });

        // T7: Parent code step removed — both paths go directly to WhatsApp (step 4)
        session.onboardingStep = 4;
        await new Promise(r => setTimeout(r, 600));
        await ctx.reply(
          t("onboarding.whatsapp_prompt", lang), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true, input_field_placeholder: t("onboarding.whatsapp_placeholder", lang) },
          }
        );
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // Kanban vote callbacks (DM inline buttons: kanban_vote:PROPOSAL_ID:yes|no)
    if (data.startsWith("kanban_vote:")) {
      const parts = data.split(":");
      // parts = ["kanban_vote", "PROPOSAL_ID", "yes"|"no"]
      if (parts.length >= 3) {
        const proposalId = parts.slice(1, -1).join(":"); // handle UUIDs with dashes
        const vote = parts[parts.length - 1] as "yes" | "no";
        await handleKanbanVote(prisma, ctx as BotContext, proposalId, vote);
      } else {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos de votación inválidos" });
      }
      return;
    }

    // Attach:link_confirm — user picks from multiple matching tasks
    if (data.startsWith("attach:link_confirm:")) {
      const parts = data.split(":");
      // parts = ["attach", "link_confirm", todoId, ...filePathParts]
      const todoId = parts[2];
      const filePath = parts.slice(3).join(":");

      if (!todoId || !filePath) {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos inválidos" });
        return;
      }

      try {
        const todo = await (prisma as any).todo.findUnique({
          where: { id: todoId },
          select: { id: true, text: true, summary: true },
        });
        if (!todo) {
          await ctx.editMessageText("⚠️ La tarea ya no existe.");
          return;
        }
        const fileNote = `\n📎 Archivo vinculado: ${filePath}`;
        await (prisma as any).todo.update({
          where: { id: todo.id },
          data: { text: (todo.text || "") + fileNote },
        });
        await ctx.editMessageText(
          `🔗 Archivo vinculado a la tarea *${todo.summary}*.`,
          { parse_mode: "Markdown" }
        );
      } catch (err: any) {
        console.error("[attach:link_confirm] Error:", err.message);
        await ctx.answerCallbackQuery({ text: "⚠️ Error al vincular" });
      }
      return;
    }

    // Worker callbacks (onboarding currency/confirm/edit/toggle/claim)
    if (data.startsWith("worker_")) {
      await handleWorkerCallback(prisma, ctx as BotContext);
      return;
    }

    // External task callbacks (claim/deliver)
    if (data.startsWith("external_")) {
      const { handleExternalCallback } = await import("./worker");
      await handleExternalCallback(prisma, ctx as BotContext);
      return;
    }

    // Attach file callbacks (sandbox file buttons: photo/document uploads)
    if (data.startsWith("attach:")) {
      const parts = data.split(":");
      // parts = ["attach", action, treeId, ...filePathParts]
      const action = parts[1];
      const treeId = parts[2];
      const filePath = parts.slice(3).join(":");

      if (!action || !treeId || !filePath) {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos inválidos" });
        return;
      }

      await ctx.answerCallbackQuery();

      switch (action) {
        case "link": {
          // Step 1: save state, ask user which task to link
          const session = (ctx as BotContext).session;
          session.awaitingLinkFile = filePath;
          session.awaitingLinkTreeId = treeId;
          await ctx.editMessageText(
            "🔗 ¿A qué tarea quieres vincular este archivo?\nResponde con el nombre o ID de la tarea."
          );
          break;
        }
        case "analyze": {
          try {
            await ctx.editMessageText("🔍 Enviando a Ari para análisis...");
            await routeToHermes(
              `Analiza el archivo "${filePath}" en el sandbox del árbol ${treeId}. Describe su contenido, utilidad y si detectas algo relevante para las necesidades del árbol.`,
              treeId,
              ctx.from?.id?.toString() ?? "0",
              undefined,
              ctx.from?.first_name,
              ctx.chat?.id,
              ctx.callbackQuery?.message?.message_id,
            );
          } catch (err: any) {
            console.error("[attach:analyze] Error routing to Hermes:", err.message);
          }
          break;
        }
        case "keep": {
          await ctx.editMessageText("💾 Archivo guardado en el sandbox del árbol.");
          break;
        }
        case "discard": {
          try {
            const TREES_BASE = process.env.SANDBOX_BASE_DIR || "/home/leo/trees";
            const fullPath = require("path").join(TREES_BASE, treeId, filePath);
            const resolved = require("path").resolve(fullPath);
            // Safety: ensure path is inside the tree's sandbox
            const sandboxRoot = require("path").resolve(TREES_BASE, treeId);
            if (!resolved.startsWith(sandboxRoot)) {
              await ctx.editMessageText("⚠️ Ruta insegura, descarte cancelado.");
              return;
            }
            require("fs").unlinkSync(resolved);
            await ctx.editMessageText("🗑 Archivo descartado.");
          } catch (err: any) {
            console.error("[attach:discard] Error deleting file:", err.message);
            await ctx.editMessageText(
              err.code === "ENOENT"
                ? "⚠️ El archivo ya no existe."
                : "⚠️ Error al descartar el archivo."
            );
          }
          break;
        }
        default: {
          await ctx.answerCallbackQuery({ text: "⚠️ Acción no reconocida" });
        }
      }
      return;
    }

    // ── Candidate: "Yo puedo" button (tree-first hiring, V4 i18n) ────────────
    // Callback format: candidate:apply:<treeId>:<taskId>
    if (data.startsWith("candidate:apply:")) {
      const rest = data.slice("candidate:apply:".length);
      const colonIdx = rest.indexOf(":");
      if (colonIdx === -1) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_invalid", "es") });
        return;
      }
      const treeId = rest.slice(0, colonIdx);
      const taskId = rest.slice(colonIdx + 1);

      if (!treeId || !taskId) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_incomplete", "es") });
        return;
      }

      const tgUser = ctx.from;
      if (!tgUser) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_no_user", "es") });
        return;
      }

      const lng = await resolveUserLanguage(prisma, ctx) ?? tgUser.language_code ?? "es";

      const user = await (prisma as any).user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true, firstName: true },
      });
      if (!user) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_no_account", lng) });
        return;
      }

      // Verify user is active member of the tree (treeId from callback, no ExternalTask needed)
      const member = await (prisma as any).treeMember.findUnique({
        where: { userId_treeId: { userId: user.id, treeId } },
        select: { status: true },
      });
      if (!member || member.status !== "ACTIVE") {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_not_member", lng) });
        return;
      }

      // Check for duplicate application
      const existing = await (prisma as any).candidate.findFirst({
        where: { userId: user.id, taskId },
      });
      if (existing) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_already_applied", lng) });
        return;
      }

      // Register candidate
      try {
        await (prisma as any).candidate.create({
          data: { userId: user.id, taskId, treeId },
        });
        await ctx.answerCallbackQuery({ text: t("v1_candidate.applied_ok", lng) });

        // Get updated candidate count
        const candidateCount = await (prisma as any).candidate.count({
          where: { taskId },
        });

        // Group notification: "@user se postulo (N candidatos)"
        const userMention = tgUser.first_name || tgUser.username || `tg${tgUser.id}`;
        const plural = candidateCount !== 1 ? "s" : "";
        try {
          await ctx.reply(
            t("v1_candidate.group_notify", lng, { name: userMention, count: candidateCount, plural }),
            { parse_mode: "MarkdownV2" },
          );
        } catch (notifyErr: any) {
          console.error("[candidate:apply] Group notify error:", notifyErr.message);
        }

        // Edit the button to show updated candidate count
        try {
          const buttonLabel = t("v1.button_apply_count", lng, { count: candidateCount });
          await ctx.editMessageReplyMarkup({
            reply_markup: {
              inline_keyboard: [[
                { text: buttonLabel, callback_data: `candidate:apply:${treeId}:${taskId}` },
              ]],
            },
          });
        } catch { /* message may already be edited */ }
      } catch (err: any) {
        console.error("[candidate:apply] Error:", err.message);
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_error", lng) });
      }
      return;
    }

    const handled = await handleProfileCallback(prisma, ctx as BotContext);
    if (!handled) {
      // Unknown callback — acknowledge silently
      await ctx.answerCallbackQuery();
    }
  });

  // ── Unified poll_answer handler (T8: need voting, T10: satisfaction) ──
  bot.on("poll_answer", async (ctx) => {
    const answer = ctx.pollAnswer;
    if (!answer) return;

    // T8: Check if this is a need-voting poll
    const handled = await handleNeedPollAnswer(prisma, ctx as BotContext);
    if (handled) return;

    // T10: Fall through to satisfaction
    const pollId = answer.poll_id;
    const optionIds = answer.option_ids;
    const voterId = answer.user?.id;
    if (!voterId || optionIds.length === 0) return;

    handleSatisfactionPollAnswer(prisma, ctx as BotContext, pollId, optionIds, voterId).catch(
      (err: any) => console.error("[satisfaction] poll_answer handler error:", err.message)
    );
  });

  // ── Satisfaction comment reply handler (T10) ────────────────────────
  // Runs before the main message:text handler. Detects force_reply
  // responses to the bot's "¿Quieres agregar un comentario?" prompt.
  bot.on("message:text", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg)) return next();

    // ── Attach:link step 2 — user responds with task name/ID ──────────
    const session = (ctx as BotContext).session;
    if (session.awaitingLinkFile && session.awaitingLinkTreeId) {
      const taskQuery = msg.text.trim();
      const treeId = session.awaitingLinkTreeId;
      const filePath = session.awaitingLinkFile;

      // Clear session state immediately
      session.awaitingLinkFile = null;
      session.awaitingLinkTreeId = null;

      try {
        // Search for the task by summary or ID in this tree
        const todos = await (prisma as any).todo.findMany({
          where: {
            treeId,
            status: "PENDING",
            OR: [
              { id: taskQuery },
              { summary: { contains: taskQuery } },
            ],
          },
          take: 5,
        });

        if (todos.length === 0) {
          await ctx.reply(
            `⚠️ No encontré ninguna tarea pendiente que coincida con "${taskQuery}" en este árbol.`
          );
        } else if (todos.length === 1) {
          // Single match — link and confirm
          // Store the file reference in the todo's text field (append)
          const todo = todos[0];
          const fileNote = `\n📎 Archivo vinculado: ${filePath}`;
          await (prisma as any).todo.update({
            where: { id: todo.id },
            data: { text: (todo.text || "") + fileNote },
          });
          await ctx.reply(
            `🔗 Archivo vinculado a la tarea "${todo.summary}".`
          );
        } else {
          // Multiple matches — ask to pick one
          const buttons = todos.map((t: any) => [{
            text: t.summary.slice(0, 40) + (t.summary.length > 40 ? "…" : ""),
            callback_data: `attach:link_confirm:${t.id}:${filePath}`,
          }]);
          await ctx.reply("🔗 Varias tareas coinciden. ¿A cuál quieres vincular el archivo?", {
            reply_markup: { inline_keyboard: buttons },
          });
        }
      } catch (err: any) {
        console.error("[attach:link] Error linking file:", err.message);
        await ctx.reply("⚠️ Error al vincular el archivo con la tarea.");
      }
      return;
    }

    // Check if this is a reply to a bot message (force_reply pattern)
    if (msg.reply_to_message) {
      const handled = await handleSatisfactionCommentReply(prisma, ctx as BotContext);
      if (handled) return; // Don't continue to the normal message handler
    }

    return next();
  });

  // ── Todo reaction handler: track likeCount from message reactions ──
  bot.on("message_reaction", async (ctx) => {
    const chatId = ctx.chat?.id;
    const msgId = ctx.messageReaction?.message_id;
    if (!chatId || !msgId) return;

    try {
      const todo = await (prisma as any).todo.findFirst({
        where: { chatId: BigInt(chatId), messageId: BigInt(msgId) },
      });
      if (todo) {
        const oldLen = (ctx.messageReaction?.old_reaction || []).length;
        const newLen = (ctx.messageReaction?.new_reaction || []).length;
        const delta = newLen - oldLen;
        if (delta !== 0) {
          await (prisma as any).todo.update({
            where: { id: todo.id },
            data: { likeCount: Math.max(0, todo.likeCount + delta) },
          });
        }
      }
    } catch (err) {
      // Non-critical — silently ignore
    }
  });

  // ── Welcome: saludar a nuevos miembros ──────────────────────────────
  bot.on("message:new_chat_members", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") return;

    const newMembers = ctx.message.new_chat_members;
    if (!newMembers || newMembers.length === 0) return;

    const chatId = ctx.chat.id.toString();

    // Resolve tree (skip if not linked)
    let tree: any;
    try {
      tree = await (prisma as any).tree.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true, language: true, name: true },
      });
    } catch { return; }
    if (!tree) return;

    const lang = tree.language || "es";

    for (const member of newMembers) {
      if (member.is_bot) continue;

      const userName = member.first_name || "nuevo miembro";
      const mention = member.username ? `@${member.username}` : userName;

      const welcomeText = lang === "en"
        ? [
            `Hi ${mention}! 👋 I'm Ari, the group's multi-agent assistant.`,
            "",
            `I help organize tasks, vote on needs, and keep projects moving. You can ask me things like "Ari add buy charcoal" or use /todo to manage the shared task list.`,
            "",
            `Welcome to the tree! 🌳`,
          ].join("\n")
        : [
            `¡Hola ${mention}! 👋 Soy Ari, la asistente multi-agente del grupo.`,
            "",
            `Ayudo a organizar tareas, votar necesidades y mantener los proyectos en marcha. Podés pedirme cosas como \"Ari anota comprar carbón\" o usar /todo para gestionar la lista de tareas compartida.`,
            "",
            `¡Bienvenido al árbol! 🌳`,
          ].join("\n");

      try {
        await ctx.api.sendMessage(chatId, welcomeText, {
          parse_mode: "Markdown",
        });
      } catch (markdownErr: any) {
        if (markdownErr.message?.includes("can't parse entities")) {
          await ctx.api.sendMessage(chatId, welcomeText);
        }
      }
    }
  });

  // ── Global error boundary: evita que el polling muera silenciosamente ─
  bot.catch((err) => {
    console.error(
      `[Telegram Bot] Unhandled error:`,
      err.message,
      err.error_code ? `(code: ${err.error_code})` : "",
    );
  });

  // ── Telegram API errors: log + recovery ──────────────────────────────
  bot.api.config.use((prev, method, payload) => {
    return prev(method, payload).catch((err: any) => {
      console.error(
        `[Telegram Bot] API error: ${method}`,
        err.error_code || err.message,
      );
      throw err;
    });
  });

  // ── Inicializar i18n ───────────────────────────────────────────────────
  await initI18n();

  // ── Iniciar polling ────────────────────────────────────────────────────
  bot.start({
    onStart(botInfo) {
      console.log(
        `[Telegram Bot] @${botInfo.username} iniciado en modo polling`
      );
      // T13: Recuperar encuestas de aprobación pendientes tras reinicio
      recoverPendingApprovals(bot, prisma).catch((err) =>
        console.error("[approval] Recovery error:", err.message)
      );
    },
  }).catch((err) => {
    console.error("[Telegram Bot] ERROR al iniciar polling:", err.message);
  });

  // Initialize payment service (used by /pagar command)
  initPaymentService(prisma, bot);

  // ── Todo reminders cron: cada 30 minutos ─────────────────────────
  // Solo activo si HERMES_BRIDGE_ENABLED=true (el bot está activo en modo agente)
  if (process.env.HERMES_BRIDGE_ENABLED === "true") {
    const REMINDER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
    console.log(
      `[TodoReminders] Cron iniciado — se ejecutará cada ${REMINDER_INTERVAL_MS / 60000} min`
    );
    // Run once on startup, then on interval
    checkTodoReminders(prisma, bot).catch((err) =>
      console.error("[TodoReminders] Startup check error:", err.message)
    );
    setInterval(() => {
      checkTodoReminders(prisma, bot).catch((err) =>
        console.error("[TodoReminders] Cron error:", err.message)
      );
    }, REMINDER_INTERVAL_MS);

    // ── Cleanup: delete trees past pendingDeletionAt every 5 min ────────
    setInterval(async () => {
      try {
        const expired = await (prisma as any).tree.findMany({
          where: { pendingDeletionAt: { lte: new Date() } },
          select: { id: true, name: true, telegramChatId: true },
        });
        for (const tree of expired) {
          await (prisma as any).tree.delete({ where: { id: tree.id } });
          console.log(`[Cleanup] Deleted tree "${tree.name}" (${tree.id}) — auto-cleanup after removal`);
        }
      } catch (err: any) {
        console.error("[Cleanup] Error deleting expired trees:", err.message);
      }
    }, 5 * 60 * 1000);
  }

  return bot;
}
