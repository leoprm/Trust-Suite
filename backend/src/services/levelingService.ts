import { prisma } from '../index';

// ── Constants ─────────────────────────────────────────────────────────────────

const XP_PER_LEVEL = 50;
const DAILY_DECAY_RATE = 0.005;

// ── Pure XP formulas ──────────────────────────────────────────────────────────

/** XP gained from completing a task */
export function calculateXpGain(difficulty: number, quality: number): number {
  return Math.round(difficulty * 10 * quality);
}

/** Current level from total XP */
export function xpToLevel(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/** XP remaining to reach next level */
export function xpToNextLevel(xp: number): number {
  const currentLevel = xpToLevel(xp);
  const xpForNext = currentLevel * XP_PER_LEVEL;
  return xpForNext - xp;
}

// ── Decay formulas ────────────────────────────────────────────────────────────

/** XP lost per day at current xp and level */
export function calculateDailyDecay(xp: number, level: number): number {
  return Math.round(xp * level * DAILY_DECAY_RATE);
}

/** Apply decay, returning new XP and level (min xp 0, min level 1) */
export function applyDecay(xp: number, level: number): { newXp: number; newLevel: number } {
  const decay = calculateDailyDecay(xp, level);
  const newXp = Math.max(0, xp - decay);
  const newLevel = Math.max(1, xpToLevel(newXp));
  return { newXp, newLevel };
}

// ── Award XP (side-effecting, uses Prisma) ────────────────────────────────────

interface AwardXpResult {
  workerSkill: { userId: string; skill: string; xp: number; level: number };
  leveledUp: boolean;
  levelsGained: number;
}

/** Award XP to a user for a given skill. Upserts WorkerSkill, logs history, and detects level-ups. */
export async function awardXp(
  userId: string,
  skill: string,
  xpDelta: number,
  reason: 'TASK_COMPLETED' | 'XP_DECAY' | 'ADMIN_ADJUST',
  taskId?: string,
): Promise<AwardXpResult> {
  // 1. Current state
  const current = await prisma.workerSkill.findUnique({
    where: { userId_skill: { userId, skill } },
  });

  const oldXp = current?.xp ?? 0;
  const oldLevel = current?.level ?? 1;
  const newXp = oldXp + xpDelta;
  const newLevel = xpToLevel(newXp);

  // 2. Upsert WorkerSkill
  const workerSkill = await prisma.workerSkill.upsert({
    where: { userId_skill: { userId, skill } },
    create: { userId, skill, xp: newXp, level: newLevel },
    update: { xp: newXp, level: newLevel },
  });

  // 3. Log history
  await prisma.workerLevelHistory.create({
    data: {
      userId,
      skill,
      xpDelta,
      reason,
      taskId,
    },
  });

  // 4. Return result
  const leveledUp = newLevel > oldLevel;
  return {
    workerSkill,
    leveledUp,
    levelsGained: newLevel - oldLevel,
  };
}
