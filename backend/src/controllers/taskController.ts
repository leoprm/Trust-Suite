import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../index';
import { evaluateDifficulty } from '../services/difficultyService';
import { routeTask } from '../services/taskRouter';
import { logEvent } from '../services/eventLogService';
import { resolveStoragePath, UPLOAD_ROOT } from '../utils/fileSecurity';
import { matchAndAwardXp } from '../services/skillMatchingService';
import { processTaskPayment, previewTaskSplit } from '../services/paymentSplitService';
import { broadcastDisputeVote } from '../services/telegramBotService';

// ── evaluateAndAssignTask (internal, fire-and-forget) ─────────────────────────
// Called after task creation. Evaluates difficulty via Hermes Agent,
// then routes to the best agent via TaskRouter. Updates the task row
// and logs events. Designed to run asynchronously — caller does NOT await.
export async function evaluateAndAssignTask(
  taskId: string,
  treeId: string,
  title: string,
  description: string,
  actorId: string,
): Promise<void> {
  try {
    // ── Smart route via TaskRouter ───────────────────────────────────────
    const assignedToResult = await routeTask(taskId);

    if (assignedToResult) {
      console.log(
        `[taskController] Task ${taskId} routed to ${assignedToResult}`,
      );
    } else {
      console.warn(
        `[taskController] No agent matched for task ${taskId} — broadcast (unassigned)`,
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
    const { treeId, needId, title, description, budget, skills } = req.body;

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

    // Validate budget if provided
    if (budget !== undefined && budget !== null) {
      if (typeof budget !== 'number' || budget < 0) {
        return res.status(400).json({ error: 'budget must be a non-negative number' });
      }
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
        creatorId: req.user?.id,
        budget: budget || 0,
        skills: skills || null,
        status: 'PENDING',
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
    const { treeId, status, assigneeId } = req.query;

    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId query param is required' });
    }

    const where: any = { treeId };

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (assigneeId && typeof assigneeId === 'string') {
      where.assigneeId = assigneeId;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: {
          select: {
            id: true,
            
            
            
            
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

// ── POST /api/tasks/:id/route ─────────────────────────────────────────────────
// Manual re-routing — forces the task through TaskRouter again.
// Requires JWT authentication.
export const routeTaskEndpoint = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, treeId: true },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only re-route OPEN or IN_PROGRESS tasks
    if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: `Cannot re-route task with status '${task.status}'`,
      });
    }

    // Clear current assignment so routeTask can re-assign
    await prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: null, status: 'PENDING' },
    });

    const assignedToResult = await routeTask(taskId);

    if (assignedToResult) {
      const updated = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: {
            select: {
              id: true,
              
              
              
              
            },
          },
        },
      });

      return res.json({
        message: 'Task re-routed successfully',
        task: updated,
      });
    }

    // No agent matched — task broadcast (unassigned)
    const unassigned = await prisma.task.findUnique({
      where: { id: taskId },
    });

    return res.json({
      message: 'No agent available — task broadcast to all agents',
      task: unassigned,
    });
  } catch (error: any) {
    console.error('[taskController] routeTask error:', error.message || error);
    res.status(500).json({ error: 'Failed to re-route task' });
  }
};
export const getTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          select: {
            id: true,
            
            
            
            
            totalXp: true,
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

// ── POST /api/tasks/:id/evidence ──────────────────────────────────────────────
// Accepts multipart file upload (photo/document) as task evidence.
// Updates task status to EVIDENCE_SUBMITTED and stores file path + type.
export const submitEvidence = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send as multipart field "evidence".' });
    }

    // Determine evidence type from mimetype
    const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const evidenceType: string = IMAGE_MIMES.has(req.file.mimetype) ? 'IMAGE' : 'FILE';

    // Relative path from uploads root: evidence/{taskId}/{timestamp}_{filename}
    const evidenceUrl = path.relative(UPLOAD_ROOT, req.file.path);

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        evidenceUrl,
        evidenceType,
        status: 'EVIDENCE_SUBMITTED',
      },
    });

    // Log event
    await logEvent({
      treeId: task.treeId,
      actorId: req.user?.id ?? null,
      action: 'EVIDENCE_SUBMITTED',
      entityType: 'Task',
      entityId: taskId,
      afterJson: {
        evidenceUrl,
        evidenceType,
        fileName: req.file.originalname,
        fileSize: req.file.size,
      },
      source: 'USER',
      severity: 'INFO',
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[taskController] submitEvidence error:', error.message || error);
    res.status(500).json({ error: 'Failed to submit evidence' });
  }
};

