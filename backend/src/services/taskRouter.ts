import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ── Role inference ─────────────────────────────────────────────────────────────
// Keyword-to-role mapping: scan title + description for role hints.
// Roles match the string values stored in AgentRoleHistory.role.

const ROLE_KEYWORDS: Record<string, string[]> = {
  analyst: ['analizar', 'analisis', 'análisis', 'investigar', 'investigación', 'datos', 'métrica', 'métrica', 'reporte', 'dashboard', 'estadística', 'research', 'analyze', 'analysis', 'data', 'metric', 'report'],
  researcher: ['investigar', 'research', 'explorar', 'explore', 'paper', 'artículo', 'fuente', 'source', 'bibliografía', 'referencia', 'literatura', 'literature'],
  implementer: ['implementar', 'código', 'code', 'build', 'construir', 'desarrollar', 'develop', 'fix', 'arreglar', 'bug', 'feature', 'funcionalidad', 'api', 'endpoint', 'componente', 'component'],
  reviewer: ['revisar', 'review', 'auditar', 'audit', 'pr', 'pull request', 'calidad', 'quality', 'test', 'testing', 'prueba', 'validar', 'validate'],
  designer: ['diseñar', 'design', 'ui', 'ux', 'interfaz', 'interface', 'layout', 'css', 'estilo', 'style', 'visual'],
};

function inferRole(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    scores[role] = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        scores[role] += 1;
      }
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  // Default to 'implementer' if no keywords matched
  return best && best[1] > 0 ? best[0] : 'implementer';
}

// ── Scoring ────────────────────────────────────────────────────────────────────
// confidenceScore * 0.7 + (1 - carga/3) * 0.3
// carga = number of active tasks assigned to this agent in this tree.
// Clamped: carga/3 capped at 1.0 so load penalty never goes negative.

function scoreAgent(confidenceScore: number, activeTaskCount: number): number {
  const loadPenalty = Math.min(activeTaskCount / 3, 1.0);
  return confidenceScore * 0.7 + (1 - loadPenalty) * 0.3;
}

// ── Main routing ───────────────────────────────────────────────────────────────

interface RoutedAgent {
  treeMemberId: string;  // TreeMember.id (for Task.assignedTo)
  agentId: string;       // Agent.id (for logging)
  role: string;
  score: number;
  activeTasks: number;
  confidenceScore: number;
}

/**
 * Finds the best agent in the tree for a task based on:
 * 1. Role match via AgentRoleHistory
 * 2. Active task load (< 3)
 * 3. confidenceScore * 0.7 + (1 - carga/3) * 0.3
 *
 * If no agent matches the inferred role, falls back to all active agents in the tree.
 * If still no match, returns null (task stays unassigned = broadcast).
 */
export async function routeTask(taskId: string): Promise<string | null> {
  // 1. Load task
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, treeId: true, title: true, description: true, status: true, assignedTo: true },
  });

  if (!task) {
    console.warn(`[taskRouter] Task ${taskId} not found`);
    return null;
  }

  // Don't re-route already assigned or completed tasks
  if (task.assignedTo || (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS')) {
    return null;
  }

  const role = inferRole(task.title, task.description);

  // 2. Find all agents in the tree via AgentRoleHistory (active = not released)
  const activeHistory = await prisma.agentRoleHistory.findMany({
    where: {
      treeId: task.treeId,
      releasedAt: null,
    },
    include: {
      agent: {
        include: { profile: true },
      },
    },
  });

  if (activeHistory.length === 0) {
    console.warn(`[taskRouter] No active agents in tree ${task.treeId} — broadcasting task`);
    // Broadcast: leave unassigned (null) — any agent can claim it
    return null;
  }

  // 3. Bridge Agent → TreeMember by matching Agent.name to TreeMember.aiProfile
  //    within this tree. TreeMember is where Task.assignedTo points.
  const agentNames = activeHistory.map(h => h.agent.name);
  const treeMembers = await prisma.treeMember.findMany({
    where: {
      treeId: task.treeId,
      isAI: true,
      aiProfile: { in: agentNames },
      status: 'ACTIVE',
    },
    select: { id: true, aiProfile: true },
  });

  const memberByName = new Map<string, string>(); // agentName → treeMemberId
  for (const tm of treeMembers) {
    if (tm.aiProfile) memberByName.set(tm.aiProfile, tm.id);
  }

  // 4. Build candidate list: agents with a TreeMember and role match
  const candidates: RoutedAgent[] = [];

  // First pass: role-matched agents
  const roleMatched = activeHistory.filter(h => h.role === role);
  // Fallback: if no role match, consider all agents in the tree
  const pool = roleMatched.length > 0 ? roleMatched : activeHistory;

  for (const h of pool) {
    const tmId = memberByName.get(h.agent.name);
    if (!tmId) continue; // agent has no TreeMember in this tree

    const activeTasks = await prisma.task.count({
      where: {
        assignedTo: tmId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    });

    if (activeTasks >= 3) continue; // load gate

    const confidenceScore = h.agent.profile?.confidenceScore ?? 0;
    const score = scoreAgent(confidenceScore, activeTasks);

    candidates.push({
      treeMemberId: tmId,
      agentId: h.agentId,
      role: h.role,
      score,
      activeTasks,
      confidenceScore,
    });
  }

  if (candidates.length === 0) {
    console.warn(`[taskRouter] No available agent for task ${taskId} (role=${role}) — broadcasting`);
    return null;
  }

  // 5. Sort by score descending, pick best
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // 6. Assign
  await prisma.task.update({
    where: { id: taskId },
    data: {
      assignedTo: best.treeMemberId,
      status: 'IN_PROGRESS',
    },
  });

  await logEvent({
    treeId: task.treeId,
    actorId: 'system',
    action: 'TASK_ROUTED',
    entityType: 'Task',
    entityId: taskId,
    afterJson: {
      assignedTo: best.treeMemberId,
      agentId: best.agentId,
      role: best.role,
      score: Math.round(best.score * 100) / 100,
      activeTasks: best.activeTasks,
      confidenceScore: best.confidenceScore,
      inferredRole: role,
      poolSize: candidates.length,
    },
    source: 'AUTOMATION',
    severity: 'INFO',
  });

  console.log(
    `[taskRouter] Task ${taskId} → agent ${best.agentId} (role=${best.role}, score=${best.score.toFixed(2)})`,
  );

  return best.treeMemberId;
}
