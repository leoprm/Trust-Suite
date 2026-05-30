import { Request, Response } from 'express';
import { prisma } from '../index';

// ─── POST /api/trees/:treeId/needs/:needId/vote ──────────────────
export const voteNeed = async (req: any, res: Response) => {
  try {
    const { treeId, needId } = req.params;
    const { points } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!points || typeof points !== 'number' || points < 1) {
      return res.status(400).json({ error: 'points must be a positive integer' });
    }

    // Verify tree membership + get cyclePoints
    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { cyclePoints: true, cyclePointsRefillAt: true },
    });

    if (!member) {
      return res.status(403).json({ error: 'Tree membership required' });
    }

    // Check refill: if cyclePointsRefillAt is in the past, reset to 25
    let availablePoints = member.cyclePoints;
    const now = new Date();
    if (member.cyclePointsRefillAt && member.cyclePointsRefillAt <= now) {
      availablePoints = 25;
      await prisma.treeMember.update({
        where: { userId_treeId: { userId, treeId } },
        data: { cyclePoints: 25, cyclePointsRefillAt: null },
      });
    }

    if (availablePoints < points) {
      return res.status(400).json({
        error: `Insufficient points. You have ${availablePoints} cyclePoints, requested ${points}`,
      });
    }

    // Verify need exists and is in vote phase
    const need = await prisma.need.findUnique({
      where: { id: needId },
      select: { treeId: true, cyclePhase: true, status: true },
    });

    if (!need) {
      return res.status(404).json({ error: 'Need not found' });
    }

    if (need.treeId !== treeId) {
      return res.status(404).json({ error: 'Need does not belong to this tree' });
    }

    if (need.cyclePhase !== 'vote') {
      return res.status(400).json({ error: 'Need is not in vote phase' });
    }

    // Create vote (unique constraint prevents double-voting)
    try {
      await prisma.needVote.create({
        data: {
          needId,
          userId,
          points,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: 'You have already voted on this need' });
      }
      throw err;
    }

    // Deduct points from member and update need totalPoints
    const newBalance = availablePoints - points;

    await prisma.$transaction([
      prisma.treeMember.update({
        where: { userId_treeId: { userId, treeId } },
        data: { cyclePoints: newBalance },
      }),
      prisma.need.update({
        where: { id: needId },
        data: { totalPoints: { increment: points } },
      }),
    ]);

    res.json({ remainingPoints: newBalance });
  } catch (error) {
    console.error('[voteNeed] error:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
};

// ─── GET /api/trees/:treeId/needs/voting ─────────────────────────
export const getVotingNeeds = async (req: any, res: Response) => {
  try {
    const { treeId } = req.params;

    const needs = await prisma.need.findMany({
      where: {
        treeId,
        cyclePhase: 'vote',
      },
      select: {
        id: true,
        title: true,
        description: true,
        roundNumber: true,
        votingEndsAt: true,
        totalPoints: true,
        difficultyAvg: true,
        createdAt: true,
      },
      orderBy: { totalPoints: 'desc' },
    });

    res.json(needs);
  } catch (error) {
    console.error('[getVotingNeeds] error:', error);
    res.status(500).json({ error: 'Failed to fetch voting needs' });
  }
};

// ─── POST /api/trees/:treeId/needs/:needId/difficulty ────────────
export const rateDifficulty = async (req: any, res: Response) => {
  try {
    const { treeId, needId } = req.params;
    const { rating } = req.body;

    // Validate rating: must be integer 1-10
    if (rating === undefined || !Number.isInteger(rating) || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'rating debe ser entero 1-10' });
    }

    // Fetch need and verify it exists
    const need = await prisma.need.findUnique({ where: { id: needId } });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Verify need belongs to the correct tree
    if (need.treeId !== treeId) {
      return res.status(404).json({ error: 'Need not found in this tree' });
    }

    // Verify need is in a valid phase for difficulty voting
    if (need.cyclePhase && need.cyclePhase !== 'vote' && need.cyclePhase !== 'collect') {
      return res.status(400).json({ error: 'Need no está en fase de votación' });
    }

    // Atomic update: recalculate running average
    const currentCount = need.difficultyVotes;
    const currentAvg = need.difficultyAvg ?? 0;
    const newCount = currentCount + 1;
    const newAvg = (currentAvg * currentCount + rating) / newCount;

    await prisma.need.update({
      where: { id: needId },
      data: {
        difficultyAvg: Math.round(newAvg * 100) / 100,
        difficultyVotes: newCount,
      },
    });

    res.json({ difficultyAvg: Math.round(newAvg * 100) / 100, difficultyVotes: newCount });
  } catch (error) {
    console.error('[rateDifficulty] error:', error);
    res.status(500).json({ error: 'Failed to rate difficulty' });
  }
};

