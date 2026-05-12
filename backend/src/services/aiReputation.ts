import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ── Constants ────────────────────────────────────────────────────────────────

/** XP per level: XP needed to reach level N = BASE_XP * N^1.5 */
const BASE_XP = 100;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function xpForLevel(level: number): number {
  return Math.floor(BASE_XP * Math.pow(level, 1.5));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) {
    level++;
  }
  return level;
}

/**
 * Gets satisfaction percentage from existing SatisfactionRatings for a deliverable,
 * or a default mid-range value if none exist yet.
 */
export async function getSatisfactionPct(
  deliverableId: string,
): Promise<number> {
  try {
    const ratings = await prisma.satisfactionRating.findMany({
      where: { deliverableId },
      select: { rating: true },
    });
    if (ratings.length === 0) return 70; // default mid-range until ratings come in
    return ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  } catch {
    return 70;
  }
}

// ── 1. Award XP on task completion ───────────────────────────────────────────

export interface AITaskXpResult {
  xpGained: number;
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
}

/**
 * Awards XP to an AI member when a task is completed.
 * XP = difficulty × satisfactionPct
 */
export async function awardAiTaskXp(
  memberId: string,
  taskId: string,
  satisfactionPct: number,
): Promise<AITaskXpResult | null> {
  const member = await prisma.treeMember.findUnique({
    where: { id: memberId },
    select: { id: true, isAI: true, xp: true, level: true, treeId: true, aiProfile: true },
  });

  if (!member || !member.isAI) {
    console.warn(`[AI Reputation] awardAiTaskXp: member ${memberId} is not an AI`);
    return null;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { difficulty: true },
  });

  const difficulty = task?.difficulty ?? 5;
  const xpGained = Math.round(difficulty * satisfactionPct);
  const newXp = member.xp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > member.level;

  await prisma.treeMember.update({
    where: { id: memberId },
    data: {
      xp: newXp,
      level: newLevel,
    },
  });

  // Log
  void logEvent({
    treeId: member.treeId,
    actorId: null,
    action: 'AI_XP_GAINED',
    entityType: 'TreeMember',
    entityId: memberId,
    metadataJson: {
      taskId,
      difficulty,
      satisfactionPct,
      xpGained,
      newXp,
      newLevel,
      leveledUp,
      aiProfile: member.aiProfile,
    },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  // Create notification for the AI's user
  try {
    await prisma.notification.create({
      data: {
        userId: (await prisma.treeMember.findUnique({
          where: { id: memberId },
          select: { userId: true },
        }))!.userId,
        type: leveledUp ? 'LEVEL_UP' : 'XP_GAIN',
        category: 'MERITO',
        title: leveledUp
          ? `AI @${member.aiProfile} subió al nivel ${newLevel}`
          : `AI @${member.aiProfile} ganó ${xpGained} XP`,
        body: leveledUp
          ? `El AI @${member.aiProfile} ha subido al nivel ${newLevel} tras completar la tarea. Total XP: ${newXp}.`
          : `El AI @${member.aiProfile} ganó ${xpGained} XP por completar la tarea (dificultad ${difficulty}, satisfacción ${satisfactionPct}%). Total: ${newXp} XP.`,
        entityType: 'tarea',
        entityAction: 'hacer',
        entityId: taskId,
      },
    });
  } catch (notifErr: any) {
    console.warn(`[AI Reputation] Notification failed:`, notifErr.message);
  }

  return { xpGained, newXp, newLevel, leveledUp };
}

// ── 2. Update Skill XP ───────────────────────────────────────────────────────

/**
 * Updates UserSkillXP for each skill tag on a completed task.
 * Uses the AI's user association (userId on TreeMember).
 */
export async function updateAiSkillXp(
  memberId: string,
  taskId: string,
): Promise<void> {
  const member = await prisma.treeMember.findUnique({
    where: { id: memberId },
    select: { id: true, isAI: true, userId: true, treeId: true },
  });

  if (!member || !member.isAI) {
    console.warn(`[AI Reputation] updateAiSkillXp: member ${memberId} is not an AI`);
    return;
  }

  const tags = await prisma.taskTag.findMany({
    where: { taskId },
    select: { skillName: true },
  });

  if (tags.length === 0) return;

  for (const tag of tags) {
    const skillName = tag.skillName;
    if (!skillName) continue;

    try {
      await prisma.userSkillXP.upsert({
        where: {
          userId_skillTag_treeId: {
            userId: member.userId,
            skillTag: skillName,
            treeId: member.treeId,
          },
        },
        create: {
          userId: member.userId,
          skillTag: skillName,
          treeId: member.treeId,
          accumulatedPoints: 1,
          completedTasks: 1,
        },
        update: {
          accumulatedPoints: { increment: 1 },
          completedTasks: { increment: 1 },
        },
      });
    } catch (err: any) {
      console.warn(
        `[AI Reputation] updateAiSkillXp failed for skill "${skillName}":`,
        err.message,
      );
    }
  }

  // Also update the AI's skills JSON on TreeMember
  try {
    const currentSkills = member.isAI
      ? await prisma.treeMember.findUnique({
          where: { id: memberId },
          select: { skills: true },
        })
      : null;

    if (currentSkills) {
      let skillsArr: string[] = [];
      try {
        skillsArr = JSON.parse(currentSkills.skills || '[]');
      } catch {}

      for (const tag of tags) {
        if (!skillsArr.includes(tag.skillName)) {
          skillsArr.push(tag.skillName);
        }
      }

      await prisma.treeMember.update({
        where: { id: memberId },
        data: { skills: JSON.stringify(skillsArr) },
      });
    }
  } catch (err: any) {
    console.warn(`[AI Reputation] Failed to update skills JSON:`, err.message);
  }
}

// ── 3. Reputation Card ────────────────────────────────────────────────────────

export interface AIReputationCard {
  memberId: string;
  aiProfile: string;
  aiProvider: string | null;
  aiModel: string | null;
  totalTasksCompleted: number;
  avgSatisfaction: number;
  avgDeliveryTimeHours: number | null;
  topSkills: { skillTag: string; accumulatedPoints: number; completedTasks: number }[];
  badges: string[];
  xp: number;
  level: number;
  autoClaimEnabled: boolean | null;
}

export async function getAiReputation(memberId: string): Promise<AIReputationCard | null> {
  const member = await prisma.treeMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      isAI: true,
      aiProfile: true,
      aiProvider: true,
      aiModel: true,
      xp: true,
      level: true,
      userId: true,
      treeId: true,
      aiConfig: {
        select: { autoClaimEnabled: true },
      },
    },
  });

  if (!member || !member.isAI) return null;

  // Count completed tasks by this AI (via AiExecution)
  const completedTasks = await prisma.aiExecution.findMany({
    where: {
      aiMemberId: memberId,
      status: 'COMPLETED',
    },
    include: {
      task: {
        select: {
          id: true,
          difficulty: true,
          completedAt: true,
          branchId: true,
        },
      },
    },
  });

  const totalTasksCompleted = completedTasks.length;

  // Avg satisfaction from deliverables' satisfaction ratings
  let totalSatisfaction = 0;
  let satisfactionCount = 0;
  let totalDeliveryMs = 0;
  let deliveryCount = 0;

  for (const exec of completedTasks) {
    if (!exec.task) continue;

    // Get deliverable for the task
    const deliverable = await prisma.phaseDeliverable.findFirst({
      where: { branchId: exec.task.branchId ?? undefined },
      include: { ratings: { select: { rating: true } } },
    });

    if (deliverable?.ratings?.length) {
      for (const r of deliverable.ratings) {
        totalSatisfaction += r.rating;
        satisfactionCount++;
      }
    }

    // Delivery time: completedAt - exec's completedAt (approximation)
    if (exec.completedAt && exec.createdAt) {
      totalDeliveryMs += exec.completedAt.getTime() - exec.createdAt.getTime();
      deliveryCount++;
    }
  }

  const avgSatisfaction =
    satisfactionCount > 0
      ? Math.round((totalSatisfaction / satisfactionCount) * 100) / 100
      : 0;

  const avgDeliveryTimeHours =
    deliveryCount > 0
      ? Math.round((totalDeliveryMs / deliveryCount / (1000 * 60 * 60)) * 100) / 100
      : null;

  // Top skills from UserSkillXP
  const topSkills = await prisma.userSkillXP.findMany({
    where: { userId: member.userId, treeId: member.treeId },
    orderBy: { accumulatedPoints: 'desc' },
    take: 5,
    select: {
      skillTag: true,
      accumulatedPoints: true,
      completedTasks: true,
    },
  });

  // Badges
  const badges: string[] = [];
  if (member.aiProfile) {
    badges.push(`AI Agent — Hermes/${member.aiProfile}`);
  }
  if (member.aiConfig?.autoClaimEnabled) {
    badges.push('Auto-claim habilitado');
  }
  if (totalTasksCompleted >= 100) {
    badges.push('Centurión — 100+ tareas completadas');
  } else if (totalTasksCompleted >= 50) {
    badges.push('Veterano — 50+ tareas completadas');
  } else if (totalTasksCompleted >= 10) {
    badges.push('Activo — 10+ tareas completadas');
  }

  return {
    memberId: member.id,
    aiProfile: member.aiProfile || 'unknown',
    aiProvider: member.aiProvider,
    aiModel: member.aiModel,
    totalTasksCompleted,
    avgSatisfaction,
    avgDeliveryTimeHours,
    topSkills,
    badges,
    xp: member.xp,
    level: member.level,
    autoClaimEnabled: member.aiConfig?.autoClaimEnabled || null,
  };
}

