import { prisma } from '../index';

export const XP_PER_LEVEL = 50;

export interface RatingInput {
  role: string;
  stars: number;
}

export interface RatingResult {
  agentId: string;
  treeId: string;
  beforeLevel: number;
  beforeXp: number;
  afterLevel: number;
  afterXp: number;
  xpGained: number;
  leveledUp: boolean;
}

/**
 * Apply ratings to an agent in a tree context:
 * - Translates stars → XP (1:1)
 * - Calculates level-up (every XP_PER_LEVEL)
 * - Updates AgentMembership atomically
 */
export async function applyRatings(
  agentId: string,
  treeId: string,
  taskId: string,
  ratings: RatingInput[],
): Promise<RatingResult> {
  // Get current membership state
  const membership = await prisma.agentMembership.findUnique({
    where: { agentId_treeId: { agentId, treeId } },
  });

  if (!membership) {
    throw new Error(`Agent ${agentId} is not a member of tree ${treeId}`);
  }

  // Calculate total XP from this rating batch
  const xpGained = ratings.reduce((sum, r) => sum + r.stars, 0);

  const beforeLevel = membership.level;
  const beforeXp = membership.xp;

  const newXp = beforeXp + xpGained;
  const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;
  const leveledUp = newLevel > beforeLevel;

  // Create rating records + update membership in one transaction
  await prisma.$transaction([
    // Insert all individual rating records
    ...ratings.map((r) =>
      prisma.rating.create({
        data: {
          agentId,
          treeId,
          taskId,
          role: r.role,
          stars: r.stars,
        },
      }),
    ),
    // Update AgentMembership
    prisma.agentMembership.update({
      where: { agentId_treeId: { agentId, treeId } },
      data: { xp: newXp, level: newLevel },
    }),
  ]);

  return {
    agentId,
    treeId,
    beforeLevel,
    beforeXp,
    afterLevel: newLevel,
    afterXp: newXp,
    xpGained,
    leveledUp,
  };
}

export async function getAgentStats(agentId: string, treeId: string) {
  const membership = await prisma.agentMembership.findUnique({
    where: { agentId_treeId: { agentId, treeId } },
    select: { level: true, xp: true },
  });

  if (!membership) {
    return null;
  }

  const totalRatings = await prisma.rating.count({
    where: { agentId, treeId },
  });

  return {
    agentId,
    treeId,
    level: membership.level,
    xp: membership.xp,
    totalRatings,
  };
}
