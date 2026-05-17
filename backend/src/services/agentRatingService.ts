import { prisma } from '../index';

export const XP_PER_LEVEL = 50;

export interface InterventionDimensions {
  useful: boolean;
  annoying: boolean;
  correct: boolean;
  comment?: string;
}

export interface RateResult {
  intervention: {
    id: string;
    agentId: string;
    treeId: string;
    description: string | null;
    createdAt: Date;
  };
  rating: {
    id: string;
    useful: boolean;
    annoying: boolean;
    correct: boolean;
    comment: string | null;
  };
  xpResult: {
    beforeXp: number;
    beforeLevel: number;
    xpDelta: number;
    afterXp: number;
    afterLevel: number;
    leveledUp: boolean;
  } | null;
}

/**
 * Rate an agent's intervention.
 * Creates an intervention record + rating, adjusts XP on AgentMembership.
 * XP rules:
 *   - correct + useful: +10 XP
 *   - correct only: +5 XP
 *   - useful only: +3 XP
 *   - annoying: -3 XP (floor 0)
 *   - none: +1 XP (acknowledgment)
 */
export async function rateAgentIntervention(
  agentId: string,
  treeId: string,
  userId: string,
  dimensions: InterventionDimensions,
  description?: string,
): Promise<RateResult> {
  // Verify agent is a member of the tree
  const membership = await prisma.agentMembership.findUnique({
    where: { agentId_treeId: { agentId, treeId } },
  });

  if (!membership) {
    throw new Error(`Agent ${agentId} is not a member of tree ${treeId}`);
  }

  // Verify user is a member of the tree
  const userMember = await prisma.treeMember.findFirst({
    where: { userId, treeId, status: 'ACTIVE' },
  });

  if (!userMember) {
    throw new Error(`User ${userId} is not an active member of tree ${treeId}`);
  }

  // Create intervention first, then rating linked to it
  const { useful, annoying, correct } = dimensions;
  const intervention = await prisma.agentIntervention.create({
    data: {
      agentId,
      treeId,
      description: description || null,
    },
  });

  const rating = await prisma.agentInterventionRating.create({
    data: {
      interventionId: intervention.id,
      userId,
      useful,
      annoying,
      correct,
      comment: dimensions.comment || null,
    },
  });

  // Calculate XP delta
  let xpDelta = 1; // Default acknowledgment
  if (correct && useful) {
    xpDelta = 10;
  } else if (correct) {
    xpDelta = 5;
  } else if (useful) {
    xpDelta = 3;
  } else if (annoying) {
    xpDelta = -3;
  }

  // Apply XP to AgentMembership
  const beforeXp = membership.xp;
  const beforeLevel = membership.level;
  const newXp = Math.max(0, beforeXp + xpDelta);
  const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;
  const leveledUp = newLevel > beforeLevel;

  await prisma.agentMembership.update({
    where: { agentId_treeId: { agentId, treeId } },
    data: { xp: newXp, level: newLevel },
  });

  // Also update AgentProfile cross-tree stats
  await prisma.agentProfile.upsert({
    where: { agentId },
    create: { agentId },
    update: {
      totalRatings: { increment: 1 },
      lastActiveAt: new Date(),
    },
  });

  return {
    intervention: {
      id: intervention.id,
      agentId: intervention.agentId,
      treeId: intervention.treeId,
      description: intervention.description,
      createdAt: intervention.createdAt,
    },
    rating: {
      id: rating.id,
      useful: rating.useful,
      annoying: rating.annoying,
      correct: rating.correct,
      comment: rating.comment,
    },
    xpResult: {
      beforeXp,
      beforeLevel,
      xpDelta,
      afterXp: newXp,
      afterLevel: newLevel,
      leveledUp,
    },
  };
}

export interface PenaltyResult {
  vote: {
    id: string;
    penalty: string;
  };
  thresholdMet: boolean;
  penaltyApplied: boolean;
  appliedPenalty?: string;
  xpResult?: {
    beforeXp: number;
    beforeLevel: number;
    afterXp: number;
    afterLevel: number;
    xpLost: number;
  };
  voteCount: number;
  totalMembers: number;
}

/**
 * Cast a penalty vote against an agent intervention.
 * After voting, checks if threshold is met (>50% of active tree members).
 * If XP_LOSS threshold met: deducts 20% of XP (min 1 level drop if >0).
 * If BEHAVIOR_REVIEW threshold met: flags the agent profile (sets explorationEligible=false).
 */
