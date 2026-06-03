/**
 * Ciclos de 4 horas: recolección → votación → resolución.
 * 
 * cycleManager (cada 4h — UTC-4: 0,4,8,12,16,20):
 *   1. Cierra votación del ciclo anterior (determina ganadora)
 *   2. Inicia votación de necesidades recolectadas (cyclePhase "collect" → "vote")
 *   3. Resetea cyclePoints de todos los miembros a 25
 *   4. Envía resumen al grupo de Telegram
 * 
 * needDetector (cada 15 min):
 *   - Analiza mensajes nuevos del grupo
 *   - Si detecta necesidad potencial: reacciona ❓
 *   - Crea Need en fase "collect"
 * 
 * Cuota mensual (día 1 de cada mes):
 *   - Calcula y persiste monthlyFee por miembro
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";
import { generateSolutionsForNeed } from "./voting";
import { exec } from "child_process";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface CycleCloseResult {
  treeName: string;
  chatId: string;
  winner: { title: string; points: number } | null;
  secondPlace: { title: string; points: number } | null;
  rejectedCount: number;
  advancedCount: number;
  error?: string;
}

interface CycleStartResult {
  treeName: string;
  chatId: string;
  needsStarted: number;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calcula el total real de puntos de una necesidad sumando sus NeedVotes.
 */
async function getNeedTotalPoints(
  prisma: PrismaClient,
  needId: string
): Promise<number> {
  const result = await prisma.needVote.aggregate({
    where: { needId },
    _sum: { points: true },
  });
  return result._sum.points ?? 0;
}

// ── Cierre de ciclo (votación → resolución) ──────────────────────────────

/**
 * Cierra la votación para un árbol: determina ganadora, actualiza estados.
 */
