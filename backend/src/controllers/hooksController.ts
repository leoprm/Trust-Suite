import { Request, Response } from 'express';
import { execSync } from 'child_process';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

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
        const cmd = `hermes kanban complete ${kanbanTaskId} --summary "Approved via ExternalTask ${externalTaskId}"`;
        console.log(`[hooks] Executing: ${cmd}`);
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 });
        console.log(`[hooks] Output: ${output.trim()}`);
      } else {
        const cmd = `hermes kanban block ${kanbanTaskId} "Rechazado"`;
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
