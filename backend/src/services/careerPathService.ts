import { prisma } from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type PathMode = 'FASTEST' | 'PROFITABLE' | 'BALANCED';

export interface EdgeWeight {
  /** Difficulty-based cost (higher = harder transition) */
  hopsWeight: number;
  /** Profit-based cost (inverted: higher profit = lower weight) */
  profitWeight: number;
  /** α·hopsWeight_norm + (1−α)·profitWeight_norm */
  combinedWeight: number;
  /** Raw co-occurrence count */
  coOccurrenceCount: number;
  /** Raw transition count */
  transitionCount: number;
}

export interface SkillNode {
  skill: string;
  /** Average difficulty for this skill in the tree */
  avgDifficulty: number;
  /** Average fiat amount for tasks with this skill */
  avgFiatAmount: number;
  /** Number of completed tasks with this skill */
  completedTaskCount: number;
}

export interface SkillGraph {
  treeId: string;
  nodes: Map<string, SkillNode>;
  /** Adjacency: sourceSkill → { targetSkill → EdgeWeight } */
  edges: Map<string, Map<string, EdgeWeight>>;
  builtAt: Date;
  /** Whether this graph was built with cold-start fallback (no transition data) */
  isColdStart: boolean;
}

export interface CareerPathResult {
  /** Ordered skills from source to target */
  path: string[];
  /** Total weight of the path */
  totalWeight: number;
  /** Number of hops */
  hops: number;
  /** The mode used */
  mode: PathMode;
  /** Individual edge details along the path */
  steps: CareerPathStep[];
}

export interface CareerPathStep {
  from: string;
  to: string;
  weight: number;
  hopsWeight: number;
  profitWeight: number;
  combinedWeight: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// In-memory cache
// ═══════════════════════════════════════════════════════════════════════════════

const graphCache = new Map<string, SkillGraph>();

/** Max cache age before rebuild (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// Graph construction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build or rebuild the SkillGraph for a tree.
 * Uses co-occurrence edges (members with both skills) and transition edges
 * (temporal sequence of completed tasks). Falls back to co-occurrence-only
 * when no transition data exists (cold-start).
 */
export async function buildGraph(treeId: string, force = false): Promise<SkillGraph> {
  const cached = graphCache.get(treeId);
  if (cached && !force && Date.now() - cached.builtAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  // 1. Gather skills: from Tree.capacidades + all TreeMember.skills
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: { capacidades: true },
  });

  const treeSkills: string[] = parseJsonArray(tree?.capacidades ?? '[]');

  const members = await (prisma as any).treeMember.findMany({
    where: { treeId, status: 'VERIFIED' },
    select: { userId: true, skills: true },
  });

  // Deduplicate all skills
  const allSkills = new Set<string>();
  for (const s of treeSkills) allSkills.add(s);
  for (const m of members) {
    for (const s of parseJsonArray(m.skills)) allSkills.add(s);
  }

  // 2. Build skill → members index
  const skillMembers = new Map<string, Set<string>>();
  for (const skill of allSkills) skillMembers.set(skill, new Set());

  for (const m of members) {
    const memberSkills = parseJsonArray(m.skills);
    for (const skill of memberSkills) {
      if (allSkills.has(skill)) {
        skillMembers.get(skill)!.add(m.userId);
      }
    }
  }

  // 3. Co-occurrence edges: members who have both skill A and B
  const skillList = [...allSkills];
  const coOccurrence: Map<string, Map<string, number>> = new Map();
  for (const skill of skillList) {
    coOccurrence.set(skill, new Map());
  }

  for (let i = 0; i < skillList.length; i++) {
    for (let j = i + 1; j < skillList.length; j++) {
      const skillA = skillList[i];
      const skillB = skillList[j];
      const membersA = skillMembers.get(skillA)!;
      const membersB = skillMembers.get(skillB)!;

      // Count members with both skills
      let count = 0;
      const smaller = membersA.size < membersB.size ? membersA : membersB;
      const larger = membersA.size < membersB.size ? membersB : membersA;
      for (const uid of smaller) {
        if (larger.has(uid)) count++;
      }

      if (count > 0) {
        coOccurrence.get(skillA)!.set(skillB, count);
        coOccurrence.get(skillB)!.set(skillA, count);
      }
    }
  }

