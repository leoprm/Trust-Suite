import { Request, Response } from 'express';
import { prisma } from '../index';
import { evaluateDifficulty } from '../services/difficultyService';
import { assignAI } from '../services/assignmentGateService';
import { logEvent } from '../services/eventLogService';

// ── evaluateAndAssignTask (internal, fire-and-forget) ─────────────────────────
// Called after task creation. Evaluates difficulty via Hermes Agent,
// then assigns the best AI via AssignmentGate. Updates the task row
// and logs events. Designed to run asynchronously — caller does NOT await.
export async function evaluateAndAssignTask(
  taskId: string,
  treeId: string,
  title: string,
  description: string,
  actorId: string,
): Promise<void> {
  try {
    // ── Step 1: Evaluate difficulty ──────────────────────────────────────
    const difficulty = await evaluateDifficulty(title, description, treeId);

    if (difficulty !== null) {
      await prisma.task.update({
        where: { id: taskId },
        data: { difficulty },
      });

      await logEvent({
        treeId,
        actorId,
        action: 'DIFFICULTY_EVALUATED',
        entityType: 'Task',
        entityId: taskId,
        afterJson: { difficulty },
        source: 'AUTOMATION',
        severity: 'INFO',
      });
    }

    // ── Step 2: Assign AI ────────────────────────────────────────────────
    const effectiveDifficulty = difficulty ?? 5; // default mid if evaluation failed
    const assignedAIId = await assignAI(treeId, effectiveDifficulty);

    if (assignedAIId) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          assignedTo: assignedAIId,
          status: 'IN_PROGRESS',
        },
      });

      await logEvent({
        treeId,
        actorId,
        action: 'TASK_ASSIGNED_TO_AI',
        entityType: 'Task',
        entityId: taskId,
        afterJson: { assignedTo: assignedAIId, difficulty: effectiveDifficulty },
        source: 'AUTOMATION',
        severity: 'INFO',
      });
    } else {
      console.warn(
        `[taskController] No AI assigned for task ${taskId} (difficulty=${effectiveDifficulty})`,
      );
    }
  } catch (error: any) {
    console.error(
      `[taskController] evaluateAndAssignTask failed for ${taskId}:`,
      error.message || error,
    );
  }
}

// ── POST /api/tasks ───────────────────────────────────────────────────────────
export const createTask = async (req: Request, res: Response) => {
  try {
    const { treeId, needId, title, description } = req.body;

    // ── Validation ───────────────────────────────────────────────────────
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (string) is required' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title (string) is required' });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description (string) is required' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    // Verify need if provided
    if (needId) {
      const need = await prisma.need.findUnique({ where: { id: needId } });
      if (!need || need.treeId !== treeId) {
        return res.status(404).json({ error: 'Need not found in this tree' });
      }
    }

    // ── Create task ──────────────────────────────────────────────────────
    const task = await prisma.task.create({
      data: {
        treeId,
        needId: needId || null,
        title: title.trim(),
        description: description.trim(),
        status: 'OPEN',
      },
    });

    // Log creation event
    await logEvent({
      treeId,
      actorId: req.user?.id ?? null,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      afterJson: { title: task.title, needId: task.needId },
      source: 'USER',
      severity: 'INFO',
    });

    // ── Fire-and-forget: evaluate + assign asynchronously ─────────────────
    // Don't await — task returns immediately to the user.
    evaluateAndAssignTask(
      task.id,
      treeId,
      title.trim(),
      description.trim(),
      req.user?.id ?? 'system',
    ).catch((err) => {
      console.error('[taskController] Unhandled evaluateAndAssignTask error:', err);
    });

    res.status(201).json(task);
  } catch (error: any) {
    console.error('[taskController] createTask error:', error.message || error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// ── GET /api/tasks ────────────────────────────────────────────────────────────
export const getTasks = async (req: Request, res: Response) => {
  try {
    const { treeId, status, assignedTo } = req.query;

    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId query param is required' });
    }

    const where: any = { treeId };

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (assignedTo && typeof assignedTo === 'string') {
      where.assignedTo = assignedTo;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedAI: {
          select: {
            id: true,
            aiProfile: true,
            aiProvider: true,
            aiModel: true,
            level: true,
          },
        },
      },
    });

    res.json(tasks);
  } catch (error: any) {
    console.error('[taskController] getTasks error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// ── GET /api/tasks/:id ────────────────────────────────────────────────────────
export const getTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedAI: {
          select: {
            id: true,
            aiProfile: true,
            aiProvider: true,
            aiModel: true,
            level: true,
            xp: true,
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error: any) {
    console.error('[taskController] getTask error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
};
