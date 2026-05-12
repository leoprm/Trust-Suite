import { Request, Response } from 'express';
import { prisma } from '../index';
import { calculateTotalBranchPoints } from '../utils/scoring';
import { 
  calculateXpFromDifficulty, 
  redistributeTreeBudget,
  resolveBranchTreeId 
} from '../utils/economicEngine';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ─── CONTROLLERS ──────────────────────────────────────────────────────

export const createExpressTask = async (req: any, res: Response) => {
  try {
    const { branchId, name, description, treeId, assignToMe } = req.body;

    const branch = await (prisma as any).branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ error: 'Hashtag branch not found' });
    if (!branch.isHashtag) return res.status(400).json({ error: 'Esta rama no es un hashtag.' });

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } },
      include: { tree: true }
    });
    if (!membership) return res.status(403).json({ error: 'Access denied' });

    const task = await prisma.task.create({
      data: {
        branchId,
        name: name || 'Express Task',
        description,
        creatorId: req.user.id,
        assignedTo: assignToMe ? req.user.id : null,
        status: assignToMe ? 'IN_PROGRESS' : 'OPEN',
        phase: 'DEVELOPMENT'
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: treeId ?? branch.treeId ?? null,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      afterJson: { id: task.id, branchId, name: task.name, status: task.status, assignedTo: task.assignedTo },
      metadataJson: getRequestMetadata(req, { express: true, result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
};

export const createTask = async (req: any, res: Response) => {
  try {
    const { branchId, name, description, tags, phase, requiredHours, difficulty, startPhotoUrl, startPhotoUrls } = req.body;
    const resolvedStartPhotoUrl = startPhotoUrls !== undefined
      ? (Array.isArray(startPhotoUrls) && startPhotoUrls.length > 0 ? JSON.stringify(startPhotoUrls) : null)
      : (startPhotoUrl || null);

    // ── Permission Check ──────────────────────────────────────────────
    const branch = await (prisma as any).branch.findUnique({
      where: { id: branchId },
      include: { tree: true }
    });
    if (!branch) return res.status(404).json({ error: 'Rama no encontrada' });

    if (branch.isHashtag) {
      const treeId = branch.treeId;
      if (treeId) {
        const treeMember = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: req.user.id, treeId } }
        });
        if (!treeMember) return res.status(403).json({ error: 'Debes ser miembro del árbol para crear tareas en ramas hashtag' });
      }
    } else {
      const treeId = await resolveBranchTreeId(branchId);
      const isCreator = branch.tree?.creatorId === req.user.id;
      if (!isCreator) {
        const branchMember = await (prisma as any).branchMember.findUnique({
          where: { userId_branchId: { userId: req.user.id, branchId } }
        });
        if (!branchMember) return res.status(403).json({ error: 'Debes ser miembro de esta rama para crear tareas' });
      }
    }

    const task = await prisma.task.create({
      data: {
        branchId,
        name: name || 'Task',
        description,
        phase: phase || 'INVESTIGATION',
        creatorId: req.user.id,
        requiredHours: requiredHours || null,
        difficulty,
        startPhotoUrl: resolvedStartPhotoUrl,
        tags: { create: (tags || []).map((t: string) => ({ skillName: t })) }
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: branch.treeId ?? null,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      afterJson: { id: task.id, branchId, name: task.name, status: task.status, phase: task.phase },
      metadataJson: getRequestMetadata(req, {
        tags: tags || [],
        hasStartEvidence: Boolean(resolvedStartPhotoUrl),
        result: 'success',
      }),
      source: 'USER',
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('[createTask] error:', error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
};

export const completeTask = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { evidenceUrl, difficulty, comment, photoUrl, photoUrls } = req.body;
    const resolvedPhotoUrl = photoUrls !== undefined
      ? (Array.isArray(photoUrls) && photoUrls.length > 0 ? JSON.stringify(photoUrls) : null)
      : photoUrl;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        branch: { include: { tree: true } }
      }
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const currentTask = task as any;
    const isAuthor = currentTask.assignedTo === req.user.id;

    // 24h Edit Logic
    if (currentTask.status === 'COMPLETED' && isAuthor) {
      const hoursSinceCompletion = (Date.now() - new Date(currentTask.completedAt!).getTime()) / (1000 * 60 * 60);
      if (hoursSinceCompletion > 24) return res.status(403).json({ error: 'Ventana de 24h expirada' });
    }

    // Memberships for XP
    const treeId = (currentTask.branch as any)?.treeId;
    const treeIds = treeId ? [treeId] : [];
    const isUnverified = false; // v2: simplified — no unverified check needed

    const { calculateTaskXpReward } = await import('../utils/economicEngine');
    
    // Use difficulty from request body if provided, else keep task's existing difficulty
    const finalDifficulty = difficulty && difficulty >= 1 && difficulty <= 10
      ? difficulty
      : currentTask.difficulty;

    // Update task: set difficulty, evidence, status
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        difficulty: finalDifficulty,
        status: 'COMPLETED',
        evidenceUrl: evidenceUrl || currentTask.evidenceUrl,
        completionComment: comment !== undefined ? comment : currentTask.completionComment,
        completionPhotoUrl: (photoUrls !== undefined || photoUrl !== undefined) ? resolvedPhotoUrl : currentTask.completionPhotoUrl,
        completedAt: currentTask.completedAt || new Date()
      }
    });

    // Calculate and award XP
    const rawXp = await calculateTaskXpReward(id);
    const xpToAward = Math.floor(rawXp);
    let deltaXp = currentTask.status === 'COMPLETED' ? 0 : xpToAward;

    if (updatedTask.status === 'COMPLETED' && currentTask.assignedTo && deltaXp !== 0) {
      for (const tid of treeIds) {
        const member = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: currentTask.assignedTo, treeId: tid } }
        }) as any;
        if (!member) continue;

        // Award XP (v2: sin boost de endorsement)
        const oldLevel = member.level;
        const newXp = Math.max(0, (member.xp || 0) + deltaXp);
        const newLevel = Math.max(1, Math.floor(newXp / 50) + 1);
        await prisma.treeMember.update({ where: { id: member.id }, data: { xp: newXp, level: newLevel } });

        void logEvent({
          ...getRequestContext(req),
          treeId: tid,
          actorId: currentTask.assignedTo,
          action: 'XP_GRANTED',
          entityType: 'TreeMember',
          entityId: member.id,
          beforeJson: { xp: member.xp, level: oldLevel },
          afterJson: { xp: newXp, level: newLevel },
          metadataJson: getRequestMetadata(req, { taskId: id, deltaXp }),
          source: 'SYSTEM',
        });

        if (oldLevel !== newLevel) {
          await redistributeTreeBudget(tid);
          void logEvent({
            ...getRequestContext(req),
            treeId: tid,
            actorId: currentTask.assignedTo,
            action: 'LEVEL_UPDATED',
            entityType: 'TreeMember',
            entityId: member.id,
            beforeJson: { level: oldLevel },
            afterJson: { level: newLevel },
            metadataJson: getRequestMetadata(req, { taskId: id }),
            source: 'SYSTEM',
          });
        }
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: treeIds[0] ?? null,
      action: 'TASK_COMPLETED',
      entityType: 'Task',
      entityId: id,
      beforeJson: { status: currentTask.status, difficulty: currentTask.difficulty },
      afterJson: { status: updatedTask.status, difficulty: updatedTask.difficulty, completedAt: updatedTask.completedAt },
      metadataJson: getRequestMetadata(req, { xpAwarded: deltaXp, result: 'success' }),
      source: 'USER',
    });

    if (evidenceUrl || photoUrl || (Array.isArray(photoUrls) && photoUrls.length > 0)) {
      void logEvent({
        ...getRequestContext(req),
        treeId: treeIds[0] ?? null,
        action: 'TASK_EVIDENCE_UPLOADED',
        entityType: 'Task',
        entityId: id,
        metadataJson: getRequestMetadata(req, {
          evidenceKinds: {
            evidenceUrl: Boolean(evidenceUrl),
            photoUrl: Boolean(photoUrl),
            photoUrlsCount: Array.isArray(photoUrls) ? photoUrls.length : 0,
          },
        }),
        source: 'USER',
      });
    }

    res.json({
      ...updatedTask,
      xpAwarded: deltaXp,
    });
  } catch (error) {
    console.error('[completeTask] error:', error);
    res.status(500).json({ error: 'Error' });
  }
};

