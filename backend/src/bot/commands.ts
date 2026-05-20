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
import { exec } from "child_process";
import { findTreeByChat, TreeInfo } from "./treeResolver";
import { t } from "./i18n";
import {
  helpMessage,
  noTreeError,
  commandNotFound,
  formatTreeInfo,
  formatNeedsList,
  formatNeedCreated,
  formatNeedPendingApproval,
  formatIdeasList,
  formatVoteAck,
  needNotFound,
  createNeedHelp,
  noMemberError,
  formatCuota,
  formatTodoList,
  summarizeTodo,
} from "./formatters";
import { isComplexNeed, sendApprovalPoll, scheduleApprovalClose } from "./approval";
import { parseDeadline } from "./deadlineParser";

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
  | { type: "todo"; text?: string }
  | { type: "informe"; target?: string } // /informe, /informe <treeId>, /informe todas
  | { type: "informe"; action: "activar" | "desactivar" } // /informe activar, /informe desactivar
  | { type: "unknown" };

// ── Parser ─────────────────────────────────────────────────────────────────

const BOT_USERNAME = "TrustMakerBot";
// Match @TrustMakerBot, @TrustMaker, @Ari, or @ari (the bot's display name is "Ari")
const MENTION_REGEX = new RegExp(`^@(TrustMakerBot|TrustMaker|[Aa]ri)\\b\\s*`, "i");

/**
 * Extrae el texto de comando del mensaje.
 *
 * Soporta tres modos de direccionamiento:
 * 1. Comando directo: el texto empieza con "/" (ej: "/info") — no requiere mención.
 * 2. Mención al inicio: "@TrustMakerBot /info" — extrae el texto después de la mención.
 *
 * Retorna null si el mensaje no está dirigido al bot.
 */