// ── GET /api/tasks/:id/evidence ────────────────────────────────────────────────
// Returns the task evidence as a downloadable file.
// Protected: only tree members can access.
export const getTaskEvidence = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const userId = req.user?.id;

    // ── Look up task with treeId and evidence fields ──────────────────────
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        treeId: true,
        evidenceUrl: true,
        evidenceType: true,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!task.evidenceUrl) {
      return res.status(404).json({ error: 'No evidence submitted for this task' });
    }

    // ── Verify tree membership ────────────────────────────────────────────
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: task.treeId } },
      select: { status: true },
    });

    if (!member) {
      return res.status(403).json({ error: 'Tree membership required' });
    }

    // ── Resolve and stream the file ───────────────────────────────────────
    // Normalize: strip leading /uploads/ if present (legacy submitEvidence format)
    let storagePath = task.evidenceUrl;
    if (storagePath.startsWith('/uploads/')) {
      storagePath = storagePath.slice('/uploads/'.length);
    }
    const absolutePath = resolveStoragePath(storagePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`[taskController] evidence file missing: ${absolutePath}`);
      return res.status(404).json({ error: 'Evidence file not found on disk' });
    }

    const ext = path.extname(task.evidenceUrl).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="evidence-${taskId}${ext}"`,
    );

    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error(`[taskController] stream error for ${taskId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream evidence file' });
      }
    });
  } catch (error: any) {
    if (error.message === 'Path traversal blocked') {
      return res.status(400).json({ error: 'Invalid evidence path' });
    }
    console.error('[taskController] getTaskEvidence error:', error.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to fetch evidence' });
    }
  }
};

// ── XP per complexity tier ────────────────────────────────────────────────────
const XP_RANGES: Record<string, { min: number; max: number }> = {
  simple:   { min: 10, max: 20 },
  media:    { min: 20, max: 35 },
  compleja: { min: 35, max: 50 },
};

function rollXp(complexity: string): number {
  const range = XP_RANGES[complexity];
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

// ── POST /api/tasks/:id/verify ────────────────────────────────────────────────
// Marks a task as VERIFIED, assigns XP based on complexity, adds to assignee's
// totalXp, and runs skill matching against the user's skill tree.
export const verifyTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        treeId: true,
        needId: true,
        status: true,
        complexity: true,
        xpAwarded: true,
        assigneeId: true,
        creatorId: true,
        title: true,
        description: true,
        skills: true,
        budget: true,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // ── Status gate: only EVIDENCE_SUBMITTED tasks can be verified ────────
    if (task.status !== 'EVIDENCE_SUBMITTED') {
      return res.status(400).json({
        error: `Cannot verify task with status '${task.status}'. Must be EVIDENCE_SUBMITTED.`,
      });
    }

    // ── Complexity must be set ────────────────────────────────────────────
    if (!task.complexity) {
      return res.status(400).json({
        error: 'Task complexity not set. The creator must define it (simple, media, compleja).',
      });
    }

    // ── Compute XP ────────────────────────────────────────────────────────
    const xp = rollXp(task.complexity);

    // ── Update task status + xpAwarded in a transaction ───────────────────
    const updatedTask = await prisma.$transaction(async (tx) => {
      const t = await tx.task.update({
        where: { id: taskId },
        data: {
          status: 'VERIFIED',
          xpAwarded: xp,
        },
      });

      // Increment assignee totalXp
      if (task.assigneeId) {
        await tx.user.update({
          where: { id: task.assigneeId },
          data: { totalXp: { increment: xp } },
        });
      }

      return t;
    });

    // ── Skill matching: match task keywords → user skills ─────────────────
    let skillResult: any = null;
    if (task.assigneeId && task.title) {
      try {
        skillResult = await matchAndAwardXp(
          task.assigneeId,
          task.title,
          task.description || '',
          xp,
        );
      } catch (skillErr: any) {
        // Skill matching failure is non-fatal — verification succeeded.
        console.warn(
          `[taskController] Skill matching failed for task ${taskId}: ${skillErr.message}`,
        );
      }
    }

    // ── Log event ─────────────────────────────────────────────────────────
    await logEvent({
      treeId: task.treeId,
      actorId: req.user?.id ?? null,
      action: 'TASK_VERIFIED',
      entityType: 'Task',
      entityId: taskId,
      afterJson: {
        complexity: task.complexity,
        xpAwarded: xp,
        assigneeId: task.assigneeId,
        skillMatching: skillResult
          ? {
              matchedCategories: skillResult.matchedCategories,
              newSkillCreated: skillResult.newSkillCreated,
              skillsAfter: skillResult.skillsAfter,
            }
          : null,
      },
      source: 'USER',
      severity: 'INFO',
    });

    // ── Fire-and-forget: process payment split if task has a budget ───────
    if (task.budget && task.budget > 0 && task.needId) {
      processTaskPayment(taskId)
        .then((splitResult) => {
          console.log(
            `[taskController] Payment split for task ${taskId}:`,
            JSON.stringify(splitResult.splits),
          );
          if (splitResult.errors.length > 0) {
            console.warn(
              `[taskController] Split warnings for ${taskId}:`,
              splitResult.errors,
            );
          }
          // Transition to PAID
          return prisma.task.update({
            where: { id: taskId },
            data: { status: 'PAID' },
          });
        })
        .then(() => {
          console.log(`[taskController] Task ${taskId} → PAID`);
        })
        .catch((err) => {
          console.error(
            `[taskController] Payment split failed for task ${taskId}:`,
            err.message,
          );
        });
    }

    res.json({
      message: `Task verified. ${xp} XP awarded (${task.complexity}).`,
      task: updatedTask,
      xpAwarded: xp,
      skillMatching: skillResult
        ? {
            matchedCategories: skillResult.matchedCategories,
            newSkillCreated: skillResult.newSkillCreated,
            skillsAfter: skillResult.skillsAfter,
            totalXpAfter: skillResult.totalXpAfter,
          }
        : null,
    });
  } catch (error: any) {
    console.error('[taskController] verifyTask error:', error.message || error);
    res.status(500).json({ error: 'Failed to verify task' });
  }
};

