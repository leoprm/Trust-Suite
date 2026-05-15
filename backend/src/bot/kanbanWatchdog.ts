/**
 * KA: Kanban Watchdog — polls Hermes kanban board every 150s.
 *
 * Watches BotKanbanTask records (tracked when kanbanBridge creates a task).
 * For each non-done record, queries real status via `hermes kanban show --json`.
 * Notifies the Telegram chat on status changes or every 2 cycles (~5 min)
 * for running tasks. Auto-cleans records whose kanban task no longer exists.
 *
 * Uses setInterval (not node-cron) because the 150s interval doesn't map
 * to a standard cron expression.
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ── Constants ─────────────────────────────────────────────────────────────

const HERMES_BIN = process.env.HERMES_BIN || "hermes";
const WATCHDOG_INTERVAL_MS = 150_000; // 150 seconds (2:30)
const TWO_CYCLES_MS = 300_000; // 2 cycles = 5 min — re-notify running tasks
const EXEC_TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────

interface KanbanShowOutput {
  task: {
    id: string;
    status: string; // "ready" | "running" | "blocked" | "done" | "archived"
    title?: string;
  };
  runs?: Array<{
    outcome: string | null;
    summary: string | null;
    error: string | null;
    started_at: number;
    ended_at: number | null;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format milliseconds into a human-readable duration string. */
function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "<1m";
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${totalMin}m`;
}

// ── Core ──────────────────────────────────────────────────────────────────

/**
 * Check a single tracked task against Hermes kanban board.
 * Returns the message to send, or null if no notification is needed.
 */
async function checkSingleTask(
  prisma: PrismaClient,
  tracked: {
    id: string;
    kanbanTaskId: string;
    chatId: string;
    status: string;
    lastNotifiedAt: Date | null;
    createdAt: Date;
  },
): Promise<{ message: string; newStatus: string } | null> {
  const {
    kanbanTaskId,
    status: storedStatus,
    lastNotifiedAt,
    createdAt,
  } = tracked;

  // 1. Query Hermes for real status
  let stdout: string;
  try {
    const result = await execFileAsync(
      HERMES_BIN,
      ["kanban", "show", kanbanTaskId, "--json"],
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 128 * 1024 },
    );
    stdout = result.stdout;
  } catch (err: any) {
    // Process crashed or timed out — skip this cycle
    console.error(
      `[KanbanWatchdog] Hermes exec failed for ${kanbanTaskId}:`,
      err.message,
    );
    return null;
  }

  // 2. Auto-limpieza: task no longer exists on the board
  if (stdout.includes("no such task")) {
    console.log(
      `[KanbanWatchdog] ${kanbanTaskId} no longer exists — marking done.`,
    );
    return { message: "", newStatus: "done" }; // signal to mark done, no notification
  }

  // 3. Parse real status
  let parsed: KanbanShowOutput;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    console.error(
      `[KanbanWatchdog] Failed to parse JSON for ${kanbanTaskId}:`,
      stdout.substring(0, 120),
    );
    return null;
  }

  const realStatus = parsed.task.status;
  const lastRun = parsed.runs?.[parsed.runs.length - 1];

  // 4. Decide whether to notify
  const statusChanged = realStatus !== storedStatus;

  // For running tasks: re-notify if 2+ cycles (~5 min) have passed since last notification
  const twoCyclesPassed = lastNotifiedAt
    ? Date.now() - new Date(lastNotifiedAt).getTime() > TWO_CYCLES_MS
    : false;

  const shouldNotify =
    statusChanged ||
    (realStatus === "running" && twoCyclesPassed);

  if (!shouldNotify) return null;

  // 5. Build notification message
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedStr = formatDuration(elapsedMs);

  let message = "";

  if (realStatus === "running") {
    message = `⏳ \`${kanbanTaskId}\` sigue trabajando... (⏱ ${elapsedStr})`;
  } else if (realStatus === "blocked") {
    const reason = lastRun?.error || lastRun?.summary || "sin razón especificada";
    message = `⚠️ \`${kanbanTaskId}\` bloqueada: ${reason}`;
  } else if (realStatus === "done") {
    const summary = lastRun?.summary || "";
    const summarySnippet =
      summary.length > 80 ? summary.substring(0, 77) + "..." : summary;
    message = `✅ \`${kanbanTaskId}\` completada en ${elapsedStr}! ${summarySnippet}`;
  } else if (realStatus === "ready") {
    message = `🆕 \`${kanbanTaskId}\` está lista para ser recogida.`;
  } else if (realStatus === "archived") {
    message = `📦 \`${kanbanTaskId}\` fue archivada.`;
    realStatus; // will be marked as done below
  }

  if (!message) return null;

  return { message, newStatus: realStatus };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run one full watchdog cycle: fetch all tracked tasks, check each,
 * send notifications, and update DB.
 */
