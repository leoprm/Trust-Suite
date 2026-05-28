import https from "https";
import { spawn } from "child_process";
import { promises as fsPromises } from "fs";
import { Bot, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { findTreeByChat } from "../treeResolver";
import { httpsDownload, generateVoice, getUserLanguage, backgroundJob } from "../helpers";
import { routeToHermes, getChatHistory } from "../hermesBridge";
import { checkPaymentAccess } from "../payment";
import { handleMessage, extractCommandText } from "../commands";
import { handleNaturalMessage } from "../messages";
import { appendToDailyLog } from "../../lib/dailyLog";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("chat" in msg)) return next();

    const hasText = !!(msg as any).text || !!(msg as any).caption;
    if (hasText) return next();

    const photo = (msg as any).photo;
    const document = (msg as any).document;
    const voice = (msg as any).voice;
    const video = (msg as any).video || (msg as any).video_note;
    const audio = (msg as any).audio;
    if (!photo && !document && !voice && !video && !audio) return next();

    // Voice messages are handled by the dedicated voice handler below (transcription + TTS)
    if (voice) return next();

    if (process.env.HERMES_BRIDGE_ENABLED !== "true") return next();

    const chatId = msg.chat?.id?.toString();
    if (!chatId) return next();

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) return next();

    const fileId = photo?.[photo.length - 1]?.file_id
      || document?.file_id || voice?.file_id
      || video?.file_id || audio?.file_id;
    if (!fileId) return next();

    try {
      const tgFile = await ctx.api.getFile(fileId);
      const filePath = tgFile.file_path;
      if (!filePath) {
        await fsPromises.appendFile("/tmp/tm_media_errors.log",
          JSON.stringify({ts:new Date().toISOString(), err:"no file_path", fileId:fileId?.slice(0,30), treeId:tree.id})+"\n"
        ).catch(err => console.error('[bot:media] appendFile failed:', err.message));
        return next();
      }

      const ext = filePath.split(".").pop() || "bin";
      const fileName = `${Date.now()}.${ext}`;
      const destDir = `/home/trustmaker/trees/${tree.id}/media`;
      await fsPromises.mkdir(destDir, { recursive: true });
      const dest = `${destDir}/${fileName}`;

      // ── Size check before downloading ──────────────────────────────
      // Telegram bot API limit: 50 MB for regular downloads (20 MB for getFile)
      const fileSize = (tgFile as any).file_size || 0;
      if (fileSize > 50 * 1024 * 1024) {
        // >50MB: exceeds Telegram bot limit; should never happen in practice
        const sizeMB = (fileSize / (1024*1024)).toFixed(1);
        await ctx.reply(
          `📎 Recibí tu archivo (${sizeMB} MB) pero supera el límite de 50 MB de Telegram.\n` +
          `*Dividilo* en partes más chicas o *describime* qué contiene.`,
          { parse_mode: "Markdown" }
        ).catch(err => console.error('[bot:media] reply failed:', err.message));
        return;
      }

      // ── Download via https (NOT fetch — IPv6 broken on Node v22 to api.telegram.org) ──
      const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
      const buffer = await new Promise<Buffer>((resolve, reject) => {
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
        req.setTimeout(30_000, () => { req.destroy(); reject(new Error("Request timeout")); });
      });
      await fsPromises.writeFile(dest, buffer);

      const mediaType = photo ? "foto" : document ? "documento" : voice ? "nota de voz" : video ? "video" : "audio";
      const senderName = ctx.from?.first_name || "alguien";
      const caption = (msg as any).caption || "";
      const fullMessage = caption
        ? `${senderName}: ${caption}\n[adjuntó una ${mediaType}: ${dest}]`
        : `${senderName} envió una ${mediaType}.\n[archivo: ${dest}]`;

      const userId = ctx.from?.id.toString() || "0";
      const displayName = ctx.from?.first_name || userId;

      ctx.replyWithChatAction("typing").catch(err => console.error('[bot:typing] replyWithChatAction failed:', err.message));
      const chatHistory = ctx.chat?.id
        ? await getChatHistory(ctx.chat.id, tree.id, 20)
        : [];
      const response = await routeToHermes(
        fullMessage, tree.id, userId, chatHistory, displayName,
        ctx.chat?.id, msg.message_id,
      );
      if (response && !response.saturationMessage && !response.queued) {
        // Send WITHOUT Markdown — media responses may contain paths/characters that break parse_mode
        await ctx.reply(response.text).catch(err => console.error('[bot:media] reply failed:', err.message));
      }
    } catch (err: any) {
      await fsPromises.appendFile("/tmp/tm_media_errors.log",
        JSON.stringify({ts:new Date().toISOString(), error:err.message||String(err), stack:err.stack?.slice(0,300), treeId:tree?.id, chatId})+"\n"
      ).catch(e => console.error('[bot:media] appendFile failed:', e.message));
      await ctx.reply("📎 Recibí tu archivo pero no pude procesarlo. Intentá describirlo con texto.").catch(e => console.error('[bot:media] reply failed:', e.message));
    }
  });


  bot.on("message:voice", (ctx) => {
    const msg = ctx.message;
    if (!msg?.voice) return;

    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const fileId = msg.voice.file_id;
    const senderFirstName = ctx.from?.first_name;
    const senderUsername = ctx.from?.username;
    const senderId = ctx.from?.id;
    const messageDate = msg.date;
    const chatType = ctx.chat?.type;
    const voiceMimeType = msg.voice.mime_type;

    // Procesar transcripción + pipeline en background (fire-and-forget)
    backgroundJob(bot, chatId, async () => {
      // 1. Download .ogg from Telegram
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[Voice] Telegram returned no file_path for", fileId);
        return;
      }

      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      // Silent save: guardar la nota de voz en filesystem del árbol
      if (chatType === "group" || chatType === "supergroup") {
        try {
          const voiceTree = await findTreeByChat(prisma, chatId);
          if (voiceTree) {
            const TREES_BASE = process.env.SANDBOX_BASE_DIR || "/home/leo/trees";
            const rawName = senderFirstName || senderUsername || senderId?.toString() || "unknown";
            const cleanSenderName = rawName
              .replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, "")
              .trim()
              .replace(/\s+/g, "_")
              .slice(0, 64) || "unknown";
            const today = new Date().toISOString().slice(0, 10);
            const voiceFileName = `voice_${Date.now()}.ogg`;
            const dir = `${TREES_BASE}/${voiceTree.id}/media/${cleanSenderName}`;
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
      const blob = new Blob([fileBuffer], { type: voiceMimeType || "audio/ogg" });
      const formData = new FormData();
      formData.append("audio", blob, "voice.ogg");

      const apiKey = process.env.HERMES_API_SERVER_KEY ?? "";
      const transcribeResp = await fetch("http://localhost:3100/api/audio/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!transcribeResp.ok) {
        console.error("[Voice] Transcription endpoint returned:", transcribeResp.status);
        await bot.api.sendMessage(chatId, "❌ No pude transcribir tu audio. ¿Probamos con texto?").catch(e => console.error('[bot:voice] sendMessage failed:', e.message));
        return;
      }

      const data = (await transcribeResp.json()) as any;
      const transcribedText: string = data?.text ?? "";
      if (!transcribedText.trim()) {
        await bot.api.sendMessage(chatId, "🤔 No entendí el audio. ¿Lo podés repetir o escribir?").catch(e => console.error('[bot:voice] sendMessage failed:', e.message));
        return;
      }

      // Daily conversation log
      try {
        const logVoiceTree = await findTreeByChat(prisma, chatId);
        if (logVoiceTree) {
          appendToDailyLog(
            logVoiceTree.id,
            new Date(messageDate * 1000),
            senderFirstName || "Unknown",
            transcribedText.trim(),
            true,
          );
        }
      } catch { /* silent */ }

      // 3. One-on-one mode
      let isOneOnOneVoice = false;
      if (chatType === "group" || chatType === "supergroup") {
        try {
          const memberCount = await ctx.getChatMemberCount();
          if (memberCount === 2) isOneOnOneVoice = true;
        } catch {
          const voiceTree = await findTreeByChat(prisma, chatId);
          if (voiceTree) {
            const dbCount = await prisma.treeMember.count({
              where: { treeId: voiceTree.id, status: "ACTIVE" },
            });
            if (dbCount <= 1) isOneOnOneVoice = true;
          }
        }
      }

      if (!isOneOnOneVoice) {
        const ariMatch = transcribedText.match(/\b(ari|ari[,!?]?|Ari)\b/i);
        if (!ariMatch) {
          console.log(`[Voice] No "Ari" mention — ignoring. Text: "${transcribedText.substring(0, 80)}"`);
          return;
        }
      }
      const cleanText = transcribedText.trim();
      if (!cleanText) return;

      console.log(`[Voice] Transcribed + routing: "${cleanText.substring(0, 80)}"`);

      // 5a. Payment check
      const paymentResult = await checkPaymentAccess(prisma, ctx, chatId, cleanText);
      if (paymentResult.blocked) {
        await bot.api.sendMessage(chatId, paymentResult.reply, { parse_mode: "Markdown" }).catch(e => console.error('[bot:voice] sendMessage failed:', e.message));
        return;
      }

      // 5b. Simulate text message with @TrustMakerBot prefix
      const originalText = (msg as any).text;
      (msg as any).text = `@TrustMakerBot ${cleanText}`;

      try {
        const isCommand = cleanText.startsWith("/");
        const isHelpAlias = /^(help|ayuda)$/i.test(cleanText);

        if (isCommand || isHelpAlias) {
          const result = await handleMessage(prisma, ctx);
          if (result) {
            await bot.api.sendMessage(chatId, result.text, { parse_mode: "Markdown" }).catch(e => console.error('[bot:voice] sendMessage failed:', e.message));
            if (result.react) {
              try { await ctx.react("❤"); } catch {}
            }
            const voiceLang = senderId ? await getUserLanguage(prisma, senderId) : undefined;
            generateVoice(result.text, voiceLang).then((vb) => {
              if (vb) {
                bot.api.sendVoice(chatId, new InputFile(vb)).catch(e => console.error('[bot:voice] sendVoice failed:', e.message));
              }
            });
          }
        } else {
          const naturalResult = await handleNaturalMessage(prisma, ctx);
          if (naturalResult) {
            // Send text WITHOUT Markdown — LLM responses may contain unescaped chars
            await bot.api.sendMessage(chatId, naturalResult.text).catch(e => console.error('[bot:voice] sendMessage failed:', e.message));
            const voiceNatLang = senderId ? await getUserLanguage(prisma, senderId) : undefined;
            generateVoice(naturalResult.text, voiceNatLang).then((vb) => {
              if (vb) {
                bot.api.sendVoice(chatId, new InputFile(vb)).catch(e => console.error('[bot:voice] sendVoice failed:', e.message));
              }
            });
          }
        }
      } finally {
        if (originalText === undefined) {
          delete (msg as any).text;
        } else {
          (msg as any).text = originalText;
        }
      }
    }, "❌ Ocurrió un error procesando tu audio. ¿Probamos con texto?");
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
      const chatId = ctx.chat?.id.toString();
      if (chatId && (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup")) {
        try {
          const tree2 = await findTreeByChat(prisma, chatId);
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
      const chatId = ctx.chat?.id.toString();
      if (chatId && (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup")) {
        try {
          const tree2 = await findTreeByChat(prisma, chatId);
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


  bot.on("message:video", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.video) return;

    const chatId = ctx.chat?.id.toString();
    if (!chatId || (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup")) return;

    try {
      const tree2 = await findTreeByChat(prisma, chatId);
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

    const chatId = ctx.chat?.id.toString();
    if (!chatId || (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup")) return;

    try {
      const tree2 = await findTreeByChat(prisma, chatId);
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

}
