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
import { getTasksForChat } from "./kanbanBridge";

const execFileAsync = promisify(execFile);

// ── Constants ─────────────────────────────────────────────────────────────

const HERMES_BIN = process.env.HERMES_BIN || "hermes";
const WATCHDOG_INTERVAL_MS = 150_000; // 150 seconds (2:30)
const TWO_CYCLES_MS = 300_000; // 2 cycles = 5 min — re-notify running tasks
const EXEC_TIMEOUT_MS = 10_000;
const RATE_LIMIT_MS = 60_000; // max 1 progress summary per minute per chat

// Rate-limit tracker: chatId → timestamp of last summary notification
const lastSummaryNotification = new Map<string, number>();

/** Exported for testing: returns true if notification is allowed for this chat. */
export function rateLimitGate(chatId: string): boolean {
  const last = lastSummaryNotification.get(chatId) || 0;
  if (Date.now() - last < RATE_LIMIT_MS) return false;
  lastSummaryNotification.set(chatId, Date.now());
  return true;
}

/** Exported for testing: reset all rate-limit state. */
export function resetRateLimits(): void {
  lastSummaryNotification.clear();
}

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
export async function checkSingleTask(
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

/**
 * Build and send a per-chat aggregate progress summary.
 *
 * Fetches ALL kanban tasks via `hermes kanban list --json`, filters to
 * only the tasks tracked for each chat (via getTasksForChat), counts
 * statuses, and sends a formatted summary. Rate-limited: 1 per minute
 * per chat_id.
 *
 * Called at the end of runWatchdogCycle for every chat that had at
 * least one individual task notification this cycle.
 */
export async function notifyProgress(
  prisma: PrismaClient,
  bot: Bot<BotContext>,
  chatIds: Set<string>,
): Promise<void> {
  if (chatIds.size === 0) return;

  // 1. Fetch all kanban tasks once (single CLI call)
  let allTasks: Array<{ id: string; status: string; title?: string }>;
  try {
    const result = await execFileAsync(
      HERMES_BIN,
      ["kanban", "list", "--json"],
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 512 * 1024 },
    );
    allTasks = JSON.parse(result.stdout.trim());
  } catch (err: any) {
    console.error(
      "[KanbanWatchdog] Failed to fetch kanban list for summary:",
      err.message,
    );
    return;
  }

  if (!Array.isArray(allTasks)) return;

  // 2. Build lookup maps: taskId → status, taskId → title
  const statusMap = new Map<string, string>();
  const titleMap = new Map<string, string>();
  for (const t of allTasks) {
    if (t?.id) {
      statusMap.set(t.id, t.status || "unknown");
      titleMap.set(t.id, t.title || t.id);
    }
  }

  // 3. For each chat, build and send the progress summary
  for (const chatId of Array.from(chatIds)) {
    // Rate limit check
    if (!rateLimitGate(chatId)) continue;

    const taskIds = await getTasksForChat(prisma, chatId);
    if (taskIds.length === 0) continue;

    // Count statuses
    let doneCount = 0;
    const running: string[] = [];
    const pending: string[] = [];
    const blocked: string[] = [];

    for (const tid of taskIds) {
      const status = statusMap.get(tid);
      const label = titleMap.get(tid) || tid;
      // Truncate long titles for readability
      const shortLabel = label.length > 40 ? label.substring(0, 37) + "..." : label;

      switch (status) {
        case "done":
          doneCount++;
          break;
        case "running":
          running.push(shortLabel);
          break;
        case "ready":
          pending.push(shortLabel);
          break;
        case "blocked":
          blocked.push(shortLabel);
          break;
        default:
          // archived, unknown — count as done/dead
          doneCount++;
          break;
      }
    }

    const total = taskIds.length;
    const parts: string[] = [];
    parts.push(`📊 Progreso: ✓ ${doneCount}/${total} tareas`);

    if (running.length) {
      parts.push(`● corriendo: ${running.join(", ")}`);
    }
    if (pending.length) {
      parts.push(`◻ pendientes: ${pending.join(", ")}`);
    }
    if (blocked.length) {
      parts.push(`⊗ bloqueadas: ${blocked.join(", ")}`);
    }

    const message = parts.join(" | ");

    try {
      await bot.api.sendMessage(chatId, message);
      console.log(`[KanbanWatchdog] Summary sent to ${chatId}`);
    } catch (sendErr: any) {
      if (sendErr?.error_code !== 403) {
        console.error(
          `[KanbanWatchdog] Summary send error to ${chatId}:`,
          sendErr.message,
        );
      }
    }
  }
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
  const trackedTasks = await prisma.botKanbanTask.findMany({
    where: { status: { not: "done" } },
  });

  if (trackedTasks.length === 0) return;

  let notified = 0;
  let cleaned = 0;
  const notifiedChats = new Set<string>();

  for (const t of trackedTasks) {
    try {
      const result = await checkSingleTask(prisma, t);

      if (!result) continue; // no notification needed

      const { message, newStatus } = result;
      const isDone = newStatus === "done";

      // Mark done in DB (auto-cleanup or real completion)
      if (isDone) {
        await prisma.botKanbanTask.update({
          where: { id: t.id },
          data: { status: "done", lastNotifiedAt: new Date() },
        });
        cleaned++;
        // Only skip notification for auto-clean (no message) — real
        // completions still get the ✅ notification below
        if (!message) continue;
      }

      // Send Telegram notification
      if (message) {
        try {
          await bot.api.sendMessage(t.chatId, message, {
            parse_mode: "Markdown",
          });
          notified++;
          notifiedChats.add(t.chatId);
        } catch (sendErr: any) {
          if (sendErr?.error_code === 403) {
            // Chat unavailable (group deleted / bot kicked)
            console.log(
              `[KanbanWatchdog] Chat ${t.chatId} unavailable — marking done.`,
            );
            await prisma.botKanbanTask.update({
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
      await prisma.botKanbanTask.update({
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

  // ── Aggregate progress summary per notified chat ──
  if (notifiedChats.size > 0) {
    await notifyProgress(prisma, bot, notifiedChats);
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
