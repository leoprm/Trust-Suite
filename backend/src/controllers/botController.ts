import { Request, Response } from "express";
import { TreeSandbox } from "../services/treeSandbox";
import { logEvent, getRequestContext } from "../services/eventLogService";
import { InputFile } from "grammy";
import path from "path";
import fs from "fs";

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

// ── Auth helper ─────────────────────────────────────────────────────────────

function checkApiKey(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Authorization header missing" });
    return false;
  }
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!API_SERVER_KEY || token !== API_SERVER_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return false;
  }
  return true;
}

// ── POST /api/bot/send-document ────────────────────────────────────────────
// Body: { treeId: string, filePath: string, caption?: string }
// Sends a document from the tree's sandbox to the tree's Telegram chat.
// Used by Ari to auto-deliver analysis PDFs.

export const sendDocument = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { treeId, filePath, caption } = req.body;

    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId is required (string)" });
    }
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath is required (string)" });
    }

    // Resolve telegramChatId from tree
    const { prisma } = await import("../index");
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree) {
      return res.status(404).json({ error: "Tree not found" });
    }
    if (!tree.telegramChatId) {
      return res.status(400).json({ error: "Tree has no linked Telegram chat" });
    }

    // Resolve file path in sandbox — auto-create if missing
    let sb = await TreeSandbox.get(treeId);
    if (!sb) {
      try {
        sb = await TreeSandbox.create(treeId);
        console.log(`[sendDocument] Lazy-init sandbox for tree ${treeId.slice(0, 8)}…`);
      } catch (createErr: any) {
        return res.status(500).json({ error: 'Failed to create sandbox', detail: createErr?.message });
      }
    }

    // Prevent path traversal
    const normalized = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
    const absolutePath = path.resolve(sb.workspacePath, normalized);
    const realWorkspace = path.resolve(sb.workspacePath);
    if (!absolutePath.startsWith(realWorkspace + path.sep) && absolutePath !== realWorkspace) {
      return res.status(403).json({ error: "Path escapes sandbox" });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "File not found", path: filePath });
    }

    // Get bot instance
    const { telegramBot } = await import("../index");
    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not available" });
    }

    // Send document via Telegram
    const fileBuffer = fs.readFileSync(absolutePath);
    const fileName = path.basename(absolutePath);
    const chatId = tree.telegramChatId;

    const sent = await telegramBot.api.sendDocument(
      chatId,
      new InputFile(fileBuffer, fileName),
      { caption: caption || undefined },
    );

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: "BOT_SEND_DOCUMENT",
      entityType: "Tree",
      entityId: treeId,
      source: "SYSTEM",
      metadataJson: {
        fileName,
        fileSize: fileBuffer.length,
        chatId,
        messageId: sent.message_id,
      },
    });

    res.json({
      success: true,
      fileName,
      fileSize: fileBuffer.length,
      messageId: sent.message_id,
      chatId,
    });
  } catch (error: any) {
    console.error("[sendDocument] ERROR:", error?.message || error);
    res.status(500).json({ error: "Failed to send document", detail: error?.message });
  }
};

// ── POST /api/bot/send-message ─────────────────────────────────────────────
// Body: { treeId: string, text: string, inlineKeyboard?: [[{text, callback_data}]], kanbanTaskId?: string }
// Sends a message to the tree's Telegram chat, optionally with inline keyboard buttons.
// Used by Ari for tree-first task announcements with "Yo puedo" button.
// When kanbanTaskId is provided, creates a CandidateAnnouncement with 4h deadline.
// callback_data format for hiring: candidate:apply:<treeId>:<taskId>
export const sendMessage = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { treeId, text, inlineKeyboard, kanbanTaskId } = req.body;

    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId is required (string)" });
    }
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required (string)" });
    }

    // Resolve telegramChatId from tree
    const { prisma } = await import("../index");
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree) {
      return res.status(404).json({ error: "Tree not found" });
    }
    if (!tree.telegramChatId) {
      return res.status(400).json({ error: "Tree has no linked Telegram chat" });
    }

    // Get bot instance
    const { telegramBot } = await import("../index");
    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not available" });
    }

    const chatId = tree.telegramChatId;

    // Build reply_markup if inlineKeyboard provided
    let replyMarkup;
    if (inlineKeyboard && Array.isArray(inlineKeyboard) && inlineKeyboard.length > 0) {
      replyMarkup = { inline_keyboard: inlineKeyboard };
    }

    const sent = await telegramBot.api.sendMessage(chatId, text, {
      reply_markup: replyMarkup,
      parse_mode: "Markdown",
    });

    // ── Track announcement for 4h window (V2) ──
    let announcement = null;
    if (kanbanTaskId && typeof kanbanTaskId === "string") {
      const deadline = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4h from now
      announcement = await prisma.candidateAnnouncement.create({
        data: {
          taskId: kanbanTaskId,
          treeId,
          telegramChatId: chatId,
          announcementMsgId: sent.message_id,
          deadline,
        },
      });
    }

    res.json({
      success: true,
      messageId: sent.message_id,
      chatId,
      announcementId: announcement?.id || null,
    });
  } catch (error: any) {
    console.error("[sendMessage] ERROR:", error?.message || error);
    res.status(500).json({ error: "Failed to send message", detail: error?.message });
  }
};

