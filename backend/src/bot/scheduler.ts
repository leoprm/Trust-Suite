/**
 * Scheduler: node-cron para el cierre diario, XP decay, y rotación semanal.
 *
 * Usa node-cron para disparar jobs a horas fijas (hora local).
 * También expone triggerDailyClose() para testing manual.
 */

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";
import { runDailyClose, runMonthlyFee } from "./cron";
import { runDisputeResolution } from "./disputeResolutionCron";
import {
  applyDecay,
  assignAgentToTreeSlot,
  releaseAgent,
} from "../services/agentProfileService";
import { autoScale } from "../services/autoScaler";
import { updateSkillPricing } from "../cron/skillPricingCron";
import { runTalentMigration } from "../cron/talentMigrationCron";
import { prisma } from "../index";

// ── Constantes ─────────────────────────────────────────────────────────────────

const ROLES = ["analyst", "researcher", "implementer", "reviewer", "mediator"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Calcula el promedio de estrellas de un agente en un árbol
 * durante los últimos 7 días. Retorna 0 si no hay ratings.
 */
async function avgStarsLast7Days(
  agentId: string,
  treeId: string,
): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.rating.aggregate({
    where: { agentId, treeId, createdAt: { gte: sevenDaysAgo } },
    _avg: { stars: true },
  });
  return result._avg.stars ?? 0;
}

/**
 * Encuentra el agente actualmente asignado a un rol en un árbol.
 * Retorna null si el slot está vacío.
 */
async function findCurrentAgent(
  treeId: string,
  role: string,
): Promise<{ agentId: string } | null> {
  return prisma.agentRoleHistory.findFirst({
    where: { treeId, role, releasedAt: null },
    select: { agentId: true },
  });
}

// ── Tareas programadas ─────────────────────────────────────────────────────────

let midnightTask: ScheduledTask | null = null;
let decayTask: ScheduledTask | null = null;
let rotationTask: ScheduledTask | null = null;
let autoScaleTask: ScheduledTask | null = null;
let monthlyFeeTask: ScheduledTask | null = null;
let disputeResolutionTask: ScheduledTask | null = null;
let skillPricingTask: ScheduledTask | null = null;
let talentMigrationTask: ScheduledTask | null = null;

/**
 * Arranca todos los schedulers.
 * Solo registra tareas si hay árboles con telegramChatId.
 */
