import { Request, Response } from "express";
import { TreeSandbox } from "../services/treeSandbox";
import { logEvent, getRequestContext } from "../services/eventLogService";
import { InputFile } from "grammy";
import path from "path";
import fs from "fs";

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

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
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree) {
      return res.status(404).json({ error: "Tree not found" });
    }
    if (!tree.telegramChatId) {
      return res.status(400).json({ error: "Tree has no linked Telegram chat" });
    }

    // Resolve file path in sandbox
    const sb = await TreeSandbox.get(treeId);
    if (!sb) {
      return res.status(404).json({ error: "Sandbox not found for this tree" });
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
    const tree = await (prisma as any).tree.findUnique({
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
      announcement = await (prisma as any).candidateAnnouncement.create({
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
