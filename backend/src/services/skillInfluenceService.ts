import { prisma } from '../index';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SkillInfluenceResult {
  treeId: string;
  skillTag: string;
  greenAvgDifficulty: number;
  goldenAvgDifficulty: number;
  greenInfluence: number;
  goldenInfluence: number;
  finalInfluence: number;
  greenMemberCount: number;
  goldenMemberCount: number;
}

// ── Normalization ─────────────────────────────────────────────────────────────

const MIN_DIFF = 3;   // minimum difficulty that counts
const MAX_DIFF = 10;  // maximum possible
const MIN_INFLUENCE = 20;
const MAX_INFLUENCE = 80;

/** Normalize average difficulty to influence range [20%, 80%] */
function normalizeInfluence(avgDifficulty: number): number {
  if (avgDifficulty < MIN_DIFF) return MIN_INFLUENCE;
  if (avgDifficulty > MAX_DIFF) return MAX_INFLUENCE;
  const ratio = (avgDifficulty - MIN_DIFF) / (MAX_DIFF - MIN_DIFF);
  return Math.round((MIN_INFLUENCE + ratio * (MAX_INFLUENCE - MIN_INFLUENCE)) * 100) / 100;
}

// ── Core calculation ──────────────────────────────────────────────────────────

/**
 * Calculate influence weight for a skill in a tree.
 *
 * Green experts (80% of specialists) determine 60% of the influence.
 * Golden experts (top 20% by level) determine 40% of the influence.
 * Each group's influence is normalized from their average task difficulty (dif ≥3).
 * Tasks from members with <6 months in the skill are excluded.
 */
