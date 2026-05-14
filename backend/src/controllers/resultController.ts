import { Request, Response } from 'express';
import { prisma } from '../index';

// Lazy import to avoid circular dependency at module load time.
// The bot is only accessed at runtime when evaluateResult is called.
let _cachedBot: any = null;
function getBot(): any | null {
  if (_cachedBot !== null) return _cachedBot;
  try {
    // Dynamic import breaks the cycle: index.ts → resultRoutes → resultController → index.ts
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idx = require('../index');
    _cachedBot = idx.telegramBot ?? null;
  } catch {
    _cachedBot = undefined;
  }
  return _cachedBot ?? null;
}

// Helper: add XP to a tree member and recalculate level
async function addXP(treeId: string, userId: string, amount: number): Promise<void> {
  const member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
  });
  if (!member) return;

  const newXP = member.xp + amount;
  const newLevel = Math.floor(newXP / 100) + 1;

  await prisma.treeMember.update({
    where: { userId_treeId: { userId, treeId } },
    data: { xp: newXP, level: newLevel },
  });
}

// POST /api/results — crear resultado para una necesidad
export const createResult = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { needId, ideaId, summary } = req.body;

    if (!needId || !ideaId || !summary) {
      return res.status(400).json({ error: 'needId, ideaId, and summary are required' });
    }

    const need = await prisma.need.findUnique({ where: { id: needId } });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    // Check if idea is linked to this need (direct or via NeedIdea)
    const isLinked =
      idea.needId === needId ||
      !!(await prisma.needIdea.findUnique({
        where: { needId_ideaId: { needId, ideaId } },
      }));

    if (!isLinked) {
      return res.status(400).json({ error: 'Idea does not belong to this need' });
    }

    if (need.creatorId !== userId) {
      return res.status(403).json({ error: 'Only the need creator can create a result' });
    }

    if (need.status === 'SATISFIED' || need.status === 'CLOSED') {
      return res.status(400).json({ error: `Need is already ${need.status}` });
    }

    // Task spec: createdBy is always "USER"
    const result = await prisma.result.create({
      data: { needId, ideaId, summary, createdBy: 'USER' },
    });

    await prisma.need.update({
      where: { id: needId },
      data: { status: 'SATISFIED' },
    });

    // Mark ideas as global so they survive for cross-tree re-proposal
    import('./ideaController').then(({ markIdeasGlobal }) =>
      markIdeasGlobal(needId).catch((err: Error) =>
        console.error(`[createResult] markIdeasGlobal failed for need ${needId}:`, err)
      )
    );

    const treeId = need.treeId;
    if (treeId && idea.creatorId && idea.creatorId !== userId) {
      await addXP(treeId, idea.creatorId, 20);
    }

    res.status(201).json(result);
  } catch (error: any) {
    console.error('[createResult] error:', error?.message || error);
    res.status(500).json({ error: 'Failed to create result', detail: error?.message || String(error) });
  }
};

// GET /api/results?needId=X — listar resultados de una necesidad
export const getResults = async (req: any, res: Response) => {
  try {
    const { needId } = req.query;
    if (!needId) return res.status(400).json({ error: 'needId query param is required' });

    const results = await prisma.result.findMany({
      where: { needId: needId as string },
      include: {
        idea: { select: { id: true, content: true, creatorId: true } },
        evaluator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(results);
  } catch (error: any) {
    console.error('[getResults] error:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
};

// PATCH /api/results/:id/evaluate — evaluar resultado
export const evaluateResult = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { evaluation } = req.body;

    if (evaluation === undefined || evaluation < 1 || evaluation > 10) {
      return res.status(400).json({ error: 'evaluation must be an integer between 1 and 10' });
    }

    const result = await prisma.result.findUnique({
      where: { id },
      include: { need: true, idea: { select: { id: true, creatorId: true } } },
    });

    if (!result) return res.status(404).json({ error: 'Result not found' });

    if (result.need.creatorId !== userId) {
      return res.status(403).json({ error: 'Only the need creator can evaluate the result' });
    }

    if (result.evaluation !== null) {
      return res.status(400).json({ error: 'Result already evaluated' });
    }

    const updated = await prisma.result.update({
      where: { id },
      data: {
        evaluation: Math.round(evaluation),
        evaluatedAt: new Date(),
        evaluatedById: userId,
      },
    });

    const need = result.need;
    if (need.treeId && need.id) {
      await prisma.need.update({
        where: { id: need.id },
        data: { status: 'CLOSED' },
      });

      // Mark ideas as global so they survive for cross-tree re-proposal
      import('./ideaController').then(({ markIdeasGlobal }) =>
        markIdeasGlobal(need.id!).catch((err: Error) =>
          console.error(`[evaluateResult] markIdeasGlobal failed for need ${need.id}:`, err)
        )
      );
    }

    const treeId = need.treeId as string | undefined;

    if (treeId && result.idea && result.idea.creatorId) {
      await addXP(treeId, result.idea.creatorId, evaluation * 10);
    }

    if (treeId) {
      await addXP(treeId, userId, 5);
    }

    // ── T10: Trigger satisfaction poll (fire-and-forget) ──
    const bot = getBot();
    if (bot) {
      import('../bot/satisfaction').then(({ sendSatisfactionPoll }) =>
        sendSatisfactionPoll(bot, prisma, updated.id).catch((err: Error) =>
          console.error(`[evaluateResult] Satisfaction poll failed for result ${updated.id}:`, err.message)
        )
      );
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[evaluateResult] error:', error?.message || error);
    res.status(500).json({ error: 'Failed to evaluate result', detail: error?.message || String(error) });
  }
};
