import { Bot, session } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext, BotSessionData } from "./types";
import { handleMessage } from "./commands";
import { registerReactionHandler } from "./voting";

export function createBot(prisma: PrismaClient): Bot<BotContext> | null {
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
        return { userId: null, authenticatedAt: null };
      },
    })
  );

  // ── Comandos ───────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🌳 Bienvenido a Trust Maker v4.\n\n" +
        "Usa /login para vincular tu cuenta.\n" +
        "Usa /help para ver los comandos disponibles."
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Comandos disponibles:\n" +
        "/start — Iniciar el bot\n" +
        "/login — Vincular tu cuenta de Trust Maker\n" +
        "/help — Mostrar esta ayuda\n\n" +
        "En grupos, menciona @TrustMaker:\n" +
        "  @TrustMaker info\n" +
        "  @TrustMaker lista necesidades\n" +
        "  @TrustMaker crea necesidad \"título\" — descripción\n" +
        "  @TrustMaker ideas para \"título\"\n" +
        "  @TrustMaker vota <id>"
    );
  });

  // ── Mensajes de texto: comandos @TrustMaker ────────────────────────────
  bot.on("message:text", async (ctx) => {
    const result = await handleMessage(prisma, ctx);

    if (result) {
      await ctx.reply(result.text, { parse_mode: "Markdown" });

      // React with heart if the command requested it
      if (result.react) {
        try {
          await ctx.react("❤");
        } catch {
          // React API may not be available (older Telegram clients / bot API)
          // Silently ignore — the reply text already confirms the vote
        }
      }
    }
    // If result is null, the message wasn't for the bot — ignore silently
  });

  // ── Reaction handler (votos con reacciones) ─────────────────────────
  registerReactionHandler(bot);

  // ── Iniciar polling ────────────────────────────────────────────────────
  bot.start({
    onStart(botInfo) {
      console.log(
        `[Telegram Bot] @${botInfo.username} iniciado en modo polling`
      );
    },
  });

  return bot;
}
