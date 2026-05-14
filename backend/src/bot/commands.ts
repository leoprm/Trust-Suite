/**
 * Parser de comandos @TrustMaker para Telegram.
 *
 * Formato: @TrustMaker comando [args]
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
} from "./formatters";

// ── Tipos ──────────────────────────────────────────────────────────────────

/** Comando parseado del mensaje. */
export type ParsedCommand =
  | { type: "crea"; titulo: string; descripcion: string }
  | { type: "lista" }
  | { type: "vota"; needId: string }
  | { type: "ideas"; query: string }
  | { type: "info" }
  | { type: "help" }
  | { type: "unknown" };

// ── Parser ─────────────────────────────────────────────────────────────────

const BOT_USERNAME = "TrustMaker";
const MENTION_REGEX = new RegExp(`^@${BOT_USERNAME}\\b\\s*`, "i");

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

/** Busca el árbol asociado al chat de Telegram. */
async function findTreeByChat(
  prisma: PrismaClient,
  telegramChatId: string
): Promise<{
  id: string;
  name: string;
  icono: string;
  description: string | null;
  admissionPolicy: string;
  memberCount: number;
  needCount: number;
  openNeedCount: number;
  ideaCount: number;
} | null> {
  const tree = await (prisma as any).tree.findUnique({
    where: { telegramChatId },
    include: {
      _count: {
        select: {
          members: true,
          needs: true,
          ratings: true,
        },
      },
    },
  });

  if (!tree) return null;

  const openNeedCount = await (prisma as any).need.count({
    where: { treeId: tree.id, status: "OPEN" },
  });

  // Count ideas linked to needs in this tree
  const ideaCount = await (prisma as any).needIdea.count({
    where: { need: { treeId: tree.id } },
  });

  return {
    id: tree.id,
    name: tree.name,
    icono: tree.icono,
    description: tree.description,
    admissionPolicy: tree.admissionPolicy,
    memberCount: tree._count.members,
    needCount: tree._count.needs,
    openNeedCount,
    ideaCount,
  };
}

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
  tree: Awaited<ReturnType<typeof findTreeByChat>>
): Promise<string> {
  if (!tree) return noTreeError();
  return formatTreeInfo(tree);
}

// ── lista necesidades ──
async function handleLista(
  prisma: PrismaClient,
  ctx: Context,
  tree: Awaited<ReturnType<typeof findTreeByChat>>
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
  tree: Awaited<ReturnType<typeof findTreeByChat>>,
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

  return formatNeedCreated(need);
}

// ── vota ──
async function handleVota(
  prisma: PrismaClient,
  ctx: Context,
  tree: Awaited<ReturnType<typeof findTreeByChat>>,
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
  tree: Awaited<ReturnType<typeof findTreeByChat>>,
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
      `Usa \`@TrustMaker lista necesidades\` para ver todas.`;
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
    `Para ver ideas, usa \`@TrustMaker ideas para "título exacto"\``
  );

  return lines.join("\n");
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

  const parsed = parseCommand(cmdText);
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    return { text: "⚠️ No se pudo identificar el chat." };
  }

  // Special case: crea with empty args (bad format)
  if (parsed.type === "crea" && !parsed.titulo) {
    return { text: createNeedHelp() };
  }

  let tree: Awaited<ReturnType<typeof findTreeByChat>> = null;

  // Only look up tree for commands that need it
  const needsTree: ParsedCommand["type"][] = [
    "info", "lista", "crea", "vota", "ideas",
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

    case "help":
      return { text: helpMessage() };

    case "unknown":
    default:
      return { text: commandNotFound() };
  }
}
