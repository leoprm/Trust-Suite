import { prisma } from '../index';

/**
 * Genesis Phase — Minimum specialists needed to activate Pareto (80/20).
 * Below this number, the hashtag is in "Genesis Phase":
 *   - No peer endorsements required to enter EN_PRUEBA
 *   - All ESPECIALISTA can access difficulty 9-10 tasks
 *   - ELITE_DORADO is dormant (not calculated)
 */
export const MIN_ESPECIALISTAS_PARETO = 10;

/**
 * Count how many ESPECIALISTA-level users exist for a given hashtag in a tree.
 * An ESPECIALISTA is a user with that skill in their TreeMember.skills JSON
 * who has completed >= 7 tasks tagged with that skill in that tree.
 */
export async function countSpecialists(
  treeId: string,
  hashtag: string
): Promise<number> {
  // Get all members who claim this skill
  const allMembers = await prisma.treeMember.findMany({
    where: { treeId },
    select: { userId: true, skills: true },
  });

  const membersWithSkill = allMembers.filter((m: any) => {
    const skills: string[] = JSON.parse(m.skills || '[]');
    return skills.some((s: string) => s.toLowerCase() === hashtag.toLowerCase());
  });

  if (membersWithSkill.length === 0) return 0;

  // Count how many have >= 7 completed tasks
  let count = 0;
  for (const m of membersWithSkill) {
    const completed = await prisma.task.count({
      where: {
        assignedTo: m.userId,
        status: 'COMPLETED',
        branch: { treeId },
        tags: { some: { skillName: hashtag } },
      },
    });
    if (completed >= 7) count++;
  }

  return count;
}

/**
 * Check if a hashtag in a tree is still in Genesis Phase.
 * Returns phase info including specialist count and how many more are needed.
 */
export async function getHashtagPhase(
  treeId: string,
  hashtag: string
): Promise<{
  phase: 'GENESIS' | 'MADUREZ';
  specialistCount: number;
  remaining: number;
  threshold: number;
}> {
  const specialistCount = await countSpecialists(treeId, hashtag);
  const isGenesis = specialistCount < MIN_ESPECIALISTAS_PARETO;

  return {
    phase: isGenesis ? 'GENESIS' : 'MADUREZ',
    specialistCount,
    remaining: Math.max(0, MIN_ESPECIALISTAS_PARETO - specialistCount),
    threshold: MIN_ESPECIALISTAS_PARETO,
  };
}

/**
 * Determine if endorsements are required for a new skill proposal.
 * Genesis Phase: no endorsements needed → direct EN_PRUEBA
 * Maturity Phase: 3 endorsements needed before EN_PRUEBA
 */
export function getRequiredEndorsements(phase: 'GENESIS' | 'MADUREZ'): number {
  return phase === 'GENESIS' ? 0 : 3;
}
