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
import { applyRatings } from "../services/ratingService";
import { updateProfileFromRating, awardSatisfactionXp } from "../services/agentProfileService";

const CONCIERGE_URL = "http://localhost:3100/api/concierge";
const CONCIERGE_TIMEOUT_MS = 120_000; // 2 min for judge analysis
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

const SATISFACTION_EMOJIS = ["👍", "❤️", "⭐"];
const SATISFACTION_LABELS = ["Poco satisfecho", "Satisfecho", "Muy satisfecho"];

// ── In-memory state: track pending comment requests per voter ────────────
// Map<voterId, { resultId, chatId, pollExpiresAt }>
// Cleared after comment received or after 10 min.
const pendingJudgeComments = new Map<
  number,
  { resultId: string; chatId: string; expiresAt: number }
>();

function setPending(voterId: number, resultId: string, chatId: string) {
  pendingJudgeComments.set(voterId, {
    resultId,
    chatId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });
}

function takePending(voterId: number) {
  const entry = pendingJudgeComments.get(voterId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingJudgeComments.delete(voterId);
    return null;
  }
  pendingJudgeComments.delete(voterId);
  return entry;
}

// Periodic cleanup every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingJudgeComments) {
    if (now > entry.expiresAt) pendingJudgeComments.delete(key);
  }
}, 5 * 60 * 1000).unref();

// ── Step 1: Send satisfaction poll when a result is delivered ────────────

export async function sendSatisfactionPoll(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  resultId: string,
): Promise<boolean> {
  try {
    const result = await prisma.result.findUnique({
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

    await prisma.satisfactionPoll.create({
      data: {
        pollId: sentPoll.poll.id,
        resultId,
        chatId,
        messageId: sentPoll.message_id,
      },
    });

    console.log(`[satisfaction] Poll sent for result ${resultId} → chat ${chatId}`);
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
  try {
    const satisfactionPoll = await prisma.satisfactionPoll.findUnique({
      where: { pollId },
    });

    if (!satisfactionPoll) return false;

    const satisfaction = optionIds[0] + 1; // 0-indexed → 1-3

    await prisma.result.update({
      where: { id: satisfactionPoll.resultId },
      data: {
        satisfactionScore: { increment: satisfaction },
        satisfactionCount: { increment: 1 },
      },
    });

    // ── T10bis: Create Ratings for agents who worked on this result ──
    try {
      await createRatingsFromSatisfaction(
        prisma,
        satisfactionPoll.resultId,
        satisfaction,
      );
    } catch (ratingErr: any) {
      console.error(
        `[satisfaction] Rating creation failed (non-fatal):`,
        ratingErr.message,
      );
    }

    // Track that this voter was asked for a comment
    setPending(voterId, satisfactionPoll.resultId, satisfactionPoll.chatId);

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
      `[satisfaction] Vote ${satisfaction}/3 on result ${satisfactionPoll.resultId} (voter ${voterId})`,
    );
    return true;
  } catch (err: any) {
    console.error(`[satisfaction] poll_answer error:`, err.message);
    return false;
  }
}

// ── T10bis: Creates Ratings for all agents in the tree from satisfaction ──

async function createRatingsFromSatisfaction(
  prisma: PrismaClient,
  resultId: string,
  satisfaction: number,
): Promise<void> {
  // 1. Get result with need.tree and need.creatorId
  const result = await prisma.result.findUnique({
    where: { id: resultId },
    include: {
      need: {
        include: { tree: { select: { id: true } } },
      },
    },
  });

  if (!result?.need?.tree?.id) {
    console.warn(
      `[satisfaction] No tree for result ${resultId} — skipping ratings`,
    );
    return;
  }

  const treeId: string = result.need.tree.id;
  const needId: string = result.needId;

  // 2. Find first task linked to this need
  const tasks = await prisma.task.findMany({
    where: { needId },
    orderBy: { createdAt: "asc" },
    take: 1,
  });

  let taskId: string;
  if (tasks.length > 0) {
    taskId = tasks[0].id;
  } else {
    // Create synthetic task so Rating.fk_taskId is satisfied
    const synthetic = await prisma.task.create({
      data: {
        treeId,
        needId,
        title: `Satisfaction proxy (result ${resultId})`,
        description: "Synthetic task for satisfaction rating",
        budget: 0,
        status: "VERIFIED",
        creatorId: result.need.creatorId,
      },
    });
    taskId = synthetic.id;
    console.log(`[satisfaction] Created synthetic task ${taskId} for result ${resultId}`);
  }

  // 3. Find active AgentMemberships in this tree
  const memberships = await prisma.agentMembership.findMany({
    where: { treeId, status: "ACTIVE" },
  });

  if (memberships.length === 0) {
    console.warn(
      `[satisfaction] No active agents in tree ${treeId} — skipping ratings`,
    );
    return;
  }

  // 4. For each agent: create Rating + update membership XP + update profile
  for (const membership of memberships) {
    try {
      await applyRatings(membership.agentId, treeId, taskId, [
        { role: membership.role, stars: satisfaction },
      ]);
      await updateProfileFromRating(
        membership.agentId,
        membership.role,
        satisfaction,
      );
      // T14: Award bonus XP based on satisfaction (5/15/30)
      await awardSatisfactionXp(
        membership.agentId,
        membership.role,
        satisfaction,
      );
    } catch (err: any) {
      console.error(
        `[satisfaction] Failed to rate agent ${membership.agentId}:`,
        err.message,
      );
    }
  }

  console.log(
    `[satisfaction] Created ${memberships.length} ratings for result ${resultId} (${satisfaction}★)`,
  );
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

  // Check if this voter was recently asked for a comment
  const pending = takePending(voterId);
  if (!pending) return false;

  // Fetch satisfaction average for context
  let satisfactionAvg = 0;
  try {
    const result = await prisma.result.findUnique({
      where: { id: pending.resultId },
      select: { satisfactionScore: true, satisfactionCount: true },
    });
    if (result && result.satisfactionCount > 0) {
      satisfactionAvg = Math.round(result.satisfactionScore / result.satisfactionCount);
    }
  } catch {
    // Non-fatal
  }

  // ── Call IA judge via concierge ──
  const analysis = await callJudgeAnalysis(
    pending.resultId,
    pending.chatId,
    satisfactionAvg,
    comment,
  );

  if (analysis) {
    try {
      await prisma.result.update({
        where: { id: pending.resultId },
        data: {
          judgeComment: comment,
          judgeAnalysis: analysis,
        },
      });
      console.log(`[satisfaction] Judge analysis saved for result ${pending.resultId}`);
    } catch (err: any) {
      console.error(`[satisfaction] Failed to save judge analysis:`, err.message);
    }
  }

  // Reply to the user — analysis is INTERNAL only (stored in DB for audit).
  // Per Leo: IA judge analysis is never shared with users or groups.
  await ctx.reply("✅ Gracias por tu comentario. Será revisado por el equipo.");
  return true;
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
      `Satisfacción promedio: ${satisfaction}/3`,
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
