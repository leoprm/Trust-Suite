/**
 * Parser de comandos @TrustMaker para Telegram.
 *
 * Formato: @TrustMaker /comando [args]
 *
 * SPEC-1: solo se procesan como comandos los mensajes donde el texto
 * post-mención empieza con "/". Si no, se delega a handleNaturalMessage
 * (conversación natural vía concierge).
 *
 * Comandos:
 *   crea necesidad "título" — descripción
 *   lista necesidades
 *   vota <necesidadId>
 *   ideas para <título parcial>
 *   info
 *   help | ayuda
 */

import { Context } from "grammy";
import { PrismaClient } from "@prisma/client";
import { findTreeByChat, TreeInfo } from "./treeResolver";
import {
  helpMessage,
  noTreeError,
  commandNotFound,
  formatTreeInfo,
  formatNeedsList,
  formatNeedCreated,
  formatIdeasList,
  formatVoteAck,
  needNotFound,
  createNeedHelp,
  noMemberError,
  formatCuota,
  formatPagar,
} from "./formatters";

// ── Tipos ──────────────────────────────────────────────────────────────────

/** Comando parseado del mensaje. */
export type ParsedCommand =
  | { type: "crea"; titulo: string; descripcion: string }
  | { type: "lista" }
  | { type: "vota"; needId: string }
  | { type: "ideas"; query: string }
  | { type: "info" }
  | { type: "cuota" }
  | { type: "pagar" }
  | { type: "help" }
  | { type: "unknown" };

// ── Parser ─────────────────────────────────────────────────────────────────

const BOT_USERNAME = "TrustMakerBot";
// Match @TrustMakerBot, @TrustMaker, @Ari, or @ari (the bot's display name is "Ari")
const MENTION_REGEX = new RegExp(`^@(TrustMakerBot|TrustMaker|[Aa]ri)\\b\\s*`, "i");

/**
 * Extrae el texto después de @TrustMaker del mensaje.
 * Retorna null si el mensaje no menciona al bot al inicio.
 */
export function extractCommandText(text: string): string | null {
  const match = text.match(MENTION_REGEX);
  if (!match) return null;
  return text.slice(match[0].length).trim();
}

/**
 * Parsea el texto (después de @TrustMaker) en un ParsedCommand.
 */
export function parseCommand(raw: string): ParsedCommand {
  const cmd = raw.trim();

  // ── info ──
  if (/^info$/i.test(cmd)) return { type: "info" };

  // ── cuota ──
  if (/^cuota$/i.test(cmd)) return { type: "cuota" };

  // ── pagar ──
  if (/^pagar$/i.test(cmd)) return { type: "pagar" };

  // ── help / ayuda ──
  if (/^(help|ayuda)$/i.test(cmd)) return { type: "help" };

  // ── lista necesidades ──
  if (/^lista\s+necesidades$/i.test(cmd)) return { type: "lista" };

  // ── vota <id> ──
  const votaMatch = cmd.match(/^vota\s+([a-f0-9-]{36})$/i);
  if (votaMatch) return { type: "vota", needId: votaMatch[1] };

  // ── ideas para "título" ──
  const ideasMatch = cmd.match(/^ideas\s+para\s+"(.+)"$/i);
  if (ideasMatch) return { type: "ideas", query: ideasMatch[1] };

  // ── crea necesidad "título" — descripción ──
  // Soporta em dash (—), en dash (–), y doble guion (--)
  const creaMatch = cmd.match(/^crea\s+necesidad\s+"(.+?)"\s+[—–-]{1,2}\s+([\s\S]+)$/i);
  if (creaMatch) {
    return {
      type: "crea",
      titulo: creaMatch[1].trim(),
      descripcion: creaMatch[2].trim(),
    };
  }

  // ── Intento parcial de crea necesidad ──
  if (/^crea\s+necesidad/i.test(cmd)) {
    // El formato está mal — lo tratamos como unknown para que muestre ayuda específica
    return { type: "crea", titulo: "", descripcion: "" };
  }

  return { type: "unknown" };
}

// ── Handlers ───────────────────────────────────────────────────────────────