// ── 4. AI Leaderboard ─────────────────────────────────────────────────────────

export interface AILeaderboardEntry {
  rank: number;
  memberId: string;
  aiProfile: string;
  xp: number;
  level: number;
  tasksCompleted: number;
  topSkill: string | null;
}

export async function getAiLeaderboard(treeId: string): Promise<AILeaderboardEntry[]> {
  const ais = await prisma.treeMember.findMany({
    where: { treeId, isAI: true, status: 'VERIFIED' },
    orderBy: { xp: 'desc' },
    select: {
      id: true,
      aiProfile: true,
      xp: true,
      level: true,
      userId: true,
    },
  });

  const leaderboard: AILeaderboardEntry[] = [];

  for (let i = 0; i < ais.length; i++) {
    const ai = ais[i];

    // Count completed tasks
    const tasksCompleted = await prisma.aiExecution.count({
      where: { aiMemberId: ai.id, status: 'COMPLETED' },
    });

    // Get top skill
    const topSkill = await prisma.userSkillXP.findFirst({
      where: { userId: ai.userId, treeId },
      orderBy: { accumulatedPoints: 'desc' },
      select: { skillTag: true },
    });

    leaderboard.push({
      rank: i + 1,
      memberId: ai.id,
      aiProfile: ai.aiProfile || 'unknown',
      xp: ai.xp,
      level: ai.level,
      tasksCompleted,
      topSkill: topSkill?.skillTag || null,
    });
  }

  return leaderboard;
}

