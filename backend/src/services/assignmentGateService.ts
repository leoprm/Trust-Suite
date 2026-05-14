import { prisma } from '../index';

// ── AssignmentGate ────────────────────────────────────────────────────────────
// Assigns an AI to a task based on difficulty brackets and AI levels.
//
// Difficulty brackets:
//   1-3 → any free AI, random
//   4-6 → AI level >= 3
//   7-8 → AI level >= 5
//   9-10 → AI level >= 7
//
// Tie-breaking: Fisher-Yates shuffle among qualified AIs.
// Concurrency gate: skips AIs that already have maxConcurrentTasks active tasks.
// Returns the TreeMember id of the assigned AI, or null if none available.

const MAX_CONCURRENT_TASKS = 5;

/** Minimum AI level required for a given difficulty. */
function minLevelForDifficulty(difficulty: number): number {
  if (difficulty <= 3) return 1;
  if (difficulty <= 6) return 3;
  if (difficulty <= 8) return 5;
  return 7; // 9-10
}

/** Fisher-Yates in-place shuffle. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function assignAI(
  treeId: string,
  difficulty: number,
): Promise<string | null> {
  const minLevel = minLevelForDifficulty(difficulty);

  // 1. Find eligible AI members in this tree
  const eligibleAIs = await prisma.treeMember.findMany({
    where: {
      treeId,
      isAI: true,
      status: 'ACTIVE',
      aiStatus: { not: 'SUSPENDED' },
      level: { gte: minLevel },
    },
    select: {
      id: true,
      level: true,
      aiProfile: true,
    },
    orderBy: { level: 'desc' },
  });

  if (eligibleAIs.length === 0) {
    console.warn(
      `[assignmentGate] No eligible AI found for tree ${treeId} (minLevel=${minLevel}, difficulty=${difficulty})`,
    );
    return null;
  }

  // 2. Fetch concurrency counts for all eligible AIs in one query
  const concurrencyCounts = await Promise.all(
    eligibleAIs.map(async (ai) => {
      const count = await prisma.task.count({
        where: {
          assigneeId: ai.id,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      });
      return { aiId: ai.id, count };
    }),
  );

  // 3. Filter to AIs with free slots
  const available = eligibleAIs.filter((ai) => {
    const cc = concurrencyCounts.find((c) => c.aiId === ai.id);
    return (cc?.count ?? 0) < MAX_CONCURRENT_TASKS;
  });

  if (available.length === 0) {
    console.warn(
      `[assignmentGate] All ${eligibleAIs.length} eligible AIs at max concurrency (${MAX_CONCURRENT_TASKS})`,
    );
    return null;
  }

  // 4. Fisher-Yates shuffle for fair tie-breaking, pick first
  const shuffled = shuffle([...available]);
  const chosen = shuffled[0];

  console.log(
    `[assignmentGate] Assigned AI ${chosen.aiProfile || chosen.id} (level=${chosen.level}) to difficulty-${difficulty} task`,
  );

  return chosen.id;
}
