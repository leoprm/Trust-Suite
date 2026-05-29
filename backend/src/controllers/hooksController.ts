import { Request, Response } from 'express';
import { execSync } from 'child_process';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

const HERMES_BIN = process.env.HERMES_BIN || "hermes";

// ── Helper: internal HTTP POST to /api/bot/send-message ────────────────────────
async function notifyTreeChat(treeId: string, text: string): Promise<void> {
  try {
    const port = process.env.PORT || 3100;
    const resp = await fetch(`http://127.0.0.1:${port}/api/bot/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.HERMES_API_SERVER_KEY || ''}`,
      },
      body: JSON.stringify({ treeId, text }),
    });
    if (!resp.ok) {
      console.error(`[hooks] notifyTreeChat failed: ${resp.status} — ${await resp.text()}`);
    } else {
      console.log(`[hooks] notifyTreeChat OK: treeId=${treeId}`);
    }
  } catch (err: any) {
    console.error(`[hooks] notifyTreeChat error: ${err.message}`);
  }
}

/**
 * POST /api/hooks/external-task-completed
 *
 * Called by Hermes Kanban dispatcher (or external system) when an ExternalTask
 * reaches terminal state. Completes or blocks the linked Kanban task via CLI.
 *
 * Body: { externalTaskId, status, kanbanTaskId, kanbanBoard }
 *   status: APPROVED | REJECTED
 * Auth: x-api-key header must match INTERNAL_API_KEY env var.
 */
export const externalTaskCompleted = async (req: Request, res: Response) => {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────────
    const apiKey = req.headers['x-api-key'];
    if (!INTERNAL_API_KEY || apiKey !== INTERNAL_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: invalid API key' });
    }

    // ── Parse body ──────────────────────────────────────────────────────────────
    const { externalTaskId, status, kanbanTaskId, kanbanBoard } = req.body;

    if (!externalTaskId || !status) {
      return res.status(400).json({ error: 'externalTaskId and status are required' });
    }

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
    }

    // ── No Kanban linkage: manual ExternalTask, just log ────────────────────────
    if (!kanbanTaskId || !kanbanBoard) {
      console.log(
        `[hooks] ExternalTask ${externalTaskId} ${status} — no Kanban linkage, skipping CLI call`
      );
      return res.json({
        ok: true,
        message: `ExternalTask ${externalTaskId} ${status} — logged (no Kanban linkage)`,
      });
    }

    // ── Execute Hermes Kanban CLI ───────────────────────────────────────────────
    try {
      if (status === 'APPROVED') {
        const cmd = `${HERMES_BIN} kanban complete ${kanbanTaskId} --summary "Approved via ExternalTask ${externalTaskId}"`;
        console.log(`[hooks] Executing: ${cmd}`);
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 });
        console.log(`[hooks] Output: ${output.trim()}`);
      } else {
        const cmd = `${HERMES_BIN} kanban block ${kanbanTaskId} "Rechazado"`;
        console.log(`[hooks] Executing: ${cmd}`);
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 });
        console.log(`[hooks] Output: ${output.trim()}`);
      }
    } catch (cmdErr: any) {
      console.error(`[hooks] CLI error for ${kanbanTaskId}:`, cmdErr.message);
      return res.status(500).json({
        error: 'Kanban CLI command failed',
        details: cmdErr.message,
        stderr: cmdErr.stderr?.toString() || '',
      });
    }

    return res.json({
      ok: true,
      message: `Kanban task ${kanbanTaskId} ${status === 'APPROVED' ? 'completed' : 'blocked'}`,
    });
  } catch (err: any) {
    console.error('[hooks] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

/**
 * POST /api/hooks/kanban-task-completed
 *
 * Called by Hermes Kanban dispatcher webhook when a Kanban task reaches
 * terminal state. Notifies the tree's Telegram chat.
 *
 * Body: { taskId, title, status, treeId, assignee }
 * Auth: x-api-key header must match INTERNAL_API_KEY env var.
 */
export const kanbanTaskCompleted = async (req: Request, res: Response) => {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const apiKey = req.headers['x-api-key'];
    if (!INTERNAL_API_KEY || apiKey !== INTERNAL_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: invalid API key' });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const { taskId, title, status, treeId, assignee } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const emoji = status === 'done' ? '✅' : status === 'blocked' ? '🚫' : '📋';
    const statusText = status === 'done' ? 'completada' : status === 'blocked' ? 'bloqueada' : status;
    const taskTitle = title || taskId;
    const byWho = assignee ? ` por *${assignee}*` : '';

    const message = `${emoji} Tarea ${statusText}${byWho}: ${taskTitle}`;

    // ── Notify tree chat if treeId provided ───────────────────────────────────
    if (treeId) {
      await notifyTreeChat(treeId, message);
    } else {
      console.log(`[hooks] Kanban task ${taskId} ${status} — no treeId, skipping notification`);
    }

    console.log(`[hooks] Kanban task completed: ${taskId} → ${status} (treeId=${treeId || 'none'})`);

    return res.json({ ok: true, message, taskId, status });
  } catch (err: any) {
    console.error('[hooks] kanbanTaskCompleted error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
