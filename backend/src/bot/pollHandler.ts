/**
 * Cycle voting via native Telegram polls (1-10) sent by DM.
 *
 * Flow:
 * 1. Admin/cron sets needs to cyclePhase = "vote" with votingEndsAt
 * 2. startVotingCycle() sends a native poll DM to each eligible member per need
 * 3. Member answers the poll → handleCycleVotePollAnswer() records NeedVote
 * 4. Points are deducted proportionally: higher rating = more points spent
 * 5. Re-voting updates the existing vote (no duplicates)
 */

import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import type { BotContext } from "./types";

// ── Rating → Points mapping ──────────────────────────────────────────────

/**
 * Map a 1-10 poll option index to points.
 * Rating 10 = max points (capped by member's available cyclePoints).
 * Rating 1 = minimal points.
 * Linear scale: option 0 → 1 point, option 9 → 10 points.
 */
function ratingToPoints(optionIndex: number): number {
  return optionIndex + 1; // 0-indexed poll option → 1-10 points
}

// ── Send cycle poll to a single member ────────────────────────────────────

interface SendPollResult {
  memberId: string;
  tgUserId: bigint;
  pollId: string | null;
  error?: string;
}

/**
 * Send a native Telegram poll (1-10) to one member for one need.
 * Returns the poll ID if successful, null otherwise.
 */
async function sendNeedPollToMember(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  need: { id: string; title: string; treeId: string | null },
  member: { userId: string; cyclePoints: number },
  tgUserId: bigint,
): Promise<string | null> {
  try {
    const treeName =
      need.treeId
        ? (await prisma.tree.findUnique({ where: { id: need.treeId }, select: { name: true } }))?.name ?? "—"
        : "—";

    const poll = await bot.api.sendPoll(
      Number(tgUserId),
      `🗳️ *Votación de necesidad* — ${treeName}\n\n${need.title}`,
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      {
        is_anonymous: false,
        allows_multiple_answers: false,
      },
    );

    // Map poll → need for answer tracking
    await prisma.pollMapping.create({
      data: {
        pollId: poll.poll.id,
        needId: need.id,
        chatId: String(tgUserId),
        messageId: poll.message_id,
      },
    });

    return poll.poll.id;
  } catch (err: any) {
    // 403 = user blocked the bot → clean up telegramUserId
    if (err?.error_code === 403) {
      await prisma.user.updateMany({
        where: { telegramUserId: tgUserId },
        data: { telegramUserId: null },
      });
      console.log(`[pollHandler] Usuario tg_${tgUserId} bloqueó al bot — telegramUserId limpiado.`);
    }
    return null;
  }
}

// ── Start voting cycle for a tree ─────────────────────────────────────────

export interface CyclePollResult {
  treeId: string;
  treeName: string;
  needsPolled: number;
  pollsSent: number;
  membersSkipped: number;
  errors: string[];
}

/**
 * Send native polls to all eligible members for all needs in "vote" phase.
 * Called by cron or admin command when a voting cycle begins.
 */
export async function startVotingCycle(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  treeId: string,
): Promise<CyclePollResult> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: { id: true, name: true },
  });

  const result: CyclePollResult = {
    treeId,
    treeName: tree?.name ?? "unknown",
    needsPolled: 0,
    pollsSent: 0,
    membersSkipped: 0,
    errors: [],
  };

  if (!tree) {
    result.errors.push(`Tree ${treeId} not found`);
    return result;
  }

  // Find needs in voting phase (not yet expired)
  const now = new Date();
  const needs = await prisma.need.findMany({
    where: {
      treeId,
      cyclePhase: "vote",
      votingEndsAt: { gt: now },
    },
    select: { id: true, title: true, treeId: true },
  });

  if (needs.length === 0) {
    return result;
  }

  result.needsPolled = needs.length;

  // Get eligible members (active, with cyclePoints > 0, with telegramUserId)
  const members = await prisma.treeMember.findMany({
    where: {
      treeId,
      status: "ACTIVE",
      cyclePoints: { gt: 0 },
      user: { telegramUserId: { not: null } },
    },
    select: {
      userId: true,
      cyclePoints: true,
      user: { select: { telegramUserId: true } },
    },
  });

  // For each need, send poll to each member
  for (const need of needs) {
    for (const m of members) {
      const tgId = m.user?.telegramUserId;
      if (!tgId) {
        result.membersSkipped++;
        continue;
      }

      const pollId = await sendNeedPollToMember(bot, prisma, need, m, tgId);
      if (pollId) {
        result.pollsSent++;
      } else {
        result.membersSkipped++;
      }
    }
  }

  console.log(
    `[pollHandler] Voting cycle for "${result.treeName}": ` +
      `${result.needsPolled} needs × ${members.length} members = ${result.pollsSent} polls sent, ` +
      `${result.membersSkipped} skipped`,
  );

  return result;
}

