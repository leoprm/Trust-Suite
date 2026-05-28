import { PrismaClient } from '@prisma/client';

/**
 * Cross-tree skill aggregation.
 * Averages xp and level from TreeSkill (per-tree) into WorkerSkill (global).
 * Pure SQL, zero LLM tokens.
 */
export async function aggregateCrossTreeSkills(prisma: PrismaClient): Promise<number> {
  const result: number = await prisma.$executeRaw`
    INSERT INTO WorkerSkill (id, userId, skill, xp, level, updatedAt)
    SELECT
      UUID() as id,
      ts.userId,
      ts.skill,
      ROUND(AVG(ts.xp)) as xp,
      ROUND(AVG(ts.level)) as level,
      NOW() as updatedAt
    FROM TreeSkill ts
    GROUP BY ts.userId, ts.skill
    ON DUPLICATE KEY UPDATE
      xp = VALUES(xp),
      level = VALUES(level),
      updatedAt = NOW()
  `;

  return result;
}

export function startCrossTreeSkillCron(prisma: PrismaClient): void {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  // First run at midnight, then every 24h
  setTimeout(() => {
    aggregateCrossTreeSkills(prisma)
      .then((count) => {
        console.log(
          `[CrossTreeSkill] Inicial: ${count} worker skills agregados/actualizados`,
        );
      })
      .catch((err) => {
        console.error('[CrossTreeSkill] Error inicial:', err?.stack || err?.message || err);
      });

    setInterval(() => {
      aggregateCrossTreeSkills(prisma)
        .then((count) => {
          console.log(
            `[CrossTreeSkill] Diario: ${count} worker skills agregados/actualizados`,
          );
        })
        .catch((err) => {
          console.error('[CrossTreeSkill] Error diario:', err?.stack || err?.message || err);
        });
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(
    `[CrossTreeSkill] Cron iniciado (medianoche, en ~${Math.round(msUntilMidnight / 60000)} min)`,
  );
}