export function startScheduler(
  prismaClient: PrismaClient,
  bot: Bot<BotContext> | null
): void {
  // ── Detener schedulers previos si existen ──
  stopScheduler();

  // ── Cron: 0 0 * * * (medianoche) ──
  midnightTask = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] ⏰ Medianoche — ejecutando cierre diario…");
    try {
      await runDailyClose(prismaClient, bot);
    } catch (err) {
      console.error("[Scheduler] Error fatal en cierre diario:", err);
    }
  });
  console.log("[Scheduler] ⏰ Cierre diario programado a las 00:00 (hora local)");

  // ── Cron: 0 3 * * * (XP decay diario) ──
  decayTask = cron.schedule("0 3 * * *", async () => {
    const lambda = parseFloat(process.env.XP_DECAY_LAMBDA || "0.05");
    console.log(`[Scheduler] 📉 XP decay iniciado (λ=${lambda})…`);
    try {
      const updated = await applyDecay(lambda);
      console.log(`[Scheduler] 📉 XP decay: ${updated} perfiles actualizados.`);
    } catch (err) {
      console.error("[Scheduler] Error en XP decay:", err);
    }
  });
  console.log("[Scheduler] 📉 XP decay programado a las 03:00 (diario)");

  // ── Cron: 0 0 * * 0 (rotación semanal — domingo 00:00) ──
  rotationTask = cron.schedule("0 0 * * 0", async () => {
    console.log("[Scheduler] 🔄 Rotación semanal iniciada…");
    try {
      const trees = await prisma.tree.findMany();
      let rotated = 0;

      for (const tree of trees) {
        for (const role of ROLES) {
          const current = await findCurrentAgent(tree.id, role);

          if (current) {
            const avg = await avgStarsLast7Days(current.agentId, tree.id);
            if (avg < 2) {
              await releaseAgent(current.agentId, tree.id, role);
              console.log(
                `[Scheduler] 🔻 ${current.agentId} removido de ${tree.name} / ${role} (avg=${avg.toFixed(1)})`,
              );
              rotated++;
              await assignAgentToTreeSlot(tree.id, role);
            }
          } else {
            await assignAgentToTreeSlot(tree.id, role);
          }
        }
      }

      console.log(
        `[Scheduler] 🔄 Rotación semanal completada — ${rotated} agentes reemplazados.`,
      );
    } catch (err) {
      console.error("[Scheduler] Error en rotación semanal:", err);
    }
  });
  console.log("[Scheduler] 🔄 Rotación semanal programada a domingo 00:00");

  // ── Cron: 0 */6 * * * (cada 6 horas) — AutoScaler ──
  autoScaleTask = cron.schedule("0 */6 * * *", async () => {
    console.log("[Scheduler] 🔄 AutoScaler ejecutándose…");
    try {
      await autoScale();
    } catch (err) {
      console.error("[Scheduler] Error en AutoScaler:", err);
    }
  });
  console.log("[Scheduler] 🔄 AutoScaler programado cada 6 horas");

  // ── Cron: 0 0 1 * * (día 1 de cada mes a medianoche) — Cuota mensual ──
  monthlyFeeTask = cron.schedule("0 0 1 * *", async () => {
    console.log("[Scheduler] 💰 Día 1 del mes — calculando cuota mensual…");
    try {
      const results = await runMonthlyFee(prismaClient, bot);
      const treesWithFee = results.filter((r) => r.cuota > 0);
      console.log(
        `[Scheduler] 💰 Cuota mensual: ${treesWithFee.length} árboles con cuota > 0 de ${results.length} total.`
      );
    } catch (err) {
      console.error("[Scheduler] Error fatal en cuota mensual:", err);
    }
  });
  console.log("[Scheduler] 💰 Cuota mensual programada al día 1 de cada mes a las 00:00");

  // ── Cron: */15 * * * * (cada 15 min) — Resolución de disputas ─────────
  disputeResolutionTask = cron.schedule("*/15 * * * *", async () => {
    try {
      const results = await runDisputeResolution(prismaClient, bot);
      if (results.length > 0) {
        console.log(
          `[Scheduler] ⚖️ Dispute resolution: ${results.length} procesadas. ` +
            `${results.filter(r => r.outcome === "RESOLVED_ACCEPTED").length} aceptadas, ` +
            `${results.filter(r => r.outcome === "RESOLVED_REJECTED").length} rechazadas, ` +
            `${results.filter(r => r.outcome === "EXPIRED").length} expiradas.`,
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error en resolución de disputas:", err);
    }
  });
  console.log("[Scheduler] ⚖️ Resolución de disputas programada cada 15 minutos");

  // ── Cron: 0 * * * * (cada hora) — Skill Pricing ────────────────────
  skillPricingTask = cron.schedule("0 * * * *", async () => {
    try {
      await updateSkillPricing(prismaClient);
    } catch (err) {
      console.error("[Scheduler] Error en skill pricing:", err);
    }
  });
  console.log("[Scheduler] 💲 Skill Pricing programado cada hora");

  // ── Cron: 0 4 * * * (4 AM diario) — Talent Migration ──────────────────
  talentMigrationTask = cron.schedule("0 4 * * *", async () => {
    console.log("[Scheduler] 🔀 Análisis de migración de talento…");
    try {
      const result = await runTalentMigration(prismaClient, bot);
      console.log(
        `[Scheduler] 🔀 Talent Migration: ${result.suggestions} sugerencias ` +
          `en ${result.treesAnalyzed} árboles analizados.`
      );
    } catch (err) {
      console.error("[Scheduler] Error en talent migration:", err);
    }
  });
  console.log("[Scheduler] 🔀 Talent Migration programado a las 04:00 (diario)");

  // ── Dev mode hint ──
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[Scheduler] 🧪 Entorno dev — usa triggerDailyClose() para simular el cierre.",
    );
  }
}

/**
 * Dispara el cierre diario manualmente (para testing / desarrollo).
 */
export async function triggerDailyClose(
  prismaClient: PrismaClient,
  bot: Bot<BotContext> | null
) {
  console.log("[Scheduler] 🔧 Cierre diario manual disparado…");
  return runDailyClose(prismaClient, bot);
}

/**
 * Detiene todos los schedulers (para shutdown graceful).
 */
export function stopScheduler(): void {
  let stopped = false;
  for (const task of [midnightTask, decayTask, rotationTask, autoScaleTask, monthlyFeeTask, disputeResolutionTask, skillPricingTask, talentMigrationTask]) {
    if (task) {
      task.stop();
      stopped = true;
    }
  }
  midnightTask = null;
  decayTask = null;
  rotationTask = null;
  autoScaleTask = null;
  monthlyFeeTask = null;
  disputeResolutionTask = null;
  skillPricingTask = null;
  talentMigrationTask = null;
  if (stopped) {
    console.log("[Scheduler] ⏹️ Todos los schedulers detenidos.");
  }
}
