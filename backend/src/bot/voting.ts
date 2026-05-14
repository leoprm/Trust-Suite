import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import type { BotContext } from "./types";

const prisma = new PrismaClient();

// ── Reaction weight mapping ──────────────────────────────────────────────
const REACTION_WEIGHT: Record<string, number> = {
  "👍": 1, // thumbs up = 1 voto
  "❤️": 2, // heart = 2 votos
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Extract emoji string from a grammy ReactionType */
function getReactionEmoji(r: any): string | null {
  if (r?.type === "emoji") return r.emoji;
  return null;
}

/** Sum the weight of all reactions in an array */
function computeWeight(reactions: any[]): number {
  let w = 0;
  for (const r of reactions) {
    const emoji = getReactionEmoji(r);
    if (emoji && REACTION_WEIGHT[emoji] !== undefined) {
      w += REACTION_WEIGHT[emoji];
    }
  }
  return w;
}

// ── Reaction handler ─────────────────────────────────────────────────────

export function registerReactionHandler(bot: Bot<BotContext>): void {
  bot.on("message_reaction", async (ctx) => {
    try {
      const update = ctx.messageReaction;
      if (!update) return;

      const messageId = update.message_id;
      const tgUser = update.user;
      if (!tgUser) return; // anonymous reactions (channels) not supported

      const oldWeight = computeWeight(update.old_reaction || []);
      const newWeight = computeWeight(update.new_reaction || []);

      if (oldWeight === newWeight) return; // no change in tracked reactions

      // ── Resolve Trust Maker user from Telegram ID ──────────────────
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
      });
      if (!user) return; // user hasn't linked their account — silently skip

      // ── Try matching message to an Idea ────────────────────────────
      const idea = await prisma.idea.findFirst({
        where: { telegramMessageId: messageId },
        include: { need: { select: { id: true } } },
      });

      if (idea) {
        const needId = idea.need?.id;
        if (!needId) return; // idea without a need can't be voted on

        const existing = await prisma.ideaVote.findUnique({
          where: {
            ideaId_userId_needId: {
              ideaId: idea.id,
              userId: user.id,
              needId,
            },
          },
        });

        if (newWeight === 0) {
          // All tracked reactions removed → delete vote
          if (existing) {
            await prisma.ideaVote.delete({ where: { id: existing.id } });
            const newTotal = Math.max(0, idea.totalLikes - existing.weight);
            await prisma.idea.update({
              where: { id: idea.id },
              data: { totalLikes: newTotal },
            });
          }
        } else if (existing) {
          // Update weight
          const delta = newWeight - existing.weight;
          await prisma.ideaVote.update({
            where: { id: existing.id },
            data: { weight: newWeight },
          });
          if (delta !== 0) {
            await prisma.idea.update({
              where: { id: idea.id },
              data: { totalLikes: Math.max(0, idea.totalLikes + delta) },
            });
          }
        } else {
          // New vote
          await prisma.ideaVote.create({
            data: {
              ideaId: idea.id,
              userId: user.id,
              needId,
              weight: newWeight,
            },
          });
          await prisma.idea.update({
            where: { id: idea.id },
            data: { totalLikes: idea.totalLikes + newWeight },
          });
        }

        return;
      }

      // ── Try matching message to a DisputeMessage ─────────────────
      const disputeMsg = await prisma.disputeMessage.findFirst({
        where: {
          telegramMessageId: messageId,
          status: "OPEN",
        },
      });

      if (disputeMsg) {
        const emoji = getReactionEmoji(
          (update.new_reaction || [])[update.new_reaction?.length - 1],
        );

        if (!emoji) return;

        let vote: "UP" | "DOWN" | null = null;
        if (emoji === "👍") vote = "UP";
        else if (emoji === "👎") vote = "DOWN";
        if (!vote) return;

        // Upsert vote
        const existingVote = await prisma.telegramDisputeVote.findUnique({
          where: {
            disputeMessageId_telegramUserId: {
              disputeMessageId: disputeMsg.id,
              telegramUserId: BigInt(tgUser.id),
            },
          },
        });

        if (existingVote) {
          await prisma.telegramDisputeVote.update({
            where: { id: existingVote.id },
            data: { vote },
          });
        } else {
          await prisma.telegramDisputeVote.create({
            data: {
              disputeMessageId: disputeMsg.id,
              telegramUserId: BigInt(tgUser.id),
              vote,
            },
          });
        }

        // Update counts
        const counts = await prisma.telegramDisputeVote.groupBy({
          by: ["vote"],
          where: { disputeMessageId: disputeMsg.id },
          _count: { vote: true },
        });

        let thumbsUp = 0;
        let thumbsDown = 0;
        for (const c of counts) {
          if (c.vote === "UP") thumbsUp = c._count.vote;
          if (c.vote === "DOWN") thumbsDown = c._count.vote;
        }

        await prisma.disputeMessage.update({
          where: { id: disputeMsg.id },
          data: { thumbsUp, thumbsDown },
        });

        return;
      }

      // ── Try matching message to a Need (future: Need voting) ──────
      const need = await prisma.need.findFirst({
        where: { telegramMessageId: messageId },
      });

      if (need) {
        // Need voting via reactions is not yet implemented.
        // Future: could use IdeaVote with a synthetic need-scoped vote,
        // or create a dedicated NeedVote model.
        return;
      }
    } catch (err) {
      console.error("[Telegram Bot] reaction handler error:", err);
    }
  });

  console.log("[Telegram Bot] Reaction handler ready (👍=1 voto, ❤️=2 votos)");
}