  // 4. Transition edges: completed tasks in temporal order
  const transitions: Map<string, Map<string, number>> = new Map();
  for (const skill of skillList) {
    transitions.set(skill, new Map());
  }

  const completedTasks = await (prisma as any).task.findMany({
    where: {
      status: 'COMPLETED',
      branch: { treeId },
    },
    select: {
      assignedTo: true,
      completedAt: true,
      tags: { select: { skillName: true } },
    },
    orderBy: { completedAt: 'asc' },
  });

  // Group tasks by user, then find skill transitions
  const userTaskSequence = new Map<string, { skillName: string; completedAt: Date }[]>();
  for (const t of completedTasks) {
    if (!t.assignedTo) continue;
    if (!t.tags || t.tags.length === 0) continue;
    if (!userTaskSequence.has(t.assignedTo)) {
      userTaskSequence.set(t.assignedTo, []);
    }
    for (const tag of t.tags) {
      if (allSkills.has(tag.skillName)) {
        userTaskSequence.get(t.assignedTo)!.push({
          skillName: tag.skillName,
          completedAt: new Date(t.completedAt),
        });
      }
    }
  }

  // For each user, find transitions: skill A→B when B is completed after A
  for (const [, seq] of userTaskSequence) {
    // Sort by completedAt (already sorted from DB but ensure)
    seq.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    for (let i = 0; i < seq.length; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        const from = seq[i].skillName;
        const to = seq[j].skillName;
        if (from === to) continue;

        const map = transitions.get(from)!;
        map.set(to, (map.get(to) ?? 0) + 1);
      }
    }
  }

  const hasTransitionData = completedTasks.length > 0;

  // 5. Gather metrics for weight computation
  const [influenceMap, xpMap, fiatMap] = await Promise.all([
    loadSkillInfluence(treeId),
    loadUserSkillXP(treeId),
    loadAvgFiatAmount(treeId),
  ]);

  // 6. Build SkillNode map
  const nodes = new Map<string, SkillNode>();
  for (const skill of skillList) {
    const influence = influenceMap.get(skill);
    nodes.set(skill, {
      skill,
      avgDifficulty: influence?.greenAvgDifficulty ?? 3.0,
      avgFiatAmount: fiatMap.get(skill) ?? 0,
      completedTaskCount: xpMap.get(skill) ?? 0,
    });
  }

  // 7. Build edges with weights
  const edges: Map<string, Map<string, EdgeWeight>> = new Map();
  for (const skill of skillList) {
    edges.set(skill, new Map());
  }

  const alpha = 0.5; // balance factor for combinedWeight

  for (const skillA of skillList) {
    for (const skillB of skillList) {
      if (skillA === skillB) continue;

      const coOccCount = coOccurrence.get(skillA)?.get(skillB) ?? 0;
      const transCount = transitions.get(skillA)?.get(skillB) ?? 0;

      // Use co-occurrence if transitions exist; fallback to co-occurrence only
      const useCoOccurrence = coOccCount > 0;
      const useTransition = hasTransitionData && transCount > 0;

      if (!useCoOccurrence && !useTransition) continue;

      const targetNode = nodes.get(skillB)!;

      // hopsWeight: based on target skill difficulty
      // Lower difficulty + more transitions = easier path (lower weight)
      const difficulty = targetNode.avgDifficulty;
      const transitionBonus = useTransition ? transCount : 0;
      // Base weight from difficulty, reduced by transition evidence
      const hopsWeight = difficulty / (1 + Math.log1p(transitionBonus));

      // profitWeight: based on average fiat amount for target skill (inverted)
      const avgFiat = targetNode.avgFiatAmount;
      // Higher profit = lower weight. Use log scaling. Minimum weight 0.1.
      let profitWeight: number;
      if (avgFiat <= 0) {
        profitWeight = 10; // no profit data → high cost
      } else {
        profitWeight = 10 / (1 + Math.log1p(avgFiat / 1000));
      }

      edges.get(skillA)!.set(skillB, {
        hopsWeight: Math.round(hopsWeight * 100) / 100,
        profitWeight: Math.round(profitWeight * 100) / 100,
        combinedWeight: 0, // computed below after normalization
        coOccurrenceCount: coOccCount,
        transitionCount: transCount,
      });
    }
  }

  // 8. Normalize and compute combinedWeight
  // Collect all weights for normalization
  const allHopsWeights: number[] = [];
  const allProfitWeights: number[] = [];
  for (const [, targets] of edges) {
    for (const [, ew] of targets) {
      allHopsWeights.push(ew.hopsWeight);
      allProfitWeights.push(ew.profitWeight);
    }
  }

  const hopsMin = allHopsWeights.length > 0 ? Math.min(...allHopsWeights) : 1;
  const hopsMax = allHopsWeights.length > 0 ? Math.max(...allHopsWeights) : 10;
  const profitMin = allProfitWeights.length > 0 ? Math.min(...allProfitWeights) : 0.1;
  const profitMax = allProfitWeights.length > 0 ? Math.max(...allProfitWeights) : 10;

  for (const [, targets] of edges) {
    for (const [, ew] of targets) {
      // Min-max normalization
      const hopsNorm =
        hopsMax === hopsMin
          ? 0.5
          : (ew.hopsWeight - hopsMin) / (hopsMax - hopsMin);
      const profitNorm =
        profitMax === profitMin
          ? 0.5
          : (ew.profitWeight - profitMin) / (profitMax - profitMin);

      ew.combinedWeight = Math.round((alpha * hopsNorm + (1 - alpha) * profitNorm) * 100) / 100;
    }
  }

  const graph: SkillGraph = {
    treeId,
    nodes,
    edges,
    builtAt: new Date(),
    isColdStart: !hasTransitionData,
  };

  graphCache.set(treeId, graph);
  return graph;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Data loaders