// ── Send cycle poll for a single need (e.g. newly created during voting) ──

/**
 * Send polls for a single need that just entered voting phase.
 * Useful when a need is set to "vote" mid-cycle.
 */
export async function sendCyclePollForNeed(
  bot: Bot<BotContext>,
  prisma: PrismaClient,
  needId: string,
): Promise<number> {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    select: { id: true, title: true, treeId: true, cyclePhase: true, votingEndsAt: true },
  });

  if (!need || need.cyclePhase !== "vote") return 0;
  if (need.votingEndsAt && new Date(need.votingEndsAt) < new Date()) return 0;
  if (!need.treeId) return 0;

  const members = await prisma.treeMember.findMany({
    where: {
      treeId: need.treeId,
      status: "ACTIVE",
      cyclePoints: { gt: 0 },
      user: { telegramUserId: { not: null } },
    },
    select: {
      userId: true,
      cyclePoints: true,
      user: { select: { telegramUserId: true } },
    },
  });

  let sent = 0;
  for (const m of members) {
    const tgId = m.user?.telegramUserId;
    if (!tgId) continue;
    const pollId = await sendNeedPollToMember(bot, prisma, need, m, tgId);
    if (pollId) sent++;
  }

  return sent;
}

// ── Poll answer handler: record NeedVote ──────────────────────────────────

/**
 * Handle a poll_answer update for cycle voting (NeedVote).
 * Returns true if the poll was handled as a cycle vote.
 */
export async function handleCycleVotePollAnswer(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  try {
    const pollId = ctx.pollAnswer.poll_id;
    const optionIds = ctx.pollAnswer.option_ids; // [0..9]
    const voterTgId = ctx.pollAnswer.user?.id;
    if (!voterTgId) return false; // anonymous polls can't be verified

    // Look up the poll mapping
    const mapping = await prisma.pollMapping.findUnique({
      where: { pollId },
    });
    if (!mapping) return false;

    // Verify the need is still in voting phase
    const need = await prisma.need.findUnique({
      where: { id: mapping.needId },
      select: { id: true, cyclePhase: true, votingEndsAt: true, treeId: true },
    });

    if (!need || need.cyclePhase !== "vote") return true; // handled, but vote closed
    if (need.votingEndsAt && new Date(need.votingEndsAt) < new Date()) return true;

    // Resolve Trust Maker user
    const user = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(voterTgId) },
      select: { id: true },
    });
    if (!user) return true; // user not linked

    // Get member record to check/update cyclePoints
    if (!need.treeId) return true;

    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: user.id, treeId: need.treeId } },
      select: { cyclePoints: true },
    });
    if (!member) return true; // not a member of this tree

    // Calculate points from rating
    const rating = ratingToPoints(optionIds[0]);
    const points = Math.min(rating, member.cyclePoints);
    if (points <= 0) return true; // no points available

    // Check existing vote
    const existing = await prisma.needVote.findUnique({
      where: { needId_userId: { needId: mapping.needId, userId: user.id } },
    });

    if (existing) {
      // Update vote — refund old points, deduct new
      const pointDelta = points - existing.points;
      await prisma.needVote.update({
        where: { id: existing.id },
        data: { points },
      });
      if (pointDelta !== 0) {
        await prisma.treeMember.update({
          where: { userId_treeId: { userId: user.id, treeId: need.treeId } },
          data: { cyclePoints: { decrement: pointDelta } },
        });
      }
    } else {
      // New vote
      await prisma.needVote.create({
        data: {
          needId: mapping.needId,
          userId: user.id,
          points,
        },
      });
      await prisma.treeMember.update({
        where: { userId_treeId: { userId: user.id, treeId: need.treeId } },
        data: { cyclePoints: { decrement: points } },
      });
    }

    return true;
  } catch (err: any) {
    console.error("[pollHandler] cycle vote poll answer error:", err.message);
    return false;
  }
}

// ── Utility: close voting phase ───────────────────────────────────────────

/**
 * Close voting for a need: tally votes, reset phase.
 * Called by cron when votingEndsAt is reached.
 */
export async function closeVotingForNeed(
  prisma: PrismaClient,
  needId: string,
): Promise<{ totalPoints: number; voterCount: number }> {
  const votes = await prisma.needVote.findMany({
    where: { needId },
  });

  const totalPoints = votes.reduce((sum, v) => sum + v.points, 0);
  const voterCount = votes.length;

  await prisma.need.update({
    where: { id: needId },
    data: {
      cyclePhase: "collect",
      votingEndsAt: null,
      totalPoints: { increment: totalPoints },
    },
  });

  return { totalPoints, voterCount };
}
