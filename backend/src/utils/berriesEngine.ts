/**
 * @deprecated berriesEngine.ts — OLD oxidation model (weekly 5% compound decay).
 *
 * This file is superseded by berryFlowService.ts which implements the correct
 * monthly 10% reduction on the opening balance (saldo inicial).
 *
 * DO NOT USE calculateOxidation or syncBerriesBalance in new code.
 * The bayasBalance field on TreeMember is now managed by berryFlowService.ts.
 *
 * Kept for backward reference only. Functions below are no longer called by cron or controllers.
 */

import { prisma } from '../index';

/** @deprecated Use DEFAULT_MONTHLY_FLOW_RATE from berryFlowService instead */
export const BERRIES_DECAY_RATE = 0.05;
export const BERRIES_CYCLE_HOURS = 168; // 1 week

/**
 * Filtro Anti-Sybil (Fases)
 * Verifica si el árbol tiene >= 100 usuarios activos (Nivel >= 3).
 */
export async function isBerriesUnlocked(treeId: string): Promise<boolean> {
  const activeUsersCount = await (prisma as any).treeMember.count({
    where: {
      treeId,
      level: { gte: 3 }
    }
  });
  return activeUsersCount >= 100;
}

/**
 * Lógica pura matemática de oxidación.
 */
export function calculateOxidation(
  currentBalance: number,
  lastUpdate: Date,
  treeCreatedAt: Date,
  now: Date = new Date()
): number {
  if (currentBalance <= 0) return 0;

  // Exención de Juventud: Si el árbol tiene menos de 365 días, no hay decaimiento.
  const treeAgeDays = (now.getTime() - new Date(treeCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (treeAgeDays < 365) {
    return currentBalance;
  }

  const hoursPassed = (now.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
  const cycles = Math.floor(hoursPassed / BERRIES_CYCLE_HOURS);

  if (cycles <= 0) return currentBalance;

  // Interés compuesto en decaimiento
  const newBalance = currentBalance * Math.pow((1 - BERRIES_DECAY_RATE), cycles);
  return parseFloat(newBalance.toFixed(2));
}

/**
 * Forzar resincronización de Berries antes de cualquier gasto/consulta.
 * Retorna el saldo final oxidado.
 */
export async function syncBerriesBalance(treeMemberId: string): Promise<number> {
  const member = await (prisma as any).treeMember.findUnique({
    where: { id: treeMemberId },
    include: { tree: true }
  });

  if (!member) throw new Error('TreeMember not found');

  const now = new Date();
  const realBalance = calculateOxidation(
    member.bayasBalance,
    member.lastBerriesUpdate,
    member.tree.createdAt,
    now
  );

  // Si hubo cambio significativo (oxido real), guardamos.
  // if balance didn't change, we still update lastBerriesUpdate ONLY if cycles >= 1, but simpler is to always update tracking to now() when queried/syncing or only when calculating.
  // Actually, to avoid losing fractional cycles, we should only pull time forward by exactly the cycles processed, OR we update balance using fraction.
  // Wait, if we use `Math.floor(cycles)`, then setting `updateAt = now()` throws away the remainder hours!
  // To fix: exact fraction `cycles = hoursPassed / 168`. No `Math.floor`.
  const hoursPassed = (now.getTime() - new Date(member.lastBerriesUpdate).getTime()) / (1000 * 60 * 60);
  const exactCycles = hoursPassed / BERRIES_CYCLE_HOURS;
  
  let preciseBalance = member.bayasBalance;
  if (member.bayasBalance > 0 && exactCycles > 0) {
    const treeAgeDays = (now.getTime() - new Date(member.tree.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (treeAgeDays >= 365) {
      preciseBalance = member.bayasBalance * Math.pow((1 - BERRIES_DECAY_RATE), exactCycles);
    }
  }

  if (preciseBalance !== member.bayasBalance) {
    await (prisma as any).treeMember.update({
      where: { id: member.id },
      data: {
        bayasBalance: preciseBalance,
        lastBerriesUpdate: now
      }
    });
  }

  return preciseBalance;
}
