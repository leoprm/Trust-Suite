/**
 * disputeResolutionCron.ts
 *
 * T14: Resolución automática de disputas al vencer el plazo de votación.
 * Corre cada 15 minutos vía scheduler.ts.
 *
 * Lógica:
 *   - A las 24h: verifica quórum (30% de miembros activos del árbol).
 *     Si hay quórum → mayoría decide (UP = aceptada, DOWN = rechazada).
 *     Sin quórum → espera hasta 48h.
 *   - A las 48h: resuelve por default.
 *     Sin quórum → EXPIRED → task vuelve a ASSIGNED.
 *
 * RESOLVED_ACCEPTED → task vuelve a VERIFIED (evidencia suficiente)
 * RESOLVED_REJECTED → task vuelve a ASSIGNED (evidencia insuficiente)
 * EXPIRED           → task vuelve a ASSIGNED (sin quórum tras 48h)
 *
 * Notifica al grupo de Telegram (vía notifyDisputeResolution) y
 * envía DM al asignado y disputante.
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";
import { notifyDisputeResolution } from "../services/telegramBotService";

const RESOLUTION_HOURS = 24;
const EXPIRY_HOURS = 48;
const QUORUM_PCT = 0.3;

export interface DisputeResolutionResult {
  taskId: string;
  taskTitle: string;
  votesUp: number;
  votesDown: number;
  quorum: number;
  outcome: "RESOLVED_ACCEPTED" | "RESOLVED_REJECTED" | "EXPIRED";
  newStatus: string;
}

/**
 * Envía DM al asignado y disputante notificando la resolución.
 */
async function notifyParties(
  bot: Bot<BotContext> | null,
  task: {
    title: string;
    assigneeId: string | null;
    disputedById: string | null;
    assignee: { telegramUserId: bigint | null } | null;
    disputedBy: { telegramUserId: bigint | null } | null;
  },
  treeName: string,
  outcome: string,
  newStatus: string,
  votesUp: number,
  votesDown: number,
): Promise<void> {
  if (!bot) return;

  const statusEmoji =
    outcome === "RESOLVED_ACCEPTED" ? "✅" : outcome === "RESOLVED_REJECTED" ? "❌" : "⏰";
  const outcomeText =
    outcome === "RESOLVED_ACCEPTED"
      ? "evidencia suficiente"
      : outcome === "RESOLVED_REJECTED"
        ? "evidencia insuficiente"
        : "plazo vencido sin quórum";

  const baseMessage =
    `⚖️ *Disputa resuelta — ${treeName}*\n\n` +
    `📋 *${task.title}*\n` +
    `${statusEmoji} Resultado: *${outcomeText}* ` +
    `(👍 ${votesUp} / 👎 ${votesDown})\n` +
    `🔄 Estado: ${newStatus}`;

  // DM al asignado
  if (task.assignee?.telegramUserId) {
    try {
      const suffix =
        outcome === "RESOLVED_REJECTED"
          ? "\n\nLa evidencia fue considerada insuficiente. La tarea vuelve a ti."
          : outcome === "RESOLVED_ACCEPTED"
            ? "\n\nLa disputa fue rechazada. La verificación se mantiene."
            : "\n\nLa disputa expiró sin quórum. La tarea vuelve a ti.";
      await bot.api.sendMessage(Number(task.assignee.telegramUserId), baseMessage + suffix, {
        parse_mode: "Markdown",
      });
    } catch (err: any) {
      if (err?.error_code !== 403) {
        console.error(`[DisputeCron] DM asignado tg=${task.assignee.telegramUserId}:`, err?.message);
      }
    }
  }

  // DM al disputante (si es distinto)
  if (
    task.disputedBy?.telegramUserId &&
    task.disputedBy.telegramUserId !== task.assignee?.telegramUserId
  ) {
    try {
      const suffix =
        outcome === "RESOLVED_ACCEPTED"
          ? "\n\nGracias por tu vigilancia."
          : outcome === "RESOLVED_REJECTED"
            ? "\n\nTu disputa fue aceptada. La tarea vuelve a asignación."
            : "\n\nNo hubo quórum sobre tu disputa. La tarea vuelve a asignación.";
      await bot.api.sendMessage(Number(task.disputedBy.telegramUserId), baseMessage + suffix, {
        parse_mode: "Markdown",
      });
    } catch (err: any) {
      if (err?.error_code !== 403) {
        console.error(
          `[DisputeCron] DM disputante tg=${task.disputedBy.telegramUserId}:`,
          err?.message,
        );
      }
    }
  }
}

/**
 * Ejecuta la resolución de todas las disputas vencidas.
 */
