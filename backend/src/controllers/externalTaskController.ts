import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';

// ── Sandbox base for deliverable storage ──────────────────────────────────────
const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || '/home/trustmaker/trees';

/** Verify user is member of a tree. Returns 403 JSON if not. */
async function requireTreeMembership(userId: string, treeId: string, res: Response): Promise<boolean> {
  const member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { status: true },
  });
  if (!member) {
    res.status(403).json({ error: 'Tree membership required' });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. POST /api/external-tasks — Create
// ═══════════════════════════════════════════════════════════════════════════════
export const createExternalTask = async (req: Request, res: Response) => {
  try {
    const { treeId, title, description, skills, budget, currency, kanbanTaskId, kanbanBoard } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (string) is required' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title (string) is required' });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description (string) is required' });
    }
    if (budget === undefined || budget === null || typeof budget !== 'number' || budget < 0) {
      return res.status(400).json({ error: 'budget (non-negative integer, in centavos) is required' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    // Verify user is member (SYSTEM role bypasses — used by Kanban dispatcher)
    let effectiveUserId = userId;
    if (req.user?.role === 'SYSTEM') {
      // System-created tasks (from Kanban dispatcher) use 'ari' as the
      // effective userId since 'telegram-bot' is not a real User row.
      effectiveUserId = 'ari';
    } else {
      const isMember = await requireTreeMembership(userId, treeId, res);
      if (!isMember) return;
    }

    // Normalize skills: accept string[], JSON string, or omit
    let skillsArr: string[] = [];
    if (Array.isArray(skills)) {
      skillsArr = skills.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof skills === 'string') {
      try {
        skillsArr = JSON.parse(skills);
      } catch {
        skillsArr = skills.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const task = await prisma.externalTask.create({
      data: {
        treeId,
        createdBy: effectiveUserId,
        title: title.trim(),
        description: description.trim(),
        skills: skillsArr as any,
        budget: Math.round(budget),
        currency: currency || 'CLP',
        status: 'OPEN',
        ...(kanbanTaskId && { kanbanTaskId }),
        ...(kanbanBoard && { kanbanBoard }),
      },
      include: {
        tree: { select: { id: true, name: true } },
      },
    });

    // Notify workers with matching skills (async, fire-and-forget — don't block response)
    notifyMatchingWorkers(task).then((count: number) => {
      if (count > 0) console.log(`[externalTask] Notified ${count} workers about task ${task.id}`);
    });

    res.status(201).json(task);
  } catch (error: any) {
    console.error('[externalTask] create error:', error.message || error);
    res.status(500).json({ error: 'Failed to create external task' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GET /api/external-tasks/available — List OPEN tasks
// ═══════════════════════════════════════════════════════════════════════════════
export const getAvailableTasks = async (req: Request, res: Response) => {
  try {
    const skillsParam = req.query.skills as string | undefined;

    const where: any = { status: 'OPEN' };

    // If skills filter provided, only return tasks with at least one matching skill
    if (skillsParam) {
      const filterSkills = skillsParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (filterSkills.length > 0) {
        // Prisma MySQL JSON array_contains: check if any skill in the JSON array matches
        where.skills = { path: '$', array_contains: filterSkills };
      }
    }

    const tasks = await prisma.externalTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tree: { select: { id: true, name: true } },
        creator: {
          select: {
            id: true,
            availableForHire: true,
            hourlyRate: true,
            currency: true,
            location: true,
          },
        },
      },
    });

    res.json(tasks);
  } catch (error: any) {
    console.error('[externalTask] available error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch available tasks' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GET /api/external-tasks/my — Tasks where workerId = userId
// ═══════════════════════════════════════════════════════════════════════════════
export const getMyTasks = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const tasks = await prisma.externalTask.findMany({
      where: { workerId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        tree: { select: { id: true, name: true } },
        creator: {
          select: {
            id: true,
            availableForHire: true,
            hourlyRate: true,
            currency: true,
            location: true,
          },
        },
      },
    });

    res.json(tasks);
  } catch (error: any) {
    console.error('[externalTask] my error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch your tasks' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. POST /api/external-tasks/:id/claim — OPEN → CLAIMED
// ═══════════════════════════════════════════════════════════════════════════════
export const claimTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.externalTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'External task not found' });
    }

    if (task.status !== 'OPEN') {
      return res.status(400).json({ error: `Cannot claim task with status '${task.status}'. Must be OPEN.` });
    }

    // Verify worker has availableForHire=true
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { availableForHire: true },
    });

    if (!user?.availableForHire) {
      return res.status(403).json({ error: 'You must set availableForHire=true in your profile before claiming tasks' });
    }

    const updated = await prisma.externalTask.update({
      where: { id: taskId },
      data: {
        status: 'CLAIMED',
        workerId: userId,
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[externalTask] claim error:', error.message || error);
    res.status(500).json({ error: 'Failed to claim task' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. POST /api/external-tasks/:id/deliver — CLAIMED → DELIVERED (multipart)
// ═══════════════════════════════════════════════════════════════════════════════
export const deliverTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.externalTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'External task not found' });
    }

    if (task.status !== 'CLAIMED') {
      return res.status(400).json({ error: `Cannot deliver task with status '${task.status}'. Must be CLAIMED.` });
    }

    if (task.workerId !== userId) {
      return res.status(403).json({ error: 'Only the assigned worker can deliver this task' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send as multipart field "deliverable".' });
    }

    // Save file in tree sandbox: <SANDBOX_BASE>/<treeId>/external-tasks/<taskId>/
    const destDir = path.join(SANDBOX_BASE, task.treeId, 'external-tasks', taskId);
    fs.mkdirSync(destDir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(destDir, `${Date.now()}_${safeName}`);
    fs.writeFileSync(destPath, req.file.buffer);

    // Relative path from sandbox base
    const deliverableUrl = path.relative(SANDBOX_BASE, destPath);

    const updated = await prisma.externalTask.update({
      where: { id: taskId },
      data: {
        status: 'DELIVERED',
        deliverableUrl,
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[externalTask] deliver error:', error.message || error);
    res.status(500).json({ error: 'Failed to deliver task' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. POST /api/external-tasks/:id/approve — DELIVERED → APPROVED
// ═══════════════════════════════════════════════════════════════════════════════
export const approveTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.externalTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'External task not found' });
    }

    if (task.status !== 'DELIVERED') {
      return res.status(400).json({ error: `Cannot approve task with status '${task.status}'. Must be DELIVERED.` });
    }

    // Verify user is member of the tree (SYSTEM role bypasses)
    if (req.user?.role !== 'SYSTEM') {
      const isMember = await requireTreeMembership(userId, task.treeId, res);
      if (!isMember) return;
    }

    const updated = await prisma.externalTask.update({
      where: { id: taskId },
      data: { status: 'APPROVED', approvedBy: userId },
    });

    // ── Escrow MVP: register payout in TransactionLedger ──────────────────────
    if (task.workerId && task.budget > 0) {
      try {
        // Find TreeMember for the worker in this tree
        const member = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: task.workerId, treeId: task.treeId } },
          select: { id: true },
        });

        if (member) {
          // Create ledger entry (credit to worker)
          await (prisma as any).transactionLedger.create({
            data: {
              treeId: task.treeId,
              memberId: member.id,
              type: 'EXTERNAL_TASK_PAYOUT',
              amount: task.budget, // positive = credit
              description: `Pago por tarea: ${task.title}`,
              metadataJson: JSON.stringify({
                taskId,
                externalTaskId: taskId,
                approvedBy: userId,
              }),
            },
          });

          // Upsert MemberBalance
          await (prisma as any).memberBalance.upsert({
            where: { memberId: member.id },
            create: {
              memberId: member.id,
              availableBalance: task.budget,
              pendingBalance: 0,
            },
            update: {
              availableBalance: { increment: task.budget },
            },
          });

          console.log(`[externalTask] Escrow: credited ${task.budget} CLP to member ${member.id} for task ${taskId}`);
        } else {
          console.warn(`[externalTask] Escrow skipped: worker ${task.workerId} is not a member of tree ${task.treeId}`);
        }
      } catch (escrowErr: any) {
        // Non-blocking: task is already APPROVED, escrow failure is logged but doesn't roll back
        console.error(`[externalTask] Escrow error for task ${taskId}:`, escrowErr.message || escrowErr);
      }
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[externalTask] approve error:', error.message || error);
    res.status(500).json({ error: 'Failed to approve task' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. POST /api/external-tasks/:id/reject — DELIVERED → REJECTED
// ═══════════════════════════════════════════════════════════════════════════════
export const rejectTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.externalTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'External task not found' });
    }

    if (task.status !== 'DELIVERED') {
      return res.status(400).json({ error: `Cannot reject task with status '${task.status}'. Must be DELIVERED.` });
    }

    // Verify user is member of the tree
    const isMember = await requireTreeMembership(userId, task.treeId, res);
    if (!isMember) return;

    const { reason } = req.body;

    const updated = await prisma.externalTask.update({
      where: { id: taskId },
      data: {
        status: 'REJECTED',
        ...(reason && { rejectReason: String(reason).slice(0, 2000) }),
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[externalTask] reject error:', error.message || error);
    res.status(500).json({ error: 'Failed to reject task' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Worker Notification Service (inline — avoids circular deps with bot module)
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = 'https://api.telegram.org';

interface MatchedWorker {
  telegramUserId: bigint;
  id: string;
  username: string;
  firstName: string | null;
}

interface TaskSummary {
  id: string;
  title: string;
  budget: number;
  currency: string;
  treeName: string;
  skills: string[];
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: any,
): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('[workerNotification] No TELEGRAM_BOT_TOKEN — skipping');
    return false;
  }
  try {
    const body: any = { chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);

    const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[workerNotification] Telegram API error ${res.status}: ${errText.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[workerNotification] sendMessage failed for ${chatId}:`, err.message);
    return false;
  }
}

/**
 * Notify workers with matching skills about a new ExternalTask.
 * Returns the number of workers notified.
 */
async function notifyMatchingWorkers(task: any): Promise<number> {
  try {
    const taskSkills: string[] = Array.isArray(task.skills) ? task.skills.map((s: any) => String(s).toLowerCase().trim()).filter(Boolean) : [];

    const workers = await (prisma as any).user.findMany({
      where: { availableForHire: true, telegramUserId: { not: null } },
      select: { id: true, telegramUserId: true, username: true, firstName: true, skills: true },
    });

    if (workers.length === 0) return 0;

    const matched = workers.filter((w: any) => {
      if (taskSkills.length === 0) return true;
      const wSkills: string[] = w.skills ? w.skills.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean) : [];
      if (wSkills.length === 0) return true;
      return taskSkills.some((ts: string) => wSkills.includes(ts));
    });

    if (matched.length === 0) {
      console.log(`[workerNotification] 0 workers matched skills [${taskSkills.join(',')}] for "${task.title}"`);
      return 0;
    }

    const budgetStr = task.budget > 0 ? `${(task.budget).toLocaleString('es-CL')} ${task.currency}` : 'Presupuesto no especificado';
    const skillsStr = taskSkills.length > 0 ? `\n*Skills:* ${taskSkills.join(', ')}` : '';
    const treeName = (task as any).tree?.name || 'Árbol';

    const text = [
      `🔔 *Nueva tarea disponible*`,
      '',
      `*${task.title}*`,
      `_${treeName}_`,
      '',
      `💰 ${budgetStr}${skillsStr}`,
    ].join('\n');

    const webAppUrl = process.env.TRUSTMAKER_WEB_URL || 'https://trustmaker.app';
    const inlineKeyboard = {
      inline_keyboard: [[{ text: '👀 Ver tarea', url: `${webAppUrl}/tasks/${task.id}` }]],
    };

    let sent = 0;
    for (const w of matched) {
      const ok = await sendTelegramMessage(Number(w.telegramUserId), text, inlineKeyboard);
      if (ok) sent++;
    }

    console.log(`[workerNotification] Notified ${sent}/${matched.length} workers for "${task.title}"`);
    return sent;
  } catch (err: any) {
    console.error('[workerNotification] Error:', err.message || err);
    return 0;
  }
}