/** Busca o crea un usuario basado en la info de Telegram. */
async function resolveTelegramUser(
  prisma: PrismaClient,
  ctx: Context
): Promise<string | null> {
  const tgUser = ctx.from;
  if (!tgUser) return null;

  const telegramId = BigInt(tgUser.id);

  try {
    // 1. Buscar por telegramUserId (mismo enfoque que voting.ts)
    const byTgId = await (prisma as any).user.findUnique({
      where: { telegramUserId: telegramId },
    });
    if (byTgId) return byTgId.id;

    // 2. Fallback: buscar por username de Telegram (si tiene)
    if (tgUser.username) {
      const byUsername = await (prisma as any).user.findUnique({
        where: { username: tgUser.username },
      });
      if (byUsername) {
        // Actualizar su telegramUserId para futuros lookups
        await (prisma as any).user.update({
          where: { id: byUsername.id },
          data: { telegramUserId: telegramId },
        });
        return byUsername.id;
      }
    }

    // 3. Crear nuevo usuario con telegramUserId asignado
    const created = await (prisma as any).user.create({
      data: {
        username: tgUser.username || `tg_${tgUser.id}`,
        telegramUserId: telegramId,
        role: "USER",
      },
    });
    return created.id;
  } catch {
    return null;
  }
}

// ── info ──
async function handleInfo(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null
): Promise<string> {
  if (!tree) return noTreeError();
  return formatTreeInfo(tree);
}

// ── lista necesidades ──
async function handleLista(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null
): Promise<string> {
  if (!tree) return noTreeError();

  const needs = await (prisma as any).need.findMany({
    where: { treeId: tree.id },
    include: {
      _count: { select: { ideas: true } },
      creator: { select: { username: true } },
    },
    orderBy: [{ status: "asc" }, { importance: "desc" }],
  });

  return formatNeedsList(needs);
}

// ── crea necesidad ──
async function handleCrea(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  titulo: string,
  descripcion: string
): Promise<string> {
  if (!tree) return noTreeError();
  if (!titulo || !descripcion) return createNeedHelp();

  const userId = await resolveTelegramUser(prisma, ctx);

  // Random importance 1-10 (same as needV3Controller)
  const importance = Math.floor(Math.random() * 10) + 1;

  const need = await (prisma as any).need.create({
    data: {
      title: titulo,
      description: descripcion,
      treeId: tree.id,
      creatorId: userId || "telegram-bot",
      importance,
      status: "OPEN",
    },
  });

  // T8: Send anonymous poll to group chat
  const chatId = ctx.chat?.id;
  if (chatId) {
    try {
      const desc = descripcion.length > 200
        ? descripcion.slice(0, 200) + "..."
        : descripcion;

      const pollMessage = await ctx.api.sendPoll(
        chatId,
        `📋 ${titulo}\n\n${desc}\n\n¿Qué importancia tiene?`,
        [
          { text: "👍 Baja" },
          { text: "❤️ Media" },
          { text: "⭐ Alta / Urgente" },
        ],
        {
          is_anonymous: true,
          allows_multiple_answers: false,
          reply_markup: {
            inline_keyboard: [[
              {
                text: "🔗 Ver necesidad",
                url: `https://t.me/TrustMakerBot?start=need_${need.id}`,
              },
            ]],
          },
        },
      );

      // Save poll_id → need_id mapping
      await (prisma as any).pollMapping.create({
        data: {
          pollId: pollMessage.poll.id,
          needId: need.id,
          chatId: chatId.toString(),
          messageId: pollMessage.message_id,
        },
      });

      // Optionally store the poll message ID on the need for reference
      await (prisma as any).need.update({
        where: { id: need.id },
        data: { telegramMessageId: pollMessage.message_id },
      });
    } catch (err: any) {
      console.error("[handleCrea] Failed to send poll:", err.message);
      // Non-fatal: still return the created confirmation
    }
  }

  return formatNeedCreated(need);
}