export async function runDisputeResolution(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<DisputeResolutionResult[]> {
  const now = new Date();
  const resolutionCutoff = new Date(now.getTime() - RESOLUTION_HOURS * 60 * 60 * 1000);
  const expiryCutoff = new Date(now.getTime() - EXPIRY_HOURS * 60 * 60 * 1000);
  const results: DisputeResolutionResult[] = [];

  // ── Find all OPEN disputes past the 24h resolution window ──────────────
  const pending = await (prisma as any).disputeMessage.findMany({
    where: {
      status: "OPEN",
      createdAt: { lte: resolutionCutoff },
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          treeId: true,
          assigneeId: true,
          disputedById: true,
          assignee: { select: { telegramUserId: true } },
          disputedBy: { select: { telegramUserId: true } },
        },
      },
      tree: { select: { name: true } },
    },
  });

  if (pending.length === 0) return results;

  console.log(`[DisputeCron] ${pending.length} dispute(s) ready for evaluation`);

  for (const dm of pending) {
    try {
      // ── Quórum: 30% de miembros activos del árbol ─────────────────────
      const memberCount = await (prisma as any).treeMember.count({
        where: { treeId: dm.treeId, status: "ACTIVE" },
      });
      const quorumRequired = Math.max(1, Math.ceil(memberCount * QUORUM_PCT));
      const totalVotes = dm.thumbsUp + dm.thumbsDown;
      const hasQuorum = totalVotes >= quorumRequired;
      const isExpired = dm.createdAt <= expiryCutoff;

      if (!hasQuorum && !isExpired) {
        // Dentro de las 48h, sin quórum aún → esperar
        console.log(
          `[DisputeCron] Dispute ${dm.id}: waiting for quorum (${totalVotes}/${quorumRequired})`,
        );
        continue;
      }

      // ── Determinar outcome ────────────────────────────────────────────
      let outcome: "RESOLVED_ACCEPTED" | "RESOLVED_REJECTED" | "EXPIRED";
      let newStatus: string;

      if (!hasQuorum && isExpired) {
        outcome = "EXPIRED";
        newStatus = "ASSIGNED";
      } else if (dm.thumbsUp > dm.thumbsDown) {
        outcome = "RESOLVED_ACCEPTED";
        newStatus = "VERIFIED";
      } else if (dm.thumbsDown > dm.thumbsUp) {
        outcome = "RESOLVED_REJECTED";
        newStatus = "ASSIGNED";
      } else {
        // Empate con quórum
        outcome = "EXPIRED";
        newStatus = "ASSIGNED";
      }

      // ── Transacción: update DisputeMessage + Task ─────────────────────
      await (prisma as any).$transaction([
        (prisma as any).disputeMessage.update({
          where: { id: dm.id },
          data: { status: outcome, resolvedAt: now },
        }),
        (prisma as any).task.update({
          where: { id: dm.taskId },
          data: {
            status: newStatus,
            // Si fue rechazada, limpiar campos de disputa para permitir re-disputa futura
            ...(outcome === "RESOLVED_REJECTED" || outcome === "EXPIRED"
              ? { disputedById: null, disputeReason: null, disputeEvidenceUrl: null, disputedAt: null, disputeExpiresAt: null }
              : {}),
          },
        }),
      ]);

      // ── Notificar grupo de Telegram ───────────────────────────────────
      notifyDisputeResolution(dm.id).catch((err: Error) =>
        console.error(`[DisputeCron] Group notify failed for ${dm.id}:`, err.message),
      );

      // ── Notificar asignado y disputante ───────────────────────────────
      await notifyParties(
        bot,
        dm.task,
        dm.tree.name,
        outcome,
        newStatus,
        dm.thumbsUp,
        dm.thumbsDown,
      );

      results.push({
        taskId: dm.taskId,
        taskTitle: dm.task.title,
        votesUp: dm.thumbsUp,
        votesDown: dm.thumbsDown,
        quorum: quorumRequired,
        outcome,
        newStatus,
      });

      console.log(
        `[DisputeCron] ✅ ${dm.task.title}: ${outcome} → ${newStatus} ` +
          `(👍${dm.thumbsUp}/👎${dm.thumbsDown}, quorum=${quorumRequired})`,
      );
    } catch (err: any) {
      console.error(`[DisputeCron] ❌ Error on dispute ${dm.id}:`, err?.message || err);
      results.push({
        taskId: dm.taskId,
        taskTitle: dm.task.title,
        votesUp: dm.thumbsUp,
        votesDown: dm.thumbsDown,
        quorum: 0,
        outcome: "EXPIRED",
        newStatus: "ASSIGNED",
      });
    }
  }

  // ── Fallback: tareas DISPUTED sin DisputeMessage (disputeExpiresAt vencido) ──
  const resolvedIds = new Set(pending.map((m: any) => m.taskId));

  const orphans = await (prisma as any).task.findMany({
    where: {
      status: "DISPUTED",
      disputeExpiresAt: { lte: now },
      id: { notIn: Array.from(resolvedIds) },
    },
    include: {
      tree: { select: { name: true } },
      assignee: { select: { telegramUserId: true } },
      disputedBy: { select: { telegramUserId: true } },
    },
  });

  for (const task of orphans) {
    try {
      await (prisma as any).task.update({
        where: { id: task.id },
        data: {
          status: "ASSIGNED",
          disputedById: null,
          disputeReason: null,
          disputeEvidenceUrl: null,
          disputedAt: null,
          disputeExpiresAt: null,
        },
      });

      await notifyParties(bot, task, task.tree.name, "EXPIRED", "ASSIGNED", 0, 0);

      results.push({
        taskId: task.id,
        taskTitle: task.title,
        votesUp: 0,
        votesDown: 0,
        quorum: 0,
        outcome: "EXPIRED",
        newStatus: "ASSIGNED",
      });

      console.log(`[DisputeCron] ⏰ ${task.title}: EXPIRED (no DisputeMessage) → ASSIGNED`);
    } catch (err: any) {
      console.error(`[DisputeCron] ❌ Fallback error on ${task.id}:`, err?.message || err);
    }
  }

  if (results.length > 0) {
    console.log(
      `[DisputeCron] Done: ${results.length} resolved. ` +
        `${results.filter((r) => r.outcome === "RESOLVED_ACCEPTED").length} accepted, ` +
        `${results.filter((r) => r.outcome === "RESOLVED_REJECTED").length} rejected, ` +
        `${results.filter((r) => r.outcome === "EXPIRED").length} expired.`,
    );
  }

  return results;
}