// ── POST /api/bot/send-to-tree ─────────────────────────────────────────────
// Body: { treeId: string, text: string, parseMode?: "Markdown" | "HTML" }
// Sends a text message to the tree's Telegram chat.
// Used by Ari to send individual messages to a tree.
// Auth: x-api-key header must match INTERNAL_API_KEY env var.
export const sendToTree = async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!INTERNAL_API_KEY || apiKey !== INTERNAL_API_KEY) {
      return res.status(401).json({ error: "Unauthorized: invalid API key" });
    }

    const { treeId, text, parseMode } = req.body;

    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId is required (string)" });
    }
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required (string)" });
    }
    if (parseMode && !["Markdown", "HTML"].includes(parseMode)) {
      return res.status(400).json({ error: "parseMode must be 'Markdown' or 'HTML'" });
    }

    // Resolve telegramChatId from tree
    const { prisma } = await import("../index");
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree) {
      return res.status(404).json({ error: "Tree not found" });
    }
    if (!tree.telegramChatId) {
      return res.status(400).json({ error: "Tree has no linked Telegram chat" });
    }

    // Get bot instance
    const { telegramBot } = await import("../index");
    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not available" });
    }

    const chatId = tree.telegramChatId;

    const sent = await telegramBot.api.sendMessage(chatId, text, {
      parse_mode: parseMode || undefined,
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: "BOT_SEND_TO_TREE",
      entityType: "Tree",
      entityId: treeId,
      source: "ARI",
      metadataJson: {
        chatId,
        messageId: sent.message_id,
        parseMode: parseMode || null,
      },
    });

    res.json({
      ok: true,
      messageId: sent.message_id,
    });
  } catch (error: any) {
    console.error("[sendToTree] ERROR:", error?.message || error);
    res.status(500).json({ error: "Failed to send message", detail: error?.message });
  }
};

// ── POST /api/bot/proactive-message ──────────────────────────────────────────
// Body: { treeId: string, chatId: string, instruction: string }
// Invokes Hermes Agent with the instruction in the tree's system prompt context,
// then sends Ari's response to the tree's Telegram chat.
// Used by the proactiveAgentCron and by Ari's self-scheduling tool.

const proactiveCooldown = new Map<string, number>();
const PROACTIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