// ── GET /api/tasks/:id/split-preview ────────────────────────────────────────
// Returns the expected payment split breakdown (20% creator, 80% executor)
// without executing any transfers.
export const previewSplit = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const preview = await previewTaskSplit(taskId);
    res.json(preview);
  } catch (error: any) {
    console.error('[taskController] previewSplit error:', error.message || error);
    res.status(500).json({ error: 'Failed to preview split' });
  }
};

// ── POST /api/tasks/:id/dispute ────────────────────────────────────────────────
// Disputes a task's evidence. Only tree members can dispute.
// Body: { reason: string, evidence?: string (URL) }
// Only tasks in EVIDENCE_SUBMITTED status can be disputed.
export const disputeTask = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const userId = req.user?.id;
    const { reason, evidence } = req.body;

    // ── Validation ───────────────────────────────────────────────────────
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'reason (string) is required' });
    }
    if (evidence !== undefined && typeof evidence !== 'string') {
      return res.status(400).json({ error: 'evidence must be a string (URL)' });
    }

    // ── Look up task ──────────────────────────────────────────────────────
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        treeId: true,
        status: true,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // ── Status gate: only EVIDENCE_SUBMITTED tasks can be disputed ────────
    if (task.status !== 'EVIDENCE_SUBMITTED') {
      return res.status(400).json({
        error: `Cannot dispute task with status '${task.status}'. Must be EVIDENCE_SUBMITTED.`,
      });
    }

    // ── Tree membership check ─────────────────────────────────────────────
    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: task.treeId } },
      select: { status: true },
    });

    if (!member) {
      return res.status(403).json({ error: 'Tree membership required to dispute tasks' });
    }

    // ── Update task ───────────────────────────────────────────────────────
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'DISPUTED',
        disputedById: userId,
        disputeReason: reason.trim(),
        disputeEvidenceUrl: evidence?.trim() || null,
        disputedAt: now,
        disputeExpiresAt: expiresAt,
      },
    });

    // ── Log event ─────────────────────────────────────────────────────────
    await logEvent({
      treeId: task.treeId,
      actorId: userId,
      action: 'TASK_DISPUTED',
      entityType: 'Task',
      entityId: taskId,
      afterJson: {
        disputedById: userId,
        disputeReason: reason.trim(),
        disputeEvidenceUrl: evidence?.trim() || null,
      },
      source: 'USER',
      severity: 'WARNING',
    });

    // ── Broadcast to Telegram (fire-and-forget) ──────────────────────────
    broadcastDisputeVote(taskId, task.treeId, updated.title).catch((err: Error) => {
      console.error('[taskController] broadcastDisputeVote error:', err.message);
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[taskController] disputeTask error:', error.message || error);
    res.status(500).json({ error: 'Failed to dispute task' });
  }
};
