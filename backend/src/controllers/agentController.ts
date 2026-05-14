import { Response } from 'express';
import { prisma } from '../index';
import { assignAgentToTreeSlot } from '../services/agentProfileService';

/**
 * GET /api/agents
 * Lista agentes con perfil cross-árbol, ordenados por totalRatings desc.
 * Soporta ?role=analyst para filtrar por primaryRole.
 */
export const getAgents = async (req: any, res: Response) => {
  try {
    const { role } = req.query;

    const where: any = {};
    if (role && typeof role === 'string') {
      where.profile = { primaryRole: role };
    }

    const agents = await prisma.agent.findMany({
      where,
      include: { profile: true },
      orderBy: { profile: { totalRatings: 'desc' } },
    });

    res.json(agents);
  } catch (error: any) {
    console.error('[getAgents] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

/**
 * GET /api/agents/:id/profile
 * Perfil detallado: Agent + AgentProfile + últimos 20 ratings + historial de roles.
 */
export const getAgentProfile = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        profile: true,
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        roleHistory: {
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(agent);
  } catch (error: any) {
    console.error('[getAgentProfile] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch agent profile' });
  }
};

/**
 * GET /api/agents/leaderboard?role=analyst
 * Top 20 agentes por confidenceScore para un rol dado.
 * Si no se especifica rol, top global (por confidenceScore).
 */
export const getAgentLeaderboard = async (req: any, res: Response) => {
  try {
    const { role } = req.query;

    const where: any = {};
    if (role && typeof role === 'string') {
      where.primaryRole = role;
    }

    const profiles = await prisma.agentProfile.findMany({
      where,
      include: { agent: true },
      orderBy: { confidenceScore: 'desc' },
      take: 20,
    });

    res.json(profiles);
  } catch (error: any) {
    console.error('[getAgentLeaderboard] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};

/**
 * GET /api/trees/:id/agents
 * Agentes actualmente asignados (AgentRoleHistory con releasedAt null).
 * Incluye role y performanceScore.
 */
export const getTreeAgents = async (req: any, res: Response) => {
  try {
    const { id: treeId } = req.params;

    const assignments = await prisma.agentRoleHistory.findMany({
      where: { treeId, releasedAt: null },
      include: {
        agent: {
          include: { profile: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    res.json(assignments);
  } catch (error: any) {
    console.error('[getTreeAgents] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch tree agents' });
  }
};

/**
 * POST /api/trees/:id/agents/assign (JWT required)
 * Forzar reasignación de un slot.
 * Body: { role: "analyst" }
 */
export const assignTreeAgent = async (req: any, res: Response) => {
  try {
    const { id: treeId } = req.params;
    const { role } = req.body;

    if (!role || typeof role !== 'string') {
      return res.status(400).json({ error: 'role (string) is required' });
    }

    const validRoles = ['analyst', 'researcher', 'implementer', 'reviewer', 'mediator'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      });
    }

    const agentId = await assignAgentToTreeSlot(treeId, role);

    if (!agentId) {
      return res.status(404).json({
        error: 'No eligible agents found for this role',
      });
    }

    const assignment = await prisma.agentRoleHistory.findFirst({
      where: { agentId, treeId, role, releasedAt: null },
      include: {
        agent: { include: { profile: true } },
      },
    });

    res.status(201).json(assignment);
  } catch (error: any) {
    console.error('[assignTreeAgent] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to assign agent', detail: error?.message || String(error) });
  }
};
