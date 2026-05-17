/**
 * Proposal Resolver Cron — cada 2 minutos resuelve propuestas kanban vencidas.
 *
 * Busca KanbanProposal con status="OPEN" y expiresAt < now().
 * Para cada una, evalúa participación y votos, actualiza estado y
 * edita el mensaje de Telegram para reflejar el resultado.
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";

export interface ProposalResolution {
  proposalId: string;
  status: "APPROVED" | "REJECTED";
  reason: string;
  votesYes: number;
  votesNo: number;
  totalVotes: number;
  activeMembers: number;
  participation: number;
}

/**
 * Ejecuta una ronda de resolución de propuestas vencidas.
 * Retorna las propuestas resueltas.
 */
export async function runProposalResolver(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<ProposalResolution[]> {
  const now = new Date();
  const resolutions: ProposalResolution[] = [];

  // 1. Buscar propuestas OPEN vencidas
  const proposals = await (prisma as any).kanbanProposal.findMany({
    where: {
      status: "OPEN",
      expiresAt: { lt: now },
    },
  });

  if (proposals.length === 0) return [];

  for (const p of proposals) {
    try {
      // a. Contar miembros activos del tree
      const activeMembers = await prisma.treeMember.count({
        where: {
          treeId: p.treeId,
          status: "ACTIVE",
        },
      });

      // b. Total de votos
      const totalVotes = (p.votesYes ?? 0) + (p.votesNo ?? 0);

      // c. Porcentaje de participación
      const participation =
        activeMembers > 0 ? (totalVotes / activeMembers) * 100 : 0;

      // d/e. Resolver según quorum
      let newStatus: string;
      let reason: string;

      if (participation < 33) {
        newStatus = "REJECTED";
        reason = "falta de quórum";
      } else if (p.votesYes > p.votesNo) {
        newStatus = "APPROVED";
        reason = "mayoría de votos a favor";
      } else {
        newStatus = "REJECTED";
        reason =
          p.votesYes === p.votesNo ? "empate" : "mayoría de votos en contra";
      }

      // f. Actualizar en DB
      await (prisma as any).kanbanProposal.update({
        where: { id: p.id },
        data: {
          status: newStatus,
          resolvedAt: now,
        },
      });

      // g. Editar mensaje de Telegram
      if (bot && p.chatId && p.messageId) {
        try {
          const statusEmoji = newStatus === "APPROVED" ? "✅" : "❌";
          const statusLabel = newStatus === "APPROVED" ? "APROBADA" : "RECHAZADA";
          const quorumInfo =
            activeMembers > 0
              ? `${totalVotes}/${activeMembers} (${participation.toFixed(0)}%)`
              : `${totalVotes} votos`;

          const resultText = [
            `📋 *Propuesta Kanban*`,
            `Estado: ${statusEmoji} ${statusLabel}`,
            `✅ Sí: ${p.votesYes} | ❌ No: ${p.votesNo} | 👥 Quórum: ${quorumInfo}`,
            `Motivo: _${reason}_`,
          ].join("\n");

          await bot.api.editMessageText(
            Number(p.chatId),
            Number(p.messageId),
            resultText,
            { parse_mode: "Markdown" },
          );
        } catch (editErr: any) {
          console.warn(
            `[ProposalResolver] Could not edit message ${p.messageId} in chat ${p.chatId}: ${editErr.message}`,
          );
        }
      }

      resolutions.push({
        proposalId: p.id,
        status: newStatus as "APPROVED" | "REJECTED",
        reason,
        votesYes: p.votesYes,
        votesNo: p.votesNo,
        totalVotes,
        activeMembers,
        participation: Math.round(participation * 10) / 10,
      });

      console.log(
        `[ProposalResolver] ✅ ${p.id}: ${newStatus} — ${reason} (${p.votesYes}Y/${p.votesNo}N, ${totalVotes}/${activeMembers}=${participation.toFixed(1)}%)`,
      );
    } catch (err: any) {
      console.error(
        `[ProposalResolver] Error resolving proposal ${p.id}:`,
        err.message,
      );
    }
  }

  if (resolutions.length > 0) {
    console.log(
      `[ProposalResolver] ${resolutions.length} propuestas resueltas.`,
    );
  }

  return resolutions;
}
