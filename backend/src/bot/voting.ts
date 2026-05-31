import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
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

// ── Solution generator (Hermes Agent) ────────────────────────────────────

async function generateSolutionsForNeed(
  needId: string,
  treeId: string,
  treeName: string,
  needTitle: string,
  needDescription: string,
  telegramChatId: string,
  replyToMessageId: number | null,
): Promise<void> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
  const HERMES_KEY = process.env.HERMES_API_SERVER_KEY || "";

  if (!HERMES_KEY) {
    console.error("[generateSolutions] Missing HERMES_API_SERVER_KEY");
    return;
  }

  const escapeShell = (s: string) => s.replace(/'/g, "'\\''");
  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1. Build prompt for Hermes Agent
  const prompt =
    `Eres Ari, asistente de Trust Maker. Genera exactamente 3 ideas de solucion ` +
    `para esta necesidad del arbol "${treeName}":\n\n` +
    `Necesidad: ${needTitle}\n` +
    `Descripcion: ${needDescription}\n\n` +
    `Responde UNICAMENTE con las 3 ideas, una por linea, sin numeros ni bullets. ` +
    `Formato:\nIdea 1 texto aqui\nIdea 2 texto aqui\nIdea 3 texto aqui`;

  const hermesBody = JSON.stringify({
    messages: [{ role: "user", content: prompt }],
    stream: false,
    tool_choice: "none",
  });

  // 2. Call Hermes Agent API
  exec(
    `curl -s --max-time 60 -X POST http://127.0.0.1:8644/v1/chat/completions ` +
      `-H 'Content-Type: application/json' ` +
      `-H 'Authorization: Bearer ${escapeShell(HERMES_KEY)}' ` +
      `-H 'X-Hermes-Session-Key: tree-agent-${escapeShell(treeId)}' ` +
      `-d '${escapeShell(hermesBody)}'`,
    { timeout: 65000 },
    async (err, stdout) => {
      if (err) {
        console.error("[generateSolutions] Hermes call failed:", err.message);
        return;
      }
      try {
        const resp = JSON.parse(stdout);
        const content: string = resp?.choices?.[0]?.message?.content || "";
        const ideas = content
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 10)
          .map((l: string) => l.slice(0, 300))
          .slice(0, 5);

        console.log(
          `[generateSolutions] Got ${ideas.length} ideas from Hermes for need ${needId}`,
        );

        for (const ideaText of ideas) {
          // 3. Send each idea as a separate Telegram message
          const payload = JSON.stringify({
            chat_id: telegramChatId,
            text:
              `<b>💡 Idea de solución</b>\n\n${escHtml(ideaText)}\n\n` +
              `👍 ❤️ ⭐ Vota por esta solución`,
            parse_mode: "HTML",
            reply_to_message_id: replyToMessageId,
          });

          exec(
            `curl -s --max-time 10 -X POST ` +
              `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage ` +
              `-H 'Content-Type: application/json' ` +
              `-d '${escapeShell(payload)}'`,
            { timeout: 12000 },
            async (err2, stdout2) => {
              if (err2) {
                console.error(
                  "[generateSolutions] Telegram send failed:",
                  err2.message,
                );
                return;
              }
              try {
                const tgResp = JSON.parse(stdout2);
                if (tgResp.ok && tgResp.result?.message_id) {
                  // 4. Create Idea record in DB
                  await prisma.idea.create({
                    data: {
                      content: ideaText,
                      creatorId: "telegram-bot",
                      needId,
                      telegramMessageId: tgResp.result.message_id,
                    },
                  });
                  console.log(
                    `[generateSolutions] Idea created (msg_id=${tgResp.result.message_id}) for need ${needId}`,
                  );
                } else {
                  console.error(
                    "[generateSolutions] Telegram API error:",
                    stdout2.slice(0, 200),
                  );
                }
              } catch {
                /* ignore parse errors */
              }
            },
          );
        }
      } catch {
        console.error("[generateSolutions] Failed to parse Hermes response");
      }
    },
  );
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

      // ── Try matching message to a Need ──────────────────────────
      const need = await prisma.need.findFirst({
        where: { telegramMessageId: messageId },
        include: { tree: { select: { id: true } } },
      });

      if (need && need.tree) {
        // Fetch full need data for title/description
        const fullNeed = await prisma.need.findUnique({
          where: { id: need.id },
          select: { id: true, title: true, description: true, dailyVotes: true, telegramMessageId: true },
        });
        if (!fullNeed) return;
        const needTitle = fullNeed.title;
        const needDesc = fullNeed.description || '';
        // Count thumbs-up reactions only
        const thumbsUpCount = (update.new_reaction || [])
          .filter((r: any) => r?.type === "emoji" && r?.emoji === "👍").length;
        const oldThumbsUp = (update.old_reaction || [])
          .filter((r: any) => r?.type === "emoji" && r?.emoji === "👍").length;
        const delta = thumbsUpCount - oldThumbsUp;

        if (delta !== 0) {
          const updatedNeed = await prisma.need.update({
            where: { id: need.id },
            data: { dailyVotes: { increment: delta } },
          });

          const memberCount = await prisma.treeMember.count({
            where: { treeId: need.tree.id, status: "ACTIVE" },
          });

          if (memberCount > 0 && updatedNeed.dailyVotes > memberCount * 0.5) {
            await prisma.need.update({
              where: { id: need.id },
              data: { status: "APPROVED" as any },
            });
            console.log(
              `[NeedVoting] Need ${need.id} APPROVED — ${updatedNeed.dailyVotes} votes > 50% of ${memberCount} members`,
            );

            // ── Notify group about approval ──────────────────────────
            const tree = await prisma.tree.findUnique({
              where: { id: need.tree.id },
              select: { telegramChatId: true, name: true },
            });
            if (tree?.telegramChatId) {
              const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
              const escHtml = (s: string) =>
                s
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
              const text =
                `<b>✅ Necesidad aprobada en ${escHtml(tree.name)}</b>\n\n` +
                `<b>${escHtml(needTitle)}</b>\n` +
                `${escHtml(needDesc)}\n\n` +
                `Votos: ${updatedNeed.dailyVotes} 👍\n\n` +
                `<b>¡Propongan soluciones!</b> Respondan a este mensaje con sus ideas.`;

              const payload = JSON.stringify({
                chat_id: tree.telegramChatId,
                text,
                parse_mode: "HTML",
                reply_to_message_id: need.telegramMessageId,
              });

              exec(
                `curl -s --max-time 10 -X POST https://api.telegram.org/bot${BOT_TOKEN}/sendMessage ` +
                  `-H 'Content-Type: application/json' -d '${payload.replace(/'/g, "'\\''")}'`,
                { timeout: 12000 },
                (err, stdout) => {
                  if (err) {
                    console.error("[NeedVoting] curl error:", err.message);
                    return;
                  }
                  try {
                    const data = JSON.parse(stdout);
                    if (data.ok) {
                      console.log(
                        `[NeedVoting] Approval notification sent for need ${need.id}`,
                      );
                    } else {
                      console.error(
                        "[NeedVoting] Telegram API error:",
                        stdout.slice(0, 200),
                      );
                    }
                  } catch {
                    /* ignore parse errors */
                  }
                },
              );

              // ── Generate solution ideas via Ari ─────────────────────
              generateSolutionsForNeed(
                need.id,
                need.tree.id,
                tree.name,
                needTitle,
                needDesc,
                tree.telegramChatId,
                need.telegramMessageId,
              );
            }
          }
        }
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
