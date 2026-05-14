/**
 * Satisfaction poll + IA judge module (T10).
 *
 * Flow:
 * 1. When a result is evaluated/delivered → send anonymous poll to Telegram group
 * 2. When user votes on the poll → save satisfaction score + ask for optional comment
 * 3. When user replies with comment → IA judge analyzes via concierge
 */

import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "./types";

const CONCIERGE_URL = "http://localhost:3100/api/concierge";
const CONCIERGE_TIMEOUT_MS = 120_000; // 2 min for judge analysis
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

const SATISFACTION_EMOJIS = ["👍", "❤️", "⭐"];
const SATISFACTION_LABELS = ["Poco satisfecho", "Satisfecho", "Muy satisfecho"];

// ── Step 1: Send satisfaction poll when a result is delivered ────────────

export async function sendSatisfactionPoll(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  resultId: string,
): Promise<boolean> {
  try {
    // Load result with need → tree → telegramChatId
    const result = await (prisma as any).result.findUnique({
      where: { id: resultId },
      include: {
        need: {
          include: { tree: { select: { id: true, name: true, telegramChatId: true } } },
        },
      },
    });

    if (!result) {
      console.error(`[satisfaction] Result ${resultId} not found`);
      return false;
    }

    const chatId = result.need?.tree?.telegramChatId;
    if (!chatId) {
      console.warn(
        `[satisfaction] No telegramChatId for tree of result ${resultId} — poll not sent`,
      );
      return false;
    }

    const pollText =
      `✅ **Solución entregada:** ${result.summary}\n\n` +
      `¿Qué tan satisfecho estás con la solución?`;

    const sentPoll = await bot.api.sendPoll(chatId, pollText, SATISFACTION_LABELS, {
      is_anonymous: true,
      allows_multiple_answers: false,
    });

    // Save mapping
    await (prisma as any).satisfactionPoll.create({
      data: {
        pollId: sentPoll.poll.id,
        resultId,
        chatId,
        messageId: sentPoll.message_id,
      },
    });

    console.log(
      `[satisfaction] Poll sent for result ${resultId} → chat ${chatId}`,
    );
    return true;
  } catch (err: any) {
    console.error(`[satisfaction] Failed to send poll for result ${resultId}:`, err.message);
    return false;
  }
}

// ── Step 2: Handle poll answer → save satisfaction + ask for comment ─────

export async function handleSatisfactionPollAnswer(
  prisma: PrismaClient,
  ctx: BotContext,
  pollId: string,
  optionIds: number[],
  voterId: number,
): Promise<boolean> {
  const satisfactionPoll = await (prisma as any).satisfactionPoll.findUnique({
    where: { pollId },
  });

  if (!satisfactionPoll) return false; // Not a satisfaction poll

  const satisfaction = optionIds[0] + 1; // 0-indexed → 1-3

  // Save satisfaction score on the result
  await (prisma as any).result.update({
    where: { id: satisfactionPoll.resultId },
    data: {
      satisfactionScore: { increment: satisfaction },
      satisfactionCount: { increment: 1 },
    },
  });

  // Ask for comment via DM
  const emoji = SATISFACTION_EMOJIS[satisfaction - 1] ?? "👍";
  await ctx.api.sendMessage(
    voterId,
    `Gracias por tu valoración (${emoji}). ¿Quieres agregar un comentario? La IA jueza lo analizará para mejorar.`,
    {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "Escribe tu comentario aquí...",
      },
    },
  );

  console.log(
    `[satisfaction] Vote ${satisfaction}/3 on result ${satisfactionPoll.resultId}`,
  );
  return true;
}

// ── Step 3: Handle comment reply → IA judge analysis ─────────────────────

