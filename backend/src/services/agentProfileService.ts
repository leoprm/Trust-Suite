import { prisma } from '../index';

/**
 * Recalcula el AgentProfile cada vez que se crea un Rating.
 * - Suma stars al xpByRole[role]
 * - Actualiza primaryRole y secondaryRole (sorted by XP)
 * - Calcula confidenceScore = min(1, totalRatings / 100)
 * - Actualiza lastActiveAt
 * - explorationEligible = totalRatings < 20
 */
export async function updateProfileFromRating(
  agentId: string,
  role: string,
  stars: number,
): Promise<void> {
  const profile = await prisma.agentProfile.upsert({
    where: { agentId },
    create: { agentId },
    update: {},
  });

  const xpByRole = (profile.xpByRole as Record<string, number>) || {};
  xpByRole[role] = (xpByRole[role] || 0) + stars;

  const sorted = Object.entries(xpByRole).sort((a, b) => b[1] - a[1]);
  const newTotalRatings = profile.totalRatings + 1;

  await prisma.agentProfile.update({
    where: { agentId },
    data: {
      totalRatings: newTotalRatings,
      avgStars:
        (profile.avgStars * profile.totalRatings + stars) / newTotalRatings,
      xpByRole,
      primaryRole: sorted[0]?.[0] || null,
      secondaryRole: sorted[1]?.[0] || null,
      confidenceScore: Math.min(1, newTotalRatings / 100),
      lastActiveAt: new Date(),
      explorationEligible: newTotalRatings < 20,
    },
  });
}

/**
 * Aplica decaimiento exponencial al XP de agentes inactivos.
 * Fórmula: xp_new = xp_current * e^(-λ * days)
 * Por rol en xpByRole, mínimo 1 XP.
 * Solo agentes inactivos ≥ 1 día.
 * Retorna el número de perfiles actualizados.
 */
export async function applyDecay(lambda: number = 0.05): Promise<number> {
  const profiles = await prisma.agentProfile.findMany({
    where: { lastActiveAt: { not: null } },
  });
  const now = new Date();
  let updated = 0;

  for (const profile of profiles) {
    const days =
      (now.getTime() - profile.lastActiveAt!.getTime()) / (24 * 3600 * 1000);
    if (days < 1) continue;

    const decayFactor = Math.exp(-lambda * days);
    const xpByRole = (profile.xpByRole as Record<string, number>) || {};
    let changed = false;

    for (const role of Object.keys(xpByRole)) {
      const newXp = Math.max(1, Math.round(xpByRole[role] * decayFactor));
      if (newXp !== xpByRole[role]) {
        xpByRole[role] = newXp;
        changed = true;
      }
    }

    if (changed) {
      await prisma.agentProfile.update({
        where: { agentId: profile.agentId },
        data: { xpByRole },
      });
      updated++;
    }
  }

  return updated;
}

/**
 * Asigna un agente a un slot (rol) en un árbol.
 * - 40% exploration / 60% exploitation
 * - Máximo 2 árboles por agente
 * - Registra en AgentRoleHistory
 * Retorna el agentId asignado, o null si no hay agentes disponibles.
 */
export async function assignAgentToTreeSlot(
  treeId: string,
  role: string,
): Promise<string | null> {
  // 1. Verificar si el slot ya está ocupado
  const existing = await prisma.agentRoleHistory.findFirst({
    where: { treeId, role, releasedAt: null },
  });
  if (existing) return existing.agentId;

  // 2. Obtener agentes elegibles
  const explorationPool = await prisma.agentProfile.findMany({
    where: { explorationEligible: true, currentTreeCount: { lt: 2 } },
  });

  const exploitationPool = await prisma.agentProfile.findMany({
    where: {
      explorationEligible: false,
      primaryRole: role,
      currentTreeCount: { lt: 2 },
    },
    orderBy: { confidenceScore: 'desc' },
  });

  // 3. 40/60 random
  const useExploration = Math.random() < 0.4 && explorationPool.length > 0;
  const pool = useExploration ? explorationPool : exploitationPool;

  if (pool.length === 0) {
    // Fallback al otro pool
    const fallback = useExploration ? exploitationPool : explorationPool;
    if (fallback.length === 0) return null;
    const selected = fallback[0];
    return doAssign(
      selected.agentId,
      treeId,
      role,
      useExploration ? 'EXPLORATION' : 'EXPLOITATION',
    );
  }

  const selected = pool[Math.floor(Math.random() * pool.length)];
  return doAssign(
    selected.agentId,
    treeId,
    role,
    useExploration ? 'EXPLORATION' : 'EXPLOITATION',
  );
}

/**
 * Libera un agente de un slot en un árbol.
 * - Cierra el AgentRoleHistory (releasedAt = now)
 * - Decrementa currentTreeCount
 */
export async function releaseAgent(
  agentId: string,
  treeId: string,
  role: string,
): Promise<void> {
  const active = await prisma.agentRoleHistory.findFirst({
    where: { agentId, treeId, role, releasedAt: null },
  });

  if (!active) return; // Nada que liberar

  await prisma.$transaction([
    prisma.agentRoleHistory.update({
      where: { id: active.id },
      data: { releasedAt: new Date() },
    }),
    prisma.agentProfile.update({
      where: { agentId },
      data: { currentTreeCount: { decrement: 1 } },
    }),
  ]);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function doAssign(
  agentId: string,
  treeId: string,
  role: string,
  reason: 'EXPLORATION' | 'EXPLOITATION',
): Promise<string> {
  await prisma.$transaction([
    prisma.agentRoleHistory.create({
      data: { agentId, treeId, role, assignmentReason: reason },
    }),
    prisma.agentProfile.update({
      where: { agentId },
      data: { currentTreeCount: { increment: 1 } },
    }),
  ]);
  return agentId;
}
