import cron from 'node-cron';
import { prisma } from '../index';

/**
 * ============================================================
 *  RECÁLCULO DE PERCENTILES DE HABILIDAD — Cron Horario
 * ============================================================
 *
 * Ejecutado cada hora (minuto 15).
 * Para cada combinación (skillTag, treeId), recalcula el percentil
 * de cada usuario basado en accumulatedPoints.
 *
 * El percentil se almacena en cachedPercentile (0-100).
 * El 20% con más puntos obtiene percentil >= 80 → ELITE_DORADO.
 */
export function startSkillPercentileCron() {
  // Every hour at minute 15
  cron.schedule('15 * * * *', async () => {
    console.log('[SkillPercentile] Recalculando percentiles…');
    try {
      // Get all distinct (skillTag, treeId) combos
      const groups = await (prisma as any).userSkillXP.findMany({
        distinct: ['skillTag', 'treeId'],
        select: { skillTag: true, treeId: true },
      });

      for (const { skillTag, treeId } of groups) {
        // Get all records for this skill+tree, sorted by points DESC
        const records = await (prisma as any).userSkillXP.findMany({
          where: { skillTag, treeId },
          orderBy: { accumulatedPoints: 'desc' },
          select: { id: true, accumulatedPoints: true },
        });

        const total = records.length;
        if (total === 0) continue;

        // Calculate percentile for each user
        // Rank 1 (top) → percentile ~100, Rank N (bottom) → percentile ~0
        const updates = records.map((r: any, idx: number) => {
          const percentile = Math.round(((total - idx) / total) * 100);
          return (prisma as any).userSkillXP.update({
            where: { id: r.id },
            data: { cachedPercentile: percentile },
          });
        });

        // Batch execute in chunks of 50
        for (let i = 0; i < updates.length; i += 50) {
          await Promise.all(updates.slice(i, i + 50));
        }
      }

      console.log(`[SkillPercentile] ${groups.length} grupos recalculados.`);
    } catch (err) {
      console.error('[SkillPercentile] Error:', err);
    }
  });

  console.log('[SkillPercentile] Cron de percentiles registrado (cada hora :15).');
}
