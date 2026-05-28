import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import type { BotContext } from "./types";

const prisma = new PrismaClient();

// ── Reaction weight mapping ──────────────────────────────────────────────
const REACTION_WEIGHT: Record<string, number> = {
  "👍": 1, // thumbs up = 1 voto (like)
  "❤️": 2, // heart = 2 votos (corazón)
  "⭐": 3, // star = 3 votos (estrella)
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

// ── Helper: resolve or create user from Telegram ID ──────────────────────

async function resolveOrCreateUser(tgId: string): Promise<any | null> {
  try {
    const bigIntId = BigInt(tgId);
    let user = await prisma.user.findUnique({
      where: { telegramUserId: bigIntId },
    });
    if (!user) {
      user = await prisma.user.create({
        data: { username: `tg_${tgId}`, telegramUserId: bigIntId },
      });
    }
    return user;
  } catch {
    return null;
  }
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

      // DisputeMessage model removed — dispute voting disabled

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

  console.log("[Telegram Bot] Reaction handler ready (👍=1, ❤️=2, ⭐=3)");
}

// ── Poll handler (T8: Votación anónima con encuestas nativas) ─────────────

/**
 * Attempt to handle a poll_answer as a need-voting poll (T8).
 * Returns true if the poll was handled, false if it should fall through.
 */
export async function handleNeedPollAnswer(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  try {
    const pollId = ctx.pollAnswer.poll_id;
    const optionIds = ctx.pollAnswer.option_ids; // [0, 1, 2]
    const voterTgId = ctx.pollAnswer.user?.id;
    if (!voterTgId) return false; // anonymous polls don't expose user — can't handle

    // Find the poll → need mapping
    const mapping = await prisma.pollMapping.findUnique({
      where: { pollId },
    });
    if (!mapping) return false;

    // Find ideas linked to this need
    const ideas = await prisma.idea.findMany({
      where: { needId: mapping.needId },
      orderBy: { createdAt: "asc" },
    });

    if (ideas.length === 0) return true; // handled, but no ideas yet

    // Take the first idea (simplified: in future, allow voting on any idea)
    const idea = ideas[0];

    // Resolve Trust Maker user
    const user = await resolveOrCreateUser(voterTgId.toString());
    if (!user) return true;

    // Weight = option_ids[0] + 1 → (0→1=Baja, 1→2=Media, 2→3=Alta)
    const weight = optionIds[0] + 1;

    // Upsert vote
    const existing = await prisma.ideaVote.findUnique({
      where: {
        ideaId_userId_needId: {
          ideaId: idea.id,
          userId: user.id,
          needId: mapping.needId,
        },
      },
    });

    if (existing) {
      const delta = weight - existing.weight;
      await prisma.ideaVote.update({
        where: { id: existing.id },
        data: { weight },
      });
      if (delta !== 0) {
        await prisma.idea.update({
          where: { id: idea.id },
          data: { totalLikes: Math.max(0, idea.totalLikes + delta) },
        });
      }
    } else {
      await prisma.ideaVote.create({
        data: {
          ideaId: idea.id,
          userId: user.id,
          needId: mapping.needId,
          weight,
        },
      });
      await prisma.idea.update({
        where: { id: idea.id },
        data: { totalLikes: idea.totalLikes + weight },
      });
    }

    return true;
  } catch (err) {
    console.error("[Telegram Bot] need poll handler error:", err);
    return false;
  }
}
