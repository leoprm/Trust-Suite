/**
 * baseNeedService.ts
 *
 * Protocolo de Necesidad Base — sedimentación orgánica a 12 meses.
 * Una Need que permanece ACTIVE durante 12 meses adquiere legitimidad
 * histórica suficiente para convertirse en Base Need: se mantiene abierta
 * por su trayectoria, liberando el pool de puntos semanales.
 *
 * Ciclo de vida:
 *   ACTIVE ──(12 meses + relevanceThresholdMet)──► BASE
 *   BASE ──(1 ciclo trimestral < 66% baseline)──► ACTIVE (degradada)
 */

import { prisma } from '../index';
import { logEvent } from './eventLogService';
import { createNotification } from '../controllers/notificationController';

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkSedimentationEligibility
// ─────────────────────────────────────────────────────────────────────────────

export async function checkSedimentationEligibility(needId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { treeLinks: { include: { tree: true } } },
  });

  if (!need) return { eligible: false, reason: 'Need not found' };
  if (need.isBase) return { eligible: false, reason: 'Already a Base Need' };
  if (need.status !== 'ACTIVE') return { eligible: false, reason: 'Status is not ACTIVE' };
  if (!need.relevanceThresholdMet) return { eligible: false, reason: 'Relevance threshold never met' };

  const twelveMonthsMs = 365 * 24 * 60 * 60 * 1000;
  const twelveMonthsAgo = new Date(Date.now() - twelveMonthsMs);
  if (need.createdAt > twelveMonthsAgo) {
    const daysRemaining = Math.ceil(
      (need.createdAt.getTime() - twelveMonthsAgo.getTime()) / (1000 * 60 * 60 * 24)
    );
    return { eligible: false, reason: `${daysRemaining} days remaining until 12 months` };
  }

  return { eligible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. sedimentNeed
// ─────────────────────────────────────────────────────────────────────────────

export async function sedimentNeed(
  needId: string,
  actorId?: string
): Promise<any> {
  const eligibility = await checkSedimentationEligibility(needId);
  if (!eligibility.eligible) {
    throw new Error(`Not eligible: ${eligibility.reason}`);
  }

  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { treeLinks: true },
  });
  if (!need) throw new Error('Need not found');

  // Contar usuarios activos: miembros VERIFIED de los árboles de esta necesidad
  const treeIds = need.treeLinks.map(tl => tl.treeId);
  const activeUsers = await prisma.treeMember.count({
    where: {
      treeId: { in: treeIds },
      status: 'VERIFIED',
    },
  });

  const before = { ...need };

  const updated = await prisma.need.update({
    where: { id: needId },
    data: {
      isBase: true,
      sedimentedAt: new Date(),
      baselineUserCount: activeUsers,
      totalPointsAssigned: 0, // Libera el pool de puntos
      // Resetear ciclos de revisión
      lastReviewCycle1: null,
      lastReviewCycle2: null,
      userCountCycle1: null,
      userCountCycle2: null,
    },
  });

  // EventLog
  void logEvent({
    treeId: treeIds[0], // primer árbol como referencia
    actorId: actorId || 'SYSTEM',
    action: 'NEED_SEDIMENTED_AS_BASE',
    entityType: 'Need',
    entityId: needId,
    beforeJson: {
      status: before.status,
      isBase: before.isBase,
      totalPointsAssigned: before.totalPointsAssigned,
    },
    afterJson: {
      isBase: true,
      baselineUserCount: activeUsers,
      sedimentedAt: updated.sedimentedAt,
    },
    severity: 'INFO',
    source: actorId ? 'USER' : 'AUTOMATION',
  });

  // Notificar a miembros de los árboles
  await notifyTreeMembersOfSedimentation(need, treeIds);

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. reviewBaseNeeds
// ─────────────────────────────────────────────────────────────────────────────

