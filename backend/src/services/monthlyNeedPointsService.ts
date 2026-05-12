/**
 * monthlyNeedPointsService.ts
 *
 * Reemplaza el sistema semanal de 100 pts por mensual de 1000 pts.
 *
 * Lógica:
 *   1. Renovación mensual (día 1): availableNeedPoints =
 *      1000 - SUM(pointsAllocated en Needs OPEN/IN_PROGRESS/SEDIMENTED)
 *
 * La sedimentación (12 meses → BASE) y degradación (<66% → ACTIVE)
 * las maneja baseNeedService.ts vía baseNeedReviewCron.ts (trimestral).
 */

import { prisma } from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// 1. renewAllNeedPoints
// ─────────────────────────────────────────────────────────────────────────────

export async function renewAllNeedPoints(): Promise<{ renewed: number }> {
  console.log('[MonthlyNeedPoints] Starting renewal...');
  let renewed = 0;

  const members = await prisma.treeMember.findMany({
    select: { id: true, userId: true, treeId: true, needPointsPool: true },
  });

  for (const m of members) {
    // SUM points allocated by this user to OPEN/IN_PROGRESS/SEDIMENTED needs in this tree
    const allocations = await prisma.needFunding.findMany({
      where: {
        userId: m.userId,
        treeId: m.treeId,
        need: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      },
      select: { points: true },
    });

    const totalAllocated = allocations.reduce((sum, a) => sum + a.points, 0);
    const newAvailable = Math.max(0, m.needPointsPool - totalAllocated);

    await prisma.treeMember.update({
      where: { id: m.id },
      data: { availableNeedPoints: newAvailable },
    });

    renewed++;
  }

  console.log(`[MonthlyNeedPoints] Renewed ${renewed} members.`);
  return { renewed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. releasePointsFromNeed
//    Cuando una Need se marca RESOLVED, sus puntos se liberan en la siguiente
//    renovación mensual. Esta función limpia pointsAllocated para que la
//    renovación no los reste.
//    (Se llama desde needController al cambiar status a RESOLVED)
// ─────────────────────────────────────────────────────────────────────────────

export async function releasePointsFromNeed(needId: string): Promise<void> {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { fundings: true },
  });
  if (!need) return;

  // Reset pointsAllocated so monthly renewal doesn't count them
  await prisma.need.update({
    where: { id: needId },
    data: { pointsAllocated: 0 },
  });

  console.log(`[MonthlyNeedPoints] Released ${need.pointsAllocated} points from need ${needId}`);
}
