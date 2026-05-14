import { Bot, session } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext, BotSessionData } from "./types";
import { handleMessage, extractCommandText } from "./commands";
import { handleNaturalMessage } from "./messages";
import { analyzeMessage } from "./analyzer";
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
        "En grupos, menciona @TrustMakerBot:\n" +
        "  @TrustMakerBot /info\n" +
        "  @TrustMakerBot /lista necesidades\n" +
        "  @TrustMakerBot /crea necesidad \"título\" — descripción\n" +
        "  @TrustMakerBot /ideas para \"título\"\n" +
        "  @TrustMakerBot /vota <id>\n\n" +
        "También puedes conversar naturalmente mencionando al bot."
    );
  });

  // ── Grupo: auto-crear árbol cuando el bot es agregado ─────────────────
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;

    if (chat.type === "group" || chat.type === "supergroup") {
      if (newStatus === "member" || newStatus === "administrator") {
        const chatId = chat.id.toString();
        try {
          // Check if tree already exists for this group
          const existing = await (prisma as any).tree.findUnique({
            where: { telegramChatId: chatId },
          });
          if (!existing) {
            const tree = await (prisma as any).tree.create({
              data: {
                name: chat.title || `Grupo ${chatId}`,
                telegramChatId: chatId,
                description: `Árbol automático para el grupo de Telegram "${chat.title || chatId}"`,
                icono: "💬",
                admissionPolicy: "OPEN",
              },
            });
            console.log(
              `[Telegram Bot] Árbol creado: "${tree.name}" (${tree.id}) para grupo ${chatId}`
            );
          }
        } catch (err: any) {
          console.error(`[Telegram Bot] Error al crear árbol para grupo ${chatId}:`, err.message);
        }
      }
    }
  });

  // ── Mensajes de texto: comandos @TrustMakerBot + conversación natural ──
  bot.on("message:text", async (ctx) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg) || !msg.text) return;

    const chatId = ctx.chat?.id.toString();

    // 1. Análisis pasivo: fire-and-forget para todo mensaje de grupo
    if (chatId) {
      analyzeMessage(prisma, ctx, chatId).catch((err: Error) => {
        console.error("[analyzer] Unhandled rejection:", err.message);
      });
    }

    // 2. Verificar si el mensaje menciona al bot (SPEC-1)
    const cmdText = extractCommandText(msg.text);

    // 3. Si no menciona → solo análisis pasivo, no responder
    if (cmdText === null) return;

    // 4. Si menciona — rutear a comando o conversación natural
    const isCommand = cmdText.startsWith("/");
    const isHelpAlias = /^(help|ayuda)$/i.test(cmdText);

    if (isCommand || isHelpAlias) {
      // ── Modo comando ──
      const result = await handleMessage(prisma, ctx);

      if (result) {
        await ctx.reply(result.text, { parse_mode: "Markdown" });

        if (result.react) {
          try {
            await ctx.react("❤");
          } catch {
            // React API may not be available (older Telegram clients / bot API)
          }
        }
      }
    } else {
      // ── Modo conversación natural (SPEC-2) ──
      const naturalResult = await handleNaturalMessage(prisma, ctx);
      if (naturalResult) {
        await ctx.reply(naturalResult.text);
      }
    }
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
  }).catch((err) => {
    console.error("[Telegram Bot] ERROR al iniciar polling:", err.message);
  });

  return bot;
}
