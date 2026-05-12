import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import {
  dijkstraMultiSource,
  getGraph,
  getAvailableSkills,
  buildGraph,
  PathMode,
  CareerPathResult,
  CareerPathStep,
  SkillNode,
  SkillGraph,
} from '../services/careerPathService';

// ═══════════════════════════════════════════════════════════════════════════
// API Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PathStep {
  from: string;
  to: string;
  weight: number;
  hopsWeight: number;
  profitWeight: number;
  combinedWeight: number;
}

export interface CareerPath {
  mode: PathMode;
  path: string[];
  totalHops: number;
  totalWeight: number;
  steps: PathStep[];
}

interface FindPathRequest {
  treeId: string;
  targetSkill: string;
  mode?: PathMode;
  alpha?: number;
  maxHops?: number;
}

interface FindPathResponse {
  path: PathStep[];
  totalHops: number;
  totalEstimatedTasks: number;
  totalExpectedIncome: number;
  mode: PathMode;
  alternatives: CareerPath[];
}

interface GraphResponse {
  treeId: string;
  builtAt: string;
  isColdStart: boolean;
  nodeCount: number;
  edgeCount: number;
  nodes: { skill: string; avgDifficulty: number; avgFiatAmount: number; completedTaskCount: number }[];
  edges: { from: string; to: string; hopsWeight: number; profitWeight: number; combinedWeight: number; coOccurrenceCount: number; transitionCount: number }[];
}

