// ── LevelingService ──────────────────────────────────────────────────────────
// Awards XP to workers based on task difficulty * quality.
// Upserts WorkerSkill and creates WorkerLevelHistory entries.
// Formula: baseXp = difficulty * quality * 10 (0–100 XP per task).
// Also exports decay functions for the daily XP decay cron.

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

/**
 * Award XP to a worker for completing a task.
 * XP is distributed evenly across all matching skills.
 * Creates WorkerLevelHistory entries for tracking.
 */
export async function awardXp(
  userId: string,
  skills: string[],
  difficulty: number,
  quality: number,
  taskId: string,
): Promise<{ totalXp: number; updatedSkills: string[] }> {
  if (!skills.length || difficulty < 1 || quality <= 0) {
    return { totalXp: 0, updatedSkills: [] };
  }

  // Base XP per skill: difficulty * quality * 10, distributed across skills
  const baseXp = Math.round(difficulty * quality * 10);
  const xpPerSkill = Math.max(1, Math.round(baseXp / skills.length));
  const updatedSkills: string[] = [];

  for (const skill of skills) {
    try {
      // Upsert WorkerSkill: increment XP, recompute level
      const existing = await prisma.workerSkill.findUnique({
        where: { userId_skill: { userId, skill } },
        select: { xp: true, level: true },
      });

      const totalXp = (existing?.xp ?? 0) + xpPerSkill;
      const newLevel = xpToLevel(totalXp);
      const oldLevel = existing?.level ?? 1;

      await prisma.workerSkill.upsert({
        where: { userId_skill: { userId, skill } },
        create: { userId, skill, xp: xpPerSkill, level: newLevel },
        update: { xp: totalXp, level: newLevel },
      });

      // Record history
      await prisma.workerLevelHistory.create({
        data: {
          userId,
          skill,
          xpDelta: xpPerSkill,
          reason: 'TASK_COMPLETED',
          taskId,
        },
      });

      // Log level-up if it happened
      if (newLevel > oldLevel) {
        console.log(
          `[levelingService] 🎉 Level up! User ${userId} skill "${skill}" ` +
          `level ${oldLevel} → ${newLevel} (${totalXp} XP, +${xpPerSkill})`,
        );
      }

      updatedSkills.push(skill);
    } catch (err: any) {
      console.error(`[levelingService] Failed to award XP for skill "${skill}":`, err.message);
    }
  }

  return { totalXp: baseXp, updatedSkills };
}