export async function reviewBaseNeeds(): Promise<{ reviewed: number; degraded: number }> {
  const baseNeeds = await prisma.need.findMany({
    where: { isBase: true, status: 'ACTIVE' },
    include: { treeLinks: true },
  });

  let degraded = 0;
  const now = new Date();

  for (const need of baseNeeds) {
    const treeIds = need.treeLinks.map(tl => tl.treeId);
    const currentUserCount = await prisma.treeMember.count({
      where: { treeId: { in: treeIds }, status: 'VERIFIED' },
    });

    const threshold = Math.floor((need.baselineUserCount || 1) * 0.66);
    const belowThreshold = currentUserCount < threshold;

    // Shift: cycle2 ← cycle1, cycle1 ← current
    const cycleUpdates: Record<string, any> = {
      lastReviewCycle1: now,
      userCountCycle1: currentUserCount,
    };

    if (need.lastReviewCycle1) {
      cycleUpdates.lastReviewCycle2 = need.lastReviewCycle1;
      cycleUpdates.userCountCycle2 = need.userCountCycle1;
    }

    if (belowThreshold) {
      // 1 ciclo debajo del threshold → DEGRADAR
      await degradeBaseNeed(need.id, currentUserCount, need.baselineUserCount || 0);
      degraded++;
    } else {
      // Solo actualizar los contadores de ciclo
      await prisma.need.update({
        where: { id: need.id },
        data: cycleUpdates,
      });
    }
  }

  console.log(`[BaseNeedReview] Reviewed: ${baseNeeds.length}, Degraded: ${degraded}`);
  return { reviewed: baseNeeds.length, degraded };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. degradeBaseNeed
// ─────────────────────────────────────────────────────────────────────────────

export async function degradeBaseNeed(
  needId: string,
  currentUserCount: number,
  baselineCount: number
): Promise<void> {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { treeLinks: true },
  });
  if (!need) return;

  const before = {
    isBase: need.isBase,
    sedimentedAt: need.sedimentedAt,
    baselineUserCount: need.baselineUserCount,
  };

  await prisma.need.update({
    where: { id: needId },
    data: {
      isBase: false,
      sedimentedAt: null,
      baselineUserCount: null,
      lastReviewCycle1: null,
      lastReviewCycle2: null,
      userCountCycle1: null,
      userCountCycle2: null,
    },
  });

  // EventLog
  const treeIds = need.treeLinks.map(tl => tl.treeId);
  void logEvent({
    treeId: treeIds[0],
    actorId: 'SYSTEM',
    action: 'NEED_DEGRADED_FROM_BASE',
    entityType: 'Need',
    entityId: needId,
    beforeJson: before,
    afterJson: {
      isBase: false,
      reason: `activeUsers (${currentUserCount}) < 66% baseline (${baselineCount}) for 2 cycles`,
    },
    severity: 'WARNING',
    source: 'AUTOMATION',
  });

  // Notificar usuarios activos
  await notifyUsersOnDegradation(need, treeIds);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. notifyTreeMembersOfSedimentation
// ─────────────────────────────────────────────────────────────────────────────

async function notifyTreeMembersOfSedimentation(need: any, treeIds: string[]): Promise<void> {
  const members = await prisma.treeMember.findMany({
    where: { treeId: { in: treeIds } },
    select: { userId: true },
  });
  const uniqueUserIds = [...new Set(members.map(m => m.userId))];

  for (const userId of uniqueUserIds) {
    await createNotification({
      userId,
      type: 'GENERAL',
      category: 'FLUJO',
      title: '🏛️ Necesidad sedimentada como Base',
      body: `"${need.title}" ha alcanzado 12 meses de actividad y ahora es una Necesidad Base. Ya no consume puntos — se mantiene por su legitimidad histórica.`,
      entityType: 'NEED',
      entityAction: 'SEDIMENTED',
      entityId: need.id,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. notifyUsersOnDegradation
// ─────────────────────────────────────────────────────────────────────────────

async function notifyUsersOnDegradation(need: any, treeIds: string[]): Promise<void> {
  const members = await prisma.treeMember.findMany({
    where: { treeId: { in: treeIds } },
    select: { userId: true },
  });
  const uniqueUserIds = [...new Set(members.map(m => m.userId))];

  for (const userId of uniqueUserIds) {
    await createNotification({
      userId,
      type: 'GENERAL',
      category: 'FLUJO',
      title: '⚠️ Necesidad Base degradada',
      body: `"${need.title}" ha perdido su estado Base por baja actividad. Ahora es una necesidad normal — asígnale puntos si quieres mantenerla activa.`,
      entityType: 'NEED',
      entityAction: 'DEGRADED',
      entityId: need.id,
    });
  }
}
