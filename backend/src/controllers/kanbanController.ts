import { Request, Response } from 'express';
import https from 'https';
import { prisma } from '../index';

// ── Types ────────────────────────────────────────────────────────────────────────

interface KanbanWebhookBody {
  task_id: string;
  treeId: string;
  status: 'done' | 'failed' | 'blocked';
  summary?: string;
  assignee?: string;
}

interface KanbanBatchBody {
  treeId: string;
  totalTasks: number;
  results?: Array<{
    assignee?: string;
    summary?: string;
    description?: string;
    task_id?: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  const body = JSON.stringify({ chat_id: chatId, text });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            const data = JSON.parse(raw);
            if (!data.ok) {
              reject(
                new Error(
                  `Telegram API error ${data.error_code}: ${data.description}`,
                ),
              );
            } else {
              resolve();
            }
          } catch {
            reject(new Error(`Telegram API non-JSON response: ${raw.slice(0, 200)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Telegram API timeout (10s)'));
    });
    req.end(body);
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/kanban-webhook
 *
 * Called by Hermes Kanban dispatcher when a task reaches terminal state.
 * Notifies the linked Tree's Telegram chat with the task result.
 *
 * Body: { task_id, treeId, status, summary?, assignee? }
 */
export const kanbanWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { task_id, treeId, status, summary, assignee } =
      req.body as KanbanWebhookBody;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!task_id || !treeId || !status) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // ── Only notify on "done" status ──────────────────────────────────────────
    if (status !== 'done') {
      res.json({ received: true, action: 'ignored' });
      return;
    }

    // ── Look up tree ──────────────────────────────────────────────────────────
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree?.telegramChatId) {
      res.json({ received: true, action: 'no_chat' });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error('[kanbanWebhook] TELEGRAM_BOT_TOKEN not set');
      res.status(500).json({ error: 'Telegram bot token not configured' });
      return;
    }

    // ── Build notification message ────────────────────────────────────────────
    const msg =
      'Tarea completada: ' + task_id + '\n' +
      'Assignee: ' + (assignee || 'worker') + '\n' +
      (summary ? summary.substring(0, 300) + '\n\n' : '\n') +
      'Ari, incorpora este resultado en tu respuesta.';

    // ── Send Telegram notification ────────────────────────────────────────────
    try {
      await sendTelegramMessage(token, tree.telegramChatId, msg);
      console.log(
        `[kanbanWebhook] Notification sent to tree ${treeId.slice(0, 8)}… chat ${tree.telegramChatId}`,
      );
      res.json({ received: true, action: 'notified' });
    } catch (err: any) {
      console.error('[kanbanWebhook] Telegram send error:', err?.message || err);
      res.status(500).json({ error: 'Failed to send Telegram notification' });
    }
  } catch (err: any) {
    console.error('[kanbanWebhook] Unexpected error:', err?.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/kanban-webhook/batch
 *
 * Called when ALL Kanban tasks for a tree have completed.
 * Notifies Ari via Telegram to deliver the final aggregated response.
 *
 * Body: { treeId, totalTasks, results?: [{ assignee?, summary?, description?, task_id? }] }
 */
export const kanbanBatchWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { treeId, totalTasks, results } = req.body as KanbanBatchBody;

    if (!treeId || !totalTasks) {
      res.status(400).json({ error: 'Missing treeId or totalTasks' });
      return;
    }

    // ── Look up tree ──────────────────────────────────────────────────────────
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree?.telegramChatId) {
      res.json({ received: true, action: 'no_chat' });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error('[kanbanBatchWebhook] TELEGRAM_BOT_TOKEN not set');
      res.status(500).json({ error: 'Telegram bot token not configured' });
      return;
    }

    // ── Build batch completion message ────────────────────────────────────────
    const resultsStr = Array.isArray(results)
      ? results
          .map(
            (r) =>
              `- ${r.assignee || 'worker'}: ${r.summary || r.description || '(completada)'}`,
          )
          .join('\n')
      : JSON.stringify(results ?? {});

    const msg =
      `✔️ Todas las tareas completadas (${totalTasks}/${totalTasks}).\n\n` +
      `Resultados:\n${resultsStr}\n\n` +
      `Ari, entrega la respuesta final al usuario.`;

    // ── Send Telegram notification ────────────────────────────────────────────
    try {
      await sendTelegramMessage(token, tree.telegramChatId, msg);
      console.log(
        `[kanbanBatchWebhook] Batch notification sent to tree ${treeId.slice(0, 8)}… chat ${tree.telegramChatId}`,
      );
      res.json({ received: true, action: 'notified' });
    } catch (err: any) {
      console.error('[kanbanBatchWebhook] Telegram send error:', err?.message || err);
      res.status(500).json({ error: 'Failed to send Telegram notification' });
    }
  } catch (err: any) {
    console.error('[kanbanBatchWebhook] Unexpected error:', err?.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
