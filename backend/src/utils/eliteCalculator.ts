import { prisma } from '../index';
import { getTicketStatus } from './goldenTicketEngine';
import { getHashtagPhase } from './genesisPhase';

/**
 * Compute the elite tier for a user on a specific skill in a specific tree.
 *
 * Rules:
 *  - INTERNO:       < 7 completed tasks with that tag in that tree
 *  - ESPECIALISTA:  >= 7 completed tasks, but NOT in top 20%
 *  - ELITE_DORADO:  >= 7 completed tasks AND in top 20% by completed count
 *
 * Genesis Phase (<10 specialists): ELITE_DORADO is dormant — all >=7 are ESPECIALISTA
 * Maturity Phase (>=10):           ELITE_DORADO activated (Pareto 80/20)
 *
 * Returns { tier, completedTasks, rank, totalSpecialists, phase }
 */
export async function computeSkillTier(
  userId: string,
  skillName: string,
  treeId: string
): Promise<{
  tier: 'INTERNO' | 'ESPECIALISTA' | 'ELITE_DORADO';
  completedTasks: number;
  accumulatedPoints: number;
  rank: number;
  totalSpecialists: number;
  phase: 'GENESIS' | 'MADUREZ';
}> {
  // Try to get data from UserSkillXP table first (faster, pre-aggregated)
  const skillXP = await (prisma as any).userSkillXP.findUnique({
    where: { userId_skillTag_treeId: { userId, skillTag: skillName, treeId } },
  });

  const completedTasks = skillXP?.completedTasks ?? await (prisma as any).task.count({
    where: {
      assignedTo: userId,
      status: 'COMPLETED',
      branch: { treeId },
      tags: { some: { skillName } },
    },
  });

  const accumulatedPoints = skillXP?.accumulatedPoints ?? 0;

  // Determine phase
  const phaseInfo = await getHashtagPhase(treeId, skillName);
  const { phase } = phaseInfo;

  if (completedTasks < 7) {
    return { tier: 'INTERNO', completedTasks, accumulatedPoints, rank: 0, totalSpecialists: phaseInfo.specialistCount, phase };
  }

  // Genesis Phase: ELITE_DORADO is dormant — everyone with >=7 is ESPECIALISTA
  if (phase === 'GENESIS') {
    return { tier: 'ESPECIALISTA', completedTasks, accumulatedPoints, rank: 1, totalSpecialists: phaseInfo.specialistCount, phase };
  }

  // Maturity Phase: activate Pareto 80/20 using accumulatedPoints from UserSkillXP
  // Use cached percentile if available (updated hourly by cron)
  if (skillXP?.cachedPercentile != null) {
    const tier = skillXP.cachedPercentile >= 80 ? 'ELITE_DORADO' : 'ESPECIALISTA';
    // Approximate rank from percentile
    const allSpecialists = await (prisma as any).userSkillXP.count({
      where: { skillTag: skillName, treeId, completedTasks: { gte: 7 } },
    });
    const rank = Math.max(1, Math.ceil((100 - skillXP.cachedPercentile) / 100 * allSpecialists));
    return { tier, completedTasks, accumulatedPoints, rank, totalSpecialists: allSpecialists, phase };
  }

  // Fallback: real-time calculation using accumulatedPoints
  const allRecords = await (prisma as any).userSkillXP.findMany({
    where: { skillTag: skillName, treeId, completedTasks: { gte: 7 } },
    orderBy: { accumulatedPoints: 'desc' },
    select: { userId: true, accumulatedPoints: true },
  });

  if (allRecords.length === 0) {
    return { tier: 'ESPECIALISTA', completedTasks, accumulatedPoints, rank: 1, totalSpecialists: 1, phase };
  }

  const topCutoff = Math.max(1, Math.ceil(allRecords.length * 0.2));
  const rank = allRecords.findIndex((r: any) => r.userId === userId) + 1;

  const tier = rank > 0 && rank <= topCutoff ? 'ELITE_DORADO' : 'ESPECIALISTA';
  return { tier, completedTasks, accumulatedPoints, rank, totalSpecialists: allRecords.length, phase };
}

/**
 * Check if a user can assume a task based on difficulty and their skill tier.
 *
 * Difficulty 1-8: any member can assume.
 * Difficulty 9-10:
 *   - Genesis Phase (<10 specialists): ABSOLUTE BLOCK — nobody can assume
 *   - Maturity Phase (>=10):           only ELITE_DORADO or Golden Ticket holders
 *
 * Returns { allowed, reason?, tier?, goldenTickets?, phase?, specialistCount?, hashtag? }
 */
export async function canAssumeTask(
  userId: string,
  taskId: string
): Promise<{
  allowed: boolean;
  reason?: string;
  tier?: string;
  goldenTickets?: number;
  phase?: string;
  specialistCount?: number;
  hashtag?: string;
}> {
  const task = await (prisma as any).task.findUnique({
    where: { id: taskId },
    include: { tags: true, branch: { select: { treeId: true } } },
  });

  if (!task) return { allowed: false, reason: 'Tarea no encontrada' };

  const difficulty = task.difficulty || 0;

  // Difficulty 1-8: no tier gate
  if (difficulty < 9) return { allowed: true };

  // Difficulty 9-10: check tags and phases
  const treeId = task.branch?.treeId;
  if (!treeId) return { allowed: true };

  const taskTags: string[] = (task.tags || []).map((t: any) => t.skillName);
  if (taskTags.length === 0) return { allowed: true };

  // Check each tag — if ANY tag is in Genesis, the task is blocked for everyone
  for (const tag of taskTags) {
    const phaseInfo = await getHashtagPhase(treeId, tag);
    if (phaseInfo.phase === 'GENESIS') {
      return {
        allowed: false,
        phase: 'GENESIS',
        specialistCount: phaseInfo.specialistCount,
        hashtag: tag,
        reason: `El gremio de ${tag} aún está en formación (${phaseInfo.specialistCount}/10 expertos). Invita a más especialistas para desbloquear contratos de nivel crítico.`,
      };
    }
  }

  // Maturity Phase: only ELITE_DORADO can access
  for (const tag of taskTags) {
    const result = await computeSkillTier(userId, tag, treeId);
    if (result.tier === 'ELITE_DORADO') {
      return { allowed: true, tier: 'ELITE_DORADO', phase: 'MADUREZ' };
    }
  }

  // Check Golden Tickets
  for (const tag of taskTags) {
    const { tickets } = await getTicketStatus(userId, treeId, tag);
    if (tickets > 0) {
      return { allowed: true, tier: 'GOLDEN_TICKET', goldenTickets: tickets, phase: 'MADUREZ' };
    }
  }

  return {
    allowed: false,
    phase: 'MADUREZ',
    reason: 'Tarea Crítica: Debes pertenecer al 20% superior de tu gremio (Golden Hashtag) o tener un Golden Ticket para asumir este nivel de responsabilidad.',
  };
}