export const proactiveMessage = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { treeId, chatId, instruction } = req.body;

    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId is required (string)" });
    }
    if (!chatId || typeof chatId !== "string") {
      return res.status(400).json({ error: "chatId is required (string)" });
    }
    if (!instruction || typeof instruction !== "string") {
      return res.status(400).json({ error: "instruction is required (string)" });
    }

    // Rate limit: max 1 proactive message per tree per 24h
    const lastProactive = proactiveCooldown.get(treeId);
    if (lastProactive && Date.now() - lastProactive < PROACTIVE_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((PROACTIVE_COOLDOWN_MS - (Date.now() - lastProactive)) / (60 * 60 * 1000));
      console.log(`[proactiveMessage] ⏭️ Tree ${treeId.slice(0, 8)}: en cooldown (${hoursLeft}h restantes)`);
      return res.status(429).json({
        error: "Rate limited",
        retryAfterHours: hoursLeft,
      });
    }

    // Resolve tree
    const { prisma } = await import("../index");
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, name: true, telegramChatId: true },
    });

    if (!tree) {
      return res.status(404).json({ error: "Tree not found" });
    }
    if (!tree.telegramChatId) {
      return res.status(400).json({ error: "Tree has no linked Telegram chat" });
    }

    // Get bot instance
    const { telegramBot } = await import("../index");
    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not available" });
    }

    // Build system prompt for the tree
    const { buildSystemPrompt } = await import("../bot/hermesBridge/system-prompt");
    const systemPrompt = await buildSystemPrompt(prisma, treeId, "0", "Ari");

    // Call Hermes Agent API
    const { getHermesApiKey } = await import("../bot/hermesBridge/getHermesApiKey");
    const apiKey = getHermesApiKey(treeId);

    const llmDispatcher = await (async () => {
      const { Agent } = await import("undici");
      return new Agent({
        bodyTimeout: 120_000,
        headersTimeout: 30_000,
        keepAliveTimeout: 120_000,
        keepAliveMaxTimeout: 300_000,
      });
    })();

    const HERMES_API = "http://127.0.0.1:8643/v1/chat/completions";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let aiResponse: string;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Hermes-Session-Key": `proactive-agent-${treeId}`,
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(HERMES_API, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `INSTRUCCIÓN PROACTIVA: ${instruction}\n\n` +
                `Genera un mensaje NATURAL y CONCISO para enviar al grupo de Telegram. ` +
                `No digas "Hola" ni uses saludos genéricos — ve directo al punto. ` +
                `Usa el tono y lenguaje configurados para este árbol. ` +
                `Máximo 3-4 frases. NO uses markdown complejo — solo negritas simples con **.`,
            },
          ],
          max_tokens: 512,
          stream: false,
        }),
        signal: controller.signal,
        // @ts-ignore
        dispatcher: llmDispatcher,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `[proactiveMessage] Hermes API returned ${response.status}: ${errorText.slice(0, 300)}`,
        );
        return res.status(502).json({
          error: "Hermes Agent API error",
          status: response.status,
        });
      }

      const data = (await response.json()) as any;
      aiResponse = data?.choices?.[0]?.message?.content?.trim();

      if (!aiResponse) {
        return res.status(502).json({ error: "Empty response from Hermes Agent" });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Send to Telegram
    const sent = await telegramBot.api.sendMessage(chatId, aiResponse, {
      parse_mode: "Markdown",
    });

    // Mark cooldown after successful send
    proactiveCooldown.set(treeId, Date.now());

    // Log event
    const { logEvent, getRequestContext } = await import("../services/eventLogService");
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: "BOT_PROACTIVE_MESSAGE",
      entityType: "Tree",
      entityId: treeId,
      source: "AUTOMATION",
      metadataJson: {
        chatId,
        messageId: sent.message_id,
        instruction: instruction.slice(0, 200),
        responseLength: aiResponse.length,
      },
    });

    res.json({
      success: true,
      messageId: sent.message_id,
      chatId,
      text: aiResponse,
    });
  } catch (error: any) {
    console.error("[proactiveMessage] ERROR:", error?.message || error);
    res.status(500).json({ error: "Failed to send proactive message", detail: error?.message });
  }
};

// ── POST /api/bot/send-reminder ──────────────────────────────────────────────
// Body: { chatId: string, text: string, scheduleAt?: string }
// Schedules a message to be sent at a specific time.
// If scheduleAt is omitted or in the past, sends immediately.

const reminderCooldown = new Map<string, number>();
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

