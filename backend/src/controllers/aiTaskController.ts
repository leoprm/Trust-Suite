import { Request, Response } from 'express';
import { findMatchingTasks, claimTask, releaseTask } from '../services/taskMatcher';
import { prisma } from '../index';

/**
 * GET /api/trees/:treeId/ai/tasks
 * Lista las Tasks disponibles para AIs en el árbol, agrupadas por AI member.
 * Solo miembros del árbol pueden consultar esto.
 */
export async function listAvailableAiTasks(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;
    const userId = req.user!.id;

    // Verificar membresía
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'You must be a member of this tree' });
    }

    // Encontrar AIs IDLE con autoClaim
    const aiMembers = await prisma.treeMember.findMany({
      where: {
        treeId,
        isAI: true,
        aiStatus: 'IDLE',
        aiConfig: { autoClaimEnabled: true },
      },
      select: { id: true, aiProfile: true, aiProvider: true, aiModel: true },
    });

    const results: any[] = [];
    for (const ai of aiMembers) {
      const matches = await findMatchingTasks(ai.id);
      results.push({
        aiMemberId: ai.id,
        aiProfile: ai.aiProfile,
        aiProvider: ai.aiProvider,
        aiModel: ai.aiModel,
        availableTasks: matches.map((m) => ({
          taskId: m.task.id,
          name: m.task.name,
          phase: m.task.phase,
          skillMatch: m.score,
          branchId: m.task.branchId,
        })),
      });
    }

    return res.json({ treeId, matches: results });
  } catch (err: any) {
    console.error('[AITaskController] listAvailableAiTasks error:', err);
    return res.status(500).json({ error: 'Failed to list AI tasks' });
  }
}

/**
 * POST /api/trees/:treeId/ai/claim/:taskId
 * Claim manual de una Task por un AI member (usando el userId del JWT).
 * El usuario debe ser el owner del AI member.
 */
export async function manualClaimTask(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;
    const taskId = req.params.taskId as string;
    const userId = req.user!.id;

    // Buscar AI member del usuario en ese árbol
    const aiMember = await prisma.treeMember.findFirst({
      where: { userId, treeId, isAI: true },
    });
    if (!aiMember) {
      return res.status(404).json({ error: 'No AI member found for this user in this tree' });
    }

    const result = await claimTask(aiMember.id, taskId);
    if (!result.success) {
      return res.status(409).json({ error: result.error });
    }

    return res.json({ success: true, message: `Task ${taskId} claimed by AI ${aiMember.aiProfile || aiMember.id}` });
  } catch (err: any) {
    console.error('[AITaskController] manualClaimTask error:', err);
    return res.status(500).json({ error: 'Failed to claim task' });
  }
}

/**
 * POST /api/trees/:treeId/ai/release/:taskId
 * Libera una Task previamente reclamada por un AI.
 */
export async function manualReleaseTask(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;
    const taskId = req.params.taskId as string;
    const userId = req.user!.id;

    const aiMember = await prisma.treeMember.findFirst({
      where: { userId, treeId, isAI: true },
    });
    if (!aiMember) {
      return res.status(404).json({ error: 'No AI member found for this user in this tree' });
    }

    const result = await releaseTask(aiMember.id, taskId);
    if (!result.success) {
      return res.status(409).json({ error: result.error });
    }

    return res.json({ success: true, message: `Task ${taskId} released by AI ${aiMember.aiProfile || aiMember.id}` });
  } catch (err: any) {
    console.error('[AITaskController] manualReleaseTask error:', err);
    return res.status(500).json({ error: 'Failed to release task' });
  }
}