export async function calculateSkillInfluence(
  treeId: string,
  skillTag: string,
): Promise<SkillInfluenceResult> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // 1. Find all completed tasks with this skill tag in this tree
  const completedTasks = await (prisma as any).task.findMany({
    where: {
      status: 'COMPLETED',
      difficulty: { gte: MIN_DIFF },
      branch: { treeId },
      tags: { some: { skillName: skillTag } },
    },
    select: {
      id: true,
      difficulty: true,
      assignedTo: true,
      completedAt: true,
    },
  });

  if (completedTasks.length === 0) {
    // No data → default to minimum influence
    const result: SkillInfluenceResult = {
      treeId,
      skillTag,
      greenAvgDifficulty: 0,
      goldenAvgDifficulty: 0,
      greenInfluence: MIN_INFLUENCE,
      goldenInfluence: MIN_INFLUENCE,
      finalInfluence: MIN_INFLUENCE,
      greenMemberCount: 0,
      goldenMemberCount: 0,
    };
    await upsertInfluence(result);
    return result;
  }

  // 2. Get member levels and first-task dates for antiquity check
  const memberIds = [...new Set(completedTasks.map((t: any) => t.assignedTo).filter(Boolean))];

  // For each member, find their first completed task with this skill tag
  const memberFirstTask = new Map<string, Date>();
  for (const memberId of memberIds) {
    const first = await (prisma as any).task.findFirst({
      where: {
        assignedTo: memberId,
        status: 'COMPLETED',
        tags: { some: { skillName: skillTag } },
      },
      orderBy: { completedAt: 'asc' },
      select: { completedAt: true },
    });
    if (first?.completedAt) {
      memberFirstTask.set(memberId, new Date(first.completedAt));
    }
  }

  // Get member levels in this tree
  const members = await (prisma as any).treeMember.findMany({
    where: {
      treeId,
      userId: { in: memberIds },
      status: 'VERIFIED',
    },
    select: { userId: true, level: true },
  });

  const memberLevelMap = new Map<string, number>();
  for (const m of members) {
    memberLevelMap.set(m.userId, m.level);
  }

  // 3. Filter tasks: exclude members with <6 months in skill
  const eligibleTasks = completedTasks.filter((t: any) => {
    const firstDate = memberFirstTask.get(t.assignedTo);
    return firstDate && firstDate <= sixMonthsAgo;
  });

  if (eligibleTasks.length === 0) {
    const result: SkillInfluenceResult = {
      treeId,
      skillTag,
      greenAvgDifficulty: 0,
      goldenAvgDifficulty: 0,
      greenInfluence: MIN_INFLUENCE,
      goldenInfluence: MIN_INFLUENCE,
      finalInfluence: MIN_INFLUENCE,
      greenMemberCount: 0,
      goldenMemberCount: 0,
    };
    await upsertInfluence(result);
    return result;
  }

  // 4. Group by member → avg difficulty per member
  const memberTasks = new Map<string, number[]>();
  for (const t of eligibleTasks) {
    if (!t.assignedTo) continue;
    if (!memberTasks.has(t.assignedTo)) memberTasks.set(t.assignedTo, []);
    memberTasks.get(t.assignedTo)!.push(t.difficulty || MIN_DIFF);
  }

  type MemberStats = { userId: string; avgDifficulty: number; level: number };
  const memberStats: MemberStats[] = [];

  for (const [userId, diffs] of memberTasks) {
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    memberStats.push({
      userId,
      avgDifficulty: Math.round(avg * 100) / 100,
      level: memberLevelMap.get(userId) || 1,
    });
  }

  // 5. Sort by level (desc) for golden/green split
  memberStats.sort((a, b) => b.level - a.level);
  const totalMembers = memberStats.length;

  // Golden = top 20% by level
  const goldenCount = Math.max(1, Math.ceil(totalMembers * 0.2));
  const goldenMembers = memberStats.slice(0, goldenCount);
  const greenMembers = memberStats; // green = all eligible (100%, not 80% — the 80/20 is influence split, not membership split)

  // 6. Calculate average difficulty per group
  const greenAvg = greenMembers.length > 0
    ? greenMembers.reduce((s, m) => s + m.avgDifficulty, 0) / greenMembers.length
    : 0;
  const goldenAvg = goldenMembers.length > 0
    ? goldenMembers.reduce((s, m) => s + m.avgDifficulty, 0) / goldenMembers.length
    : 0;

  // 7. Normalize to influence
  const greenInf = normalizeInfluence(greenAvg);
  const goldenInf = normalizeInfluence(goldenAvg);
  const final = Math.round((0.6 * greenInf + 0.4 * goldenInf) * 100) / 100;

  const result: SkillInfluenceResult = {
    treeId,
    skillTag,
    greenAvgDifficulty: Math.round(greenAvg * 100) / 100,
    goldenAvgDifficulty: Math.round(goldenAvg * 100) / 100,
    greenInfluence: greenInf,
    goldenInfluence: goldenInf,
    finalInfluence: final,
    greenMemberCount: greenMembers.length,
    goldenMemberCount: goldenMembers.length,
  };

  await upsertInfluence(result);
  return result;
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function upsertInfluence(result: SkillInfluenceResult) {
  await (prisma as any).skillInfluence.upsert({
    where: {
      treeId_skillTag: { treeId: result.treeId, skillTag: result.skillTag },
    },
    create: {
      treeId: result.treeId,
      skillTag: result.skillTag,
      greenAvgDifficulty: result.greenAvgDifficulty,
      goldenAvgDifficulty: result.goldenAvgDifficulty,
      greenInfluence: result.greenInfluence,
      goldenInfluence: result.goldenInfluence,
      finalInfluence: result.finalInfluence,
      calculatedAt: new Date(),
    },
    update: {
      greenAvgDifficulty: result.greenAvgDifficulty,
      goldenAvgDifficulty: result.goldenAvgDifficulty,
      greenInfluence: result.greenInfluence,
      goldenInfluence: result.goldenInfluence,
      finalInfluence: result.finalInfluence,
      calculatedAt: new Date(),
    },
  });
}

// ── Query ─────────────────────────────────────────────────────────────────────

/** Get the current influence weight for a skill in a tree. Returns 20% (minimum) if not yet calculated. */
export async function getInfluenceWeight(treeId: string, skillTag: string): Promise<number> {
  const record = await (prisma as any).skillInfluence.findUnique({
    where: { treeId_skillTag: { treeId, skillTag } },
    select: { finalInfluence: true },
  });
  return record?.finalInfluence ?? MIN_INFLUENCE;
}

/** Get all influence records for a tree */
export async function getTreeInfluences(treeId: string) {
  return (prisma as any).skillInfluence.findMany({
    where: { treeId },
    orderBy: { skillTag: 'asc' },
  });
}
