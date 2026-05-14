import { Response } from 'express';
import { prisma } from '../index';

/**
 * GET /api/analytics/ecosystem
 * Global ecosystem summary: agents, trees, needs, ratings today, active agents.
 */
export const getEcosystem = async (_req: any, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalAgents,
      totalTrees,
      totalNeeds,
      openNeeds,
      ratingsToday,
      activeAgents,
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.tree.count(),
      prisma.need.count(),
      prisma.need.count({ where: { status: 'OPEN' } }),
      prisma.rating.count({ where: { createdAt: { gte: today } } }),
      prisma.agentProfile.count({ where: { lastActiveAt: { gte: yesterday } } }),
    ]);

    res.json({
      totalAgents,
      totalTrees,
      totalNeeds,
      openNeeds,
      ratingsToday,
      activeAgents,
    });
  } catch (error: any) {
    console.error('[getEcosystem] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch ecosystem stats' });
  }
};

/**
 * GET /api/analytics/agents/heatmap
 * Role × Model matrix with avgStars, aggregated from Rating JOIN AgentProfile.
 */
export const getAgentsHeatmap = async (_req: any, res: Response) => {
  try {
    const ratings = await prisma.rating.findMany({
      select: {
        role: true,
        agent: { select: { name: true } },
        membership: {
          select: {
            agent: { select: { profile: { select: { avgStars: true } } } },
          },
        },
      },
    });

    // Build matrix: group by (role, model)
    const matrix = new Map<string, { role: string; model: string; totalStars: number; count: number }>();

    for (const r of ratings) {
      const model = r.agent.name;
      const role = r.role;
      const key = `${role}::${model}`;

      if (!matrix.has(key)) {
        matrix.set(key, { role, model, totalStars: 0, count: 0 });
      }
      const entry = matrix.get(key)!;
      // Use agent profile avgStars as contribution weight per rating
      const avgStars = r.membership.agent.profile?.avgStars ?? 0;
      entry.totalStars += avgStars;
      entry.count += 1;
    }

    const heatmap = Array.from(matrix.values()).map(e => ({
      role: e.role,
      model: e.model,
      avgStars: e.count > 0 ? Math.round((e.totalStars / e.count) * 10) / 10 : 0,
      totalRatings: e.count,
    }));

    // Deduplicate roles and models for matrix headers
    const roles = [...new Set(heatmap.map(h => h.role))].sort();
    const models = [...new Set(heatmap.map(h => h.model))].sort();

    res.json({ roles, models, matrix: heatmap });
  } catch (error: any) {
    console.error('[getAgentsHeatmap] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch agents heatmap' });
  }
};

/**
 * GET /api/analytics/agents/:id/timeline
 * Ratings per day for the last 30 days for a specific agent.
 * Response: [{ date, totalRatings, avgStars, topRole }]
 */
export const getAgentTimeline = async (req: any, res: Response) => {
  try {
    const { id: agentId } = req.params;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const ratings = await prisma.rating.findMany({
      where: {
        agentId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        stars: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const dayMap = new Map<string, { totalStars: number; count: number; roles: Map<string, number> }>();

    for (const r of ratings) {
      const date = r.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!dayMap.has(date)) {
        dayMap.set(date, { totalStars: 0, count: 0, roles: new Map() });
      }
      const day = dayMap.get(date)!;
      day.totalStars += r.stars;
      day.count += 1;
      day.roles.set(r.role, (day.roles.get(r.role) || 0) + 1);
    }

    // Build timeline filling all 30 days
    const timeline = [];
    const startDate = new Date(thirtyDaysAgo);

    for (let i = 0; i <= 30; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const day = dayMap.get(dateStr);

      let topRole = null;
      if (day && day.roles.size > 0) {
        topRole = [...day.roles.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      }

      timeline.push({
        date: dateStr,
        totalRatings: day?.count ?? 0,
        avgStars: day && day.count > 0 ? Math.round((day.totalStars / day.count) * 10) / 10 : 0,
        topRole,
      });
    }

    res.json(timeline);
  } catch (error: any) {
    console.error('[getAgentTimeline] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch agent timeline' });
  }
};

/**
 * GET /api/analytics/trees/:id/health
 * Tree health: open needs, active agents, 7d activity, avg rating.
 */
export const getTreeHealth = async (req: any, res: Response) => {
  try {
    const { id: treeId } = req.params;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [openNeeds, activeAgents, activity7d, ratingAgg] = await Promise.all([
      prisma.need.count({ where: { treeId, status: 'OPEN' } }),
      prisma.agentMembership.count({ where: { treeId, status: 'ACTIVE' } }),
      prisma.rating.count({ where: { treeId, createdAt: { gte: sevenDaysAgo } } }),
      prisma.rating.aggregate({
        where: { treeId },
        _avg: { stars: true },
        _count: true,
      }),
    ]);

    res.json({
      treeId,
      openNeeds,
      activeAgents,
      activity7d,
      avgRating: ratingAgg._avg.stars
        ? Math.round(ratingAgg._avg.stars * 10) / 10
        : 0,
      totalRatings: ratingAgg._count,
    });
  } catch (error: any) {
    console.error('[getTreeHealth] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch tree health' });
  }
};

/**
 * GET /api/analytics/models/compare
 * Side-by-side model comparison: avgStars, totalRatings, primaryRole, confidenceScore.
 * Query: ?ids=id1,id2
 */
export const compareModels = async (req: any, res: Response) => {
  try {
    const idsParam = req.query.ids as string;
    if (!idsParam) {
      return res.status(400).json({ error: 'Query parameter "ids" is required (comma-separated agent IDs)' });
    }

    const agentIds = idsParam.split(',').map((s: string) => s.trim()).filter(Boolean);

    if (agentIds.length === 0) {
      return res.status(400).json({ error: 'At least one agent ID is required' });
    }

    const profiles = await prisma.agentProfile.findMany({
      where: { agentId: { in: agentIds } },
      select: {
        agentId: true,
        avgStars: true,
        totalRatings: true,
        primaryRole: true,
        confidenceScore: true,
        agent: { select: { name: true } },
      },
    });

    const models = profiles.map(p => ({
      id: p.agentId,
      name: p.agent.name,
      avgStars: p.avgStars,
      totalRatings: p.totalRatings,
      primaryRole: p.primaryRole,
      confidenceScore: p.confidenceScore,
    }));

    res.json({ models });
  } catch (error: any) {
    console.error('[compareModels] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to compare models' });
  }
};
