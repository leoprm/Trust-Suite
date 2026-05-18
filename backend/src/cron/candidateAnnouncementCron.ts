/**
 * CandidateAnnouncement Cron — V4 hiring pipeline automation.
 *
 * Runs every 60 seconds. Handles:
 *   1. 3h40m reminder: send group notification "Quedan 20 min. Nadie mas?"
 *   2. 4h deadline: close window, create anonymous Telegram poll with candidates
 *   3. 24h after deadline: close the poll and parse results
 *
 * Poll options: candidate names + "Contratar externo (~$X)" + "Cancelar tarea"
 * Poll is anonymous (is_anonymous: true), type: regular.
 *
 * V4: i18n-aware — uses tree language for all user-facing messages.
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";
import { t } from "../bot/i18n";

const REMINDER_BEFORE_MS = 20 * 60 * 1000;
const POLL_DURATION_MS = 24 * 60 * 60 * 1000;

async function resolveTreeLanguage(prisma: PrismaClient, treeId: string): Promise<string> {
  try {
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { language: true },
    });
    return tree?.language || "es";
  } catch {
    return "es";
  }
}

export async function runCandidateAnnouncementCron(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<{ checked: number; remindersSent: number; pollsCreated: number; pollsClosed: number }> {
  if (!bot) return { checked: 0, remindersSent: 0, pollsCreated: 0, pollsClosed: 0 };

  const now = new Date();
  let remindersSent = 0;
  let pollsCreated = 0;
  let pollsClosed = 0;

  const announcements = await (prisma as any).candidateAnnouncement.findMany({
    where: { pollClosed: false },
  });

  for (const ann of announcements) {
    const deadline = new Date(ann.deadline);
    const msUntilDeadline = deadline.getTime() - now.getTime();
    const lng = await resolveTreeLanguage(prisma, ann.treeId);

    // 1. Reminder at 3h40m
    if (!ann.reminderSentAt && msUntilDeadline <= REMINDER_BEFORE_MS && msUntilDeadline > -60_000) {
      try {
        const reminder = await bot.api.sendMessage(
          ann.telegramChatId,
          t("v1.reminder", lng),
          { parse_mode: "MarkdownV2" },
        );
        await (prisma as any).candidateAnnouncement.update({
          where: { id: ann.id },
          data: { reminderSentAt: now, reminderMsgId: reminder.message_id },
        });
        remindersSent++;
        console.log(`[CandidateCron] Reminder sent for task ${ann.taskId}`);
      } catch (err: any) {
        console.error(`[CandidateCron] Reminder error for ${ann.taskId}:`, err.message);
      }
      continue;
    }

    // 2. Deadline reached: create poll
    if (!ann.pollId && msUntilDeadline <= 0) {
      try {
        const candidates = await (prisma as any).candidate.findMany({
          where: { taskId: ann.taskId },
          include: { user: { select: { id: true, firstName: true, username: true } } },
          orderBy: { createdAt: "asc" },
        });

        const extTask = await (prisma as any).externalTask.findFirst({
          where: { kanbanTaskId: ann.taskId },
          select: { budget: true, currency: true, title: true },
        });

        const budget = extTask?.budget || 0;
        const currency = extTask?.currency || "CLP";
        const pollOptions: string[] = [];

        for (const c of candidates) {
          const name = c.user?.firstName || c.user?.username || c.userId.slice(0, 8);
          pollOptions.push(name);
        }

        if (budget > 0) {
          pollOptions.push(
            t("v1.poll_option_external_budget", lng, { budget, currency }),
          );
        } else {
          pollOptions.push(t("v1.poll_option_external", lng));
        }
        pollOptions.push(t("v1.poll_option_cancel", lng));

        const taskTitle = extTask?.title || ann.taskId.slice(0, 12);
        const question = t("v1.poll_question", lng, { title: taskTitle });

        const poll = await bot.api.sendPoll(ann.telegramChatId, question, pollOptions, {
          is_anonymous: true,
          type: "regular",
          allows_multiple_answers: false,
        });

        await (prisma as any).candidateAnnouncement.update({
          where: { id: ann.id },
          data: { pollId: poll.poll.id, pollMessageId: poll.message_id },
        });

        try {
          await bot.api.editMessageReplyMarkup(ann.telegramChatId, ann.announcementMsgId, {
            reply_markup: { inline_keyboard: [] },
          });
        } catch { /* ok */ }

        pollsCreated++;
        console.log(`[CandidateCron] Poll created for ${ann.taskId} (${candidates.length} candidates)`);
      } catch (err: any) {
        console.error(`[CandidateCron] Poll creation error:`, err.message);
      }
      continue;
    }

    // 3. Close polls after 24h
    if (ann.pollId && !ann.pollClosed) {
      const pollAge = now.getTime() - deadline.getTime();
      if (pollAge >= POLL_DURATION_MS) {
        try {
          const stoppedPoll = await bot.api.stopPoll(ann.telegramChatId, ann.pollMessageId!);
          const options = stoppedPoll.options || [];
          let winnerOption: string | null = null;
          let winnerVotes = 0;

          for (let i = 0; i < options.length; i++) {
            if (options[i].voter_count > winnerVotes) {
              winnerVotes = options[i].voter_count;
              winnerOption = options[i].text;
            }
          }

          if (winnerVotes === 0 && winnerOption) {
            try {
              await bot.api.sendMessage(
                ann.telegramChatId,
                t("v1.poll_closed_no_votes", lng),
              );
            } catch { /* best effort */ }
          }

          await (prisma as any).candidateAnnouncement.update({
            where: { id: ann.id },
            data: { pollClosed: true },
          });
          pollsClosed++;
          console.log(`[CandidateCron] Poll closed: winner="${winnerOption}" (${winnerVotes} votes)`);
        } catch (err: any) {
          if (err.message?.includes("closed") || err.message?.includes("stopped")) {
            await (prisma as any).candidateAnnouncement.update({
              where: { id: ann.id },
              data: { pollClosed: true },
            });
            pollsClosed++;
          } else {
            console.error(`[CandidateCron] Poll close error:`, err.message);
          }
        }
      }
    }
  }

  return { checked: announcements.length, remindersSent, pollsCreated, pollsClosed };
}