// ═══════════════════════════════════════════════════════════════════════════════

async function loadSkillInfluence(treeId: string): Promise<Map<string, { greenAvgDifficulty: number }>> {
  const records = await (prisma as any).skillInfluence.findMany({
    where: { treeId },
    select: { skillTag: true, greenAvgDifficulty: true },
  });
  const map = new Map<string, { greenAvgDifficulty: number }>();
  for (const r of records) {
    map.set(r.skillTag, { greenAvgDifficulty: r.greenAvgDifficulty });
  }
  return map;
}

async function loadUserSkillXP(treeId: string): Promise<Map<string, number>> {
  // Aggregate completedTasks per skill across all users in the tree
  const records = await (prisma as any).userSkillXP.groupBy({
    by: ['skillTag'],
    where: { treeId },
    _sum: { completedTasks: true },
  });
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.skillTag, r._sum.completedTasks ?? 0);
  }
  return map;
}

async function loadAvgFiatAmount(treeId: string): Promise<Map<string, number>> {
  // Average fiat amount per skill via Task → TaskTag join
  // Use raw query for efficiency since we need to join across multiple tables
  const records = await (prisma as any).$queryRaw<{ skillName: string; avgAmount: number }[]>`
    SELECT tt.skillName, AVG(ft.amount) as avgAmount
     FROM FiatTransaction ft
     INNER JOIN \`Task\` t ON ft.taskId = t.id
     INNER JOIN TaskTag tt ON tt.taskId = t.id
     WHERE ft.treeId = ${treeId}
     GROUP BY tt.skillName
  `;

  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.skillName, Number(r.avgAmount) || 0);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dijkstra multi-source
// ═══════════════════════════════════════════════════════════════════════════════

interface HeapEntry {
  skill: string;
  weight: number;
}

