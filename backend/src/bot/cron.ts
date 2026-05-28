/**
 * Lógica de crons: cierre diario + cuota mensual.
 *
 * Cada día a las 00:00:
 *   1. Por cada árbol con grupo de Telegram:
 *      a. La necesidad OPEN con más dailyVotes → IN_PROGRESS
 *      b. Todas las necesidades → dailyVotes = 0
 *   2. Todos los miembros → dailyPoints = 100
 *   3. Enviar resumen al grupo de Telegram
 *
 * Cada día 1 del mes a las 00:00:
 *   1. Calcular cuota mensual por árbol
 *   2. Persistir monthlyFee en cada TreeMember
 *   3. Notificar vía DM a cada miembro con telegramUserId
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";

interface DailyCloseResult {
  treeName: string;
  chatId: string;
  winner: { title: string; votes: number } | null;
  totalNeeds: number;
  error?: string;
}

/**
 * Ejecuta el cierre diario para un árbol específico.
 */
async function closeTree(
  prisma: PrismaClient,
  tree: { id: string; name: string; telegramChatId: string | null },
  bot: Bot<BotContext> | null
): Promise<DailyCloseResult> {
  const chatId = tree.telegramChatId;
  if (!chatId) {
    return {
      treeName: tree.name,
      chatId: "N/A",
      winner: null,
      totalNeeds: 0,
      error: "sin telegramChatId",
    };
  }

  // ── Encontrar todas las necesidades OPEN del árbol ──
  const openNeeds = await prisma.need.findMany({
    where: { treeId: tree.id, status: "OPEN" },
    orderBy: { dailyVotes: "desc" },
  });

  const totalNeeds = openNeeds.length;

  if (totalNeeds === 0) {
    // Sin necesidades → solo regenerar puntos
    const resetCount = await prisma.treeMember.updateMany({
      where: { treeId: tree.id, status: "ACTIVE" },
      data: { dailyPoints: 100 },
    });

    return { treeName: tree.name, chatId, winner: null, totalNeeds: 0 };
  }

  // ── Ganadora: la necesidad con más dailyVotes ──
  const winner = openNeeds[0];

  if (winner.dailyVotes > 0) {
    await prisma.need.update({
      where: { id: winner.id },
      data: { status: "IN_PROGRESS" },
    });
  }

  // ── Resetear dailyVotes de TODAS las necesidades del árbol ──
  await prisma.need.updateMany({
    where: { treeId: tree.id },
    data: { dailyVotes: 0 },
  });

  // ── Regenerar dailyPoints = 100 para todos los miembros ──
  const resetCount = await prisma.treeMember.updateMany({
    where: { treeId: tree.id, status: "ACTIVE" },
    data: { dailyPoints: 100 },
  });

  // ── Enviar resumen al grupo: DESHABILITADO por solicitud del admin ──

  return {
    treeName: tree.name,
    chatId,
    winner: { title: winner.title, votes: winner.dailyVotes },
    totalNeeds,
  };
}

/**
 * Ejecuta el cierre diario para TODOS los árboles con grupo de Telegram.
 */
export async function runDailyClose(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
): Promise<DailyCloseResult[]> {
  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  console.log(
    `[Cron] Cierre diario iniciado para ${trees.length} árbol(es)…`
  );

  const results: DailyCloseResult[] = [];

  for (const tree of trees) {
    try {
      const result = await closeTree(prisma, tree, bot);
      results.push(result);
      console.log(
        `[Cron] ✅ ${result.treeName}: ` +
          (result.winner
            ? `ganó "${result.winner.title}" (${result.winner.votes} votos)`
            : "sin ganador") +
          ` | ${result.totalNeeds} necesidades`
      );
    } catch (err) {
      console.error(`[Cron] ❌ Error en ${tree.name}:`, err);
      results.push({
        treeName: tree.name,
        chatId: tree.telegramChatId || "N/A",
        winner: null,
        totalNeeds: 0,
        error: String(err),
      });
    }
  }

  console.log(`[Cron] Cierre diario completado. ${results.length} árboles procesados.`);
  return results;
}

// ── Cuota mensual (día 1 de cada mes) ──────────────────────────────────────────

const ACTIVE_TASK_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "EVIDENCE_SUBMITTED"];

interface MonthlyFeeResult {
  treeName: string;
  memberCount: number;
  costoBase: number;
  taskBudgetSum: number;
  cuota: number;
}

