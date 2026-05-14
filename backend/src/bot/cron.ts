/**
 * Lógica del cierre diario a medianoche.
 *
 * Cada día a las 00:00:
 *   1. Por cada árbol con grupo de Telegram:
 *      a. La necesidad OPEN con más dailyVotes → IN_PROGRESS
 *      b. Todas las necesidades → dailyVotes = 0
 *   2. Todos los miembros → dailyPoints = 100
 *   3. Enviar resumen al grupo de Telegram
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
  const openNeeds = await (prisma as any).need.findMany({
    where: { treeId: tree.id, status: "OPEN" },
    orderBy: { dailyVotes: "desc" },
  });

  const totalNeeds = openNeeds.length;

  if (totalNeeds === 0) {
    // Sin necesidades → solo regenerar puntos
    const resetCount = await (prisma as any).treeMember.updateMany({
      where: { treeId: tree.id, status: "ACTIVE" },
      data: { dailyPoints: 100 },
    });

    // Enviar resumen aunque no haya ganador
    if (bot && chatId) {
      try {
        await bot.api.sendMessage(
          chatId,
          `🌅 *Cierre diario — ${tree.name}*\n\n` +
            `📋 Sin necesidades abiertas hoy.\n` +
            `🔋 Puntos renovados a 100 para ${resetCount.count} miembros.`
        );
      } catch (err) {
        console.error(`[Cron] Error enviando mensaje a ${chatId}:`, err);
      }
    }

    return { treeName: tree.name, chatId, winner: null, totalNeeds: 0 };
  }

  // ── Ganadora: la necesidad con más dailyVotes ──
  const winner = openNeeds[0];

  if (winner.dailyVotes > 0) {
    await (prisma as any).need.update({
      where: { id: winner.id },
      data: { status: "IN_PROGRESS" },
    });
  }

  // ── Resetear dailyVotes de TODAS las necesidades del árbol ──
  await (prisma as any).need.updateMany({
    where: { treeId: tree.id },
    data: { dailyVotes: 0 },
  });

  // ── Regenerar dailyPoints = 100 para todos los miembros ──
  const resetCount = await (prisma as any).treeMember.updateMany({
    where: { treeId: tree.id, status: "ACTIVE" },
    data: { dailyPoints: 100 },
  });

  // ── Enviar resumen al grupo ──
  if (bot && chatId) {
    const winnerLine =
      winner.dailyVotes > 0
        ? `🏆 *${winner.title}* con ${winner.dailyVotes} votos.`
        : `📋 Ninguna necesidad recibió votos hoy.`;

    const message =
      `🌅 *Resultados de hoy — ${tree.name}*\n\n` +
      `${winnerLine}\n` +
      `📋 ${totalNeeds} necesidades revisadas.\n` +
      `🔋 Puntos renovados a 100 para ${resetCount.count} miembros.`;

    try {
      await bot.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error(`[Cron] Error enviando mensaje a ${chatId}:`, err);
    }
  }

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
  const trees = await (prisma as any).tree.findMany({
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
