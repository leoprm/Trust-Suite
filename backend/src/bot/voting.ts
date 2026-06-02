import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import type { BotContext } from "./types";

const prisma = new PrismaClient();

// ── HTTP / Telegram helpers ───────────────────────────────────────────────

/** Escape HTML special chars for Telegram parse_mode=HTML */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Shell-escape a single-quoted string for use in curl -d '...' */
function sq(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/** Promisified curl POST */
function curlPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeout = 60000,
): Promise<string> {
  const hdrArgs = Object.entries(headers)
    .map(([k, v]) => `-H '${sq(k)}: ${sq(v)}'`)
    .join(" ");
  const cmd =
    `curl -s --max-time ${Math.ceil(timeout / 1000)} -X POST ${url} ${hdrArgs} -d '${sq(body)}'`;
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Send a Telegram message and return the parsed API response */
async function sendTgMessage(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; result?: { message_id: number } }> {
  const resp = await curlPost(
    `https://api.telegram.org/bot${token}/sendMessage`,
    JSON.stringify(payload),
    { "Content-Type": "application/json" },
    12000,
  );
  return JSON.parse(resp);
}

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
//
// Flow:
//   1. Ask Hermes for solutions in structured JSON: { solutions: [{title, description}, …] }
//   2. Send an intro message to the group
//   3. Send each solution as a SEPARATE Telegram message
//   4. Create an Idea record for each message with its real telegramMessageId
//   → The reaction handler can now match telegramMessageId → Idea → vote.

export async function generateSolutionsForNeed(
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

  try {
    // ── 1. Ask Hermes for structured JSON solutions ────────────────────
    const prompt =
      `Eres Ari, asistente de Trust Maker. Una necesidad acaba de ser aprobada ` +
      `en el árbol "${treeName}":\n\n` +
      `Necesidad: ${needTitle}\n` +
      `Descripción: ${needDescription}\n\n` +
      `Generá 2-3 soluciones concretas, viables y orientadas a resultados. ` +
      `Respondé ESTRICTAMENTE en este formato JSON (sin markdown ni texto extra):\n` +
      `{"solutions": [{"title": "Título corto de la solución", "description": "Qué implica y cómo se haría"}, ...]}`;

    const hermesBody = JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      stream: false,
      tool_choice: "none",
      response_format: { type: "json_object" },
    });

    console.log(
      `[generateSolutions] Calling Hermes for need ${needId}…`,
    );

    const raw = await curlPost(
      "http://127.0.0.1:8642/v1/chat/completions",
      hermesBody,
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HERMES_KEY}`,
        "X-Hermes-Session-Key": `tree-agent-${treeId}`,
      },
      65000,
    );

    const resp = JSON.parse(raw);
    const content: string = resp?.choices?.[0]?.message?.content || "";

    if (!content.trim()) {
      console.error("[generateSolutions] Hermes returned empty response");
      return;
    }

    console.log(
      `[generateSolutions] Hermes response: ${content.length} chars for need ${needId}`,
    );

    // ── 2. Parse JSON (handle both {solutions:[…]} and direct […]) ─────
    let solutions: { title: string; description: string }[] = [];

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        solutions = parsed;
      } else if (parsed.solutions && Array.isArray(parsed.solutions)) {
        solutions = parsed.solutions;
      } else if (parsed.soluciones && Array.isArray(parsed.soluciones)) {
        solutions = parsed.soluciones;
      } else {
        // Try to find any array property
        const arrProp = Object.values(parsed).find(Array.isArray);
        if (arrProp) solutions = arrProp as any[];
      }
    } catch {
      // Fallback: try to extract JSON array from code-fenced or raw text
      const jsonMatch =
        content.match(/```(?:json)?\s*\n?([\s\S]*?)```/) ||
        content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          solutions = Array.isArray(extracted) ? extracted : [];
        } catch {
          console.error("[generateSolutions] Could not parse JSON from Hermes response");
        }
      }
    }

    if (!Array.isArray(solutions) || solutions.length === 0) {
      console.error(
        "[generateSolutions] No solutions parsed from response:",
        content.slice(0, 300),
      );
      return;
    }

    console.log(
      `[generateSolutions] Parsed ${solutions.length} solutions for need ${needId}`,
    );

    // ── 3. Send intro message ──────────────────────────────────────────
    const introText =
      `<b>✅ Necesidad aprobada: ${escHtml(needTitle)}</b>\n\n` +
      `${escHtml(needDescription)}\n\n` +
      `<b>💡 Soluciones propuestas por Ari:</b>`;

    const introPayload: Record<string, unknown> = {
      chat_id: telegramChatId,
      text: introText,
      parse_mode: "HTML",
    };
    if (replyToMessageId) {
      introPayload.reply_to_message_id = replyToMessageId;
    }

    await sendTgMessage(BOT_TOKEN, introPayload);

    // ── 4. Send each solution individually + create Idea record ────────
    for (let i = 0; i < solutions.length; i++) {
      const sol = solutions[i];
      if (!sol.title || !sol.description) continue;

      const solText =
        `<b>💡 Solución ${i + 1}: ${escHtml(sol.title)}</b>\n\n` +
        `${escHtml(sol.description)}\n\n` +
        `<i>Votá con 👍 ❤️ ⭐</i>`;

      const solPayload: Record<string, unknown> = {
        chat_id: telegramChatId,
        text: solText,
        parse_mode: "HTML",
      };
      if (replyToMessageId) {
        solPayload.reply_to_message_id = replyToMessageId;
      }

      // Small delay to avoid Telegram rate limits
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 400));
      }

      const tgResult = await sendTgMessage(BOT_TOKEN, solPayload);

      if (tgResult?.ok && tgResult.result?.message_id) {
        const msgId = tgResult.result.message_id;

        // Create Idea record so reaction handler can find it
        await prisma.idea.create({
          data: {
            content: `${sol.title}\n\n${sol.description}`,
            creatorId: "system",
            needId,
            telegramMessageId: msgId,
            totalLikes: 0,
          },
        });

        console.log(
          `[generateSolutions] Idea created: "${sol.title.slice(0, 40)}" → msg_id=${msgId}, need ${needId}`,
        );
      } else {
        console.error(
          `[generateSolutions] Telegram send failed for solution ${i + 1}:`,
          JSON.stringify(tgResult).slice(0, 200),
        );
      }
    }

    // ── 5. Send closing message ────────────────────────────────────────
    const closeText =
      `<i>¿Tenés otra idea? Respondé a este mensaje con tu propuesta. ` +
      `Las soluciones se votan con 👍 ❤️ ⭐</i>`;

    const closePayload: Record<string, unknown> = {
      chat_id: telegramChatId,
      text: closeText,
      parse_mode: "HTML",
    };
    if (replyToMessageId) {
      closePayload.reply_to_message_id = replyToMessageId;
    }

    await sendTgMessage(BOT_TOKEN, closePayload);

    console.log(
      `[generateSolutions] Done — ${solutions.length} ideas created for need ${needId}`,
    );
  } catch (err: any) {
    console.error("[generateSolutions] Error:", err?.message || err);
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