export const sendReminder = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { chatId, text, scheduleAt } = req.body;

    if (!chatId || typeof chatId !== "string") {
      return res.status(400).json({ error: "chatId is required (string)" });
    }
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required (string)" });
    }

    // Rate limit: max 1 scheduled/reminder message per chat per 24h
    const lastReminder = reminderCooldown.get(chatId);
    if (lastReminder && Date.now() - lastReminder < REMINDER_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((REMINDER_COOLDOWN_MS - (Date.now() - lastReminder)) / (60 * 60 * 1000));
      console.log(`[sendReminder] ⏭️ Chat ${chatId}: en cooldown (${hoursLeft}h restantes)`);
      return res.status(429).json({
        error: "Rate limited",
        retryAfterHours: hoursLeft,
      });
    }

    const { telegramBot } = await import("../index");
    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not available" });
    }

    if (scheduleAt && typeof scheduleAt === "string") {
      const scheduledDate = new Date(scheduleAt);
      const now = new Date();

      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: "scheduleAt is not a valid date" });
      }

      const delayMs = scheduledDate.getTime() - now.getTime();

      if (delayMs <= 0) {
        // Already past — send immediately
        const sent = await telegramBot.api.sendMessage(chatId, text, {
          parse_mode: "Markdown",
        });

        reminderCooldown.set(chatId, Date.now());

        return res.json({
          success: true,
          messageId: sent.message_id,
          chatId,
          scheduled: false,
          reason: "scheduleAt is in the past — sent immediately",
        });
      }

      // Schedule for future
      const maxDelay = 24 * 60 * 60 * 1000; // 24h max
      const cappedDelay = Math.min(delayMs, maxDelay);

      setTimeout(async () => {
        try {
          await telegramBot.api.sendMessage(chatId, text, {
            parse_mode: "Markdown",
          });
          console.log(
            `[sendReminder] Scheduled message sent to ${chatId} (${Math.round(cappedDelay / 1000)}s delay)`,
          );
        } catch (err: any) {
          console.error(`[sendReminder] Failed to send scheduled message: ${err.message}`);
        }
      }, cappedDelay);

      reminderCooldown.set(chatId, Date.now());

      return res.json({
        success: true,
        chatId,
        scheduled: true,
        scheduledAt: scheduleAt,
        delaySeconds: Math.round(cappedDelay / 1000),
        capped: delayMs > maxDelay,
      });
    }

    // No scheduleAt — send immediately
    const sent = await telegramBot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
    });

    reminderCooldown.set(chatId, Date.now());

    res.json({
      success: true,
      messageId: sent.message_id,
      chatId,
      scheduled: false,
    });
  } catch (error: any) {
    console.error("[sendReminder] ERROR:", error?.message || error);
    res.status(500).json({ error: "Failed to send reminder", detail: error?.message });
  }
};

// ── POST /api/bot/trigger-comment-review ──────────────────────────────────────
// Body: { treeId?: string }
// Triggers Ari to review pendientes in comments.md. If treeId is omitted,
// scans all parent trees (trees with children) and triggers each one.
// Called by the 3h cron job (09:00-21:00 Chile).
export const triggerCommentReview = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { treeId } = req.body;

    const { prisma } = await import("../index");
    const { telegramBot } = await import("../index");

    if (!telegramBot) {
      return res.status(503).json({ error: "Telegram bot not available" });
    }

    let targetTreeIds: string[] = [];

    if (treeId && typeof treeId === "string") {
      // Specific tree requested
      targetTreeIds = [treeId];
    } else {
      // Scan all parent trees: trees that have children (other trees referencing them as parent)
      const parentTrees = await prisma.tree.findMany({
        where: {
          childTrees: { some: {} },  // has at least one child
          telegramChatId: { not: null },
        },
        select: { id: true, name: true, telegramChatId: true },
      });
      targetTreeIds = parentTrees.map((t: any) => t.id);
    }

    if (targetTreeIds.length === 0) {
      return res.json({ triggered: 0, message: "No parent trees with Telegram groups found" });
    }

    const results: { treeId: string; treeName: string; chatId: string; messageId?: number; error?: string }[] = [];
    const TRIGGER_TEXT = "Ari, revisa los comentarios pendientes en obsidian/comentarios.md";

    for (const tid of targetTreeIds) {
      try {
        const tree = await prisma.tree.findUnique({
          where: { id: tid },
          select: { id: true, name: true, telegramChatId: true },
        });

        if (!tree || !tree.telegramChatId) {
          results.push({ treeId: tid, treeName: tree?.name || "unknown", chatId: "", error: "No Telegram group" });
          continue;
        }

        const sent = await telegramBot.api.sendMessage(tree.telegramChatId, TRIGGER_TEXT, {
          parse_mode: "Markdown",
        });

        void logEvent({
          ...getRequestContext(req),
          treeId: tid,
          action: "TRIGGER_COMMENT_REVIEW",
          entityType: "Tree",
          entityId: tid,
          source: "AUTOMATION",
          metadataJson: { chatId: tree.telegramChatId, messageId: sent.message_id },
        });

        results.push({ treeId: tid, treeName: tree.name, chatId: tree.telegramChatId, messageId: sent.message_id });

        // Brief delay to avoid rate limiting if multiple trees
        if (targetTreeIds.length > 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (err: any) {
        console.error(`[triggerCommentReview] Failed for tree ${tid}:`, err?.message || err);
        results.push({ treeId: tid, treeName: "unknown", chatId: "", error: err?.message });
      }
    }

    res.json({
      triggered: results.filter(r => !r.error).length,
      results,
    });
  } catch (error: any) {
    console.error("[triggerCommentReview] ERROR:", error?.message || error);
    res.status(500).json({ error: "Trigger failed", detail: error?.message });
  }
};
