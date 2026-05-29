/**
 * ExternalTask Orchestrator Cron
 *
 * Runs every 5 minutes. Two responsibilities:
 *
 * 1. DELIVERED evaluation -- For each DELIVERED ExternalTask, reads the
 *    deliverable from the sandbox and asks Ari (via Hermes API) to evaluate
 *    whether it meets the task description. Ari returns APPROVE, REJECT, or
 *    FLAG. The cron applies the decision and updates the DB.
 *
 * 2. OPEN timeout -- Tasks in OPEN > 48h without being claimed trigger a
 *    notification to the tree's Telegram group.
 *
 * Pattern follows disputeResolutionCron.ts and monthlyRetrospective.ts.
 */

import type { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";
import { routeToHermes } from "../bot/hermesBridge/route";
import { DB_STRING_FIELD_MAX_CHARS } from "../bot/hermesBridge/constants";
import fs from "fs";
import path from "path";

// -- Constants --

const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
const OPEN_TIMEOUT_HOURS = 48;
const MAX_DELIVERABLE_CHARS = 20_000;
const TIMEOUT_RENOTIFY_HOURS = 24;

// -- Types --

export interface OrchestratorResult {
  taskId: string;
  title: string;
  treeId: string;
  action: "APPROVED" | "REJECTED" | "FLAGGED" | "NOTIFIED" | "ERROR";
  reason?: string;
}

// -- Renotify guard --

/** Track last notification timestamp per task to avoid spam on OPEN timeouts. */
const lastTimeoutNotify = new Map<string, number>();

// -- Deliverable reader --

/**
 * Reads a deliverable file from the sandbox.
 * Returns the text content, or a descriptive placeholder for binary / missing files.
 */
function readDeliverable(deliverableUrl: string | null): string {
  if (!deliverableUrl) {
    return "[No deliverable file uploaded]";
  }

  const fullPath = path.join(SANDBOX_BASE, deliverableUrl);

  try {
    if (!fs.existsSync(fullPath)) {
      return "[File not found at deliverableUrl]";
    }

    const stat = fs.statSync(fullPath);
    if (stat.size > 5 * 1024 * 1024) {
    return `[File too large to evaluate: ${(stat.size / 1024 / 1024).toFixed(1)} MB]`;
    }

    const raw = fs.readFileSync(fullPath, "utf-8");

    if (raw.includes("\x00")) {
      const ext = path.extname(fullPath).toLowerCase();
      return `[Binary file (${ext || "unknown type"}), ${(stat.size / 1024).toFixed(1)} KB -- cannot evaluate content automatically]`;
    }

    if (raw.length > MAX_DELIVERABLE_CHARS) {
      return raw.slice(0, MAX_DELIVERABLE_CHARS) + "\n\n... [truncated -- file too long]";
    }

    return raw;
  } catch (err: any) {
    return `[Error reading file: ${err.message}]`;
  }
}

// -- Evaluation --

/**
 * Sends a DELIVERED task + its deliverable content to Ari for evaluation.
 * Parses the response and applies APPROVE / REJECT to the DB.
 * FLAG results are returned without DB changes (human review needed).
 */
async function evaluateTask(
  prisma: PrismaClient,
  task: any,
): Promise<OrchestratorResult> {
  const deliverableContent = readDeliverable(task.deliverableUrl);

  const skills = Array.isArray(task.skills) ? task.skills : [];
  const skillsStr = skills.length > 0 ? skills.join(", ") : "ninguna especificada";

  const evalPrompt = [
    "=== EVALUACION DE EXTERNAL TASK ===",
    "",
    "Evalua esta ExternalTask DELIVERED y decide: APPROVE, REJECT, o FLAG.",
    "",
    `Titulo: ${task.title}`,
    `Descripcion: ${task.description}`,
    `Skills requeridas: ${skillsStr}`,
    `Presupuesto: ${task.budget} ${task.currency}`,
    "",
    "--- CONTENIDO DEL ENTREGABLE ---",
    deliverableContent,
    "--- FIN DEL ENTREGABLE ---",
    "",
    "REGLAS DE DECISION ESTRICTAS:",
    "1. APPROVE -- La evidencia satisface CLARAMENTE la descripcion. El trabajo esta completo y correcto.",
    "2. REJECT -- La evidencia NO satisface los requisitos. El trabajo esta incompleto, incorrecto, o no coincide con lo pedido.",
    "3. FLAG -- Hay ambiguedad legitima y necesitas revision humana para decidir.",
    "",
    "RESPONDE EXACTAMENTE CON UNO DE ESTOS FORMATOS (nada mas, sin markdown, sin saludos):",
    "APPROVE",
    "REJECT: <razon corta en espanol>",
    "FLAG: <razon corta en espanol>",
    "",
    "Responde ahora:",
  ].join("\n");

  let decision: string;
  try {
    const response = await routeToHermes(
      evalPrompt,
      task.treeId,
      "0",
    );

    if (!response || !response.text) {
      return {
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: "Hermes returned null/empty",
      };
    }
    decision = response.text.trim();
  } catch (err: any) {
    return {
      taskId: task.id,
      title: task.title,
      treeId: task.treeId,
      action: "ERROR",
      reason: `Hermes API error: ${err.message}`,
    };
  }

  // -- Parse Ari's decision --

  const approveMatch = decision.match(/^APPROVE\b/i);
  const rejectMatch = decision.match(/^REJECT:\s*(.+)/is);
  const flagMatch = decision.match(/^FLAG:\s*(.+)/is);

  if (approveMatch) {
    try {
      await prisma.externalTask.update({
        where: { id: task.id },
        data: { status: "APPROVED", approvedBy: "ari" },
      });
    } catch (dbErr: any) {
      return {
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: `DB update failed: ${dbErr.message}`,
      };
    }
    return { taskId: task.id, title: task.title, treeId: task.treeId, action: "APPROVED" };
  }

  if (rejectMatch) {
    const reason = rejectMatch[1].trim().slice(0, DB_STRING_FIELD_MAX_CHARS);
    try {
      await prisma.externalTask.update({
        where: { id: task.id },
        data: { status: "REJECTED", rejectReason: reason },
      });
    } catch (dbErr: any) {
      return {
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: `DB update failed: ${dbErr.message}`,
      };
    }
    return { taskId: task.id, title: task.title, treeId: task.treeId, action: "REJECTED", reason };
  }

  if (flagMatch) {
    const reason = flagMatch[1].trim();
    return { taskId: task.id, title: task.title, treeId: task.treeId, action: "FLAGGED", reason };
  }

  // -- Fallback: fuzzy matching --

  const lower = decision.toLowerCase();

  const hasApprove =
    lower.includes("approve") ||
    lower.includes("aprobado") ||
    lower.includes("apruebo") ||
    lower.includes("cumple");
  const hasReject =
    lower.includes("reject") ||
    lower.includes("rechazo") ||
    lower.includes("rechazar") ||
    lower.includes("no cumple");

  if (hasApprove && !hasReject) {
    try {
      await prisma.externalTask.update({
        where: { id: task.id },
        data: { status: "APPROVED", approvedBy: "ari" },
      });
    } catch (dbErr: any) {
      return {
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: `DB update failed: ${dbErr.message}`,
      };
    }
    return {
      taskId: task.id,
      title: task.title,
      treeId: task.treeId,
      action: "APPROVED",
      reason: "Inferred from fuzzy match",
    };
  }

  if (hasReject && !hasApprove) {
    try {
      await prisma.externalTask.update({
        where: { id: task.id },
        data: { status: "REJECTED", rejectReason: decision.slice(0, DB_STRING_FIELD_MAX_CHARS) },
      });
    } catch (dbErr: any) {
      return {
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: `DB update failed: ${dbErr.message}`,
      };
    }
    return {
      taskId: task.id,
      title: task.title,
      treeId: task.treeId,
      action: "REJECTED",
      reason: "Inferred from fuzzy match",
    };
  }

  // Cannot parse -- flag for human
  return {
    taskId: task.id,
    title: task.title,
    treeId: task.treeId,
    action: "FLAGGED",
    reason: `Respuesta no parseable: ${decision.slice(0, 200)}`,
  };
}

// -- OPEN timeout --

/**
 * Checks for OPEN tasks older than 48h that haven't been claimed.
 * Sends one notification per task per 24h to avoid spam.
 */
async function checkOpenTimeouts(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<OrchestratorResult[]> {
  const cutoff = new Date(Date.now() - OPEN_TIMEOUT_HOURS * 60 * 60 * 1000);
  const renotifyCutoff = Date.now() - TIMEOUT_RENOTIFY_HOURS * 60 * 60 * 1000;

  const staleTasks = await prisma.externalTask.findMany({
    where: {
      status: "OPEN",
      createdAt: { lt: cutoff },
    },
    include: {
      tree: { select: { id: true, name: true, telegramChatId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: OrchestratorResult[] = [];

  for (const task of staleTasks) {
    const lastNotify = lastTimeoutNotify.get(task.id) ?? 0;
    if (lastNotify > renotifyCutoff) {
      continue;
    }

    const chatId = task.tree?.telegramChatId;
    if (!chatId || !bot) {
      results.push({
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: "No Telegram chat for tree",
      });
      continue;
    }

    try {
      const hoursAgo = Math.round(
        (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60),
      );
      const desc =
        task.description.length > 200
          ? task.description.slice(0, 197) + "..."
          : task.description;

      await bot.api.sendMessage(
        chatId,
        "⚠️ *ExternalTask sin reclamar*\n\n" +
        `La tarea *"${task.title}"* lleva ${hoursAgo}h en estado OPEN sin que nadie la haya reclamado.\n\n` +
        `📝 ${desc}\n\n` +
        "¿Alguien del arbol puede tomarla? Revisen /tasks disponibles.",
        { parse_mode: "Markdown" },
      );

      lastTimeoutNotify.set(task.id, Date.now());
      results.push({
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "NOTIFIED",
      });
    } catch (err: any) {
      if (err?.error_code !== 403) {
        console.error(
          `[Orchestrator] Telegram send error for task ${task.id}:`,
          err?.message || err,
        );
      }
      results.push({
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: `Telegram error: ${err.message || err}`,
      });
    }
  }

  return results;
}

// -- Public API --

/**
 * Main orchestrator entry point. Called by the scheduler every 5 minutes.
 */
export async function runExternalTaskOrchestrator(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<{
  evaluations: OrchestratorResult[];
  timeouts: OrchestratorResult[];
}> {
  // 1. Evaluate DELIVERED tasks
  const deliveredTasks = await prisma.externalTask.findMany({
    where: { status: "DELIVERED" },
    orderBy: { updatedAt: "asc" },
  });

  const evaluations: OrchestratorResult[] = [];
  for (const task of deliveredTasks) {
    try {
      const result = await evaluateTask(prisma, task);
      evaluations.push(result);
      console.log(
        `[Orchestrator] ${task.id.slice(0, 8)}: ${result.action}` +
          (result.reason ? ` -- ${result.reason}` : ""),
      );
    } catch (err: any) {
      console.error(`[Orchestrator] Error evaluating ${task.id}:`, err.message || err);
      evaluations.push({
        taskId: task.id,
        title: task.title,
        treeId: task.treeId,
        action: "ERROR",
        reason: err.message,
      });
    }
  }

  // 2. Check OPEN timeouts
  const timeouts = await checkOpenTimeouts(prisma, bot);

  // Log summary
  if (evaluations.length > 0 || timeouts.length > 0) {
    const approved = evaluations.filter((e) => e.action === "APPROVED").length;
    const rejected = evaluations.filter((e) => e.action === "REJECTED").length;
    const flagged = evaluations.filter((e) => e.action === "FLAGGED").length;
    const errors = evaluations.filter((e) => e.action === "ERROR").length;
    console.log(
      `[Orchestrator] ${evaluations.length} evaluated: ` +
        `${approved} approved, ${rejected} rejected, ${flagged} flagged, ${errors} errors. ` +
        `${timeouts.length} timeouts notified.`,
    );
  }

  return { evaluations, timeouts };
}