// ── vota ──
async function handleVota(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  needId: string
): Promise<{ text: string; react: boolean }> {
  if (!tree) return { text: noTreeError(), react: false };

  const need = await (prisma as any).need.findUnique({
    where: { id: needId },
    select: { id: true, title: true, treeId: true },
  });

  if (!need) return { text: needNotFound(needId), react: false };
  if (need.treeId !== tree.id) {
    return { text: `❌ Esa necesidad no pertenece a este árbol.`, react: false };
  }

  // Intentar registrar el voto del usuario si podemos identificarlo
  const userId = await resolveTelegramUser(prisma, ctx);
  if (userId) {
    try {
      // Find top ideas for this need and vote for the top one, or just create a generic vote
      const topIdeas = await (prisma as any).needIdea.findMany({
        where: { needId },
        include: { idea: { select: { id: true } } },
        orderBy: { idea: { totalLikes: "desc" } },
        take: 1,
      });

      if (topIdeas.length > 0) {
        const ideaId = topIdeas[0].idea.id;
        // Check if already voted
        const existing = await (prisma as any).ideaVote.findUnique({
          where: {
            ideaId_userId_needId: { ideaId, userId, needId },
          },
        });
        if (!existing) {
          await (prisma as any).ideaVote.create({
            data: { ideaId, userId, needId },
          });
          await (prisma as any).idea.update({
            where: { id: ideaId },
            data: { totalLikes: { increment: 1 } },
          });
          // Increment daily votes on the need (only once per user-need)
          await (prisma as any).need.update({
            where: { id: needId },
            data: { dailyVotes: { increment: 1 } },
          });
        }
      }
    } catch {
      // Non-fatal: the reaction is still sent
    }
  }

  return { text: formatVoteAck(need.title), react: true };
}

// ── ideas para ──
async function handleIdeas(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  query: string
): Promise<string> {
  if (!tree) return noTreeError();

  // Find needs matching the query (by title substring)
  const needs = await (prisma as any).need.findMany({
    where: {
      treeId: tree.id,
      title: { contains: query },
    },
    select: { id: true, title: true },
    take: 5,
  });

  if (needs.length === 0) {
    return `❌ No se encontraron necesidades que coincidan con *"${query}"*.\n\n` +
      `Usa \`@TrustMakerBot /lista necesidades\` para ver todas.`;
  }

  if (needs.length === 1) {
    // Show ideas for the single match
    const need = needs[0];
    const needIdeas = await (prisma as any).needIdea.findMany({
      where: { needId: need.id },
      include: {
        idea: {
          include: {
            creator: { select: { username: true } },
          },
        },
      },
      orderBy: { idea: { totalLikes: "desc" } },
      take: 10,
    });

    const ideas = needIdeas.map((ni: any) => ({
      id: ni.idea.id,
      content: ni.idea.content,
      totalLikes: ni.idea.totalLikes,
      matchScore: ni.matchScore,
      creator: ni.idea.creator,
    }));

    return formatIdeasList(need.title, ideas);
  }

  // Multiple matches: show the matching needs first, let user pick one
  const lines: string[] = [
    `🔍 *${needs.length} necesidades* coinciden con *"${query}"*:\n`,
  ];
  for (const n of needs) {
    lines.push(`• *${n.title}*\n  \`${n.id}\``);
  }
  lines.push(
    "",
    `Para ver ideas, usa \`@TrustMakerBot /ideas para "título exacto"\``
  );

  return lines.join("\n");
}

// ── cuota ──

const ACTIVE_TASK_STATUSES_CUOTA = ["PENDING", "ASSIGNED", "IN_PROGRESS", "EVIDENCE_SUBMITTED"];

