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

// Stop words to filter from keyword extraction (es + en)
const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con',
  'por', 'para', 'que', 'es', 'son', 'the', 'a', 'an', 'and', 'or', 'but', 'in',
  'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been',
  'this', 'that', 'it', 'its', 'se', 'no', 'si', 'ya', 'lo', 'al', 'como', 'más',
  'muy', 'todo', 'todos', 'hay', 'tiene', 'tienen', 'ser', 'hacer', 'puede',
]);

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

// ── Keyword extraction for skill matching ──────────────────────────────────────
// Extract meaningful words from title+description to match against member skills.

function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  // Split on non-alphanumeric, filter stop words and short tokens
  const tokens = text.split(/[^a-záéíóúüñ0-9]+/);
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const token of tokens) {
    const clean = token.trim();
    if (clean.length < 3) continue;
    if (STOP_WORDS.has(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    keywords.push(clean);
  }

  return keywords;
}

// ── Scoring ────────────────────────────────────────────────────────────────────
// confidenceScore * 0.7 + (1 - carga/3) * 0.3
// carga = number of active tasks assigned to this agent in this tree.
// Clamped: carga/3 capped at 1.0 so load penalty never goes negative.

function scoreAgent(confidenceScore: number, activeTaskCount: number): number {
  const loadPenalty = Math.min(activeTaskCount / 3, 1.0);
  return confidenceScore * 0.7 + (1 - loadPenalty) * 0.3;
}

// ── Unified candidate interface ────────────────────────────────────────────────

interface RoutedCandidate {
  treeMemberId: string;
  agentId?: string;        // AI only
  isHuman: boolean;
  role?: string;           // AI only
  score: number;
  activeTasks: number;
  tasksThisWeek?: number;  // human rotation tracking
  skillMatches?: number;   // human: how many skills matched keywords
  xp?: number;             // human XP for logging
  confidenceScore?: number; // AI confidence score
}

// ── Human candidate search ─────────────────────────────────────────────────────
// Query tree members with isAI=false, status=ACTIVE.
// Match their skills (JSON array) against extracted keywords from the task.
// Sort by XP desc. Exclude >3 active tasks. Rotation penalty for ≥2 this week.

async function findHumanCandidates(
  treeId: string,
  title: string,
  description: string,
): Promise<RoutedCandidate[]> {
  const keywords = extractKeywords(title, description);
  if (keywords.length === 0) return [];

  // Query human members in the tree
  const humanMembers = await prisma.treeMember.findMany({
    where: {
      treeId,
      isAI: false,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      userId: true,
      skills: true,
      xp: true,
    },
  });

  if (humanMembers.length === 0) return [];

  // Find max XP for normalization
  const maxXp = Math.max(1, ...humanMembers.map((m: any) => m.xp || 0));

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates: RoutedCandidate[] = [];

  for (const member of humanMembers) {
    const skills: string[] = JSON.parse(member.skills || '[]');
    const skillsLower = skills.map((s: string) => s.toLowerCase());

    // Count keyword matches against skills
    let skillMatches = 0;
    for (const kw of keywords) {
      for (const skill of skillsLower) {
        if (skill.includes(kw) || kw.includes(skill)) {
          skillMatches++;
          break;
        }
      }
    }

    // Get active task count
    const activeTasks = await prisma.task.count({
      where: {
        assigneeId: member.id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    // Exclude members with >3 active tasks
    if (activeTasks > 3) continue;

    // Count tasks assigned this week for rotation
    const tasksThisWeek = await prisma.task.count({
      where: {
        assigneeId: member.id,
        createdAt: { gte: oneWeekAgo },
      },
    });

    // Score: skill match + XP + load + rotation penalty
    // Normalized to ~0-1 range for comparison with AI scores
    const xpFactor = (member.xp || 0) / maxXp;
    const skillMatchFactor = Math.min(1, skillMatches / Math.max(1, keywords.length));
    const loadPenalty = Math.min(activeTasks / 3, 1.0);
    // Rotation: baja prioridad si ya tiene ≥2 tasks esta semana
    const rotationPenalty = tasksThisWeek >= 2 ? 0.2 : 0;

    const score =
      skillMatchFactor * 0.3 +
      xpFactor * 0.4 +
      (1 - loadPenalty) * 0.3 -
      rotationPenalty;

    candidates.push({
      treeMemberId: member.id,
      isHuman: true,
      score,
      activeTasks,
      tasksThisWeek,
      skillMatches,
      xp: member.xp || 0,
    });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

// ── Main routing ───────────────────────────────────────────────────────────────

/**
 * Finds the best agent or human in the tree for a task based on:
 * 1. Role match via AgentRoleHistory (AI) or skill keyword match (human)
 * 2. Active task load (< 3 for AI, ≤ 3 for human)
 * 3. Scoring: AI uses confidenceScore, humans use XP + skill match
 * 4. Rotation: humans with ≥2 tasks this week get a score penalty
 *
 * Priority: best candidate from combined AI + human pool.
 * If no candidate matches, returns null (task stays unassigned = broadcast).
 */
export async function routeTask(taskId: string): Promise<string | null> {
  // 1. Load task
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, treeId: true, title: true, description: true, status: true, assigneeId: true },
  });

  if (!task) {
    console.warn(`[taskRouter] Task ${taskId} not found`);
    return null;
  }

  // Don't re-route already assigned or completed tasks
  if (task.assigneeId || (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS')) {
    return null;
  }

  const role = inferRole(task.title, task.description);

  // ── 2. AI candidates (existing logic) ─────────────────────────────────────
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

  const allCandidates: RoutedCandidate[] = [];

  // AI pool: role-matched first, then fallback to all
  const roleMatched = activeHistory.filter(h => h.role === role);
  const aiPool = roleMatched.length > 0 ? roleMatched : activeHistory;

  for (const h of aiPool) {
    const tmId = memberByName.get(h.agent.name);
    if (!tmId) continue;

    const activeTasks = await prisma.task.count({
      where: {
        assigneeId: tmId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    if (activeTasks >= 3) continue;

    const confidenceScore = h.agent.profile?.confidenceScore ?? 0;
    const score = scoreAgent(confidenceScore, activeTasks);

    allCandidates.push({
      treeMemberId: tmId,
      agentId: h.agentId,
      isHuman: false,
      role: h.role,
      score,
      activeTasks,
      confidenceScore,
    });
  }

  // ── 3. Human candidates (new) ──────────────────────────────────────────────
  const humanCandidates = await findHumanCandidates(
    task.treeId,
    task.title,
    task.description,
  );
  allCandidates.push(...humanCandidates);

  // ── 4. Pick best ──────────────────────────────────────────────────────────
  if (allCandidates.length === 0) {
    const noAi = activeHistory.length === 0;
    const noHumans = humanCandidates.length === 0;
    const reason = noAi && noHumans
      ? `No AI agents or human members available in tree ${task.treeId}`
      : `No available candidate for task ${taskId} (role=${role})`;
    console.warn(`[taskRouter] ${reason} — broadcasting`);
    return null;
  }

  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates[0];

  // ── 5. Assign ─────────────────────────────────────────────────────────────
  await prisma.task.update({
    where: { id: taskId },
    data: {
      assigneeId: best.treeMemberId,
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
      assigneeId: best.treeMemberId,
      agentId: best.agentId ?? null,
      isHuman: best.isHuman,
      role: best.role ?? null,
      score: Math.round(best.score * 100) / 100,
      activeTasks: best.activeTasks,
      confidenceScore: best.confidenceScore ?? null,
      inferredRole: role,
      poolSize: allCandidates.length,
      aiCandidates: allCandidates.filter(c => !c.isHuman).length,
      humanCandidates: allCandidates.filter(c => c.isHuman).length,
      // Human-specific metadata
      ...(best.isHuman && {
        skillMatches: best.skillMatches,
        xp: best.xp,
        tasksThisWeek: best.tasksThisWeek,
      }),
    },
    source: 'AUTOMATION',
    severity: 'INFO',
  });

  const assigneeType = best.isHuman ? 'human' : 'agent';
  const assigneeId = best.isHuman ? best.treeMemberId : best.agentId;
  console.log(
    `[taskRouter] Task ${taskId} → ${assigneeType} ${assigneeId} (score=${best.score.toFixed(2)})`,
  );

  return best.treeMemberId;
}