/**
 * Calcula y persiste la cuota mensual para cada miembro activo de un árbol.
 *
 * Fórmula: cuota = costoBase + (Σ presupuestos tasks activas / N miembros)
 *
 * costoBase = monthlyCost de la suscripción del creador del árbol (0 si no hay).
 *
 * Después de persistir, envía DM a cada miembro con telegramUserId notificando su cuota.
 */
async function calcMonthlyFee(
  prisma: PrismaClient,
  tree: { id: string; name: string; creatorId: string | null },
  bot: Bot<BotContext> | null
): Promise<MonthlyFeeResult> {
  // ── costoBase: suscripción del creador ──
  let costoBase = 0;
  if (tree.creatorId) {
    const sub = await prisma.subscription.findFirst({
      where: { userId: tree.creatorId, status: "ACTIVE" },
      select: { monthlyCost: true },
    });
    costoBase = sub?.monthlyCost ?? 0;
  }

  // ── Σ presupuestos de tasks activas ──
  const budgetAgg = await prisma.task.aggregate({
    where: {
      treeId: tree.id,
      status: { in: ACTIVE_TASK_STATUSES },
    },
    _sum: { budget: true },
  });
  const taskBudgetSum = budgetAgg._sum.budget ?? 0;

  // ── N miembros activos ──
  const memberCount = await prisma.treeMember.count({
    where: { treeId: tree.id, status: "ACTIVE" },
  });

  if (memberCount === 0) {
    return { treeName: tree.name, memberCount: 0, costoBase, taskBudgetSum, cuota: 0 };
  }

  const cuota = Math.round(costoBase + taskBudgetSum / memberCount);

  // ── Persistir monthlyFee en cada miembro activo ──
  await prisma.treeMember.updateMany({
    where: { treeId: tree.id, status: "ACTIVE" },
    data: { monthlyFee: cuota },
  });

  // ── Enviar DM a cada miembro con telegramUserId ──
  if (bot) {
    const members = await prisma.treeMember.findMany({
      where: { treeId: tree.id, status: "ACTIVE" },
      include: {
        user: { select: { telegramUserId: true } },
      },
    });

    const taskShare = Math.round(taskBudgetSum / memberCount);
    let notified = 0;

    for (const m of members) {
      const tgId = m.user?.telegramUserId;
      if (!tgId) continue;

      try {
        await bot.api.sendMessage(
          Number(tgId),
          `💰 *Cuota mensual — ${tree.name}*\n\n` +
            `Tu cuota de este mes es *$${cuota.toLocaleString("es-CL")} CLP*\n` +
            `(base $${costoBase.toLocaleString("es-CL")} + tasks $${taskShare.toLocaleString("es-CL")})\n\n` +
            `Paga con /pagar`,
          { parse_mode: "Markdown" }
        );
        notified++;
      } catch (err: any) {
        // 403 = user blocked the bot → clean up telegramUserId
        if (err?.error_code === 403) {
          await prisma.user.update({
            where: { id: m.userId },
            data: { telegramUserId: null },
          });
          console.log(`[Cron] 💰 Usuario ${m.userId} bloqueó al bot — telegramUserId limpiado.`);
        } else {
          console.error(`[Cron] 💰 Error enviando DM a tgUser ${tgId}:`, err?.message || err);
        }
      }
    }

    if (notified > 0) {
      console.log(`[Cron] 💰 ${tree.name}: ${notified}/${members.length} miembros notificados.`);
    }
  }

  return { treeName: tree.name, memberCount, costoBase, taskBudgetSum, cuota };
}

/**
 * Ejecuta el cálculo de cuota mensual para TODOS los árboles.
 */
export async function runMonthlyFee(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
): Promise<MonthlyFeeResult[]> {
  const trees = await prisma.tree.findMany({
    select: { id: true, name: true, creatorId: true },
  });

  console.log(
    `[Cron] 💰 Cuota mensual iniciada para ${trees.length} árbol(es)…`
  );

  const results: MonthlyFeeResult[] = [];

  for (const tree of trees) {
    try {
      const result = await calcMonthlyFee(prisma, tree, bot);
      results.push(result);
      console.log(
        `[Cron] 💰 ${result.treeName}: costoBase=${result.costoBase} ` +
        `+ (${result.taskBudgetSum} / ${result.memberCount}) = cuota ${result.cuota} CLP`
      );
    } catch (err) {
      console.error(`[Cron] ❌ Error calculando cuota para ${tree.name}:`, err);
      results.push({
        treeName: tree.name,
        memberCount: 0,
        costoBase: 0,
        taskBudgetSum: 0,
        cuota: 0,
      });
    }
  }

  console.log(`[Cron] 💰 Cuota mensual completada. ${results.length} árboles procesados.`);
  return results;
}
