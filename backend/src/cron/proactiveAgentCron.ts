/**
 * Proactive Agent Cron — habilita mensajería proactiva de Ari.
 *
 * Cada 30 minutos, para cada árbol con telegramChatId:
 *   1. Revisa deadlines próximos (necesidades por cerrar, votaciones)
 *   2. Lee <sandbox>/proactive-tasks.json (tareas auto-agendadas por Ari)
 *   3. Si hay algo pendiente, llama a POST /api/bot/proactive-message
 */

import fs from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
const PROACTIVE_ENDPOINT =
  process.env.PROACTIVE_ENDPOINT || "http://127.0.0.1:3100/api/bot/proactive-message";
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

// ── Types ─────────────────────────────────────────────────────────────────

interface ProactiveTask {
  scheduledAt: string;
  chatId: string;
  instruction: string;
}

interface ProactiveTasksFile {
  tasks: ProactiveTask[];
}

interface DeadlineCheck {
  treeId: string;
  treeName: string;
  chatId: string;
  instruction: string;
}

interface ProactiveAgentResult {
  treeName: string;
  treeId: string;
  status: "triggered" | "skipped" | "error";
  instruction?: string;
  error?: string;
}

// ── Sandbox helpers ──────────────────────────────────────────────────────

function getSandboxDir(treeId: string): string {
  return path.join(SANDBOX_BASE, treeId);
}

function readProactiveTasks(treeId: string): ProactiveTask[] {
  const filePath = path.join(getSandboxDir(treeId), "proactive-tasks.json");
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return [];
    const data: ProactiveTasksFile = JSON.parse(raw);
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch {
    return [];
  }
}

/**
 * Marca tareas como procesadas y reescribe el archivo.
 * Solo mantiene tareas futuras (scheduledAt > now).
 */
function cleanupProcessedTasks(treeId: string, processedCount: number): void {
  const tasks = readProactiveTasks(treeId);
  if (tasks.length === 0) return;

  const now = new Date();
  const remaining = tasks.filter((t) => new Date(t.scheduledAt) > now);

  const filePath = path.join(getSandboxDir(treeId), "proactive-tasks.json");

  if (remaining.length === 0) {
    try { fs.unlinkSync(filePath); } catch { /* best-effort */ }
  } else if (remaining.length < tasks.length) {
    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify({ tasks: remaining }, null, 2) + "\n",
        "utf-8",
      );
    } catch { /* best-effort */ }
  }
}

// ── Deadline checks ──────────────────────────────────────────────────────

/**
 * Checks for upcoming deadlines that warrant proactive notification.
 * Scans for:
 *   1. Needs in "vote" phase whose votingEndsAt is within 6 hours
 *   2. Open needs without recent activity (stale)
 */
async function checkNeedDeadlines(
  prisma: PrismaClient,
): Promise<DeadlineCheck[]> {
  const results: DeadlineCheck[] = [];
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  for (const tree of trees) {
    if (!tree.telegramChatId) continue;

    // Needs in vote phase with upcoming voting deadline
    const votingNeeds = await prisma.need.findMany({
      where: {
        treeId: tree.id,
        status: "OPEN",
        cyclePhase: "vote",
        votingEndsAt: { not: null, lte: sixHoursFromNow, gte: now },
      },
      select: { title: true, votingEndsAt: true },
    });

    for (const need of votingNeeds) {
      if (!need.votingEndsAt) continue;
      const hoursLeft = Math.round(
        (need.votingEndsAt.getTime() - now.getTime()) / (60 * 60 * 1000),
      );
      results.push({
        treeId: tree.id,
        treeName: tree.name,
        chatId: tree.telegramChatId,
        instruction:
          `La votación para "${need.title}" cierra en ${hoursLeft} hora(s). ` +
          `Recuérdale al grupo que voten antes de que se acabe el plazo. Sé breve y motivador.`,
      });
    }

    // Stale OPEN needs — created > 7 days ago, no dailyVotes
    const staleNeeds = await prisma.need.findMany({
      where: {
        treeId: tree.id,
        status: "OPEN",
        dailyVotes: 0,
        createdAt: { lte: sevenDaysAgo },
      },
      select: { title: true, createdAt: true },
      take: 2,
    });

    if (staleNeeds.length > 0) {
      results.push({
        treeId: tree.id,
        treeName: tree.name,
        chatId: tree.telegramChatId,
        instruction:
          `Hay ${staleNeeds.length} necesidad(es) sin votos en más de 7 días: ` +
          staleNeeds.map((n) => `"${n.title}"`).join(", ") +
          `. Anima al grupo a participar en la votación o a proponer ideas. Sé breve.`,
      });
    }
  }

  return results;
}

