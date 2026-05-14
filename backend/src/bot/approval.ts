/**
 * Approval poll module (T13): encuesta de aprobación para necesidades complejas.
 *
 * Flujo:
 * 1. Cuando se crea una necesidad compleja → status PENDING_APPROVAL + encuesta Sí/No
 * 2. A las 24h → stopPoll → resolver (OPEN o REJECTED)
 * 3. Al reiniciar el servidor → recuperar encuestas pendientes
 */

import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "./types";

// ── Detección de complejidad ──────────────────────────────────────────────

export function isComplexNeed(description: string, budget?: number): boolean {
  const longDescription = description.length > 300;
  const highBudget = (budget || 0) > 100;
  return longDescription || highBudget;
}

// ── Enviar encuesta de aprobación ─────────────────────────────────────────

export async function sendApprovalPoll(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  needId: string,
  chatId: number | string,
): Promise<boolean> {
  try {
    const need = await (prisma as any).need.findUnique({
      where: { id: needId },
      select: { title: true, description: true },
    });
    if (!need) return false;

    const desc =
      need.description.length > 200
        ? need.description.slice(0, 200) + "..."
        : need.description;

    const sentPoll = await bot.api.sendPoll(
      chatId,
      `⚠️ **Necesidad compleja detectada:**\n\n*${need.title}*\n\n${desc}\n\n¿Aprobamos desarrollarla?`,
      [
        { text: "✅ Sí, desarrollarla" },
        { text: "❌ No, por ahora" },
      ],
      {
        is_anonymous: true,
        allows_multiple_answers: false,
      },
    );

    await (prisma as any).need.update({
      where: { id: needId },
      data: {
        approvalPollId: sentPoll.poll.id,
        approvalMessageId: sentPoll.message_id,
      },
    });

    console.log(
      `[approval] Poll sent for need ${needId} → chat ${chatId}`,
    );
    return true;
  } catch (err: any) {
    console.error(`[approval] Failed to send poll for ${needId}:`, err.message);
    return false;
  }
}

// ── Cerrar encuesta y resolver ────────────────────────────────────────────

export async function closeApprovalPoll(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  needId: string,
): Promise<void> {
  try {
    const need = await (prisma as any).need.findUnique({
      where: { id: needId },
      select: {
        status: true,
        approvalPollId: true,
        approvalMessageId: true,
        tree: { select: { telegramChatId: true } },
      },
    });

    if (!need || need.status !== "PENDING_APPROVAL") return;
    if (!need.approvalPollId || !need.approvalMessageId || !need.tree?.telegramChatId) {
      console.warn(
        `[approval] Cannot close poll for ${needId}: missing poll data`,
      );
      return;
    }

    const results = await bot.api.stopPoll(
      need.tree.telegramChatId,
      need.approvalMessageId,
    );

    const yesVotes = results.options[0]?.voter_count ?? 0;
    const noVotes = results.options[1]?.voter_count ?? 0;

    if (yesVotes > noVotes) {
      await (prisma as any).need.update({
        where: { id: needId },
        data: { status: "OPEN" },
      });

      // Send confirmation to the group
      try {
        await bot.api.sendMessage(
          need.tree.telegramChatId,
          `✅ **Necesidad aprobada** por votación (${yesVotes} a favor vs ${noVotes} en contra).\n\nYa está disponible para priorización.`,
          { parse_mode: "Markdown" },
        );
      } catch {}

      console.log(
        `[approval] ✅ Need ${needId} approved (${yesVotes} vs ${noVotes})`,
      );
    } else {
      await (prisma as any).need.update({
        where: { id: needId },
        data: { status: "REJECTED" },
      });

      try {
        await bot.api.sendMessage(
          need.tree.telegramChatId,
          `❌ **Necesidad rechazada** por votación (${yesVotes} a favor vs ${noVotes} en contra).\n\nNo se desarrollará por ahora.`,
          { parse_mode: "Markdown" },
        );
      } catch {}

      console.log(
        `[approval] ❌ Need ${needId} rejected (${yesVotes} vs ${noVotes})`,
      );
    }
  } catch (err: any) {
    console.error(
      `[approval] Failed to close poll for ${needId}:`,
      err.message,
    );
  }
}

// ── Programar cierre a 24h ────────────────────────────────────────────────

export function scheduleApprovalClose(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  needId: string,
): void {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
    closeApprovalPoll(bot, prisma, needId).catch((err) =>
      console.error(
        `[approval] Scheduled close failed for ${needId}:`,
        err.message,
      ),
    );
  }, TWENTY_FOUR_HOURS).unref();

  console.log(`[approval] Scheduled close for ${needId} in 24h`);
}

// ── Recuperación al iniciar ───────────────────────────────────────────────

export async function recoverPendingApprovals(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
): Promise<void> {
  try {
    const pending = await (prisma as any).need.findMany({
      where: { status: "PENDING_APPROVAL" },
      select: {
        id: true,
        createdAt: true,
        approvalPollId: true,
        approvalMessageId: true,
        tree: { select: { telegramChatId: true } },
      },
    });

    if (pending.length === 0) return;

    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    let resolved = 0;
    let rescheduled = 0;

    for (const need of pending) {
      const age = Date.now() - new Date(need.createdAt).getTime();

      if (age >= TWENTY_FOUR_HOURS) {
        if (
          need.approvalPollId &&
          need.approvalMessageId &&
          need.tree?.telegramChatId
        ) {
          await closeApprovalPoll(bot, prisma, need.id);
          resolved++;
        }
      } else {
        const remaining = TWENTY_FOUR_HOURS - age;
        setTimeout(() => {
          closeApprovalPoll(bot, prisma, need.id).catch((err) =>
            console.error(
              `[approval] Recovery close failed for ${need.id}:`,
              err.message,
            ),
          );
        }, remaining).unref();
        rescheduled++;
      }
    }

    console.log(
      `[approval] Recovery: ${resolved} resolved, ${rescheduled} rescheduled`,
    );
  } catch (err: any) {
    console.error(`[approval] Recovery failed:`, err.message);
  }
}
