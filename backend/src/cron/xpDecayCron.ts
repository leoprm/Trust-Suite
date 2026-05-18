/**
 * XP Decay Cron — daily job that applies XP decay to all workers.
 *
 * Runs once per day. For every WorkerSkill with xp > 0, applies
 * the daily decay formula and logs the change in WorkerLevelHistory.
 */

import { PrismaClient } from '@prisma/client';
import { applyDecay, calculateDailyDecay } from '../services/levelingService';

export async function runXpDecay(prisma: PrismaClient): Promise<void> {
  const skills = await prisma.workerSkill.findMany({
    where: { xp: { gt: 0 } },
    select: { id: true, userId: true, skill: true, xp: true, level: true },
  });

  let affected = 0;
  let totalDecayed = 0;

  for (const ws of skills) {
    const decay = calculateDailyDecay(ws.xp, ws.level);
    if (decay <= 0) continue;

    const { newXp, newLevel } = applyDecay(ws.xp, ws.level);

    // Update WorkerSkill
    await prisma.workerSkill.update({
      where: { id: ws.id },
      data: { xp: newXp, level: newLevel },
    });

    // Log history
    await prisma.workerLevelHistory.create({
      data: {
        userId: ws.userId,
        skill: ws.skill,
        xpDelta: -decay,
        reason: 'XP_DECAY',
      },
    });

    affected++;
    totalDecayed += decay;
  }

  console.log(
    `[xpDecayCron] Decay applied: ${affected} workers affected, ` +
    `${totalDecayed} total XP decayed across ${skills.length} skills checked.`,
  );
}