// ── Proactive task processing ────────────────────────────────────────────

/**
 * Revisa proactive-tasks.json en el sandbox. Ejecuta tareas cuyo
 * scheduledAt ya pasó (con 5 min de margen).
 */
async function checkProactiveTasks(
  prisma: PrismaClient,
): Promise<DeadlineCheck[]> {
  const results: DeadlineCheck[] = [];
  const now = new Date();
  const margin = 5 * 60 * 1000; // 5 min margin

  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  for (const tree of trees) {
    if (!tree.telegramChatId) continue;

    const tasks = readProactiveTasks(tree.id);
    const due = tasks.filter(
      (t) => new Date(t.scheduledAt).getTime() - margin <= now.getTime(),
    );

    for (const task of due) {
      results.push({
        treeId: tree.id,
        treeName: tree.name,
        chatId: task.chatId || tree.telegramChatId,
        instruction: task.instruction,
      });
    }
  }

  return results;
}

// ── Hermes invocation ────────────────────────────────────────────────────

async function invokeProactiveMessage(
  treeId: string,
  chatId: string,
  instruction: string,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min

  try {
    const response = await fetch(PROACTIVE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SERVER_KEY}`,
      },
      body: JSON.stringify({ treeId, chatId, instruction }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[ProactiveAgent] HTTP ${response.status} for tree ${treeId.slice(0, 8)}: ${errorText.slice(0, 200)}`,
      );
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      console.error(
        `[ProactiveAgent] Fetch failed for tree ${treeId.slice(0, 8)}: ${err.message}`,
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Deduplication ────────────────────────────────────────────────────────

/**
 * Deduplica instrucciones por treeId, manteniendo solo la primera.
 * Múltiples deadlines para el mismo árbol se fusionan en una sola invocación.
 */
function deduplicateByTree(checks: DeadlineCheck[]): DeadlineCheck[] {
  const seen = new Set<string>();
  return checks.filter((c) => {
    if (seen.has(c.treeId)) return false;
    seen.add(c.treeId);
    return true;
  });
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Entry point. Llamado por el scheduler cada 30 minutos.
 */
export async function runProactiveAgent(
  prisma: PrismaClient,
): Promise<ProactiveAgentResult[]> {
  console.log("[ProactiveAgent] 🔔 Iniciando revisión proactiva…");

  // 1. Check proactive-tasks.json
  const proactiveChecks = await checkProactiveTasks(prisma);

  // 2. Check need deadlines
  const deadlineChecks = await checkNeedDeadlines(prisma);

  // Merge and deduplicate
  const allChecks = deduplicateByTree([...proactiveChecks, ...deadlineChecks]);

  if (allChecks.length === 0) {
    console.log("[ProactiveAgent] ✅ Nada pendiente.");
    return [];
  }

  console.log(
    `[ProactiveAgent] 📋 ${allChecks.length} árbol(es) con mensajes pendientes.`,
  );

  const results: ProactiveAgentResult[] = [];

  for (const check of allChecks) {
    try {
      await invokeProactiveMessage(check.treeId, check.chatId, check.instruction);

      // Cleanup processed tasks from proactive-tasks.json
      cleanupProcessedTasks(check.treeId, 1);

      results.push({
        treeName: check.treeName,
        treeId: check.treeId,
        status: "triggered",
        instruction: check.instruction.slice(0, 80) + "...",
      });

      console.log(
        `[ProactiveAgent] 📨 ${check.treeName}: mensaje proactivo enviado.`,
      );

      // Brief delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      console.error(
        `[ProactiveAgent] ❌ ${check.treeName}: ${err.message}`,
      );
      results.push({
        treeName: check.treeName,
        treeId: check.treeId,
        status: "error",
        error: err.message,
      });
    }
  }

  const triggered = results.filter((r) => r.status === "triggered").length;
  const errors = results.filter((r) => r.status === "error").length;
  console.log(
    `[ProactiveAgent] 🔔 Revisión completada: ${triggered} mensajes enviados, ${errors} errores.`,
  );

  return results;
}