// ── 5. Escrow integration ────────────────────────────────────────────────────

/**
 * When an AI completes a task, redirect PLEDGED payments from the AI member
 * to the AI owner's TreeMember in the same tree.
 * Returns the number of payments redirected.
 */
export async function redirectAiPaymentsToOwner(
  aiMemberId: string,
  taskId: string,
): Promise<number> {
  const member = await prisma.treeMember.findUnique({
    where: { id: aiMemberId },
    select: { id: true, aiOwnerId: true, treeId: true },
  });

  if (!member?.aiOwnerId) {
    // No owner set — nothing to redirect
    return 0;
  }

  // Find owner's TreeMember in the same tree
  const ownerMember = await prisma.treeMember.findUnique({
    where: {
      userId_treeId: {
        userId: member.aiOwnerId,
        treeId: member.treeId,
      },
    },
    select: { id: true },
  });

  if (!ownerMember) {
    console.warn(
      `[AI Reputation] AI owner ${member.aiOwnerId} is not a member of tree ${member.treeId}`,
    );
    return 0;
  }

  // Find PLEDGED payments for this task that are assigned to the AI member
  const payments = await prisma.memberPayment.findMany({
    where: {
      taskId,
      memberId: aiMemberId,
      status: 'PLEDGED',
    },
    select: { id: true },
  });

  let count = 0;
  for (const payment of payments) {
    try {
      await prisma.memberPayment.update({
        where: { id: payment.id },
        data: { memberId: ownerMember.id },
      });
      count++;
    } catch (err: any) {
      console.warn(`[AI Reputation] Failed to redirect payment ${payment.id}:`, err.message);
    }
  }

  if (count > 0) {
    void logEvent({
      treeId: member.treeId,
      actorId: null,
      action: 'AI_PAYMENT_REDIRECTED',
      entityType: 'MemberPayment',
      entityId: payments[0]?.id || aiMemberId,
      metadataJson: {
        aiMemberId,
        ownerUserId: member.aiOwnerId,
        ownerMemberId: ownerMember.id,
        taskId,
        paymentsRedirected: count,
      },
      severity: 'INFO',
      source: 'AUTOMATION',
    });
  }

  return count;
}