export async function runWatchdogCycle(
  prisma: PrismaClient,
  bot: Bot<BotContext>,
): Promise<void> {
  const trackedTasks = await (prisma as any).botKanbanTask.findMany({
    where: { status: { not: "done" } },
  });

  if (trackedTasks.length === 0) return;

  let notified = 0;
  let cleaned = 0;

  for (const t of trackedTasks) {
    try {
      const result = await checkSingleTask(prisma, t);

      if (!result) continue; // no notification needed

      const { message, newStatus } = result;
      const isDone = newStatus === "done";

      // Mark done in DB (auto-cleanup or real completion)
      if (isDone) {
        await (prisma as any).botKanbanTask.update({
          where: { id: t.id },
          data: { status: "done", lastNotifiedAt: new Date() },
        });
        cleaned++;
        continue; // don't notify for auto-cleaned tasks
      }

      // Send Telegram notification
      if (message) {
        try {
          await bot.api.sendMessage(t.chatId, message, {
            parse_mode: "Markdown",
          });
          notified++;
        } catch (sendErr: any) {
          if (sendErr?.error_code === 403) {
            // Chat unavailable (group deleted / bot kicked)
            console.log(
              `[KanbanWatchdog] Chat ${t.chatId} unavailable — marking done.`,
            );
            await (prisma as any).botKanbanTask.update({
              where: { id: t.id },
              data: { status: "done" },
            });
            cleaned++;
          } else {
            console.error(
              `[KanbanWatchdog] Send error to ${t.chatId}:`,
              sendErr.message,
            );
          }
        }
      }

      // Sync status + lastNotifiedAt in DB
      await (prisma as any).botKanbanTask.update({
        where: { id: t.id },
        data: {
          status: newStatus,
          lastNotifiedAt: new Date(),
        },
      });
    } catch (err: any) {
      console.error(
        `[KanbanWatchdog] Error processing ${t.kanbanTaskId}:`,
        err.message,
      );
    }
  }

  if (notified > 0 || cleaned > 0) {
    console.log(
      `[KanbanWatchdog] Cycle complete — ${notified} notified, ${cleaned} cleaned.`,
    );
  }
}

/**
 * Start the Kanban watchdog as a setInterval.
 * Returns the interval handle so the scheduler can stop it on shutdown.
 */
export function startKanbanWatchdog(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): NodeJS.Timeout | null {
  if (!bot) {
    console.log("[KanbanWatchdog] Bot not available — watchdog disabled.");
    return null;
  }

  console.log(
    `[KanbanWatchdog] Starting — polling every ${WATCHDOG_INTERVAL_MS / 1000}s`,
  );

  // Run first cycle immediately so users don't wait 2:30 for initial status
  runWatchdogCycle(prisma, bot).catch((err) =>
    console.error("[KanbanWatchdog] Initial cycle error:", err.message),
  );

  const interval = setInterval(() => {
    runWatchdogCycle(prisma, bot).catch((err) =>
      console.error("[KanbanWatchdog] Cycle error:", err.message),
    );
  }, WATCHDOG_INTERVAL_MS);

  return interval;
}

/**
 * Stop the watchdog interval. Idempotent — safe to call with null.
 */
export function stopKanbanWatchdog(
  interval: NodeJS.Timeout | null,
): void {
  if (interval) {
    clearInterval(interval);
    console.log("[KanbanWatchdog] Stopped.");
  }
}
