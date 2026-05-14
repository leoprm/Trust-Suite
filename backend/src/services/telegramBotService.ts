// ── Telegram Dispute Voting Service ─────────────────────────────────────────
// Provides broadcast and resolution notification for task disputes.
// Init with the grammy Bot instance from index.ts on startup.

import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";
import { PrismaClient } from "@prisma/client";

let _bot: Bot<BotContext> | null = null;
let _prisma: PrismaClient | null = null;

// ── Init ─────────────────────────────────────────────────────────────────

export function initDisputeService(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): void {
  _prisma = prisma;
  _bot = bot;
  console.log(
    bot
      ? "[DisputeService] Initialized with Telegram bot."
      : "[DisputeService] Initialized WITHOUT Telegram bot. Dispute broadcasts disabled.",
  );
}

// ── Broadcast ────────────────────────────────────────────────────────────

/**
 * Send a dispute voting message to the tree's Telegram group.
 * Non-blocking: logs errors but never throws.
 * @returns The telegramMessageId if successful, null otherwise.
 */
export async function broadcastDisputeVote(
  taskId: string,
  treeId: string,
  taskTitle: string,
): Promise<number | null> {
  if (!_bot || !_prisma) {
    console.warn("[DisputeService] Bot not initialized — skipping broadcast.");
    return null;
  }

  try {
    // 1. Find the tree's telegramGroupId
    const tree = await _prisma.tree.findUnique({
      where: { id: treeId },
      select: { telegramGroupId: true },
    });

    if (!tree?.telegramGroupId) {
      console.warn(
        `[DisputeService] Tree ${treeId} has no telegramGroupId — skipping.`,
      );
      return null;
    }

    const groupId = tree.telegramGroupId;

    // 2. Send the message
    const msg = await _bot.api.sendMessage(
      Number(groupId),
      `🔍 *Disputa en task* — ¿evidencia suficiente?\n\n` +
        `📋 *Tarea:* ${taskTitle}\n` +
        `🆔 ID: \`${taskId}\`\n\n` +
        `Vota reaccionando:\n👍 = Evidencia *válida*\n👎 = Evidencia *insuficiente*\n\n` +
        `⏳ Votación abierta por 24h. Quórum: 30% de miembros activos.`,
      { parse_mode: "Markdown" },
    );

    const telegramMessageId = msg.message_id;

    // 3. Persist the DisputeMessage record
    await _prisma.disputeMessage.create({
      data: {
        taskId,
        treeId,
        telegramMessageId,
        telegramGroupId: groupId,
        status: "OPEN",
      },
    });

    console.log(
      `[DisputeService] Broadcast dispute for task ${taskId} → msg ${telegramMessageId} in group ${groupId}`,
    );

    return telegramMessageId;
  } catch (error: any) {
    console.error(
      `[DisputeService] Failed to broadcast dispute for task ${taskId}:`,
      error.message,
    );
    return null;
  }
}

// ── Resolution Notification ──────────────────────────────────────────────

/**
 * Post the resolution result as a reply to the original dispute message.
 */
export async function notifyDisputeResolution(
  disputeMessageId: string,
): Promise<void> {
  if (!_bot || !_prisma) return;

  try {
    const dm = await _prisma.disputeMessage.findUnique({
      where: { id: disputeMessageId },
      include: { task: { select: { title: true } } },
    });

    if (!dm) {
      console.warn(`[DisputeService] DisputeMessage ${disputeMessageId} not found.`);
      return;
    }

    const statusEmoji: Record<string, string> = {
      RESOLVED_ACCEPTED: "✅",
      RESOLVED_REJECTED: "❌",
      EXPIRED: "⏰",
    };
    const statusLabel: Record<string, string> = {
      RESOLVED_ACCEPTED: "ACEPTADA — la evidencia es suficiente.",
      RESOLVED_REJECTED: "RECHAZADA — la evidencia es insuficiente. La tarea vuelve a EVIDENCE_SUBMITTED.",
      EXPIRED: "EXPIRADA — sin quórum tras 48h. Se acepta por default.",
    };

    const emoji = statusEmoji[dm.status] ?? "❓";
    const label = statusLabel[dm.status] ?? dm.status;
    const result = dm.thumbsUp > dm.thumbsDown ? "👍" : "👎";

    await _bot.api.sendMessage(
      Number(dm.telegramGroupId),
      `${emoji} *Resultado de la disputa:* ${label}\n\n` +
        `📋 *Tarea:* ${dm.task.title}\n` +
        `🆔 ID: \`${dm.taskId}\`\n` +
        `📊 Votos: 👍 ${dm.thumbsUp} | 👎 ${dm.thumbsDown}\n` +
        `🏆 Mayoría: ${result}`,
      {
        parse_mode: "Markdown",
        reply_parameters: { message_id: dm.telegramMessageId },
      },
    );

    console.log(
      `[DisputeService] Resolution notified for dispute ${disputeMessageId}: ${dm.status}`,
    );
  } catch (error: any) {
    console.error(
      `[DisputeService] Failed to notify resolution for ${disputeMessageId}:`,
      error.message,
    );
  }
}
