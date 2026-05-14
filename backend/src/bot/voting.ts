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