export const getPendingTasks = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const memberships = await prisma.treeMember.findMany({ where: { userId } });
    const userTreeIds = memberships.map(m => m.treeId);

    const tasks = await prisma.task.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] },
        OR: [
          { branch: { treeId: { in: userTreeIds } } },
        ]
      },
      include: {
        branch: { include: { tree: true } },
        tags: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const results = await Promise.all(tasks.map(async (task) => {
      const branchPoints = await calculateTotalBranchPoints(task.branchId);
      return { ...task, branch: { ...task.branch, totalPoints: branchPoints } };
    }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const assignTask = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } }) as any;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'OPEN') return res.status(400).json({ error: 'Solo se pueden asumir tareas abiertas' });

    // Auto-release expired tasks before checking
    if (task.assignedTo && task.deadlineAt && new Date() > new Date(task.deadlineAt)) {
      await (prisma as any).task.update({ where: { id }, data: { assignedTo: null, status: 'OPEN', deadlineAt: null } });
    } else if (task.assignedTo) {
      return res.status(400).json({ error: 'Esta tarea ya está asignada a otro usuario' });
    }

    // Calculate deadline: 1.3x requiredHours (default 24h if not set)
    const hours = (task.requiredHours || 24) * 1.3;
    const deadlineAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Optional start photo ("before" evidence)
    const { startPhotoUrl } = req.body || {};

    const updated = await (prisma as any).task.update({
      where: { id },
      data: {
        assignedTo: req.user.id,
        status: 'IN_PROGRESS',
        deadlineAt,
        ...(startPhotoUrl ? { startPhotoUrl } : {}),
      }
    });

    const treeId = await resolveBranchTreeId(task.branchId);
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TASK_ASSIGNED',
      entityType: 'Task',
      entityId: id,
      beforeJson: { assignedTo: task.assignedTo, status: task.status },
      afterJson: { assignedTo: updated.assignedTo, status: updated.status, deadlineAt: updated.deadlineAt },
      metadataJson: getRequestMetadata(req, { hasStartEvidence: Boolean(startPhotoUrl), result: 'success' }),
      source: 'USER',
    });

    if (startPhotoUrl) {
      void logEvent({
        ...getRequestContext(req),
        treeId,
        action: 'TASK_EVIDENCE_UPLOADED',
        entityType: 'Task',
        entityId: id,
        metadataJson: getRequestMetadata(req, { evidenceKinds: { startPhotoUrl: true } }),
        source: 'USER',
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('[assignTask] error:', error);
    res.status(500).json({ error: 'Error' });
  }
};

export const approveTaskEvidence = async (req: any, res: Response) => {
  try {
    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' }
    });
    const treeId = await resolveBranchTreeId(updated.branchId);
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TASK_COMPLETED',
      entityType: 'Task',
      entityId: req.params.id,
      afterJson: { status: updated.status },
      metadataJson: getRequestMetadata(req, { via: 'approve_evidence', result: 'success' }),
      source: 'USER',
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};
