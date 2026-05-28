/**
 * Survey Reminder Cron: checks daily for SatisfactionSurveys closing in ~3 days,
 * sends a group announcement, and marks them as reminded.
 *
 * Runs every 6 hours — uses a ±12h window around the 3-day mark so each survey
 * gets reminded exactly once.
 */

import { PrismaClient } from "@prisma/client";
import type { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../bot/types";

export interface SurveyReminderResult {
  treeName: string;
  surveyId: string;
  targetName: string;
  skill: string;
  chatId: string;
  sent: boolean;
  error?: string;
}

/**
 * Check all active surveys closing in approximately 3 days and send reminders.
 */
export async function runSurveyReminders(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<SurveyReminderResult[]> {
  if (!bot) return [];

  const now = new Date();
  // Window: closes between 60h and 84h from now (~3 days ±12h)
  const windowStart = new Date(now.getTime() + 60 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 84 * 60 * 60 * 1000);

  const surveys = await prisma.satisfactionSurvey.findMany({
    where: {
      closesAt: { gte: windowStart, lte: windowEnd },
      reminderSent: false,
    },
    include: {
      tree: { select: { id: true, name: true, telegramChatId: true } },
    },
  });

  const results: SurveyReminderResult[] = [];

  for (const survey of surveys) {
    const chatId = survey.tree?.telegramChatId;
    if (!chatId) {
      results.push({
        treeName: survey.tree?.name || "—",
        surveyId: survey.id,
        targetName: "—",
        skill: survey.skill,
        chatId: "N/A",
        sent: false,
        error: "sin telegramChatId",
      });
      continue;
    }

    try {
      // Get target user name
      const targetUser = await prisma.user.findUnique({
        where: { id: survey.targetUserId },
        select: { firstName: true, username: true },
      });
      const targetName = targetUser?.firstName || targetUser?.username || survey.targetUserId.slice(0, 8);

      const closeDate = new Date(survey.closesAt).toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const keyboard = new (await import("grammy")).InlineKeyboard()
        .text("✍️ Votar", `votar_select:${survey.id}`);

      await bot.api.sendMessage(
        chatId,
        `📋 <b>Encuesta por cerrar</b>\n\n` +
        `👤 Para: <b>${targetName}</b>\n` +
        `🎯 Habilidad: <b>${survey.skill}</b>\n` +
        `⏳ Cierra en 3 días: ${closeDate}\n\n` +
        `Vota con <b>/votar</b> (anónimo, escala 1-10).`,
        {
          parse_mode: "HTML",
          reply_markup: keyboard,
        },
      );

      // Mark as reminded
      await prisma.satisfactionSurvey.update({
        where: { id: survey.id },
        data: { reminderSent: true },
      });

      results.push({
        treeName: survey.tree?.name || "—",
        surveyId: survey.id,
        targetName,
        skill: survey.skill,
        chatId,
        sent: true,
      });

      console.log(
        `[SurveyReminder] ✅ Recordatorio enviado: ${survey.skill} → ${targetName} (${survey.tree?.name})`,
      );
    } catch (err: any) {
      console.error(`[SurveyReminder] ❌ Error en ${survey.id}:`, err.message);
      results.push({
        treeName: survey.tree?.name || "—",
        surveyId: survey.id,
        targetName: "—",
        skill: survey.skill,
        chatId,
        sent: false,
        error: err.message,
      });
    }
  }

  if (results.length > 0) {
    const sent = results.filter((r) => r.sent).length;
    console.log(`[SurveyReminder] ${sent}/${results.length} recordatorios enviados.`);
  }

  return results;
}
