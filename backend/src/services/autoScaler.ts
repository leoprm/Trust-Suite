import { prisma } from '../index';
import {
  assignAgentToTreeSlot,
  releaseAgent,
} from './agentProfileService';

/**
 * SPEC-3: Auto-Scaling
 *
 * Ejecutado cada 6 horas. Por cada árbol:
 * - Si hay >5 necesidades abiertas sin agente y <5 agentes activos → escala up
 * - Si hay <2 necesidades abiertas sin agente y >3 agentes activos → escala down
 */

export async function autoScale(): Promise<void> {
  const trees = await prisma.tree.findMany({ select: { id: true } });

  for (const tree of trees) {
    const treeId = tree.id;

    // OPEN needs con 0 tareas (sin agente trabajando)
    const openNeeds = await prisma.need.count({
      where: {
        treeId,
        status: 'OPEN',
        tasks: { none: {} },
      },
    });

    const activeAgents = await prisma.agentRoleHistory.count({
      where: { treeId, releasedAt: null },
    });

    // ── Scale UP ──
    if (openNeeds > 5 && activeAgents < 5) {
      const rol = await detectarRolMasNecesitado(treeId);
      const assigned = await assignAgentToTreeSlot(treeId, rol);
      console.log(
        `[AutoScaler] 📈 Scale UP tree=${treeId} rol=${rol} agent=${assigned ?? 'none'}`,
      );
    }

    // ── Scale DOWN ──
    if (openNeeds < 2 && activeAgents > 3) {
      const least = await findLeastActiveAgent(treeId);
      if (least) {
        await releaseAgent(least.agentId, treeId, least.role);
        console.log(
          `[AutoScaler] 📉 Scale DOWN tree=${treeId} agent=${least.agentId} role=${least.role}`,
        );
      }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const KNOWN_ROLES = [
  'analyst',
  'researcher',
  'implementer',
  'designer',
  'tester',
  'reviewer',
  'devops',
  'writer',
  'architect',
];

/**
 * Detecta el rol con mayor demanda insatisfecha en el árbol.
 * Revisa necesidades OPEN sin tareas y busca keywords de roles
 * en título + descripción.
 */
async function detectarRolMasNecesitado(treeId: string): Promise<string> {
  const needs = await prisma.need.findMany({
    where: {
      treeId,
      status: 'OPEN',
      tasks: { none: {} },
    },
    select: { title: true, description: true },
  });

  const roleCounts: Record<string, number> = {};
  for (const role of KNOWN_ROLES) roleCounts[role] = 0;

  for (const need of needs) {
    const text = `${need.title} ${need.description ?? ''}`.toLowerCase();
    for (const role of KNOWN_ROLES) {
      if (text.includes(role)) roleCounts[role]++;
    }
  }

  const sorted = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[1] > 0 ? sorted[0][0] : 'analyst';
}

/**
 * Encuentra el agente activo con menos ratings en los últimos 7 días.
 * Retorna { agentId, role } o null si no hay agentes activos.
 */
async function findLeastActiveAgent(
  treeId: string,
): Promise<{ agentId: string; role: string } | null> {
  const activeAgents = await prisma.agentRoleHistory.findMany({
    where: { treeId, releasedAt: null },
    select: { agentId: true, role: true },
  });

  if (activeAgents.length === 0) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const scored = await Promise.all(
    activeAgents.map(async (a) => {
      const count = await prisma.rating.count({
        where: {
          agentId: a.agentId,
          treeId,
          createdAt: { gte: sevenDaysAgo },
        },
      });
      return { agentId: a.agentId, role: a.role, count };
    }),
  );

  scored.sort((a, b) => a.count - b.count);
  return scored[0];
}
