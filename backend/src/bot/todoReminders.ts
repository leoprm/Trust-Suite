/**
 * Smart todo reminders — checks pending todos with deadlines and sends
 * timely reminders to Telegram groups.
 *
 * Logic per todo:
 *   - deadline > 48h away  → remind at 50% of remaining time
 *   - deadline 24-48h away  → remind immediately
 *   - deadline < 24h away   → if already reminded, re-remind every 6h
 *   - deadline already past → mark as OVERDUE (no reminder)
 */

import { PrismaClient } from "@prisma/client";
import { Bot } from "grammy";
import { BotContext } from "./types";

export async function checkTodoReminders(
  prisma: PrismaClient,
  bot: Bot<BotContext>,
): Promise<void> {
  const now = new Date();

  // Find all active trees with Telegram chat
  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });

  for (const tree of trees) {
    const chatId = tree.telegramChatId;
    if (!chatId) continue;

    // Find pending todos with deadlines
    const todos = await prisma.todo.findMany({
      where: {
        treeId: tree.id,
        status: "PENDING",
        deadline: { not: null },
      },
    });

    for (const todo of todos) {
      const deadline = new Date(todo.deadline);
      const diffMs = deadline.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // ── Overdue: mark and skip ──────────────────────────────────
      if (diffHours <= 0) {
        await prisma.todo.update({
          where: { id: todo.id },
          data: { status: "OVERDUE" },
        });
        continue;
      }

      let shouldRemind = false;

      if (!todo.reminderSent) {
        // First reminder
        if (diffHours > 48) {
          // Remind at 50% of remaining time
          const totalMs = deadline.getTime() - new Date(todo.createdAt).getTime();
          const elapsedMs = now.getTime() - new Date(todo.createdAt).getTime();
          const progress = elapsedMs / totalMs; // 0..1
          shouldRemind = progress >= 0.5;
        } else {
          // 48h or less → remind immediately
          shouldRemind = true;
        }
      } else {
        // Already reminded at least once
        if (diffHours < 24) {
          // Re-remind every 6h
          const lastReminder = todo.reminderSentAt
            ? new Date(todo.reminderSentAt)
            : new Date(0);
          const sinceLastReminder =
            (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);
          shouldRemind = sinceLastReminder >= 6;
        }
        // > 24h after first reminder → don't re-remind (already done)
      }

      if (!shouldRemind) continue;

      // ── Send reminder ────────────────────────────────────────────
      const dateStr = deadline.toLocaleDateString("es-CL", {
        day: "numeric",
        month: "long",
        year: deadline.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });

      const assigneeTag = todo.assignedToName
        ? ` ${todo.assignedToName} esta a cargo.`
        : " ¿Alguien se ha apuntado?";

      const message =
        "\u23F0 *Recordatorio:* \"" + todo.summary + "\" tiene fecha limite *" + dateStr + "*." + assigneeTag;

      try {
        await bot.api.sendMessage(Number(chatId), message, {
          parse_mode: "Markdown",
        });
      } catch (err: any) {
        console.error(
          `[TodoReminders] Failed to send reminder for todo ${todo.id}:`,
          err.message,
        );
        continue; // Don't mark as sent if delivery failed
      }

      // ── Mark as reminded ─────────────────────────────────────────
      await prisma.todo.update({
        where: { id: todo.id },
        data: {
          reminderSent: true,
          reminderSentAt: now,
        },
      });
    }
  }
}
