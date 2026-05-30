// ── Bot orchestrator: imports + middleware + registry dispatch ──
// Each module registers its own commands/handlers via register(bot, prisma).

import { Bot, session } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext, BotSessionData } from "./types";

// ── Registry modules ──
import { register as registerCommands } from "./registry/commands";
import { register as registerAdmin } from "./registry/admin";
import { register as registerWorker } from "./registry/worker";
import { register as registerGroups } from "./registry/groups";
import { register as registerMedia } from "./registry/media";
import { register as registerDMs } from "./registry/dms";
import { register as registerCallbacks } from "./registry/callbacks";
import { register as registerOnboarding } from "./registry/onboarding";
import { register as registerGroupLifecycle } from "./registry/group-lifecycle";

// ── Remaining middleware / handlers ──
import { resolveTree } from "./middleware";
import { checkRateLimit } from "./rateLimiter";
import { registerReactionHandler, handleNeedPollAnswer } from "./voting";
import {
  handleSatisfactionPollAnswer,
  handleSatisfactionCommentReply,
} from "./satisfaction";
import { handleEncuestaText } from "./encuesta";
import { handleCycleVotePollAnswer } from "./pollHandler";
import { initI18n } from "./i18n";
import { initPaymentService } from "../services/telegramBotService";
import { checkTodoReminders } from "./todoReminders";
import { recoverPendingApprovals } from "./approval";

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

  // ── Tree resolver middleware: injects ctx.tree once per message ─────
  bot.use(resolveTree(prisma));

  // ── Rate limiter middleware ─────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgUser = ctx.from;
    if (!tgUser) return next();
    const userId = tgUser.id;
    const chatId = ctx.chat?.id;
    const groupId = chatId ? `${chatId}` : `user_${userId}`;
    try {
      const passedLimit = await checkRateLimit(prisma, groupId, userId);
      if (!passedLimit) {
        const lang = ctx.from?.language_code?.startsWith("en") ? "en" : "es";
        await ctx.reply(
          lang === "en"
            ? "⏳ Please wait a bit before sending more messages."
            : "⏳ Por favor espera un momento antes de enviar más mensajes."
        );
        return;
      }
    } catch (err: any) {
      console.error("[rateLimiter] middleware error:", err.message);
    }
    return next();
  });

  // ── Registry: dispatch all modules ──────────────────────────────────────
  registerCommands(bot, prisma);
  registerAdmin(bot, prisma);
  registerWorker(bot, prisma);
  registerOnboarding(bot, prisma);
  registerGroups(bot, prisma);
  registerGroupLifecycle(bot, prisma);
  registerDMs(bot, prisma);
  registerMedia(bot, prisma);
  registerCallbacks(bot, prisma);

  // ── Reaction handler (votos con reacciones) ─────────────────────────────
  registerReactionHandler(bot);

  // ── Unified poll_answer handler (T8: need voting, T10: satisfaction, F7: cycle voting) ────
  bot.on("poll_answer", async (ctx) => {
    // F7: Cycle voting (NeedVote via native DM polls 1-10)
    try {
      const handled = await handleCycleVotePollAnswer(prisma, ctx as BotContext);
      if (handled) return;
    } catch (err: any) {
      console.error("[pollHandler] poll_answer handler error:", err.message);
    }
    // T8: Need → Idea voting (group polls)
    try {
      await handleNeedPollAnswer(prisma, ctx as BotContext);
    } catch (err: any) {
      console.error("[voting] poll_answer handler error:", err.message);
    }
    try {
      await handleSatisfactionPollAnswer(prisma, ctx as BotContext);
    } catch (err: any) {
      console.error("[satisfaction] poll_answer handler error:", err.message);
    }
  });

  // ── Satisfaction comment reply + encuesta text + attach:link ────────────
  bot.on("message:text", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg)) return next();

    // ── Attach:link step 2 — user responds with task name/ID ──────────
    const session = (ctx as BotContext).session;
    if (session.awaitingLinkFile && session.awaitingLinkTreeId) {
      const taskQuery = msg.text.trim();
      const treeId = session.awaitingLinkTreeId;
      const filePath = session.awaitingLinkFile;

      session.awaitingLinkFile = null;
      session.awaitingLinkTreeId = null;

      try {
        const todos = await prisma.todo.findMany({
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
          const todo = todos[0];
          const fileNote = `\n📎 Archivo vinculado: ${filePath}`;
          await prisma.todo.update({
            where: { id: todo.id },
            data: { text: (todo.text || "") + fileNote },
          });
          await ctx.reply(
            `🔗 Archivo vinculado a la tarea "${todo.summary}".`
          );
        } else {
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

    // ── Encuesta wizard text continuation (skill, duration) ───────────
    const encuestaHandled = await handleEncuestaText(prisma, bot, ctx as BotContext);
    if (encuestaHandled) return;

    // Check if this is a reply to a bot message (force_reply pattern)
    if (msg.reply_to_message) {
      const handled = await handleSatisfactionCommentReply(prisma, ctx as BotContext);
      if (handled) return;
    }

    return next();
  });

  // ── Todo reaction handler: track likeCount from message reactions ──
  bot.on("message_reaction", async (ctx) => {
    const chatId = ctx.chat?.id;
    const msgId = ctx.messageReaction?.message_id;
    if (!chatId || !msgId) return;

    try {
      const todo = await prisma.todo.findFirst({
        where: { chatId: BigInt(chatId), messageId: BigInt(msgId) },
      });
      if (todo) {
        const oldLen = (ctx.messageReaction?.old_reaction || []).length;
        const newLen = (ctx.messageReaction?.new_reaction || []).length;
        const delta = newLen - oldLen;
        if (delta !== 0) {
          await prisma.todo.update({
            where: { id: todo.id },
            data: { likeCount: Math.max(0, todo.likeCount + delta) },
          });
        }
      }
    } catch (err) {
      // Non-critical — silently ignore
    }
  });

  // ── Global error boundary ───────────────────────────────────────────────
  bot.catch((err) => {
    console.error(
      `[Telegram Bot] Unhandled error:`,
      err.message,
      err.error_code ? `(code: ${err.error_code})` : "",
    );
  });

  // ── Telegram API errors: log + recovery ─────────────────────────────────
  bot.api.config.use((prev, method, payload) => {
    return prev(method, payload).catch((err: any) => {
      console.error(
        `[Telegram Bot] API error: ${method}`,
        err.error_code || err.message,
      );
      throw err;
    });
  });

  // ── Inicializar i18n ────────────────────────────────────────────────────
  console.log("[DEBUG] initI18n type:", typeof initI18n);
  await initI18n();

  // Initialize payment service
  initPaymentService(prisma, bot);

  // ── Todo reminders cron: cada 30 minutos ────────────────────────────────
  if (process.env.HERMES_BRIDGE_ENABLED === "true") {
    const REMINDER_INTERVAL_MS = 30 * 60 * 1000;
    console.log(
      `[TodoReminders] Cron iniciado — se ejecutará cada ${REMINDER_INTERVAL_MS / 60000} min`
    );
    checkTodoReminders(prisma, bot).catch((err) =>
      console.error("[TodoReminders] Startup check error:", err.message)
    );
    setInterval(() => {
      checkTodoReminders(prisma, bot).catch((err) =>
        console.error("[TodoReminders] Cron error:", err.message)
      );
    }, REMINDER_INTERVAL_MS);

    // ── Cleanup: delete trees past pendingDeletionAt every 5 min ───────────
    setInterval(async () => {
      try {
        const expired = await prisma.tree.findMany({
          where: { pendingDeletionAt: { lte: new Date() } },
          select: { id: true, name: true, telegramChatId: true },
        });
        for (const tree of expired) {
          await prisma.tree.delete({ where: { id: tree.id } });
          console.log(`[Cleanup] Deleted tree "${tree.name}" (${tree.id}) — auto-cleanup after removal`);
        }
      } catch (err: any) {
        console.error("[Cleanup] Error deleting expired trees:", err.message);
      }
    }, 5 * 60 * 1000);
  }

  return bot;
}

/**
 * Inicia el bot en modo polling (fallback cuando no hay túnel webhook disponible).
 * Exportada para que src/index.ts pueda usarla como alternativa al webhook.
 */
export async function startBotPolling(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  maxRetries = 5,
): Promise<void> {
  // Quick connectivity test
  try {
    const me = await bot.api.getMe();
    console.log(`[Telegram Bot] getMe OK: @${me.username}`);
  } catch (e: any) {
    console.error(`[Telegram Bot] getMe FAILED:`, e.message);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.start({
        drop_pending_updates: true,
        onStart(botInfo) {
          console.log(
            `[Telegram Bot] @${botInfo.username} iniciado en modo polling`,
          );
          recoverPendingApprovals(bot, prisma).catch((err) =>
            console.error("[approval] Recovery error:", err.message),
          );
        },
      });
      return;
    } catch (err: any) {
      const is409 = err?.error_code === 409;
      if (is409 && attempt < maxRetries) {
        const delay = Math.min(2000 * 2 ** (attempt - 1), 30000);
        console.warn(
          `[Telegram Bot] 409 Conflict (intento ${attempt}/${maxRetries}), reintentando en ${delay / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error("[Telegram Bot] ERROR al iniciar polling:", err.message);
        throw err;
      }
    }
  }
}
