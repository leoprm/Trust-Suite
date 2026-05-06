import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { Request, Response } from 'express';
import { prisma } from '../index';

export const getDeliverable = async (req: any, res: Response) => {
  try {
    const { branchId, phase } = req.params;

    const deliverable = await prisma.phaseDeliverable.findFirst({
    // Update branch phase deliverables
    const branch = await (prisma as any).branch.findUnique({
      where: { id: deliverable.branchId },
      select: { treeId: true },
    });

    res.json(deliverable);

    void logEvent({
      ...getRequestContext(req),
      treeId: branch.treeId,
      actorId: userId,
      action: 'DELIVERABLE_SUBMITTED',
      entityType: 'PhaseDeliverable',
      entityId: deliverable.id,
      source: 'USER',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit deliverable' });
  }
};

export const submitDeliverable = async (req: any, res: Response) => {
  try {
    const { branchId, phase } = req.params;
    const { deliverableUrl } = req.body;
    const userId = req.user.id;

    if (!deliverableUrl) return res.status(400).json({ error: 'Deliverable URL is required' });

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { members: true }
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (branch.phase !== phase) return res.status(400).json({ error: `Branch is currently in ${branch.phase} phase, not ${phase}` });

    // Validate if the user is a member of this specific phase
    const member = branch.members.find(m => m.userId === userId);
    if (!member) return res.status(403).json({ error: 'You are not a member of this branch' });

    let joinedPhases: string[] = [];
    try { joinedPhases = JSON.parse(member.joinedPhases || '[]'); } catch {}
    
    if (!joinedPhases.includes(phase)) {
      return res.status(403).json({ error: `You have not joined the ${phase} phase` });
    }

    // Upsert deliverable
    const existing = await prisma.phaseDeliverable.findFirst({
      where: { branchId, phase: phase as any }
    });

    let deliverable;
    if (existing) {
      deliverable = await prisma.phaseDeliverable.update({
        where: { id: existing.id },
        data: { deliverableUrl, status: 'PENDING_REVIEW' }
      });
    } else {
      deliverable = await prisma.phaseDeliverable.create({
        data: {
          branchId,
          phase: phase as any,
          deliverableUrl,
          status: 'PENDING_REVIEW'
        }
      });
    }

    // Award initial 30% XP if not already awarded
    if (!deliverable.initialXpAwarded) {
      let activePhases = [];
      try { activePhases = JSON.parse(branch.activePhasesJson || '[]'); } catch {}
      if (activePhases.length === 0) activePhases = ['INVESTIGATION'];

      const basePhaseXP = branch.xpPool / activePhases.length;
      const initialXP = basePhaseXP * 0.30; // 30%

      const phaseMembers = branch.members.filter((m: any) => {
        let jps: string[] = [];
        try { jps = JSON.parse(m.joinedPhases || '[]'); } catch {}
        return jps.includes(phase);
      });

      if (phaseMembers.length > 0 && initialXP > 0) {
        const xpPerMember = initialXP / phaseMembers.length;
        // Get the branch's treeId by traversing idea->need->treeLinks
        const branchWithTree = await prisma.branch.findUnique({
          where: { id: branchId },
          include: { idea: { include: { need: { include: { treeLinks: true } } } } }
        });
        const treeId = branchWithTree?.idea?.need?.treeLinks?.[0]?.treeId;
        for (const m of phaseMembers) {
          if (treeId) {
            await prisma.treeMember.updateMany({
              where: { userId: m.userId, treeId },
              data: { xp: { increment: xpPerMember } }
            });
          }
        }
      }

      deliverable = await prisma.phaseDeliverable.update({
        where: { id: deliverable.id },
        data: { initialXpAwarded: true }
      });
    }

    res.json(deliverable);

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'DELIVERABLE_COMPLETED',
      entityType: 'PhaseDeliverable',
      entityId: deliverable.id,
      source: 'USER',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit deliverable' });
  }
};

export const rateDeliverable = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { rating } = req.body; // 0.0 to 5.0
    const userId = req.user.id;

    if (rating == null || isNaN(rating) || rating < 0 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 0.0 and 5.0 stars' });
    }

    const deliverable = await prisma.phaseDeliverable.findUnique({
      where: { id },
      include: { branch: true }
    });

    if (!deliverable) return res.status(404).json({ error: 'Deliverable not found' });
    
    if (deliverable.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This phase is already completed. Ratings are closed.' });
    }

    // For simplicity, anyone not in the specific phase team can rate, or specifically tree members.
    // For now we allow tree members to rate. The frontend can just ensure only non-team members can rate it.

    // Upsert rating
    const existingRating = await prisma.satisfactionRating.findUnique({
      where: { deliverableId_userId: { deliverableId: id, userId } }
    });

    let newRating;
    if (existingRating) {
      newRating = await prisma.satisfactionRating.update({
        where: { id: existingRating.id },
        data: { rating: Number(rating) }
      });
    } else {
      newRating = await prisma.satisfactionRating.create({
        data: {
          deliverableId: id,
          userId,
          rating: Number(rating)
        }
      });
    }

    res.json(newRating);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit rating' });
  }
};

export const completeDeliverable = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const deliverable = await prisma.phaseDeliverable.findUnique({
      where: { id },
      include: {
        branch: {
          include: { members: true, idea: true }
        },
        ratings: true
      }
    });

    if (!deliverable) return res.status(404).json({ error: 'Deliverable not found' });
    if (deliverable.status === 'COMPLETED') return res.status(400).json({ error: 'Deliverable already completed' });

    // Calculate Satisfaction
    const totalRatings = deliverable.ratings.length;
    let averageStars = 0;
    
    if (totalRatings > 0) {
      const sum = deliverable.ratings.reduce((acc: number, cur: any) => acc + cur.rating, 0);
      averageStars = sum / totalRatings; // 0.0 to 5.0
    }

    // 0 stars -> 0% BONUS, 5 stars -> 100% BONUS
    // Since 30% is already awarded at submission, the multiplier here is just the bonus.
    // Bonus Multiplier calculation: XP_Earned = Phase_XP_Pool * (Stars * 0.20)
    const satisfactionBonusMultiplier = averageStars * 0.20;
    
    // For phase xp chunking, we can distribute the pool equally among activePhases.
    // E.g. If activePhases length = 3, PhaseXP = xpPool / 3
    let activePhases = [];
    try { activePhases = JSON.parse(deliverable.branch.activePhasesJson || '[]'); } catch {}
    
    if (activePhases.length === 0) activePhases = ['INVESTIGATION'];

    const basePhaseXP = deliverable.branch.xpPool / activePhases.length;
    const distributedXP = basePhaseXP * satisfactionBonusMultiplier;

    // Distribute XP only to members of this specific phase
    const phaseMembers = deliverable.branch.members.filter((m: any) => {
      let jps: string[] = [];
      try { jps = JSON.parse(m.joinedPhases || '[]'); } catch {}
      return jps.includes(deliverable.phase);
    });

    if (phaseMembers.length > 0 && distributedXP > 0) {
      const xpPerMember = distributedXP / phaseMembers.length;
      // Get the branch's treeId
      const branchWithTree = await prisma.branch.findUnique({
        where: { id: deliverable.branchId },
        include: { idea: { include: { need: { include: { treeLinks: true } } } } }
      });
      const treeId = branchWithTree?.idea?.need?.treeLinks?.[0]?.treeId;
      for (const m of phaseMembers) {
        if (treeId) {
          await prisma.treeMember.updateMany({
            where: { userId: m.userId, treeId },
            data: { xp: { increment: xpPerMember } }
          });
        }
      }
    }

    // Move to next Phase in queue, if any
    const currentIndex = deliverable.branch.currentPhaseIndex;
    const nextIndex = currentIndex + 1;
    let nextPhase = deliverable.branch.phase; // fallback

    if (nextIndex < activePhases.length) {
      nextPhase = activePhases[nextIndex];
    }

    // Update branch properly (even if it's the last phase, we update the state to completed deliverables)
    await prisma.branch.update({
      where: { id: deliverable.branchId },
      data: {
        phase: nextPhase as any,
        currentPhaseIndex: nextIndex
      }
    });

    // Mark deliverable complete
    await prisma.phaseDeliverable.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });

    res.json({ message: 'Phase Completed Successfully', xpAwarded: distributedXP, nextPhase });

  } catch (error) {
    res.status(500).json({ error: 'Failed to complete deliverable' });
  }
};