// ─── POST /api/trees/:treeId/needs/:needId/revive ────────────────
export const reviveNeed = async (req: any, res: Response) => {
  try {
    const { treeId, needId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify tree membership
    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Tree membership required' });
    }

    // Verify need exists, belongs to tree, and is REJECTED
    const need = await prisma.need.findUnique({
      where: { id: needId },
    });

    if (!need) {
      return res.status(404).json({ error: 'Need not found' });
    }

    if (need.treeId !== treeId) {
      return res.status(404).json({ error: 'Need does not belong to this tree' });
    }

    if (need.status !== 'REJECTED') {
      return res.status(400).json({ error: 'Only REJECTED needs can be revived' });
    }

    const updated = await prisma.need.update({
      where: { id: needId },
      data: {
        status: 'OPEN' as any,
        roundNumber: 1,
        cyclePhase: null,
        votingEndsAt: null,
        totalPoints: 0,
        difficultyAvg: null,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[reviveNeed] error:', error);
    res.status(500).json({ error: 'Failed to revive need' });
  }
};

// ─── GET /api/trees/:treeId/cycle/status ─────────────────────────
export const getCycleStatus = async (req: any, res: Response) => {
  try {
    const { treeId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get all needs in active cycle phases for this tree
    const cycleNeeds = await prisma.need.findMany({
      where: {
        treeId,
        cyclePhase: { in: ['collect', 'vote'] },
      },
      orderBy: [
        { cyclePhase: 'asc' },   // collect before vote
        { roundNumber: 'desc' },
      ],
    });

    // Separate by phase
    const now = new Date();
    const voteNeeds = cycleNeeds.filter(
      n => n.cyclePhase === 'vote' && n.votingEndsAt && n.votingEndsAt > now
    );
    const collectNeeds = cycleNeeds.filter(n => n.cyclePhase === 'collect' && n.status === 'OPEN');

    // Determine overall phase: "vote" > "collect" > "idle"
    const phase: 'vote' | 'collect' | 'idle' =
      voteNeeds.length > 0 ? 'vote' :
      collectNeeds.length > 0 ? 'collect' :
      'idle';

    // Find the nearest votingEndsAt
    const nearestEnd = voteNeeds
      .map(n => n.votingEndsAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const timeRemaining = nearestEnd
      ? Math.max(0, Math.floor((nearestEnd.getTime() - Date.now()) / 1000))
      : null;

    // Get user's available points
    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { cyclePoints: true, cyclePointsRefillAt: true },
    });

    if (!member) {
      return res.status(403).json({ error: 'Tree membership required' });
    }

    let availablePoints = member.cyclePoints;
    if (member.cyclePointsRefillAt && member.cyclePointsRefillAt <= now) {
      availablePoints = 25;
    }

    // Build needs array for current phase
    const currentNeeds = phase === 'vote' ? voteNeeds : phase === 'collect' ? collectNeeds : [];

    res.json({
      phase,
      timeRemaining,          // seconds, null if no deadline
      availablePoints,
      needs: currentNeeds.map(n => ({
        id: n.id,
        title: n.title,
        description: n.description,
        cyclePhase: n.cyclePhase,
        roundNumber: n.roundNumber,
        totalPoints: n.totalPoints,
        votingEndsAt: n.votingEndsAt,
        createdAt: n.createdAt,
      })),
      needsInCollect: collectNeeds.length,
      needsInVote: voteNeeds.length,
      currentRound: cycleNeeds[0]?.roundNumber ?? 1,
    });
  } catch (error) {
    console.error('[getCycleStatus] error:', error);
    res.status(500).json({ error: 'Failed to get cycle status' });
  }
};