async function handleCuota(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null
): Promise<string> {
  if (!tree) return noTreeError();

  const userId = await resolveTelegramUser(prisma, ctx);
  if (!userId) return "⚠️ No se pudo identificar tu usuario de Telegram. Usa /login.";

  // Buscar membresía en este árbol
  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId: tree.id } },
    select: { monthlyFee: true },
  });
  if (!member) return noMemberError();

  // Recalcular breakdown para mostrar base + tasks
  let costoBase = 0;
  if (tree.creatorId) {
    const sub = await (prisma as any).subscription.findFirst({
      where: { userId: tree.creatorId, status: "ACTIVE" },
      select: { monthlyCost: true },
    });
    costoBase = sub?.monthlyCost ?? 0;
  }

  const budgetAgg = await (prisma as any).task.aggregate({
    where: {
      treeId: tree.id,
      status: { in: ACTIVE_TASK_STATUSES_CUOTA },
    },
    _sum: { budget: true },
  });
  const taskBudgetSum = budgetAgg._sum.budget ?? 0;

  const memberCount = await (prisma as any).treeMember.count({
    where: { treeId: tree.id, status: "ACTIVE" },
  });

  const taskShare = memberCount > 0 ? Math.round(taskBudgetSum / memberCount) : 0;
  const cuota = member.monthlyFee ?? (costoBase + taskShare);

  return formatCuota(cuota, costoBase, taskShare);
}

// ── pagar ──

async function handlePagar(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null
): Promise<string> {
  if (!tree) return noTreeError();

  const userId = await resolveTelegramUser(prisma, ctx);
  if (!userId) return "⚠️ No se pudo identificar tu usuario de Telegram. Usa /login.";

  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId: tree.id } },
    select: { id: true },
  });
  if (!member) return noMemberError();

  // Balance
  const balance = await (prisma as any).memberBalance.findUnique({
    where: { memberId: member.id },
    select: { availableBalance: true, pendingBalance: true },
  });

  // Splits
  const splitsRaw = await (prisma as any).paymentSplit.findMany({
    where: { memberId: member.id },
    include: { need: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });

  const splits = splitsRaw.map((s: any) => ({
    needTitle: s.need?.title ?? "(sin necesidad)",
    percentage: s.percentage,
    reason: s.reason,
  }));

  return formatPagar(balance, splits);
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Procesa un mensaje de texto buscando comandos @TrustMaker.
 * Retorna la respuesta (string) o null si el mensaje no es para el bot.
 */
export async function handleMessage(
  prisma: PrismaClient,
  ctx: Context
): Promise<{ text: string; react?: boolean } | null> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return null;

  const cmdText = extractCommandText(msg.text);
  if (cmdText === null) return null;

  // SPEC-1: solo procesar como comando si el texto post-mención empieza con "/"
  // Backward compat: "help"/"ayuda" sin "/" como alias temporal
  const isCommand = cmdText.startsWith("/");
  const isHelpAlias = /^(help|ayuda)$/i.test(cmdText);
  if (!isCommand && !isHelpAlias) return null;

  // Quitar el "/" inicial si lo tiene, o usar el texto tal cual para alias
  const cmdWithoutSlash = isCommand ? cmdText.slice(1).trim() : cmdText;
  const parsed = parseCommand(cmdWithoutSlash);
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    return { text: "⚠️ No se pudo identificar el chat." };
  }

  // Special case: crea with empty args (bad format)
  if (parsed.type === "crea" && !parsed.titulo) {
    return { text: createNeedHelp() };
  }

  let tree: TreeInfo | null = null;

  // Only look up tree for commands that need it
  const needsTree: ParsedCommand["type"][] = [
    "info", "lista", "crea", "vota", "ideas", "cuota", "pagar",
  ];

  if (needsTree.includes(parsed.type)) {
    tree = await findTreeByChat(prisma, chatId);
  }

  switch (parsed.type) {
    case "info":
      return { text: await handleInfo(prisma, ctx, tree) };

    case "lista":
      return { text: await handleLista(prisma, ctx, tree) };

    case "crea":
      return {
        text: await handleCrea(prisma, ctx, tree, parsed.titulo, parsed.descripcion),
      };

    case "vota": {
      const result = await handleVota(prisma, ctx, tree, parsed.needId);
      return { text: result.text, react: result.react };
    }

    case "ideas":
      return { text: await handleIdeas(prisma, ctx, tree, parsed.query) };

    case "cuota":
      return { text: await handleCuota(prisma, ctx, tree) };

    case "pagar":
      return { text: await handlePagar(prisma, ctx, tree) };

    case "help":
      return { text: helpMessage() };

    case "unknown":
    default:
      return { text: commandNotFound() };
  }
}
