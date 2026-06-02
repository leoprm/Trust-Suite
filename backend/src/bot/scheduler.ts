/**
 * Scheduler: node-cron para el cierre diario, XP decay, y rotación semanal.
 *
 * Usa node-cron para disparar jobs a horas fijas (hora local).
 * También expone triggerDailyClose() para testing manual.
 */

import fs from "fs";
import path from "path";
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";
import { runCycleManager, runNeedDetector, runMonthlyFee } from "./cron";
import { runMonthlyRetrospective } from "../services/monthlyRetrospective";
import { runDisputeResolution } from "./disputeResolutionCron";
import { startKanbanWatchdog, stopKanbanWatchdog } from "./kanbanWatchdog";
import {
  assignAgentToTreeSlot,
  releaseAgent,
} from "../services/agentProfileService";
import { autoScale } from "../services/autoScaler";
import { updateSkillPricing } from "../cron/skillPricingCron";
import { runTalentMigration } from "../cron/talentMigrationCron";
import { runHealthCheck } from "../cron/healthCheckCron";
import { runProposalResolver } from "../cron/proposalResolverCron";
import { runExternalTaskOrchestrator } from "../cron/externalTaskOrchestratorCron";
import { runCandidateAnnouncementCron } from "../cron/candidateAnnouncementCron";
import { runXpDecay } from "../cron/xpDecayCron";
import { runNightlyResearch } from "../cron/nightlyResearchCron";
import { runSurveyReminders } from "../cron/surveyReminderCron";
import { runProactiveAgent } from "../cron/proactiveAgentCron";
import { nightlyScan } from "../services/skillEvolution";
import { startHiringBridge, stopHiringBridge } from "../services/hiringBridge";
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

/**
 * Elimina archivos .txt en conversations/<treeId>/ con más de 90 días.
 */
