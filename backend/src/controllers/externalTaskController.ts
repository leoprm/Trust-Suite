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

    // Verify user is member
    const isMember = await requireTreeMembership(userId, treeId, res);
    if (!isMember) return;

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
        createdBy: userId,
        title: title.trim(),
        description: description.trim(),
        skills: skillsArr as any,
        budget: Math.round(budget),
        currency: currency || 'CLP',
        status: 'OPEN',
        ...(kanbanTaskId && { kanbanTaskId }),
        ...(kanbanBoard && { kanbanBoard }),
      },
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

    // Verify user is member of the tree
    const isMember = await requireTreeMembership(userId, task.treeId, res);
    if (!isMember) return;

    const updated = await prisma.externalTask.update({
      where: { id: taskId },
      data: { status: 'APPROVED', approvedBy: userId },
    });

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

    const updated = await prisma.externalTask.update({
      where: { id: taskId },
      data: { status: 'REJECTED' },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[externalTask] reject error:', error.message || error);
    res.status(500).json({ error: 'Failed to reject task' });
  }
};