class MinHeap {
  private heap: HeapEntry[] = [];

  push(entry: HeapEntry): void {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[idx].weight >= this.heap[parent].weight) break;
      [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
      idx = parent;
    }
  }

  private bubbleDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = (idx << 1) + 2;

      if (left < n && this.heap[left].weight < this.heap[smallest].weight) {
        smallest = left;
      }
      if (right < n && this.heap[right].weight < this.heap[smallest].weight) {
        smallest = right;
      }
      if (smallest === idx) break;

      [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
      idx = smallest;
    }
  }
}

function selectWeightFn(
  mode: PathMode,
): (ew: EdgeWeight) => number {
  switch (mode) {
    case 'FASTEST':
      return (ew) => ew.hopsWeight;
    case 'PROFITABLE':
      return (ew) => ew.profitWeight;
    case 'BALANCED':
      return (ew) => ew.combinedWeight;
  }
}

/**
 * Multi-source Dijkstra: find shortest path from any sourceSkill to targetSkill.
 *
 * @param sourceSkills - Skills the user already has (multiple entry points)
 * @param targetSkill - The skill to reach
 * @param weightFn - Function extracting the weight from an EdgeWeight
 * @param graph - The skill graph
 * @returns CareerPathResult or null if no path exists
 */
function dijkstra(
  sourceSkills: string[],
  targetSkill: string,
  weightFn: (ew: EdgeWeight) => number,
  graph: SkillGraph,
): CareerPathResult | null {
  // Filter source skills to only those in the graph
  const validSources = sourceSkills.filter((s) => graph.nodes.has(s));
  if (validSources.length === 0) return null;
  if (!graph.nodes.has(targetSkill)) return null;

  // If target is already a source skill
  if (validSources.includes(targetSkill)) {
    return {
      path: [],
      totalWeight: 0,
      hops: 0,
      steps: [],
      mode: 'BALANCED' as PathMode, // placeholder, overwritten below
    };
  }

  // Dijkstra state
  const dist = new Map<string, number>();
  const prev = new Map<string, string>(); // skill → predecessor
  const visited = new Set<string>();
  const heap = new MinHeap();

  // Initialize all sources with distance 0
  for (const src of validSources) {
    dist.set(src, 0);
    heap.push({ skill: src, weight: 0 });
  }

  while (heap.size > 0) {
    const entry = heap.pop()!;
    const u = entry.skill;

    if (visited.has(u)) continue;
    visited.add(u);

    // Early exit if we reached the target
    if (u === targetSkill) break;

    const neighbors = graph.edges.get(u);
    if (!neighbors) continue;

    for (const [v, edgeWeight] of neighbors) {
      if (visited.has(v)) continue;

      const w = weightFn(edgeWeight);
      const newDist = (dist.get(u) ?? Infinity) + w;

      if (newDist < (dist.get(v) ?? Infinity)) {
        dist.set(v, newDist);
        prev.set(v, u);
        heap.push({ skill: v, weight: newDist });
      }
    }
  }

  const targetDist = dist.get(targetSkill);
  if (targetDist === undefined) return null;

  // Reconstruct path
  const path: string[] = [];
  let current = targetSkill;
  while (prev.has(current)) {
    path.unshift(current);
    current = prev.get(current)!;
  }
  // The first node in the chain is the source; add it
  path.unshift(current);

  // Build steps
  const steps: CareerPathStep[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const ew = graph.edges.get(from)?.get(to);
    steps.push({
      from,
      to,
      weight: ew ? weightFn(ew) : 0,
      hopsWeight: ew?.hopsWeight ?? 0,
      profitWeight: ew?.profitWeight ?? 0,
      combinedWeight: ew?.combinedWeight ?? 0,
    });
  }

  return {
    path, // includes source and target; if already at source, path is just [source]
    totalWeight: Math.round(targetDist * 100) / 100,
    hops: path.length - 1,
    steps,
    mode: 'BALANCED' as PathMode, // overwritten by caller
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the optimal career path from any of the source skills to the target skill.
 *
 * @param sourceSkills - Skills the user currently possesses
 * @param targetSkill - The skill the user wants to reach
 * @param treeId - The tree context
 * @param mode - Weight selection mode: FASTEST, PROFITABLE, or BALANCED
 * @param alpha - Balance factor for combinedWeight (default 0.5). Higher = favor hopsWeight.
 */
export async function dijkstraMultiSource(
  sourceSkills: string[],
  targetSkill: string,
  treeId: string,
  mode: PathMode = 'BALANCED',
  alpha?: number,
): Promise<CareerPathResult | null> {
  const graph = await buildGraph(treeId);
  const weightFn = selectWeightFn(mode);

  // If alpha is provided and mode is BALANCED, rebuild with custom alpha
  // (combinedWeight is already computed in buildGraph with alpha=0.5;
  //  for custom alpha we need to recompute in-memory)
  if (alpha !== undefined && mode === 'BALANCED') {
    return dijkstraWithCustomAlpha(sourceSkills, targetSkill, graph, alpha, mode);
  }

  const result = dijkstra(sourceSkills, targetSkill, weightFn, graph);
  if (result) {
    result.mode = mode;
  }
  return result;
}

function dijkstraWithCustomAlpha(
  sourceSkills: string[],
  targetSkill: string,
  graph: SkillGraph,
  alpha: number,
  mode: PathMode,
): CareerPathResult | null {
  // Compute combined weights with custom alpha
  const allHops: number[] = [];
  const allProfit: number[] = [];
  for (const [, targets] of graph.edges) {
    for (const [, ew] of targets) {
      allHops.push(ew.hopsWeight);
      allProfit.push(ew.profitWeight);
    }
  }

  const hopsMin = allHops.length > 0 ? Math.min(...allHops) : 1;
  const hopsMax = allHops.length > 0 ? Math.max(...allHops) : 10;
  const profitMin = allProfit.length > 0 ? Math.min(...allProfit) : 0.1;
  const profitMax = allProfit.length > 0 ? Math.max(...allProfit) : 10;

  // Clone graph with custom combined weights
  const customGraph: SkillGraph = {
    ...graph,
    edges: new Map(),
  };

  for (const [from, targets] of graph.edges) {
    const newTargets = new Map<string, EdgeWeight>();
    for (const [to, ew] of targets) {
      const hopsNorm =
        hopsMax === hopsMin ? 0.5 : (ew.hopsWeight - hopsMin) / (hopsMax - hopsMin);
      const profitNorm =
        profitMax === profitMin
          ? 0.5
          : (ew.profitWeight - profitMin) / (profitMax - profitMin);

      newTargets.set(to, {
        ...ew,
        combinedWeight:
          Math.round((alpha * hopsNorm + (1 - alpha) * profitNorm) * 100) / 100,
      });
    }
    customGraph.edges.set(from, newTargets);
  }

  const weightFn = selectWeightFn(mode);
  const result = dijkstra(sourceSkills, targetSkill, weightFn, customGraph);
  if (result) {
    result.mode = mode;
  }
  return result;
}

/**
 * Get all skills available in a tree's graph.
 */
export async function getAvailableSkills(treeId: string): Promise<string[]> {
  const graph = await buildGraph(treeId);
  return [...graph.nodes.keys()];
}

/**
 * Get the full SkillGraph for inspection.
 */
export async function getGraph(treeId: string): Promise<SkillGraph> {
  return buildGraph(treeId);
}

/**
 * Invalidate the cache for a tree (forces rebuild on next access).
 */
export function invalidateCache(treeId: string): void {
  graphCache.delete(treeId);
}

/**
 * Invalidate all cached graphs.
 */
export function invalidateAllCaches(): void {
  graphCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function parseJsonArray(raw: string): string[] {
  if (!raw || raw === '[]' || raw === '{}') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
    return [];
  } catch {
    return [];
  }
}
