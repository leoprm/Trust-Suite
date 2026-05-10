import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ── Asimov gate v0 ──────────────────────────────────────────────────────────
const FORBIDDEN_PHASES = new Set(['MAINTENANCE']); // requiere juicio humano

const PHASE_ORDER: Record<string, number> = {
  INVESTIGATION: 0,
  DEVELOPMENT: 1,
  PRODUCTION: 2,
  DISTRIBUTION: 3,
  MAINTENANCE: 4,
  RECYCLING: 5,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseSkills(member: { skills: string }): string[] {
  try {
    return JSON.parse(member.skills || '[]');
  } catch {
    return [];
  }
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getAiSkillSet(aiMemberId: string): Promise<Set<string>> {
  const member = await prisma.treeMember.findUnique({
    where: { id: aiMemberId },
    select: { skills: true, aiConfig: { select: { skillOverrides: true } } },
  });
  if (!member) return new Set();

  const skills = new Set(parseSkills(member));
  if (member.aiConfig?.skillOverrides) {
    for (const s of parseJsonArray(member.aiConfig.skillOverrides)) {
      skills.add(s);
    }
  }
  return skills;
}

// ── Core functions ──────────────────────────────────────────────────────────

/**
 * Calcula el porcentaje de match de skills entre un AI member y una Task.
 * Retorna 0-100. Si la task no requiere skills, retorna 100%.
 */
export async function calculateSkillMatch(
  aiMemberId: string,
  task: { tags?: { skillName: string }[] },
): Promise<number> {
  const taskSkills = (task.tags ?? []).map((t) => t.skillName);
  if (taskSkills.length === 0) return 100;

  const aiSkills = await getAiSkillSet(aiMemberId);
  const matched = taskSkills.filter((s) => aiSkills.has(s)).length;
  return Math.round((matched / taskSkills.length) * 100);
}

export interface TaskMatch {
  task: any;
  score: number; // skill match %
}

/**
 * Encuentra todas las Tasks disponibles para un AI member en su Tree,
 * ordenadas por: skill match (desc), prioridad de fase (asc), antigüedad (asc).
 */
export async function findMatchingTasks(aiMemberId: string): Promise<TaskMatch[]> {
  const member = await prisma.treeMember.findUnique({
    where: { id: aiMemberId },
    include: { aiConfig: true },
  });
  if (!member || !member.isAI || !member.aiConfig?.autoClaimEnabled) return [];

  const allowedPhases = parseJsonArray(member.aiConfig.allowedPhases);
  if (allowedPhases.length === 0) return []; // no phases configured → skip

  // Count currently claimed tasks (not completed)
  const activeClaims = await prisma.task.count({
    where: {
      claimedByAI: aiMemberId,
      status: { not: 'COMPLETED' },
    },
  });
  const maxConcurrent = member.aiConfig.maxConcurrentTasks ?? 1;
  if (activeClaims >= maxConcurrent) return [];

  const slotsAvailable = maxConcurrent - activeClaims;

  // Find candidate tasks in same tree
  const tasks = await prisma.task.findMany({
    where: {
      branch: { treeId: member.treeId },
      status: 'OPEN',
      claimedByAI: null,
      phase: {
        in: allowedPhases as any[],
        notIn: [...FORBIDDEN_PHASES] as any[],
      },
      auditada: false, // Asimov gate: conflicto de interés
    },
    include: { tags: true, branch: { select: { treeId: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // Compute skill match scores
  const scored: TaskMatch[] = [];
  for (const task of tasks) {
    const score = await calculateSkillMatch(aiMemberId, task);
    scored.push({ task, score });
  }

  // Sort: skill match desc, phase priority asc, createdAt asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = PHASE_ORDER[a.task.phase] ?? 99;
    const pb = PHASE_ORDER[b.task.phase] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
  });

  return scored.slice(0, slotsAvailable);
}

/**
 * AI reclama una Task: asigna claimedByAI, actualiza aiStatus, loguea.
 */
export async function claimTask(
  aiMemberId: string,
  taskId: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Obtener AI member + task
  const [member, task] = await Promise.all([
    prisma.treeMember.findUnique({ where: { id: aiMemberId }, include: { aiConfig: true } }),
    prisma.task.findUnique({ where: { id: taskId }, include: { branch: true } }),
  ]);

  if (!member || !member.isAI) return { success: false, error: 'AI member not found' };
  if (!task) return { success: false, error: 'Task not found' };
  if (task.claimedByAI) return { success: false, error: 'Task already claimed' };
  if (task.status !== 'OPEN') return { success: false, error: 'Task is not open' };

  // Asimov gate: no MAINTENANCE, no audit
  if (FORBIDDEN_PHASES.has(task.phase)) {
    return { success: false, error: `Phase ${task.phase} not allowed for AI (requires human judgment)` };
  }
  if (task.auditada) {
    return { success: false, error: 'Audit tasks cannot be claimed by AI (conflict of interest)' };
  }

  // Check concurrent tasks
  const activeClaims = await prisma.task.count({
    where: { claimedByAI: aiMemberId, status: { not: 'COMPLETED' } },
  });
  const maxConcurrent = member.aiConfig?.maxConcurrentTasks ?? 1;
  if (activeClaims >= maxConcurrent) {
    return { success: false, error: `Max concurrent tasks (${maxConcurrent}) reached` };
  }

  // 2. Atomic claim
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { claimedByAI: aiMemberId, aiClaimedAt: new Date() },
    });
    await tx.treeMember.update({
      where: { id: aiMemberId },
      data: { aiStatus: 'WORKING' },
    });
  });

  // 3. Log
  void logEvent({
    treeId: task.branch.treeId,
    actorId: null,
    action: 'TASK_CLAIMED_BY_AI',
    entityType: 'Task',
    entityId: taskId,
    metadataJson: {
      aiMemberId,
      aiProfile: member.aiProfile,
      taskPhase: task.phase,
      branchId: task.branchId,
    },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  return { success: true };
}

/**
 * AI libera una Task (falló, timeout, etc.): limpia claimedByAI, restaura status.
 * Si el AI no tiene más tareas activas, vuelve a IDLE.
 */
export async function releaseTask(
  aiMemberId: string,
  taskId: string,
): Promise<{ success: boolean; error?: string }> {
  const [member, task] = await Promise.all([
    prisma.treeMember.findUnique({ where: { id: aiMemberId } }),
    prisma.task.findUnique({ where: { id: taskId }, include: { branch: { select: { treeId: true } } } }),
  ]);

  if (!member || !member.isAI) return { success: false, error: 'AI member not found' };
  if (!task) return { success: false, error: 'Task not found' };
  if (task.claimedByAI !== aiMemberId) {
    return { success: false, error: 'Task not claimed by this AI' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { claimedByAI: null, aiClaimedAt: null },
    });

    const remaining = await tx.task.count({
      where: { claimedByAI: aiMemberId, status: { not: 'COMPLETED' } },
    });
    if (remaining === 0) {
      await tx.treeMember.update({
        where: { id: aiMemberId },
        data: { aiStatus: 'IDLE' },
      });
    }
  });

  void logEvent({
    treeId: task.branch.treeId,
    actorId: null,
    action: 'TASK_RELEASED_BY_AI',
    entityType: 'Task',
    entityId: taskId,
    metadataJson: { aiMemberId, aiProfile: member.aiProfile },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  return { success: true };
}