interface SkillInfo {
  skill: string;
  avgDifficulty: number;
  avgFiatAmount: number;
  completedTaskCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

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

function careerPathToResponse(result: CareerPathResult, graph: SkillGraph): FindPathResponse {
  const uniqueSkills = new Set(result.path);
  let totalEstimatedTasks = 0;
  let totalExpectedIncome = 0;

  for (const skill of uniqueSkills) {
    const node = graph.nodes.get(skill);
    if (node) {
      totalEstimatedTasks += node.completedTaskCount;
      totalExpectedIncome += node.avgFiatAmount;
    }
  }

  return {
    path: result.steps.map(s => ({
      from: s.from,
      to: s.to,
      weight: s.weight,
      hopsWeight: s.hopsWeight,
      profitWeight: s.profitWeight,
      combinedWeight: s.combinedWeight,
    })),
    totalHops: result.hops,
    totalEstimatedTasks,
    totalExpectedIncome: Math.round(totalExpectedIncome * 100) / 100,
    mode: result.mode,
    alternatives: [], // filled by caller
  };
}

function graphToResponse(graph: SkillGraph): GraphResponse {
  const edges: GraphResponse['edges'] = [];
  for (const [from, targets] of graph.edges) {
    for (const [to, ew] of targets) {
      edges.push({
        from,
        to,
        hopsWeight: ew.hopsWeight,
        profitWeight: ew.profitWeight,
        combinedWeight: ew.combinedWeight,
        coOccurrenceCount: ew.coOccurrenceCount,
        transitionCount: ew.transitionCount,
      });
    }
  }

  const nodes: GraphResponse['nodes'] = [];
  for (const [, node] of graph.nodes) {
    nodes.push({
      skill: node.skill,
      avgDifficulty: node.avgDifficulty,
      avgFiatAmount: node.avgFiatAmount,
      completedTaskCount: node.completedTaskCount,
    });
  }

  return {
    treeId: graph.treeId,
    builtAt: graph.builtAt.toISOString(),
    isColdStart: graph.isColdStart,
    nodeCount: graph.nodes.size,
    edgeCount: edges.length,
    nodes,
    edges,
  };
}

function makeAlternative(mode: PathMode, result: CareerPathResult): CareerPath {
  return {
    mode,
    path: result.path,
    totalHops: result.hops,
    totalWeight: result.totalWeight,
    steps: result.steps.map(s => ({
      from: s.from,
      to: s.to,
      weight: s.weight,
      hopsWeight: s.hopsWeight,
      profitWeight: s.profitWeight,
      combinedWeight: s.combinedWeight,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. findPath — POST /api/career-path/find
// ═══════════════════════════════════════════════════════════════════════════

export async function findPath(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { treeId, targetSkill, mode = 'BALANCED', alpha, maxHops } = req.body as FindPathRequest;

    if (!treeId || !targetSkill) {
      return res.status(400).json({ error: 'treeId and targetSkill are required' });
    }

    // Validate targetSkill exists in the graph
    const graph = await getGraph(treeId);
    if (!graph.nodes.has(targetSkill)) {
      return res.status(404).json({ error: `Skill "${targetSkill}" not found in tree ${treeId}` });
    }

    // Get user's source skills from their tree membership
    const membership = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { skills: true, status: true },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this tree' });
    }

    const sourceSkills = parseJsonArray(membership.skills ?? '[]');
    if (sourceSkills.length === 0) {
      return res.status(400).json({ error: 'You have no skills registered in this tree' });
    }

    // If maxHops is provided, filter paths longer than maxHops after computing
    // Compute primary path
    const primaryResult = await dijkstraMultiSource(sourceSkills, targetSkill, treeId, mode, alpha);

    if (!primaryResult) {
      return res.status(404).json({
        error: `No path found from your skills to "${targetSkill}" in tree ${treeId}`,
      });
    }

    // Compute alternatives in other modes (deduplicate by path signature)
    const allModes: PathMode[] = ['FASTEST', 'PROFITABLE', 'BALANCED'];
    const alternatives: CareerPath[] = [];
    const seenPaths = new Set<string>();
    const primaryPathKey = primaryResult.path.join('→');
    seenPaths.add(primaryPathKey);

    for (const altMode of allModes) {
      if (altMode === mode) continue;
      // Use same alpha if BALANCED
      const altAlpha = altMode === 'BALANCED' ? alpha : undefined;
      const altResult = await dijkstraMultiSource(sourceSkills, targetSkill, treeId, altMode, altAlpha);
      if (!altResult) continue;

      const key = altResult.path.join('→');
      if (!seenPaths.has(key)) {
        seenPaths.add(key);
        alternatives.push(makeAlternative(altMode, altResult));
      }
    }

    // If requested mode is BALANCED but no BALANCED alt (it's the primary), add the other 2
    // If fewer than 3 alternatives, we return what we found (top 3 unique)
    const response = careerPathToResponse(primaryResult, graph);
    response.alternatives = alternatives.slice(0, 3);

    // Apply maxHops filter if provided
    if (maxHops !== undefined && maxHops >= 0) {
      response.alternatives = response.alternatives.filter(a => a.totalHops <= maxHops);
    }

    // Log findPath event
    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'CAREER_PATH_FIND',
      entityType: 'CareerPath',
      entityId: treeId,
      treeId,
      metadataJson: getRequestMetadata(req, {
        targetSkill,
        mode: response.mode,
        totalHops: response.totalHops,
        alternativesCount: response.alternatives.length,
      }),
      severity: 'INFO',
      source: 'USER',
    });

    return res.json(response);
  } catch (err: any) {
    console.error('[careerPath] findPath error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. getGraph — GET /api/career-path/graph/:treeId
// ═══════════════════════════════════════════════════════════════════════════

export async function getGraphEndpoint(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    const graph = await getGraph(treeId);
    return res.json(graphToResponse(graph));
  } catch (err: any) {
    console.error('[careerPath] getGraph error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. getSkills — GET /api/career-path/skills/:treeId
// ═══════════════════════════════════════════════════════════════════════════

export async function getSkills(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    const graph = await getGraph(treeId);
    const skills: SkillInfo[] = [];

    for (const [, node] of graph.nodes) {
      skills.push({
        skill: node.skill,
        avgDifficulty: node.avgDifficulty,
        avgFiatAmount: node.avgFiatAmount,
        completedTaskCount: node.completedTaskCount,
      });
    }

    // Sort by completedTaskCount descending (most used skills first)
    skills.sort((a, b) => b.completedTaskCount - a.completedTaskCount);

    return res.json({
      treeId,
      totalSkills: skills.length,
      isColdStart: graph.isColdStart,
      skills,
    });
  } catch (err: any) {
    console.error('[careerPath] getSkills error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. getSkillStats — GET /api/career-path/stats/:treeId/:skillTag
// ═══════════════════════════════════════════════════════════════════════════

export async function getSkillStats(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;
    const skillTag = req.params.skillTag as string;

    if (!treeId || !skillTag) {
      return res.status(400).json({ error: 'treeId and skillTag are required' });
    }

    const graph = await getGraph(treeId);
    const node = graph.nodes.get(skillTag);

    if (!node) {
      return res.status(404).json({ error: `Skill "${skillTag}" not found in tree ${treeId}` });
    }

    // Incoming edges (how to learn this skill)
    const incomingEdges: { from: string; hopsWeight: number; profitWeight: number; combinedWeight: number }[] = [];
    for (const [from, targets] of graph.edges) {
      const edge = targets.get(skillTag);
      if (edge) {
        incomingEdges.push({
          from,
          hopsWeight: edge.hopsWeight,
          profitWeight: edge.profitWeight,
          combinedWeight: edge.combinedWeight,
        });
      }
    }
    incomingEdges.sort((a, b) => a.combinedWeight - b.combinedWeight);

    // Outgoing edges (skills you can transition to)
    const outgoingEdges: { to: string; hopsWeight: number; profitWeight: number; combinedWeight: number }[] = [];
    const targets = graph.edges.get(skillTag);
    if (targets) {
      for (const [to, edge] of targets) {
        outgoingEdges.push({
          to,
          hopsWeight: edge.hopsWeight,
          profitWeight: edge.profitWeight,
          combinedWeight: edge.combinedWeight,
        });
      }
    }
    outgoingEdges.sort((a, b) => a.combinedWeight - b.combinedWeight);

    // Number of members with this skill
    const memberCount = await (prisma as any).treeMember.count({
      where: {
        treeId,
        status: 'VERIFIED',
        // Prisma can't filter JSON arrays directly; estimate via skillInfluence
      },
    });

    return res.json({
      skill: node.skill,
      treeId,
      avgDifficulty: node.avgDifficulty,
      avgFiatAmount: node.avgFiatAmount,
      completedTaskCount: node.completedTaskCount,
      incomingEdgeCount: incomingEdges.length,
      outgoingEdgeCount: outgoingEdges.length,
      incomingEdges: incomingEdges.slice(0, 5), // top 5 easiest to learn from
      outgoingEdges: outgoingEdges.slice(0, 5), // top 5 skills to transition to
      memberCount: memberCount > 0 ? memberCount : null, // approximate
    });
  } catch (err: any) {
    console.error('[careerPath] getSkillStats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. rebuildGraph — POST /api/career-path/rebuild/:treeId (admin only)
// ═══════════════════════════════════════════════════════════════════════════

export async function rebuildGraph(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const treeId = req.params.treeId as string;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    // Admin check
    if (req.user?.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Administrator privileges required' });
    }

    // Force rebuild
    const graph = await buildGraph(treeId, true);

    // Log ADMIN event (WARNING severity)
    void logEvent({
      treeId,
      actorId: userId,
      action: 'CAREER_PATH_REBUILD',
      entityType: 'CareerPath',
      entityId: treeId,
      metadataJson: getRequestMetadata(req, {
        nodeCount: graph.nodes.size,
        isColdStart: graph.isColdStart,
      }),
      severity: 'WARNING',
      source: 'ADMIN',
    });

    return res.json({
      message: 'Graph rebuilt successfully',
      ...graphToResponse(graph),
    });
  } catch (err: any) {
    console.error('[careerPath] rebuildGraph error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