export async function penalizeAgent(
  agentId: string,
  treeId: string,
  interventionId: string,
  userId: string,
  penalty: 'XP_LOSS' | 'BEHAVIOR_REVIEW' | 'NO_ACTION',
): Promise<PenaltyResult> {
  // Verify intervention exists and belongs to this agent/tree
  const intervention = await prisma.agentIntervention.findUnique({
    where: { id: interventionId },
  });

  if (!intervention || intervention.agentId !== agentId || intervention.treeId !== treeId) {
    throw new Error('Intervention not found or does not match agent/tree');
  }

  // Verify user is an active tree member
  const userMember = await prisma.treeMember.findFirst({
    where: { userId, treeId, status: 'ACTIVE' },
  });

  if (!userMember) {
    throw new Error(`User ${userId} is not an active member of tree ${treeId}`);
  }

  // Cast the vote (idempotent via upsert to handle unique constraint)
  const vote = await prisma.agentPenaltyVote.upsert({
    where: {
      interventionId_userId: { interventionId, userId },
    },
    create: {
      interventionId,
      userId,
      penalty,
    },
    update: {
      penalty,
    },
  });

  // Check threshold: >50% of active tree members
  const [totalMembers, voteCount] = await Promise.all([
    prisma.treeMember.count({
      where: { treeId, status: 'ACTIVE' },
    }),
    prisma.agentPenaltyVote.count({
      where: { interventionId },
    }),
  ]);

  const thresholdMet = totalMembers > 0 && voteCount > totalMembers / 2;

  let penaltyApplied = false;
  let xpResult: PenaltyResult['xpResult'] = undefined;
  let appliedPenalty: string | undefined = undefined;

  if (thresholdMet) {
    // Determine winning penalty by majority
    const votesByPenalty = await prisma.agentPenaltyVote.groupBy({
      by: ['penalty'],
      where: { interventionId },
      _count: { penalty: true },
    });

    const winner = votesByPenalty.reduce((best, curr) =>
      curr._count.penalty > best._count.penalty ? curr : best
    );

    if (winner.penalty === 'XP_LOSS') {
      // Apply XP penalty: 20% loss, minimum 1 level drop if >0 XP
      const membership = await prisma.agentMembership.findUnique({
        where: { agentId_treeId: { agentId, treeId } },
      });

      if (membership && membership.xp > 0) {
        const xpLost = Math.max(
          Math.ceil(membership.xp * 0.2), // 20% of current
          membership.xp % XP_PER_LEVEL || XP_PER_LEVEL // At least to previous level boundary
        );
        // Ensure we don't lose more than we have and drop at most 1 level
        const actualLoss = Math.min(xpLost, membership.xp);
        const newXp = Math.max(0, membership.xp - actualLoss);
        const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;

        await prisma.agentMembership.update({
          where: { agentId_treeId: { agentId, treeId } },
          data: { xp: newXp, level: newLevel },
        });

        xpResult = {
          beforeXp: membership.xp,
          beforeLevel: membership.level,
          afterXp: newXp,
          afterLevel: newLevel,
          xpLost: actualLoss,
        };
        penaltyApplied = true;
        appliedPenalty = 'XP_LOSS';
      }
    } else if (winner.penalty === 'BEHAVIOR_REVIEW') {
      // Flag agent: mark explorationEligible=false (under review)
      await prisma.agentProfile.update({
        where: { agentId },
        data: { explorationEligible: false },
      });
      penaltyApplied = true;
      appliedPenalty = 'BEHAVIOR_REVIEW';
    }
    // NO_ACTION: threshold met but no penalty to apply
  }

  return {
    vote: { id: vote.id, penalty: vote.penalty },
    thresholdMet,
    penaltyApplied,
    appliedPenalty,
    xpResult,
    voteCount,
    totalMembers,
  };
}

/**
 * Get public stats for an agent in a tree context.
 * Includes: level, xp, recent ratings summary, penalty history.
 */
export async function getAgentPublicStats(agentId: string, treeId: string) {
  const membership = await prisma.agentMembership.findUnique({
    where: { agentId_treeId: { agentId, treeId } },
    include: {
      agent: { select: { name: true, type: true, description: true } },
    },
  });

  if (!membership) {
    return null;
  }

  // Recent intervention ratings (last 20)
  const recentInterventions = await prisma.agentIntervention.findMany({
    where: { agentId, treeId },
    include: {
      ratings: {
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { useful: true, annoying: true, correct: true, createdAt: true },
      },
      penaltyVotes: {
        select: { penalty: true },
      },
      _count: { select: { ratings: true, penaltyVotes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Aggregate rating stats
  const allRatings = await prisma.agentInterventionRating.findMany({
    where: {
      intervention: { agentId, treeId },
    },
    select: { useful: true, annoying: true, correct: true },
  });

  const ratingStats = {
    total: allRatings.length,
    useful: allRatings.filter(r => r.useful).length,
    annoying: allRatings.filter(r => r.annoying).length,
    correct: allRatings.filter(r => r.correct).length,
  };

  // Active penalty counts
  const activePenalties = await prisma.agentPenaltyVote.count({
    where: {
      intervention: { agentId, treeId },
    },
  });

  return {
    agentId,
    treeId,
    name: membership.agent.name,
    type: membership.agent.type,
    level: membership.level,
    xp: membership.xp,
    xpToNextLevel: XP_PER_LEVEL - (membership.xp % XP_PER_LEVEL),
    ratingStats,
    activePenalties,
    recentInterventions,
  };
}
