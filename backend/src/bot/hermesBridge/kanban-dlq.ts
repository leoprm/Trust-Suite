/**
 * Kanban Dead-Letter Queue — writes failed kanban checks to kanban_dlq.json.
 *
 * When Hermes kanban CLI calls fail (spawn errors, JSON parse failures,
 * timeouts), the failure is recorded as a JSONL entry in the tree's sandbox
 * DLQ file.  The system prompt builder reads this file and injects a warning
 * so Ari knows to investigate.
 */

import fs from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────

export interface DlqEntry {
  timestamp: string;   // ISO-8601
  operation: string;   // "kanban show", "kanban create", "kanban list"
  task_id?: string;    // optional — task ID if applicable
  tree_id: string;
  chat_id?: string;
  error: string;       // error message or stderr
}

// ── Constants ─────────────────────────────────────────────────────────────

const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
const DLQ_FILENAME = "kanban_dlq.json";
const DLQ_MAX_ENTRIES = 100; // keep file from growing unbounded

// ── Helpers ───────────────────────────────────────────────────────────────

/** Resolve the DLQ file path for a given tree id. */
export function dlqPath(treeId: string): string {
  return path.join(SANDBOX_BASE, treeId, DLQ_FILENAME);
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Append a failed kanban check to the dead-letter queue.
 *
 * If the DLQ file already has DLQ_MAX_ENTRIES or more entries, the oldest
 * entries are trimmed before appending (FIFO cap).
 */
export function writeDlqEntry(entry: DlqEntry): void {
  const filePath = dlqPath(entry.tree_id);
  const line = JSON.stringify(entry) + "\n";

  try {
    // Ensure sandbox directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing entries
    let existing: string[] = [];
    if (fs.existsSync(filePath)) {
      try {
        existing = fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
      } catch {
        existing = [];
      }
    }

    // FIFO cap: keep at most DLQ_MAX_ENTRIES - 1 before appending
    if (existing.length >= DLQ_MAX_ENTRIES) {
      existing = existing.slice(existing.length - (DLQ_MAX_ENTRIES - 1));
    }

    existing.push(JSON.stringify(entry));
    fs.writeFileSync(filePath, existing.join("\n") + "\n", "utf-8");
  } catch (err: any) {
    console.error(`[kanban-dlq] Failed to write DLQ entry for tree ${entry.tree_id}:`, err.message);
  }
}

/**
 * Read all DLQ entries for a tree.
 * Returns parsed entries (most recent first), or null if file doesn't exist
 * or is empty/unreadable.
 */
export function readDlqEntries(treeId: string): DlqEntry[] | null {
  const filePath = dlqPath(treeId);

  if (!fs.existsSync(filePath)) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return null;
  }

  if (!raw) return null;

  const entries: DlqEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }

  if (entries.length === 0) return null;

  // Most recent first
  entries.reverse();
  return entries;
}

/**
 * Build a compact DLQ warning string for injection into the system prompt.
 * Returns null if there are no DLQ entries or the file doesn't exist.
 */
export function buildDlqWarning(treeId: string): string | null {
  const entries = readDlqEntries(treeId);
  if (!entries) return null;

  const lines: string[] = [];
  lines.push("");
  lines.push("═══ DEAD-LETTER QUEUE — failed kanban operations ═══");
  lines.push(`There are ${entries.length} failed kanban check(s) in the dead-letter queue:`);

  // Show most recent 5, summarize the rest
  const shown = entries.slice(0, 5);
  for (const e of shown) {
    const taskStr = e.task_id ? ` [${e.task_id}]` : "";
    const errorSnippet = e.error.length > 120
      ? e.error.slice(0, 117) + "..."
      : e.error;
    lines.push(`  - ${e.timestamp} | ${e.operation}${taskStr}: ${errorSnippet}`);
  }

  if (entries.length > 5) {
    lines.push(`  ... and ${entries.length - 5} more (oldest first).`);
  }

  lines.push("");
  lines.push("These operations failed and may need manual investigation. Use the sandbox");
  lines.push("tools to inspect or clear the DLQ file at: memory/kanban_dlq.json");

  return lines.join("\n");
}

/**
 * Clear the DLQ file for a tree.  Returns true if the file was removed,
 * false if it didn't exist.
 */
export function clearDlq(treeId: string): boolean {
  const filePath = dlqPath(treeId);

  if (!fs.existsSync(filePath)) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}
