import { prisma } from '../index';

/**
 * Calculates the relative points a branch receives from a specific user.
 * Formula: (Total User Points in Tree / Sum of User's 1-10 Votes for Branches in Tree) * User's 1-10 Vote for this Branch
 */
export async function calculateBranchPointsForUser(userId: string, branchId: string, treeId: string) {
  // 1. Get user's weekly need points in this tree
  const membership = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } }
  });
  if (!membership) return 0;
  
  const totalUserPoints = membership.weeklyNeedPoints;

  // 2. Get all 1-10 votes this user gave to branches in this tree
  const userVotesInTree = await prisma.branchNeedVote.findMany({
    where: {
      userId,
      branch: {
        OR: [
          { treeId },
          { idea: { need: { treeLinks: { some: { treeId } } } } }
        ]
      }
    }
  });

  const sumOfVotes = userVotesInTree.reduce((sum, v) => sum + v.score, 0);
  if (sumOfVotes === 0) return 0;

  // 3. Find the specific vote for this branch
  const specificVote = userVotesInTree.find(v => v.branchId === branchId);
  if (!specificVote) return 0;

  return (totalUserPoints / sumOfVotes) * specificVote.score;
}

/**
 * Calculates the total points assigned to a branch from all users.
 */
export async function calculateTotalBranchPoints(branchId: string) {
  const branch = await (prisma as any).branch.findUnique({
    where: { id: branchId },
    include: {
      tree: true,
      idea: { include: { need: { include: { treeLinks: true } } } },
      needVotes: true
    }
  });

  if (!branch) return 0;

  // A branch can be linked to multiple trees via NeedTree, but usually it's one tree for local context.
  // We'll iterate over all unique users who voted.
  const voterIds: string[] = Array.from(new Set(branch.needVotes.map((v: any) => v.userId as string)));
  let totalPoints = 0;

  for (const userId of voterIds) {
    // For each voter, we need to know WHICH tree they are allocating points from.
    // If it's a hashtag branch with a direct treeId:
    const treeId = branch.treeId || (branch.idea?.need?.treeLinks?.[0]?.treeId);
    if (!treeId) continue;

    totalPoints += await calculateBranchPointsForUser(userId, branchId, treeId);
  }

  return totalPoints;
}

/**
 * Calculates the points value of a specific task within its branch.
 * Formula: (Total Branch Points) * (Task Average Difficulty / Sum of Average Difficulties of all Tasks in Branch)
 */
export async function calculateTaskPoints(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { 
      branch: true,
      difficultyVotes: true
    }
  });

  if (!task || !task.branchId) return 0;

  // 1. Get total branch points
  const totalBranchPoints = await calculateTotalBranchPoints(task.branchId);
  if (totalBranchPoints === 0) return 0;

  // 2. Get all tasks in this branch
  const allTasksInBranch = await prisma.task.findMany({
    where: { branchId: task.branchId },
    include: { difficultyVotes: true }
  });

  // 3. Calculate average difficulty for each task
  const taskAverages = allTasksInBranch.map(t => {
    if (t.difficultyVotes.length === 0) return 0;
    const sum = t.difficultyVotes.reduce((s, v) => s + (v.value || (v as any).score || 0), 0);
    return sum / t.difficultyVotes.length;
  });

  const sumOfAverages = taskAverages.reduce((s, a) => s + a, 0);
  if (sumOfAverages === 0) return 0;

  // 4. Calculate average for THIS task
  const currentTaskSum = task.difficultyVotes.reduce((s, v) => s + (v.value || (v as any).score || 0), 0);
  const currentTaskAverage = task.difficultyVotes.length > 0 ? currentTaskSum / task.difficultyVotes.length : 0;

  return (totalBranchPoints / sumOfAverages) * currentTaskAverage;
}
