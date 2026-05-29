/**
 * KA-2.1: Kanban Bridge.
 *
 * Bridge between Telegram bot messages and the Hermes Kanban task system.
 * When the complexity detector flags a query or the concierge can't answer,
 * this module creates a kanban task for async processing by a specialist agent.
 */

import { exec } from "child_process";
import { PrismaClient } from "@prisma/client";
import { writeDlqEntry } from "./hermesBridge/kanban-dlq";

// ── Constants ─────────────────────────────────────────────────────────────

const HERMES_BIN = process.env.HERMES_BIN || "hermes";
const EXEC_TIMEOUT_MS = 10_000; // 10 seconds
const TITLE_MAX_CHARS = 80;
const KANBAN_TASK_ID_REGEX = /t_[a-f0-9]+/;

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrackedTask {
  kanbanTaskId: string;
  status: string;
  createdAt: Date;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Create a kanban task for async specialist processing.
 *
 * Spawns `hermes kanban create` with the user's message, treeId, and chatId
 * embedded in the task body so the assigned worker knows where to respond.
 *
 * Returns the kanban task ID on success, or null on failure (caller should
 * fallback to concierge).
 */
export async function createKanbanTask(
  prisma: PrismaClient,
  message: string,
  treeId: string,
  chatId: string,
): Promise<string | null> {
  // ── 1. Build title: "Consulta: <first 80 chars>" ────────────────────
  const truncated = message.substring(0, TITLE_MAX_CHARS).replace(/\n/g, " ");
  const title = `Consulta: ${truncated}`;

  // ── 2. Build body with context for the worker ────────────────────────
  const body = [
    `**Tree:** ${treeId}`,
    `**Chat:** ${chatId}`,
    ``,
    `> ${message}`,
  ].join("\n");

  // Shell-escape single quotes inside title and body
  const safeTitle = title.replace(/'/g, "'\\''");
  const safeBody = body.replace(/'/g, "'\\''");

  const command =
    `${HERMES_BIN} kanban create '${safeTitle}' ` +
    `--assignee backend-eng ` +
    `--workspace 'dir:/home/leo/Documentos/TrustMaker/backend' ` +
    `--body '${safeBody}'`;

  // ── 3. Execute with 10s timeout ─────────────────────────────────────
  let stdout: string;
  try {
    stdout = await new Promise<string>((resolve, reject) => {
      exec(command, { timeout: EXEC_TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error) {
          writeDlqEntry({
            timestamp: new Date().toISOString(),
            operation: "kanban create",
            tree_id: treeId,
            chat_id: chatId,
            error: (stderr || error.message).slice(0, 500),
          });
          resolve(""); // Any failure → null
          return;
        }
        resolve(stdout);
      });
    });
  } catch {
    return null;
  }

  if (!stdout) {
    writeDlqEntry({
      timestamp: new Date().toISOString(),
      operation: "kanban create",
      tree_id: treeId,
      chat_id: chatId,
      error: "hermes kanban create returned empty stdout",
    });
    return null;
  }

  // ── 4. Parse task ID from stdout using regex ─────────────────────────
  const match = stdout.match(KANBAN_TASK_ID_REGEX);
  if (!match) {
    writeDlqEntry({
      timestamp: new Date().toISOString(),
      operation: "kanban create",
      tree_id: treeId,
      chat_id: chatId,
      error: `Could not parse task ID from stdout: ${stdout.slice(0, 200)}`,
    });
    return null;
  }

  const kanbanTaskId = match[0];

  // ── 5. Auto-claim: claim the task so a worker picks it up immediately ─
  try {
    await new Promise<void>((resolve) => {
      exec(
        `${HERMES_BIN} kanban claim ${kanbanTaskId}`,
        { timeout: EXEC_TIMEOUT_MS },
        (error) => {
          if (error) {
            console.error(
              `[kanbanBridge] Claim failed for ${kanbanTaskId}:`,
              error.message,
            );
          }
          resolve(); // Non-blocking — task exists even if claim fails
        },
      );
    });
  } catch {
    // Non-blocking
  }

  // ── 6. Persist to DB ─────────────────────────────────────────────────
  try {
    await prisma.botKanbanTask.create({
      data: {
        kanbanTaskId,
        chatId,
        status: "running",
      },
    });
  } catch (err: any) {
    console.error(
      `[kanbanBridge] DB write failed for ${kanbanTaskId}:`,
      err.message,
    );
    // Task was created in kanban — return the ID anyway
  }

  return kanbanTaskId;
}

/**
 * Return all kanban task IDs tracked for a given Telegram chat.
 * Used by the watchdog to build per-chat progress summaries.
 */
export async function getTasksForChat(
  prisma: PrismaClient,
  chatId: string,
): Promise<string[]> {
  const records = await prisma.botKanbanTask.findMany({
    where: { chatId, status: { not: "done" } },
    select: { kanbanTaskId: true },
  });
  return records.map((r: any) => r.kanbanTaskId);
}
