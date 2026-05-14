import { Bot, session } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext, BotSessionData } from "./types";
import { handleMessage, extractCommandText } from "./commands";
import { handleNaturalMessage } from "./messages";
import { analyzeMessage } from "./analyzer";
import { registerReactionHandler } from "./voting";
import { checkPaymentAccess } from "./payment";
import { formatForChannel, sendViaTelegram } from "./channelAdapter";
import { textToSpeech } from "../services/ttsService";

// ── TTS: generate voice buffer for a text response ──────────────────────

async function generateVoice(text: string): Promise<Buffer | null> {
  try {
    return await textToSpeech(text);
  } catch (err: any) {
    console.warn("[TTS] Voice generation failed:", err.message);
    return null; // non-blocking — text still gets sent
  }
}

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
        return { userId: null, authenticatedAt: null, awaitingEvidenceTaskId: null, awaitingEvidenceBotMsgId: null };
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
        "/cuota — Ver tu cuota mensual\n" +
        "/pagar — Ver pagos pendientes\n" +
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

  // ── /pagar: mostrar info de pago ───────────────────────────────────────
  bot.command("pagar", async (ctx) => {
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

    const paymentLink = process.env.PAYMENT_LINK || "https://trustmaker.app/pagos";
    const lines: string[] = ["💳 *Pagos*:\n"];

    let total = 0;
    for (const m of memberships) {
      const fee = m.monthlyFee ?? 0;
      total += fee;
      const icono = m.tree.icono ?? "🌳";
      lines.push(`${icono} *${m.tree.name}*: ${fee} CLP`);
    }

    lines.push(
      "",
      `💰 Total: ${total} CLP/mes`,
      "",
      `Para pagar, visita: ${paymentLink}`
    );

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  // ── Grupo: auto-crear árbol cuando el bot es agregado ─────────────────
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;

    if (chat.type === "group" || chat.type === "supergroup") {
      if (newStatus === "member" || newStatus === "administrator") {
        const chatId = chat.id.toString();
        const adderId = ctx.update.my_chat_member.from.id.toString();
        try {
          // Check if tree already exists for this group
          let tree = await (prisma as any).tree.findUnique({
            where: { telegramChatId: chatId },
          });
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
          }

          // Auto-add the user who invited the bot
          try {
            // Resolve or create user by telegram ID
            const tgId = BigInt(adderId);
            let user = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
            if (!user) {
              user = await prisma.user.create({
                data: { username: `tg_${adderId}`, telegramUserId: tgId },
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

    // 3.5 Payment check: verificar acceso antes de procesar
    if (chatId) {
      const paymentResult = await checkPaymentAccess(prisma, ctx, chatId, cmdText);
      if (paymentResult.blocked) {
        await ctx.reply(paymentResult.reply, { parse_mode: "Markdown" });
        return;
      }
    }

    // 4. Si menciona — rutear a comando o conversación natural
    const isCommand = cmdText.startsWith("/");
    const isHelpAlias = /^(help|ayuda)$/i.test(cmdText);

    if (isCommand || isHelpAlias) {
      // ── Modo comando ──
      const result = await handleMessage(prisma, ctx);

      if (result) {
        // Generate voice (non-blocking)
        const voiceBuffer = await generateVoice(result.text);
        // Route through channel adapter (T27)
        const messages = formatForChannel(
          { text: result.text, react: result.react, voiceBuffer: voiceBuffer ?? undefined },
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
      }
    } else {
      // ── Modo conversación natural (SPEC-2) ──
      const naturalResult = await handleNaturalMessage(prisma, ctx);
      if (naturalResult) {
        // Generate voice (non-blocking)
        const voiceBuffer = await generateVoice(naturalResult.text);
        // Route through channel adapter (T27)
        const messages = formatForChannel(
          { text: naturalResult.text, voiceBuffer: voiceBuffer ?? undefined },
          "telegram",
        );
        await sendViaTelegram(ctx, messages);
      }
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
      const fileResp = await fetch(tgUrl);
      if (!fileResp.ok) {
        console.error("[Voice] Failed to download from Telegram:", fileResp.status);
        return;
      }
      const fileBuffer = Buffer.from(await fileResp.arrayBuffer());

      // 2. POST to /api/audio/transcribe
      const blob = new Blob([fileBuffer], {
        type: msg.voice.mime_type || "audio/ogg",
      });
      const formData = new FormData();
      formData.append("file", blob, "voice.ogg");

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

      // 3. Check if the text mentions @TrustMakerBot
      const mentionMatch = transcribedText.match(/@(TrustMakerBot|TrustMaker)\b/i);
      if (!mentionMatch) {
        console.log(
          `[Voice] No bot mention in transcription — ignoring. Text: "${transcribedText.substring(0, 80)}"`,
        );
        return; // Not addressed to the bot → ignore
      }

      // 4. Extract clean text after the mention
      const mentionEnd = (mentionMatch.index ?? 0) + mentionMatch[0].length;
      const cleanText = transcribedText.slice(mentionEnd).trim();
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

      // 5b. Simulate a text message so the existing handlers work
      const originalText = (msg as any).text;
      (msg as any).text = cleanText;

      try {
        const isCommand = cleanText.startsWith("/");
        const isHelpAlias = /^(help|ayuda)$/i.test(cleanText);

        if (isCommand || isHelpAlias) {
          const result = await handleMessage(prisma, ctx);
          if (result) {
            const messages = formatForChannel(
              { text: result.text, react: result.react },
              "telegram",
            );
            await sendViaTelegram(ctx, messages);
            if (result.react) {
              try { await ctx.react("❤"); } catch {}
            }
          }
        } else {
          const naturalResult = await handleNaturalMessage(prisma, ctx);
          if (naturalResult) {
            const messages = formatForChannel(
              { text: naturalResult.text },
              "telegram",
            );
            await sendViaTelegram(ctx, messages);
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
      const fileResp = await fetch(tgUrl);
      if (!fileResp.ok) {
        console.error("[Evidence] Failed to download from Telegram:", fileResp.status);
        return null;
      }
      const fileBuffer = Buffer.from(await fileResp.arrayBuffer());

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

  bot.on("message:photo", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.photo || msg.photo.length === 0) return;

    const session = ctx.session;
    const taskId = session.awaitingEvidenceTaskId;

    // Must be awaiting evidence
    if (!taskId) return;

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
    if (!taskId) return;

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