export async function handleSatisfactionCommentReply(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return false;
  if (!msg.reply_to_message) return false;

  const comment = msg.text.trim();
  if (!comment) return false;

  const voterId = msg.from?.id;
  if (!voterId) return false;

  // Find the satisfaction poll associated with the bot's message that
  // this user is replying to.  We track polls by messageId on the group,
  // but the force_reply goes to DM — so we search for a result where this
  // voter was recently asked for feedback.
  // Strategy: look up the most recent satisfactionPoll for this voter
  // by correlating with recent poll_answer events.  Since Telegram polls
  // are anonymous, we can't map voter → poll directly.  Instead, we
  // search satisfactionPolls ordered by recency and match the voter
  // via the poll_answer event.

  // The most reliable approach: the satisfactionPoll is the one where
  // the bot most recently sent a poll to a group this user is in.
  // We'll query all recent satisfactionPolls and cross-check with
  // the user's tree memberships.

  // Simplified: find any satisfactionPoll from the last 5 minutes
  // where the user might have voted.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentPolls = await (prisma as any).satisfactionPoll.findMany({
    where: { createdAt: { gte: fiveMinutesAgo } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (recentPolls.length === 0) return false;

  // Try each poll — look up the result and its need creator.
  // The voter's Telegram ID should match the need creator who evaluated.
  // Actually, the satisfaction poll is sent to the GROUP, so any
  // group member can vote. We need to correlate the DM reply with
  // a poll answer.  The simplest heuristic: use the most recent
  // satisfactionPoll where this user could have voted.

  // Since polls are anonymous on Telegram, we use a best-effort approach:
  // pick the most recent satisfactionPoll whose poll was sent to
  // a group this user is a member of.
  const tgId = BigInt(voterId);
  const user = await (prisma as any).user.findUnique({
    where: { telegramUserId: tgId },
    select: { id: true },
  });
  if (!user) return false;

  for (const poll of recentPolls) {
    // Check if user is a member of the tree associated with this result
    const result = await (prisma as any).result.findUnique({
      where: { id: poll.resultId },
      select: { need: { select: { treeId: true } }, satisfactionCount: true },
    });
    if (!result?.need?.treeId) continue;

    const membership = await (prisma as any).treeMember.findUnique({
      where: {
        userId_treeId: { userId: user.id, treeId: result.need.treeId },
      },
    });
    if (!membership) continue;

    // Found: this is the right poll. Get satisfaction score.
    const satisfactionScore = result.satisfactionCount > 0
      ? Math.round(
          (await (prisma as any).result.findUnique({
            where: { id: poll.resultId },
            select: { satisfactionScore: true, satisfactionCount: true },
          })).satisfactionScore / 
          (await (prisma as any).result.findUnique({
            where: { id: poll.resultId },
            select: { satisfactionCount: true },
          })).satisfactionCount
        )
      : 0;

    // ── Call IA judge via concierge ──
    const analysis = await callJudgeAnalysis(
      poll.resultId,
      poll.chatId,
      satisfactionScore,
      comment,
    );

    if (analysis) {
      await (prisma as any).result.update({
        where: { id: poll.resultId },
        data: {
          judgeComment: comment,
          judgeAnalysis: analysis,
        },
      });

      // Notify the voter
      await ctx.reply(
        `📊 **IA jueza analizó tu feedback:**\n${analysis}`,
        { parse_mode: "Markdown" },
      );

      console.log(`[satisfaction] Judge analysis saved for result ${poll.resultId}`);
    }

    return true;
  }

  return false;
}

// ── Concierge call for IA judge analysis ─────────────────────────────────

async function callJudgeAnalysis(
  resultId: string,
  chatId: string,
  satisfaction: number,
  comment: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONCIERGE_TIMEOUT_MS);

  try {
    const prompt = [
      `Analiza este comentario de satisfacción sobre un resultado de Trust Maker:`,
      ``,
      `Satisfacción: ${satisfaction}/3`,
      `Comentario: "${comment}"`,
      ``,
      `Resume en 1-2 frases qué mejorar y si el resultado fue útil.`,
      `Responde en español neutro. Solo el análisis, sin saludos ni despedidas.`,
    ].join("\n");

    const response = await fetch(CONCIERGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SERVER_KEY}`,
        "X-Hermes-Session-Key": `judge-result-${resultId}`,
      },
      body: JSON.stringify({
        message: prompt,
        treeId: chatId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[satisfaction] Concierge returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as any;
    return data?.reply?.trim() ?? null;
  } catch (err: any) {
    console.error(`[satisfaction] Judge analysis failed:`, err.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