async function cleanupOldConversations(): Promise<void> {
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
  if (!fs.existsSync(sandboxBase)) return;

  const now = Date.now();
  const MAX_AGE = 90 * 24 * 60 * 60 * 1000; // 90 días en ms

  const treeDirs = fs.readdirSync(sandboxBase);
  for (const treeId of treeDirs) {
    const conversationsDir = path.join(sandboxBase, treeId, "conversations");
    if (!fs.existsSync(conversationsDir)) continue;
    if (!fs.statSync(conversationsDir).isDirectory()) continue;

    const files = fs.readdirSync(conversationsDir);
    for (const file of files) {
      if (!file.endsWith(".txt")) continue;
      const filePath = path.join(conversationsDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > MAX_AGE) {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] Deleted old conversation: ${filePath}`);
      }
    }
  }
}

// ── Tareas programadas ─────────────────────────────────────────────────────────

/** Verifica si hoy es el último día del mes. */
function isLastDayOfMonth(): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

let cycleManagerTask: ScheduledTask | null = null;
let needDetectorTask: ScheduledTask | null = null;
let decayTask: ScheduledTask | null = null;
let rotationTask: ScheduledTask | null = null;
let autoScaleTask: ScheduledTask | null = null;
let monthlyFeeTask: ScheduledTask | null = null;
let disputeResolutionTask: ScheduledTask | null = null;
let skillPricingTask: ScheduledTask | null = null;
let talentMigrationTask: ScheduledTask | null = null;
let healthCheckTask: ScheduledTask | null = null;
let proposalResolverTask: ScheduledTask | null = null;
let cleanupConversationsTask: ScheduledTask | null = null;
let monthlyRetroTask: ScheduledTask | null = null;
let skillEvolutionTask: ScheduledTask | null = null;
let externalTaskOrchestratorTask: ScheduledTask | null = null;
let candidateAnnouncementTask: ScheduledTask | null = null;
let nightlyResearchTask: ScheduledTask | null = null;
let surveyReminderTask: ScheduledTask | null = null;
let proactiveAgentTask: ScheduledTask | null = null;
let kanbanWatchdogInterval: NodeJS.Timeout | null = null;

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

  // ── Cron: 0 */4 * * * (cada 4 horas) — Cierre e inicio de ciclo ──
  cycleManagerTask = cron.schedule("0 */4 * * *", async () => {
    console.log("[Scheduler] ⚡ Ejecutando cierre/inicio de ciclo…");
    try {
      await runCycleManager(prismaClient, bot);
    } catch (err) {
      console.error("[Scheduler] Error fatal en ciclo:", err);
    }
  });
  console.log("[Scheduler] ⚡ Ciclo programado cada 4 horas (0,4,8,12,16,20)");

  // ── Cron: */15 * * * * (cada 15 min) — Detector de necesidades ──
  needDetectorTask = cron.schedule("*/15 * * * *", async () => {
    try {
      await runNeedDetector(prismaClient, bot);
    } catch (err) {
      console.error("[Scheduler] Error en needDetector:", err);
    }
  });
  console.log("[Scheduler] 🔍 NeedDetector programado cada 15 minutos");

  // ── Cron: 0 3 * * * (XP decay diario para workers) ──
  decayTask = cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] 📉 XP decay diario iniciado (workers)…");
    try {
      await runXpDecay(prismaClient);
    } catch (err) {
      console.error("[Scheduler] Error en XP decay (workers):", err);
    }
  });
  console.log("[Scheduler] 📉 XP decay programado a las 03:00 (diario)");

  // ── Cron: 0 3 * * * (evolución nocturna de skills) ──
  skillEvolutionTask = cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] 🧬 Iniciando evolución nocturna de skills...");
    try {
      await nightlyScan(prismaClient, bot);
      console.log("[Scheduler] 🧬 Evolución de skills completada.");
    } catch (err) {
      console.error("[Scheduler] Error en evolución de skills:", err);
    }
  });
  console.log("[Scheduler] 🧬 Evolución de skills programada a las 03:00 (diario)");

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
  // DISABLED: modelo eliminado en simplificación v4.
  // autoScaleTask = cron.schedule("0 */6 * * *", async () => { ... });

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
  // DISABLED: modelo disputeMessage eliminado en simplificación v4.
  // Reactivar cuando se re-implemente el sistema de disputas.
  // disputeResolutionTask = cron.schedule("*/15 * * * *", async () => { ... });

  // ── Cron: 0 * * * * (cada hora) — Skill Pricing ────────────────────
  // DISABLED: modelo de skill pricing eliminado en simplificación v4.
  // skillPricingTask = cron.schedule("0 * * * *", async () => { ... });

  // ── Cron: 0 4 * * * (4 AM diario) — Talent Migration ──────────────────
  // DISABLED: modelo eliminado en simplificación v4.
  // talentMigrationTask = cron.schedule("0 4 * * *", async () => { ... });

  // ── Cron: */15 * * * * (cada 15 min) — SSH Health Check ─────────────
  healthCheckTask = cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await runHealthCheck(prismaClient);
      if (result.checked > 0) {
        console.log(
          `[HealthCheck] 🔍 ${result.checked} servidores chequeados, ` +
            `${result.failed} fallos, ${result.markedUnreachable} marcados UNREACHABLE.`,
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error en health check:", err);
    }
  });
  console.log("[Scheduler] 🔍 SSH Health Check programado cada 15 minutos");

  // ── Cron: 0 4 * * * (4 AM diario) — Limpieza de conversaciones >90 días ──
  cleanupConversationsTask = cron.schedule("0 4 * * *", async () => {
    console.log("[Scheduler] 🧹 Limpieza de conversaciones antiguas iniciada…");
    try {
      await cleanupOldConversations();
    } catch (err) {
      console.error("[Scheduler] Error en limpieza de conversaciones:", err);
    }
  });
  console.log("[Scheduler] 🧹 Limpieza de conversaciones programada a las 04:00 (diario)");

  // ── Cron: 30 0 * * * (00:30 diario) — Nightly Research Pipeline ──
  nightlyResearchTask = cron.schedule("30 0 * * *", async () => {
    console.log("[Scheduler] 🌙 Iniciando pipeline de investigación nocturna…");
    try {
      const results = await runNightlyResearch(prismaClient);
      const spawned = results.filter((r) => r.status === "spawned").length;
      console.log(
        `[Scheduler] 🌙 Nightly Research: ${spawned}/${results.length} árboles → tareas Kanban creadas.`,
      );
    } catch (err) {
      console.error("[Scheduler] Error en Nightly Research:", err);
    }
  });
  console.log("[Scheduler] 🌙 Nightly Research programado a las 00:30 (diario)");

  // ── Cron: 0 */6 * * * (cada 6 horas) — Survey Reminder (3-day closing) ──
  surveyReminderTask = cron.schedule("0 */6 * * *", async () => {
    try {
      const results = await runSurveyReminders(prismaClient, bot);
      const sent = results.filter((r) => r.sent).length;
      if (results.length > 0) {
        console.log(
          `[Scheduler] 📋 Survey Reminder: ${sent}/${results.length} recordatorios enviados.`,
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error en Survey Reminder:", err);
    }
  });
  console.log("[Scheduler] 📋 Survey Reminder programado cada 6 horas");

  // ── Cron: */30 * * * * (cada 30 min) — Proactive Agent ──
  proactiveAgentTask = cron.schedule("*/30 * * * *", async () => {
    try {
      const results = await runProactiveAgent(prismaClient);
      const triggered = results.filter((r) => r.status === "triggered").length;
      if (results.length > 0) {
        console.log(
          `[Scheduler] 🔔 Proactive Agent: ${triggered}/${results.length} árboles notificados.`,
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error en Proactive Agent:", err);
    }
  });
  console.log("[Scheduler] 🔔 Proactive Agent programado cada 30 minutos");

  // ── Cron: */5 * * * * (cada 5 min) — ExternalTask Orchestrator ──
  externalTaskOrchestratorTask = cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await runExternalTaskOrchestrator(prismaClient, bot);
      // Only log when there's actual work done (silent otherwise)
    } catch (err) {
      console.error("[Scheduler] Error en ExternalTask Orchestrator:", err);
    }
  });
  console.log("[Scheduler] 📋 ExternalTask Orchestrator programado cada 5 minutos");

  // ── Cron: * * * * * (cada minuto) — Candidate Announcement timer ──
  candidateAnnouncementTask = cron.schedule("* * * * *", async () => {
    try {
      const result = await runCandidateAnnouncementCron(prismaClient, bot);
      if (result.remindersSent > 0 || result.pollsCreated > 0) {
        console.log(
          `[Scheduler] 📢 Candidate Announcement: ${result.checked} activos, ` +
            `${result.remindersSent} recordatorios, ${result.pollsCreated} encuestas`,
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error en Candidate Announcement Cron:", err);
    }
  });
  console.log("[Scheduler] 📢 Candidate Announcement Cron programado cada minuto");

  // ── Cron: 0 23 28-31 * * (último día del mes a las 23:00) — Retrospectiva mensual/trimestral ──
  // Internally routes to quarterly if isEndOfQuarter(), otherwise runs monthly.
  monthlyRetroTask = cron.schedule("0 23 28-31 * *", async () => {
    if (!isLastDayOfMonth()) return;

    console.log("[Scheduler] 📊 Último día del mes — ejecutando retrospectiva…");
    try {
      const results = await runMonthlyRetrospective(prismaClient, bot);
      const posted = results.filter((r) => r.reportPosted).length;
      console.log(
        `[Scheduler] 📊 Retrospectiva: ${posted}/${results.length} árboles publicaron reporte.`,
      );
    } catch (err) {
      console.error("[Scheduler] Error fatal en retrospectiva:", err);
    }
  });
  console.log("[Scheduler] 📊 Retrospectiva mensual/trimestral programada al último día de cada mes a las 23:00");

  // DISABLED: modelo proposal eliminado en simplificación v4.
  // proposalResolverTask = cron.schedule("*/2 * * * *", async () => {
  //   try {
  //     const resolutions = await runProposalResolver(prismaClient, bot);
  //     if (resolutions.length > 0) {
  //       console.log(
  //         `[Scheduler] 📋 Proposal Resolver: ${resolutions.length} propuestas resueltas.`,
  //       );
  //     }
  //   } catch (err) {
  //     console.error("[Scheduler] Error en proposal resolver:", err);
  //   }
  // });
  // console.log("[Scheduler] 📋 Proposal Resolver programado cada 2 minutos");

  // ── Kanban Watchdog: 150s interval ──
  kanbanWatchdogInterval = startKanbanWatchdog(prismaClient, bot);

  // ── Hiring Bridge: watcher para hiring-request-*.json en sandboxes ──
  startHiringBridge();

  // ── Dev mode hint ──
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[Scheduler] 🧪 Entorno dev — usa triggerCycleClose() para simular el cierre de ciclo.",
    );
  }
}

/**
 * Dispara el cierre de ciclo manualmente (para testing / desarrollo).
 */
export async function triggerCycleClose(
  prismaClient: PrismaClient,
  bot: Bot<BotContext> | null
) {
  console.log("[Scheduler] 🔧 Cierre de ciclo manual disparado…");
  return runCycleManager(prismaClient, bot);
}

/**
 * Detiene todos los schedulers (para shutdown graceful).
 */
export function stopScheduler(): void {
  let stopped = false;
  for (const task of [cycleManagerTask, needDetectorTask, decayTask, rotationTask, autoScaleTask, monthlyFeeTask, disputeResolutionTask, skillPricingTask, talentMigrationTask, healthCheckTask, proposalResolverTask, cleanupConversationsTask, monthlyRetroTask, skillEvolutionTask, externalTaskOrchestratorTask, candidateAnnouncementTask, nightlyResearchTask, surveyReminderTask, proactiveAgentTask]) {
    if (task) {
      task.stop();
      stopped = true;
    }
  }
  stopKanbanWatchdog(kanbanWatchdogInterval);
  stopHiringBridge();
  cycleManagerTask = null;
  needDetectorTask = null;
  decayTask = null;
  rotationTask = null;
  autoScaleTask = null;
  monthlyFeeTask = null;
  disputeResolutionTask = null;
  skillPricingTask = null;
  talentMigrationTask = null;
  healthCheckTask = null;
  proposalResolverTask = null;
  cleanupConversationsTask = null;
  monthlyRetroTask = null;
  skillEvolutionTask = null;
  externalTaskOrchestratorTask = null;
  candidateAnnouncementTask = null;
  nightlyResearchTask = null;
  surveyReminderTask = null;
  proactiveAgentTask = null;
  kanbanWatchdogInterval = null;
  if (stopped) {
    console.log("[Scheduler] ⏹️ Todos los schedulers detenidos.");
  }
}
