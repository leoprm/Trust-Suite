import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import { notifyMatchingWorkers as notifyWorkers } from '../services/matchingService';
import { evaluateDifficulty, evaluateQuality } from '../services/difficultyService';
import { awardXp } from '../services/levelingService';

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
    const { treeId, title, description, skills, location, locationType, type, budget, currency, kanbanTaskId, kanbanBoard } = req.body;
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

    // Validate locationType if provided
    const validLocationTypes = ['REMOTE', 'ONSITE', 'HYBRID'];
    if (locationType && !validLocationTypes.includes(locationType)) {
      return res.status(400).json({ error: `locationType must be one of: ${validLocationTypes.join(', ')}` });
    }

    // Validate type if provided (defaults to HUMAN)
    const validTypes = ['HUMAN', 'AGENT'];
    const taskType = type || 'HUMAN';
    if (!validTypes.includes(taskType)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    // Normalize location: accept string or nullish
    const normalizedLocation = location && typeof location === 'string' && location.trim()
      ? location.trim()
      : null;

    const task = await prisma.externalTask.create({
      data: {
        treeId,
        createdBy: effectiveUserId,
        title: title.trim(),
        description: description.trim(),
        skills: skillsArr as any,
        location: normalizedLocation,
        locationType: locationType || 'REMOTE',
        type: taskType,
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
    // Only notify for HUMAN tasks (AGENT tasks are system-internal)
    if (taskType === 'HUMAN') {
      notifyWorkers({
        id: task.id,
        treeId: task.treeId,
        title: task.title,
        skills: skillsArr,
        location: normalizedLocation,
        locationType: locationType || 'REMOTE',
        budget: Math.round(budget),
        currency: currency || 'CLP',
        difficulty: task.difficulty ?? 5,
      }).then((count: number) => {
        if (count > 0) console.log(`[externalTask] Notified ${count} workers about task ${task.id} (type=${taskType})`);
      });
    } else {
      console.log(`[externalTask] Skipping worker notification — task ${task.id} is type=${taskType}`);
    }

    // ── Ari auto-evaluates difficulty (fire-and-forget) ─────────────────
    evaluateDifficulty(task.title, task.description, treeId).then(difficulty => {
      if (difficulty !== null && difficulty !== (task.difficulty ?? 5)) {
        prisma.externalTask.update({
          where: { id: task.id },
          data: { difficulty },
        }).then(() => {
          console.log(`[externalTask] Ari evaluated difficulty=${difficulty} for task ${task.id}`);
        }).catch(() => {});
      }
    });

    res.status(201).json(task);
  } catch (error: any) {
    console.error('[externalTask] create error:', error.message || error);
    res.status(500).json({ error: 'Failed to create external task' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1b. GET /api/external-tasks/:id — Get task detail with dynamic price
// ═══════════════════════════════════════════════════════════════════════════════
export const getExternalTaskById = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;

    const task = await prisma.externalTask.findUnique({
      where: { id: taskId },
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

    if (!task) {
      return res.status(404).json({ error: 'External task not found' });
    }

    // Precio dinámico: budget * (1 + (difficulty - 1) * 0.15)
    const difficulty = task.difficulty ?? 5;
    const multiplier = 1 + (difficulty - 1) * 0.15;
    const effectiveRate = Math.round(task.budget * multiplier);

    res.json({
      ...task,
      effectiveRate,
      multiplier: parseFloat(multiplier.toFixed(2)),
      difficulty,
    });
  } catch (error: any) {
    console.error('[externalTask] getById error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch external task' });
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

    // ── Ari auto-evaluates quality + awards XP (fire-and-forget) ──────
    const _task = updated;
    const _destPath = destPath;
    if (_task.workerId && _task.skills && Array.isArray(_task.skills) && (_task.skills as any[]).length > 0) {
      evaluateQuality(_task.title, _task.description, _destPath, _task.treeId).then(quality => {
        if (quality !== null) {
          prisma.externalTask.update({
            where: { id: _task.id },
            data: { quality },
          }).then(() => {
            console.log(`[externalTask] Ari evaluated quality=${quality} for task ${_task.id}`);
            // Award XP using difficulty (already evaluated, default 5) and quality
            const diff = _task.difficulty ?? 5;
            return awardXp(_task.workerId!, _task.skills as string[], diff, quality, _task.id);
          }).then(result => {
            if (result && result.totalXp > 0) {
              console.log(`[externalTask] Awarded ${result.totalXp} XP across ${result.updatedSkills.length} skills for task ${_task.id}`);
            }
          }).catch(err => {
            console.error(`[externalTask] XP award failed for task ${_task.id}:`, err.message || err);
          });
        } else {
          console.warn(`[externalTask] Quality evaluation returned null for task ${_task.id} — XP not awarded`);
        }
      });
    }

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

    // ── Fire-and-forget webhook to Hermes Kanban ──────────────────────────────
    // Notify the Kanban dispatcher that this ExternalTask reached APPROVED,
    // so it can transition the linked Kanban task from running → done.
    if (task.kanbanTaskId) {
      const webhookUrl = `http://localhost:${process.env.PORT || 3100}/api/hooks/external-task-completed`;
      const internalApiKey = process.env.INTERNAL_API_KEY || '';
      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': internalApiKey,
        },
        body: JSON.stringify({
          externalTaskId: taskId,
          status: 'APPROVED',
          kanbanTaskId: task.kanbanTaskId,
          kanbanBoard: task.kanbanBoard || 'main',
        }),
      }).then(() => {
        console.log(`[externalTask] Webhook sent: task ${taskId} APPROVED → Kanban ${task.kanbanTaskId}`);
      }).catch((err: any) => {
        console.error(`[externalTask] Webhook failed for task ${taskId}:`, err.message || err);
      });
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

    // ── Fire-and-forget webhook to Hermes Kanban ──────────────────────────────
    if (task.kanbanTaskId) {
      const webhookUrl = `http://localhost:${process.env.PORT || 3100}/api/hooks/external-task-completed`;
      const internalApiKey = process.env.INTERNAL_API_KEY || '';
      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': internalApiKey,
        },
        body: JSON.stringify({
          externalTaskId: taskId,
          status: 'REJECTED',
          kanbanTaskId: task.kanbanTaskId,
          kanbanBoard: task.kanbanBoard || 'main',
        }),
      }).then(() => {
        console.log(`[externalTask] Webhook sent: task ${taskId} REJECTED → Kanban ${task.kanbanTaskId}`);
      }).catch((err: any) => {
        console.error(`[externalTask] Webhook failed for task ${taskId}:`, err.message || err);
      });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[externalTask] reject error:', error.message || error);
    res.status(500).json({ error: 'Failed to reject task' });
  }
};
