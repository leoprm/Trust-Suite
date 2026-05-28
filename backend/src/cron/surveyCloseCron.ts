/**
 * Survey Close Cron: runs every hour, closes expired SatisfactionSurveys.
 *
 * For each survey where closesAt < now() AND visible = false:
 *   1. Calculate AVG(score) from SurveyVote
 *   2. Upsert into SatisfactionScore (weighted average formula)
 *   3. Set visible = true
 *   4. Publish results (or "sin votos") to the tree's Telegram group
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";

export interface SurveyCloseResult {
  surveyId: string;
  treeName: string;
  targetName: string;
  skill: string;
  chatId: string | null;
  avgScore: number | null;
  voteCount: number;
  closed: boolean;
  error?: string;
}

/**
 * Close all expired surveys and publish results.
 */
export async function runSurveyClose(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<SurveyCloseResult[]> {
  const now = new Date();

  const surveys = await prisma.satisfactionSurvey.findMany({
    where: {
      closesAt: { lt: now },
      visible: false,
    },
    include: {
      tree: { select: { id: true, name: true, telegramChatId: true } },
      votes: { select: { score: true } },
    },
  });

  if (surveys.length === 0) return [];

  const results: SurveyCloseResult[] = [];

  for (const survey of surveys) {
    const chatId: string | null = survey.tree?.telegramChatId ?? null;

    try {
      // Get target user name
      const targetUser = await prisma.user.findUnique({
        where: { id: survey.targetUserId },
        select: { firstName: true, username: true },
      });
      const targetName =
        targetUser?.firstName ||
        targetUser?.username ||
        survey.targetUserId.slice(0, 8);

      // Calculate average score from votes
      const scores: number[] = (survey.votes || []).map((v: any) => v.score);
      const voteCount = scores.length;

      if (voteCount > 0) {
        const sum = scores.reduce((a: number, b: number) => a + b, 0);
        const newAvg = Math.round((sum / voteCount) * 10) / 10; // 1 decimal

        // Upsert SatisfactionScore: weighted average
        const oldScore = await prisma.satisfactionScore.findUnique({
          where: {
            userId_skill: {
              userId: survey.targetUserId,
              skill: survey.skill,
            },
          },
        });

        let finalAvg: number;
        let finalTotal: number;

        if (oldScore) {
          const oldWeight = oldScore.avgScore * oldScore.totalSurveys;
          const newWeight = newAvg * voteCount;
          finalTotal = oldScore.totalSurveys + voteCount;
          finalAvg = Math.round(((oldWeight + newWeight) / finalTotal) * 10) / 10;
        } else {
          finalAvg = newAvg;
          finalTotal = voteCount;
        }

        await prisma.satisfactionScore.upsert({
          where: {
            userId_skill: {
              userId: survey.targetUserId,
              skill: survey.skill,
            },
          },
          create: {
            userId: survey.targetUserId,
            skill: survey.skill,
            avgScore: finalAvg,
            totalSurveys: finalTotal,
          },
          update: {
            avgScore: finalAvg,
            totalSurveys: finalTotal,
          },
        });

        // Publish to group
        if (bot && chatId) {
          await bot.api.sendMessage(
            chatId,
            `📊 <b>Resultados de encuesta</b>\n\n` +
              `👤 Para: <b>${targetName}</b>\n` +
              `🎯 Habilidad: <b>${survey.skill}</b>\n` +
              `⭐ Promedio: <b>${newAvg}/10</b>\n` +
              `🗳 Votos: <b>${voteCount}</b>`,
            { parse_mode: "HTML" },
          );
        }

        console.log(
          `[SurveyClose] ✅ Cerrada: ${survey.skill} → ${targetName} | ` +
            `avg=${newAvg}/10 (${voteCount} votos) | ` +
            `score acumulado=${finalAvg}/10 (${finalTotal} encuestas)`,
        );

        results.push({
          surveyId: survey.id,
          treeName: survey.tree?.name || "—",
          targetName,
          skill: survey.skill,
          chatId,
          avgScore: newAvg,
          voteCount,
          closed: true,
        });
      } else {
        // No votes
        if (bot && chatId) {
          await bot.api.sendMessage(
            chatId,
            `📋 <b>Encuesta cerrada sin votos</b>\n\n` +
              `👤 Para: <b>${targetName}</b>\n` +
              `🎯 Habilidad: <b>${survey.skill}</b>`,
            { parse_mode: "HTML" },
          );
        }

        console.log(
          `[SurveyClose] ⚠️ Cerrada sin votos: ${survey.skill} → ${targetName}`,
        );

        results.push({
          surveyId: survey.id,
          treeName: survey.tree?.name || "—",
          targetName,
          skill: survey.skill,
          chatId,
          avgScore: null,
          voteCount: 0,
          closed: true,
        });
      }

      // Mark as visible (closed and results revealed)
      await prisma.satisfactionSurvey.update({
        where: { id: survey.id },
        data: { visible: true },
      });
    } catch (err: any) {
      console.error(`[SurveyClose] ❌ Error en ${survey.id}:`, err.message);
      results.push({
        surveyId: survey.id,
        treeName: survey.tree?.name || "—",
        targetName: "—",
        skill: survey.skill,
        chatId,
        avgScore: null,
        voteCount: 0,
        closed: false,
        error: err.message,
      });
    }
  }

  const closed = results.filter((r) => r.closed).length;
  console.log(
    `[SurveyClose] ${closed}/${results.length} encuestas cerradas.`,
  );

  return results;
}

/**
 * Start the survey close cron: runs every hour.
 */
export function startSurveyCloseCron(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): void {
  // Run immediately on startup, then every hour
  const run = () => {
    runSurveyClose(prisma, bot)
      .then((results) => {
        if (results.length > 0) {
          const closed = results.filter((r) => r.closed).length;
          console.log(
            `[SurveyClose] Tick: ${closed}/${results.length} encuestas cerradas.`,
          );
        }
      })
      .catch((err) => {
        console.error("[SurveyClose] Error en tick:", err?.stack || err?.message || err);
      });
  };

  // First run after 30s (let the bot initialize), then every hour
  setTimeout(() => {
    run();
    setInterval(run, 60 * 60 * 1000);
  }, 30_000);

  console.log("[SurveyClose] Cron iniciado (cada hora, primer tick en 30s)");
}