async function closeCycleForTree(
  prisma: PrismaClient,
  tree: { id: string; name: string; telegramChatId: string | null },
  bot: Bot<BotContext> | null
): Promise<CycleCloseResult> {
  const chatId = tree.telegramChatId;
  if (!chatId) {
    return {
      treeName: tree.name,
      chatId: "N/A",
      winner: null,
      secondPlace: null,
      rejectedCount: 0,
      advancedCount: 0,
      error: "sin telegramChatId",
    };
  }

  const now = new Date();

  // ── Encontrar necesidades con votación cerrada (votingEndsAt ya pasó) ──
  const votingNeeds = await prisma.need.findMany({
    where: {
      treeId: tree.id,
      cyclePhase: "vote",
      votingEndsAt: { lte: now },
    },
    select: { id: true, title: true, roundNumber: true, description: true, telegramMessageId: true, dailyVotes: true },
  });

  if (votingNeeds.length === 0) {
    return {
      treeName: tree.name,
      chatId,
      winner: null,
      secondPlace: null,
      rejectedCount: 0,
      advancedCount: 0,
    };
  }

  // ── Calcular puntos reales de cada necesidad ──
  const scored: { id: string; title: string; roundNumber: number; description: string | null; telegramMessageId: number | null; dailyVotes: number; totalPoints: number }[] = [];
  for (const need of votingNeeds) {
    const needVotePoints = await getNeedTotalPoints(prisma, need.id);
    const totalPoints = needVotePoints + (need.dailyVotes ?? 0);
    scored.push({ ...need, totalPoints });
  }
  scored.sort((a, b) => b.totalPoints - a.totalPoints);

  const winner = scored[0];
  let rejectedCount = 0;
  let advancedCount = 0;

  // ── Ganadora → APPROVED ──
  if (winner && winner.totalPoints > 0) {
    await prisma.need.update({
      where: { id: winner.id },
      data: {
        status: "APPROVED",
        cyclePhase: null,
        votingEndsAt: null,
        totalPoints: winner.totalPoints,
      },
    });

    // ── Notificar al grupo que la necesidad fue aprobada ──
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
    if (BOT_TOKEN) {
      const escHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const text =
        `<b>✅ Necesidad aprobada en ${escHtml(tree.name)}</b> — ` +
        `<b>${escHtml(winner.title)}</b> — ${winner.totalPoints} pts\n\n` +
        `${winner.description ? escHtml(winner.description) + "\n\n" : ""}` +
        `<b>¡Propongan soluciones!</b> Respondan a este mensaje con sus ideas.`;

      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      };
      if (winner.telegramMessageId) {
        payload.reply_to_message_id = winner.telegramMessageId;
      }

      const escapeShell = (s: string) => s.replace(/'/g, "'\\''");

      exec(
        `curl -s --max-time 10 -X POST https://api.telegram.org/bot${BOT_TOKEN}/sendMessage ` +
          `-H 'Content-Type: application/json' -d '${escapeShell(JSON.stringify(payload))}'`,
        { timeout: 12000 },
        (err, stdout) => {
          if (err) {
            console.error(`[CycleCron] curl error notificando aprobación:`, err.message);
            return;
          }
          try {
            const data = JSON.parse(stdout);
            if (data.ok) {
              console.log(
                `[CycleCron] ✅ Notificación de aprobación enviada para "${winner.title}" en ${tree.name}`,
              );
            } else {
              console.error("[CycleCron] Telegram API error:", stdout.slice(0, 200));
            }
          } catch {
            /* ignore parse errors */
          }
        },
      );
    }

    // ── Generar soluciones vía Ari (Hermes Agent) ──
    generateSolutionsForNeed(
      winner.id,
      tree.id,
      tree.name,
      winner.title,
      winner.description || "",
      chatId,
      winner.telegramMessageId,
    );
  }

  // ── 2do lugar + resto: roundNumber=2 o REJECTED ──
  for (const item of scored.slice(1)) {
    if (item.roundNumber >= 2) {
      // Ya pasó 2 rondas → REJECTED
      await prisma.need.update({
        where: { id: item.id },
        data: {
          status: "REJECTED",
          cyclePhase: null,
          votingEndsAt: null,
          totalPoints: item.totalPoints,
        },
      });
      rejectedCount++;
    } else {
      // Primera ronda → pasa a ronda 2, vuelve a collect
      await prisma.need.update({
        where: { id: item.id },
        data: {
          roundNumber: 2,
          cyclePhase: "collect",
          votingEndsAt: null,
          totalPoints: item.totalPoints,
        },
      });
      advancedCount++;
    }
  }

  // ── Si ganó con 0 votos: rechazar si ya pasó 2 rondas, si no avanzar ──
  if (winner && winner.totalPoints === 0) {
    if (winner.roundNumber >= 2) {
      // Ya pasó 2 rondas sin recibir votos → RECHAZADA definitivamente
      await prisma.need.update({
        where: { id: winner.id },
        data: {
          status: "REJECTED",
          cyclePhase: null,
          votingEndsAt: null,
          totalPoints: 0,
        },
      });
      rejectedCount++;
    } else {
      // Primera ronda → avanza a ronda 2, vuelve a collect
      await prisma.need.update({
        where: { id: winner.id },
        data: {
          roundNumber: 2,
          cyclePhase: "collect",
          votingEndsAt: null,
          totalPoints: 0,
        },
      });
      advancedCount++;
    }
  }

  // ── Enviar resumen al grupo ──
  if (bot) {
    try {
      const winnerLine = winner
        ? winner.totalPoints > 0
          ? `🏆 *${winner.title}* — ${winner.totalPoints} pts → APROBADA`
          : winner.roundNumber >= 2
            ? `❌ *${winner.title}* — 0 votos tras 2 rondas → RECHAZADA`
            : `🔄 *${winner.title}* — 0 votos → pasa a ronda 2`
        : "📋 Sin ganadora este ciclo.";

      const parts = [winnerLine];
      if (scored.length > 1) {
        const second = scored[1];
        parts.push(`🥈 *${second.title}* — ${second.totalPoints} pts → pasa a ronda 2`);
      }
      if (advancedCount > 0) {
        parts.push(`🔄 ${advancedCount} necesidad(es) pasan a ronda 2`);
      }
      if (rejectedCount > 0) {
        parts.push(`❌ ${rejectedCount} necesidad(es) RECHAZADAS (ronda 2 sin ganar)`);
      }

      await bot.api.sendMessage(
        chatId,
        `⚡ *Cierre de ciclo — ${tree.name}*\n\n${parts.join("\n")}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error(`[CycleCron] Error enviando resumen a ${chatId}:`, err);
    }
  }

  return {
    treeName: tree.name,
    chatId,
    winner: winner ? { title: winner.title, points: winner.totalPoints } : null,
    secondPlace: scored.length > 1 ? { title: scored[1].title, points: scored[1].totalPoints } : null,
    rejectedCount,
    advancedCount,
  };
}

// ── Inicio de ciclo (collect → vote) ──────────────────────────────────────

/**
 * Inicia la votación: mueve necesidades en fase "collect" a "vote".
 */
async function startCycleForTree(
  prisma: PrismaClient,
  tree: { id: string; name: string; telegramChatId: string | null },
  bot: Bot<BotContext> | null
): Promise<CycleStartResult> {
  const chatId = tree.telegramChatId;
  if (!chatId) {
    return {
      treeName: tree.name,
      chatId: "N/A",
      needsStarted: 0,
      error: "sin telegramChatId",
    };
  }

  const now = new Date();
  const votingEndsAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4h

  // ── Mover necesidades en "collect" o sin cyclePhase a "vote" ──
  const collectedNeeds = await prisma.need.findMany({
    where: {
      treeId: tree.id,
      status: "OPEN",
      OR: [{ cyclePhase: "collect" }, { cyclePhase: null }],
    },
    select: { id: true, title: true },
  });

  if (collectedNeeds.length > 0) {
    await prisma.need.updateMany({
      where: {
        treeId: tree.id,
        status: "OPEN",
        OR: [{ cyclePhase: "collect" }, { cyclePhase: null }],
      },
      data: {
        cyclePhase: "vote",
        votingEndsAt,
      },
    });
  }

  // ── Notificar al grupo con botones de votación ──
  if (bot && collectedNeeds.length > 0) {
    try {
      const needList = collectedNeeds
        .map((n, i) => `${i + 1}. ${n.title}`)
        .join("\n");

      // Inline keyboard: one button per need (one per row for clarity)
      const keyboard = collectedNeeds.map((n, i) => [{
        text: `${i + 1}. ${n.title.slice(0, 50)}`,
        callback_data: `vote_need:${n.id}`,
      }]);

      await bot.api.sendMessage(
        chatId,
        `🗳️ *Votación abierta — ${tree.name}*\n\n` +
          `📋 ${collectedNeeds.length} necesidad(es) a votación:\n${needList}\n\n` +
          `⏰ Votación abierta hasta: ${votingEndsAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}\n\n` +
          `_Toca un botón para votar. Solo puedes votar una vez por necesidad._`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    } catch (err) {
      console.error(`[CycleCron] Error notificando inicio de votación a ${chatId}:`, err);
    }
  }

  return {
    treeName: tree.name,
    chatId,
    needsStarted: collectedNeeds.length,
  };
}

// ── Reset de cyclePoints ──────────────────────────────────────────────────

async function resetCyclePoints(
  prisma: PrismaClient,
  treeId: string
): Promise<number> {
  const result = await prisma.treeMember.updateMany({
    where: { treeId, status: "ACTIVE" },
    data: {
      cyclePoints: 25,
      cyclePointsRefillAt: new Date(),
    },
  });
  return result.count;
}

// ── cycleManager: ciclo completo (cierre + inicio + reset) ────────────────

/** 
 * Ejecuta el ciclo completo para TODOS los árboles con grupo de Telegram.
 *  
 * Orden de operaciones por árbol: 
 * 1. Iniciar votación de necesidades recolectadas (del ciclo anterior) 
 * 2. Cerrar votación del ciclo que termina (ganadora → APPROVED, 2do lugar → collect para próximo ciclo) 
 * 3. Resetear cyclePoints 
 */
export async function runCycleManager(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
): Promise<{
  treesProcessed: number;
  winners: number;
  needsStarted: number;
  pointsReset: number;
}> {
  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  console.log(
    `[CycleCron] ⚡ Ejecutando cierre de ciclo para ${trees.length} árbol(es)…`
  );

  let totalWinners = 0;
  let totalStarted = 0;
  let totalPointsReset = 0;

  for (const tree of trees) {
    try { 
      // 1. Iniciar votación con necesidades recolectadas (del ciclo anterior) 
      const startResult = await startCycleForTree(prisma, tree, bot); 
      totalStarted += startResult.needsStarted; 
 
      // 2. Cerrar votación del ciclo que termina 
      const closeResult = await closeCycleForTree(prisma, tree, bot); 
      if (closeResult.winner) totalWinners++; 
 
      // 3. Resetear cyclePoints 
      const resetCount = await resetCyclePoints(prisma, tree.id); 
      totalPointsReset += resetCount;

      console.log(
        `[CycleCron] ✅ ${tree.name}: ` +
          `ganadora=${closeResult.winner ? `"${closeResult.winner.title}"` : "ninguna"}, ` +
          `en_votación=${startResult.needsStarted}, ` +
          `puntos_reset=${resetCount}`
      );
    } catch (err) {
      console.error(`[CycleCron] ❌ Error en ${tree.name}:`, err);
    }
  }

  console.log(
    `[CycleCron] ⚡ Ciclo completado: ${trees.length} árboles, ` +
      `${totalWinners} ganadoras, ${totalStarted} en votación, ${totalPointsReset} puntos reseteados.`
  );

  return {
    treesProcessed: trees.length,
    winners: totalWinners,
    needsStarted: totalStarted,
    pointsReset: totalPointsReset,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// needDetector — análisis de mensajes para detectar necesidades
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detecta necesidades potenciales en los mensajes recientes de un grupo.
 * 
 * Análisis simple: busca patrones de pregunta, solicitud o problema.
 * La detección avanzada con IA (Ari vía Hermes) se implementa en Fase 4.
 */
async function detectNeedsInTree(
  prisma: PrismaClient,
  tree: { id: string; name: string; telegramChatId: string | null },
  bot: Bot<BotContext> | null
): Promise<{ detected: number; created: number }> {
  const chatId = tree.telegramChatId;
  if (!chatId) return { detected: 0, created: 0 };

  // ── Obtener mensajes de los últimos 15 minutos ──
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const recentMessages = await prisma.chatMessage.findMany({
    where: {
      treeId: tree.id,
      role: "user",
      createdAt: { gte: since },
    },
    select: { id: true, content: true, userId: true },
    orderBy: { createdAt: "asc" },
  });

  if (recentMessages.length === 0) return { detected: 0, created: 0 };

  // ── Heurísticas simples de detección ──
  // NOTA: detección básica basada en patrones. La detección avanzada con IA 
  // (Ari vía Hermes) se implementa en Fase 4.
  const NEED_PATTERNS = [
    /\b(?:necesitamos|necesito|hace falta|falta|urge)\b/i,
    /\b(?:sería bueno|estaría bien|podríamos|hay que)\b.*\b(?:crear|hacer|implementar|arreglar|mejorar|resolver)\b/i,
    /\b(?:problema|bug|error|falla|no funciona|roto|se cayó)\b/i,
    /\b(?:idea|propongo|sugiero|propuesta)\b/i,
  ];

  const detectedMessages = recentMessages.filter((msg) =>
    NEED_PATTERNS.some((pattern) => pattern.test(msg.content))
  );

  let created = 0;

  for (const msg of detectedMessages) {
    // ── Evitar duplicados: no crear si ya existe una necesidad similar ──
    const existing = await prisma.need.findFirst({
      where: {
        treeId: tree.id,
        title: msg.content.slice(0, 200),
      },
    });
    if (existing) continue;

    // ── Crear necesidad en fase "collect" ──
    await prisma.need.create({
      data: {
        treeId: tree.id,
        creatorId: msg.userId,
        title: msg.content.slice(0, 200),
        description: msg.content,
        status: "OPEN",
        cyclePhase: "collect",
        roundNumber: 1,
      },
    });
    created++;

    // ── Reaccionar con ❓ al mensaje original en Telegram ──
    if (bot) {
      try {
        // Buscar el message_id en el campo content o un campo separado
        // Por ahora, notificamos vía mensaje en vez de reacción
        // (reacciones requieren el message_id que ChatMessage no almacena)
        console.log(
          `[NeedDetector] ✅ Necesidad detectada en ${tree.name}: "${msg.content.slice(0, 60)}..."`
        );
      } catch (err) {
        // no-op: la reacción es opcional
      }
    }
  }

  if (created > 0) {
    console.log(
      `[NeedDetector] 🔍 ${tree.name}: ${created} necesidad(es) creada(s) de ${detectedMessages.length} detecciones.`
    );
  }

  return { detected: detectedMessages.length, created };
}

/**
 * Ejecuta el detector de necesidades para TODOS los árboles con grupo.
 */
export async function runNeedDetector(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
): Promise<{ treesProcessed: number; totalDetected: number; totalCreated: number }> {
  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  let totalDetected = 0;
  let totalCreated = 0;

  for (const tree of trees) {
    try {
      const result = await detectNeedsInTree(prisma, tree, bot);
      totalDetected += result.detected;
      totalCreated += result.created;
    } catch (err) {
      console.error(`[NeedDetector] ❌ Error en ${tree.name}:`, err);
    }
  }

  if (totalCreated > 0) {
    console.log(
      `[NeedDetector] 🔍 Detección completada: ${trees.length} árboles, ` +
        `${totalDetected} mensajes analizados, ${totalCreated} necesidades creadas.`
    );
  }

  return {
    treesProcessed: trees.length,
    totalDetected,
    totalCreated,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cuota mensual (día 1 de cada mes)
// ═══════════════════════════════════════════════════════════════════════════

const ACTIVE_TASK_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "EVIDENCE_SUBMITTED"];

interface MonthlyFeeResult {
  treeName: string;
  memberCount: number;
  costoBase: number;
  taskBudgetSum: number;
  cuota: number;
}

async function calcMonthlyFee(
  prisma: PrismaClient,
  tree: { id: string; name: string; creatorId: string | null },
  bot: Bot<BotContext> | null
): Promise<MonthlyFeeResult> {
  let costoBase = 0;
  if (tree.creatorId) {
    const sub = await prisma.subscription.findFirst({
      where: { userId: tree.creatorId, status: "ACTIVE" },
      select: { monthlyCost: true },
    });
    costoBase = sub?.monthlyCost ?? 0;
  }

  const budgetAgg = await prisma.task.aggregate({
    where: { treeId: tree.id, status: { in: ACTIVE_TASK_STATUSES } },
    _sum: { budget: true },
  });
  const taskBudgetSum = budgetAgg._sum.budget ?? 0;

  const memberCount = await prisma.treeMember.count({
    where: { treeId: tree.id, status: "ACTIVE" },
  });

  if (memberCount === 0) {
    return { treeName: tree.name, memberCount: 0, costoBase, taskBudgetSum, cuota: 0 };
  }

  const cuota = Math.round(costoBase + taskBudgetSum / memberCount);

  await prisma.treeMember.updateMany({
    where: { treeId: tree.id, status: "ACTIVE" },
    data: { monthlyFee: cuota },
  });

  if (bot) {
    const members = await prisma.treeMember.findMany({
      where: { treeId: tree.id, status: "ACTIVE" },
      include: { user: { select: { telegramUserId: true } } },
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

export async function runMonthlyFee(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
): Promise<MonthlyFeeResult[]> {
  const trees = await prisma.tree.findMany({
    select: { id: true, name: true, creatorId: true },
  });

  console.log(`[Cron] 💰 Cuota mensual iniciada para ${trees.length} árbol(es)…`);

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