export function extractCommandText(text: string): string | null {
  // Direct command (starts with "/") — no mention needed (group handler)
  if (text.startsWith("/")) return text.trim();

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

  // ── todo [texto] ──
  const todoMatch = cmd.match(/^todo(?:\s+(.+))?$/i);
  if (todoMatch) return { type: "todo", text: todoMatch[1]?.trim() };

  // ── informe [treeId|todas|activar|desactivar] ──
  // /informe            → branch-job for immediate children
  // /informe <id>       → branch-job for specific child
  // /informe todas      → branch-job for all descendants
  // /informe activar    → enable monthly reports for this tree (admin)
  // /informe desactivar → disable monthly reports for this tree (admin)
  const informeMatch = cmd.match(/^informe(?:\s+(.+))?$/i);
  if (informeMatch) {
    const arg = informeMatch[1]?.trim().toLowerCase();
    if (arg === "activar" || arg === "desactivar") {
      return { type: "informe", action: arg };
    }
    return { type: "informe", target: arg };
  }

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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extrae el idioma del contexto de Telegram. */
function getUserLanguage(ctx: Context): string {
  const code = ctx.from?.language_code;
  if (code === "en") return "en";
  return "es"; // default
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

    // 3. Crear nuevo usuario con telegramUserId asignado y language null (forzar selector onboarding)
    const created = await (prisma as any).user.create({
      data: {
        username: tgUser.username || `tg_${tgUser.id}`,
        telegramUserId: telegramId,
        role: "USER",
        language: null,
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
  tree: TreeInfo | null,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);
  return formatTreeInfo(tree, lng);
}

// ── lista necesidades ──
async function handleLista(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

  const needs = await (prisma as any).need.findMany({
    where: { treeId: tree.id },
    include: {
      _count: { select: { ideas: true } },
      creator: { select: { username: true } },
    },
    orderBy: [{ status: "asc" }, { importance: "desc" }],
  });

  return formatNeedsList(needs, lng);
}

// ── crea necesidad ──
async function handleCrea(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  titulo: string,
  descripcion: string,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);
  if (!titulo || !descripcion) return createNeedHelp(lng);

  const userId = await resolveTelegramUser(prisma, ctx);

  // Random importance 1-10 (same as needV3Controller)
  const importance = Math.floor(Math.random() * 10) + 1;
  const complex = isComplexNeed(descripcion);

  const need = await (prisma as any).need.create({
    data: {
      title: titulo,
      description: descripcion,
      treeId: tree.id,
      creatorId: userId || "telegram-bot",
      importance,
      isComplex: complex,
      status: complex ? "PENDING_APPROVAL" : "OPEN",
    },
  });

  const chatId = ctx.chat?.id;
  if (!chatId) return formatNeedCreated(need, lng);

  if (complex) {
    // ── Necesidad compleja → encuesta de aprobación ──
    const sent = await sendApprovalPoll(
      ctx.api as any, // grammy Api has sendPoll/stopPoll
      prisma,
      need.id,
      chatId,
      lng,
    );

    if (sent) {
      scheduleApprovalClose(ctx.api as any, prisma, need.id, lng);
    }

    return formatNeedPendingApproval(need, lng);
  }

  // ── Necesidad simple → encuesta de importancia (T8) ──
  try {
    const desc = descripcion.length > 200
      ? descripcion.slice(0, 200) + "..."
      : descripcion;

    const pollMessage = await ctx.api.sendPoll(
      chatId,
      t("common:poll_question", lng, { title: titulo, description: desc }),
      [
        { text: t("common:poll_low", lng) },
        { text: t("common:poll_medium", lng) },
        { text: t("common:poll_high", lng) },
      ],
      {
        is_anonymous: true,
        allows_multiple_answers: false,
        reply_markup: {
          inline_keyboard: [[
            {
              text: t("common:poll_view_need", lng),
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

  return formatNeedCreated(need, lng);
}

// ── vota ──
async function handleVota(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  needId: string,
  lng: string,
): Promise<{ text: string; react: boolean }> {
  if (!tree) return { text: noTreeError(lng), react: false };

  const need = await (prisma as any).need.findUnique({
    where: { id: needId },
    select: { id: true, title: true, treeId: true },
  });

  if (!need) return { text: needNotFound(needId, lng), react: false };
  if (need.treeId !== tree.id) {
    return { text: t("errors:need_wrong_tree", lng), react: false };
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

  return { text: formatVoteAck(need.title, lng), react: true };
}

// ── ideas para ──
async function handleIdeas(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  query: string,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

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
    return t("errors:no_ideas_match", lng, { query });
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

    return formatIdeasList(need.title, ideas, lng);
  }

  // Multiple matches: show the matching needs first, let user pick one
  const lines: string[] = [
    t("errors:ideas_multiple_match", lng, { count: needs.length, query }),
  ];
  for (const n of needs) {
    lines.push(`• *${n.title}*\n  \`${n.id}\``);
  }
  lines.push(
    "",
    t("errors:ideas_pick_hint", lng),
  );

  return lines.join("\n");
}

// ── cuota ──

const ACTIVE_TASK_STATUSES_CUOTA = ["PENDING", "ASSIGNED", "IN_PROGRESS", "EVIDENCE_SUBMITTED"];

async function handleCuota(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

  const userId = await resolveTelegramUser(prisma, ctx);
  if (!userId) return t("errors:not_identified_cuota", lng);

  // Buscar membresía en este árbol
  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId: tree.id } },
    select: { monthlyFee: true },
  });
  if (!member) return noMemberError(lng);

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

  return formatCuota(cuota, costoBase, taskShare, lng);
}

// ── pagar ──

async function handlePagar(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

  const tgUser = ctx.from;
  if (!tgUser) return t("errors:not_identified_cuota", lng);

  const { computePaymentObligations, formatPagarResult } = await import("../services/telegramBotService");
  const result = await computePaymentObligations(tgUser.id);
  if (!result) {
    return lng === "en"
      ? "⚠️ Could not compute your payment obligations. Try again later."
      : "⚠️ Error al calcular tus obligaciones de pago. Intenta más tarde.";
  }

  return formatPagarResult(result, lng);
}

// ── todo ──

async function handleTodo(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  text: string | undefined,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

  const chatId = ctx.chat?.id;
  if (!chatId) return t("errors:no_chat_id", lng);

  if (!text || text.trim() === "") {
    // Mostrar lista rankeada
    const todos = await (prisma as any).todo.findMany({
      where: { treeId: tree.id, chatId: BigInt(chatId), status: "PENDING" },
      orderBy: { likeCount: "desc" },
      take: 20,
    });
    return formatTodoList(todos, lng);
  }

  // Crear nuevo todo
  const summary = summarizeTodo(text.trim());
  const tgUser = ctx.from;
  const messageId = ctx.message?.message_id;
  const deadline = parseDeadline(text.trim());

  await (prisma as any).todo.create({
    data: {
      treeId: tree.id,
      chatId: BigInt(chatId),
      messageId: BigInt(messageId || 0),
      createdBy: BigInt(tgUser?.id || 0),
      createdByName: tgUser?.username || tgUser?.first_name || null,
      text: text.trim(),
      summary,
      status: "PENDING",
      deadline: deadline || undefined,
    },
  });

  // Posición en el ranking (cuántos tienen más likes)
  const higherCount = await (prisma as any).todo.count({
    where: {
      treeId: tree.id,
      chatId: BigInt(chatId),
      status: "PENDING",
      likeCount: { gt: 0 },
    },
  });

  return t("common:todo_created", lng, {
    summary,
    position: higherCount + 1,
  });
}

// ── informe toggle (activar/desactivar) ──

/** Toggle para activar/desactivar informes mensuales del árbol (admin only). */
async function handleInformeToggle(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  action: "activar" | "desactivar",
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

  const chatId = ctx.chat?.id.toString();
  if (!chatId) return t("errors:no_chat_id", lng);

  // Admin check
  const tgUser = ctx.from;
  if (!tgUser) return t("common:not_identified", lng);

  const user = await (prisma as any).user.findUnique({
    where: { telegramUserId: BigInt(tgUser.id) },
    select: { id: true },
  });
  if (!user) return t("common:no_account", lng);

  const adminMember = await (prisma as any).treeMember.findFirst({
    where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
  });
  if (!adminMember) return t("common:informe_no_admin", lng);

  const enabled = action === "activar";

  try {
    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { monthlyReportsEnabled: enabled },
    });

    return enabled
      ? t("common:informe_activado", lng)
      : t("common:informe_desactivado", lng);
  } catch (err: any) {
    console.error("[handleInformeToggle] Error:", err.message);
    return t("common:informe_error", lng);
  }
}

// ── informe ──

const KANBAN_TASK_ID_REGEX = /t_[a-f0-9]+/;
const EXEC_TIMEOUT_MS = 10_000;

/**
 * Crea una tarea kanban branch-job para un árbol hijo.
 * Retorna el kanban taskId o null si falla.
 */
async function createBranchJobTask(
  childTreeId: string,
  childTreeName: string,
  parentTreeId: string,
  chatId: string,
): Promise<string | null> {
  const title = `Informe: ${childTreeName}`;
  const body = [
    `**Tipo:** branch-job informe`,
    `**Tree:** ${childTreeId}`,
    `**Parent:** ${parentTreeId}`,
    `**Chat:** ${chatId}`,
  ].join("\n");

  const safeTitle = title.replace(/'/g, "'\\''");
  const safeBody = body.replace(/'/g, "'\\''");

  const command =
    `hermes kanban create '${safeTitle}' ` +
    `--assignee branch-job ` +
    `--body '${safeBody}'`;

  let stdout: string;
  try {
    stdout = await new Promise<string>((resolve, reject) => {
      exec(command, { timeout: EXEC_TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error) { resolve(""); return; }
        resolve(stdout);
      });
    });
  } catch {
    return null;
  }

  if (!stdout) return null;
  const match = stdout.match(KANBAN_TASK_ID_REGEX);
  return match ? match[0] : null;
}

/**
 * Obtiene recursivamente todos los IDs de árboles descendientes.
 */
async function getAllDescendantIds(
  prisma: PrismaClient,
  treeId: string,
): Promise<string[]> {
  const children = await (prisma as any).tree.findMany({
    where: { parentTreeId: treeId },
    select: { id: true },
  });
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    const subIds = await getAllDescendantIds(prisma, child.id);
    ids.push(...subIds);
  }
  return ids;
}

async function handleInforme(
  prisma: PrismaClient,
  ctx: Context,
  tree: TreeInfo | null,
  target: string | undefined,
  lng: string,
): Promise<string> {
  if (!tree) return noTreeError(lng);

  const chatId = ctx.chat?.id.toString();
  if (!chatId) return t("errors:no_chat_id", lng);

  // ── Admin check ──
  const tgUser = ctx.from;
  if (!tgUser) return t("common:not_identified", lng);

  const user = await (prisma as any).user.findUnique({
    where: { telegramUserId: BigInt(tgUser.id) },
    select: { id: true },
  });
  if (!user) return t("common:no_account", lng);

  const adminMember = await (prisma as any).treeMember.findFirst({
    where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
  });
  if (!adminMember) return t("common:informe_no_admin", lng);

  try {
    // ── /informe <treeId> — child specific ──
    if (target && target !== "todas") {
      // Guard: can't /informe own tree (self-reference)
      if (target === tree.id) {
        return t("common:informe_child_not_found", lng, { treeId: target });
      }
      // Validate it's a direct child
      const child = await (prisma as any).tree.findUnique({
        where: { id: target },
        select: { id: true, name: true, parentTreeId: true },
      });

      if (!child) {
        return t("common:informe_child_not_found", lng, { treeId: target });
      }

      if (child.parentTreeId !== tree.id) {
        // It might be a descendant but not a direct child
        const isDescendant = child.parentTreeId
          ? await isDescendantOf(prisma, child.id, tree.id)
          : false;
        if (isDescendant) {
          return t("common:informe_child_not_direct", lng, { name: child.name });
        }
        return t("common:informe_child_not_found", lng, { treeId: target });
      }

      const taskId = await createBranchJobTask(child.id, child.name, tree.id, chatId);
      if (!taskId) return t("common:informe_error", lng);

      return t("common:informe_processing_child", lng, {
        name: child.name,
        taskId,
      });
    }

    // ── /informe todas — all descendants ──
    if (target === "todas") {
      const allIds = await getAllDescendantIds(prisma, tree.id);
      if (allIds.length === 0) return t("common:informe_no_children", lng);

      const trees = await (prisma as any).tree.findMany({
        where: { id: { in: allIds } },
        select: { id: true, name: true },
      });

      let ok = 0;
      for (const t of trees) {
        const taskId = await createBranchJobTask(t.id, t.name, tree.id, chatId);
        if (taskId) ok++;
      }

      if (ok === 0) return t("common:informe_error", lng);
      return t("common:informe_processing_all", lng, { count: ok });
    }

    // ── /informe (no args) — immediate children ──
    const children = await (prisma as any).tree.findMany({
      where: { parentTreeId: tree.id },
      select: { id: true, name: true },
    });

    if (children.length === 0) return t("common:informe_no_children", lng);

    let ok = 0;
    for (const child of children) {
      const taskId = await createBranchJobTask(child.id, child.name, tree.id, chatId);
      if (taskId) ok++;
    }

    if (ok === 0) return t("common:informe_error", lng);
    return t("common:informe_processing_all", lng, { count: ok });
  } catch (err: any) {
    console.error("[handleInforme] Error:", err.message);
    return t("common:informe_error", lng);
  }
}

/**
 * Verifica si `descendantId` es descendiente de `ancestorId` (recorriendo parentTreeId).
 */
async function isDescendantOf(
  prisma: PrismaClient,
  descendantId: string,
  ancestorId: string,
): Promise<boolean> {
  let current = descendantId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current === ancestorId) return true;
    const tree = await (prisma as any).tree.findUnique({
      where: { id: current },
      select: { parentTreeId: true },
    });
    if (!tree?.parentTreeId) return false;
    current = tree.parentTreeId;
  }
  return false;
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

  const lng = getUserLanguage(ctx);

  // Quitar el "/" inicial si lo tiene, o usar el texto tal cual para alias
  const cmdWithoutSlash = isCommand ? cmdText.slice(1).trim() : cmdText;
  const parsed = parseCommand(cmdWithoutSlash);
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    return { text: t("errors:no_chat_id", lng) };
  }

  // Special case: crea with empty args (bad format)
  if (parsed.type === "crea" && !parsed.titulo) {
    return { text: createNeedHelp(lng) };
  }

  let tree: TreeInfo | null = null;

  // Only look up tree for commands that need it
  const needsTree: ParsedCommand["type"][] = [
    "info", "lista", "crea", "vota", "ideas", "cuota", "pagar", "todo", "informe",
  ];

  if (needsTree.includes(parsed.type)) {
    tree = await findTreeByChat(prisma, chatId);
  }

  switch (parsed.type) {
    case "info":
      return { text: await handleInfo(prisma, ctx, tree, lng) };

    case "lista":
      return { text: await handleLista(prisma, ctx, tree, lng) };

    case "crea":
      return {
        text: await handleCrea(prisma, ctx, tree, parsed.titulo, parsed.descripcion, lng),
      };

    case "vota": {
      const result = await handleVota(prisma, ctx, tree, parsed.needId, lng);
      return { text: result.text, react: result.react };
    }

    case "ideas":
      return { text: await handleIdeas(prisma, ctx, tree, parsed.query, lng) };

    case "cuota":
      return { text: await handleCuota(prisma, ctx, tree, lng) };

    case "pagar":
      return { text: await handlePagar(prisma, ctx, tree, lng) };

    case "todo":
      return { text: await handleTodo(prisma, ctx, tree, parsed.text, lng) };

    case "informe":
      if ("action" in parsed) {
        return { text: await handleInformeToggle(prisma, ctx, tree, parsed.action, lng) };
      }
      return { text: await handleInforme(prisma, ctx, tree, parsed.target, lng) };

    case "help":
      return { text: helpMessage(lng) };

    case "unknown":
    default:
      return { text: commandNotFound(lng) };
  }
}
