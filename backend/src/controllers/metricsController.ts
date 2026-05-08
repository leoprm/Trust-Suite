import { Request, Response } from 'express';
import { prisma } from '../index';

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/metrics/conversion-rate?treeId=...&days=90
// Tasa de conversión Need → Branch. Un Need se considera "convertido" si tiene
// al menos una Idea que fue promovida a Branch. Retorna total, convertidos y tasa.
// ═══════════════════════════════════════════════════════════════════════════════
export const getConversionRate = async (req: Request, res: Response) => {
  try {
    const treeId = req.query.treeId as string | undefined;
    const days = parseInt(req.query.days as string || '90', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Needs asociados (opcionalmente a un árbol)
    let needIds: string[];
    if (treeId) {
      const links = await prisma.needTree.findMany({
        where: { treeId },
        select: { needId: true },
      });
      needIds = links.map(l => l.needId);
    } else {
      const allNeeds = await prisma.need.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true },
      });
      needIds = allNeeds.map(n => n.id);
    }

    if (needIds.length === 0) {
      return res.json({ totalNeeds: 0, convertedNeeds: 0, conversionRate: 0, periodDays: days });
    }

    // Total needs en el período
    const totalNeeds = await prisma.need.count({
      where: { id: { in: needIds }, createdAt: { gte: since } },
    });

    // Needs que tienen al menos una Idea promovida a Branch
    const branches = await prisma.branch.findMany({
      where: {
        idea: { needId: { in: needIds } },
        createdAt: { gte: since },
      },
      select: { idea: { select: { needId: true } } },
    });
    const convertedNeedIds = new Set(branches.map(b => b.idea?.needId).filter(Boolean));
    const convertedNeeds = convertedNeedIds.size;

    const conversionRate = totalNeeds > 0 ? parseFloat(((convertedNeeds / totalNeeds) * 100).toFixed(2)) : 0;

    return res.json({ totalNeeds, convertedNeeds, conversionRate, periodDays: days });
  } catch (err: any) {
    console.error('[Metrics:conversionRate]', err);
    return res.status(500).json({ error: 'Failed to compute conversion rate' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/metrics/engagement?treeId=...&days=30
// Participación y engagement por árbol: total miembros, miembros con actividad
// reciente (últimos N días en EventLog o tareas completadas), y ratio.
// Si no se pasa treeId, devuelve todos los árboles.
// ═══════════════════════════════════════════════════════════════════════════════
export const getEngagement = async (req: Request, res: Response) => {
  try {
    const treeId = req.query.treeId as string | undefined;
    const days = parseInt(req.query.days as string || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const treeFilter = treeId ? { treeId } : {};

    // Miembros totales por árbol (VERIFIED = activo)
    const memberCounts = await (prisma as any).treeMember.groupBy({
      by: ['treeId'],
      where: { ...treeFilter, status: 'VERIFIED' },
      _count: { id: true },
    });

    // Usuarios activos recientemente (EventLog)
    const activeUsersFromEvents = await prisma.eventLog.findMany({
      where: {
        ...(treeId ? { treeId } : {}),
        createdAt: { gte: since },
        actorId: { not: null },
      },
      select: { actorId: true, treeId: true },
      distinct: ['actorId', 'treeId'],
    });

    // Usuarios activos por tareas completadas recientemente
    const activeUsersFromTasks = await prisma.task.findMany({
      where: {
        ...(treeId ? { branch: { treeId } } : {}),
        status: 'COMPLETED',
        completedAt: { gte: since },
        assignedTo: { not: null },
      },
      select: { assignedTo: true, branchId: true },
    });
    // Resolver treeId de cada tarea
    const taskBranchIds = [...new Set(activeUsersFromTasks.map(t => t.branchId))];
    const branchTreeMap: Record<string, string> = {};
    if (taskBranchIds.length > 0) {
      const branchRecords = await prisma.branch.findMany({
        where: { id: { in: taskBranchIds } },
        select: { id: true, treeId: true },
      });
      for (const b of branchRecords) {
        if (b.treeId) branchTreeMap[b.id] = b.treeId;
      }
    }

    // Build active set per tree
    const activeByTree: Record<string, Set<string>> = {};
    for (const e of activeUsersFromEvents) {
      const t = e.treeId || '_global';
      if (!activeByTree[t]) activeByTree[t] = new Set();
      if (e.actorId) activeByTree[t].add(e.actorId);
    }
    for (const t of activeUsersFromTasks) {
      const tid = branchTreeMap[t.branchId] || '_global';
      if (!activeByTree[tid]) activeByTree[tid] = new Set();
      if (t.assignedTo) activeByTree[tid].add(t.assignedTo);
    }

    const result = (memberCounts as any[]).map((mc: any) => ({
      treeId: mc.treeId,
      totalMembers: mc._count?.id ?? 0,
      activeMembers: activeByTree[mc.treeId]?.size || 0,
      engagementRatio: (mc._count?.id ?? 0) > 0
        ? parseFloat((((activeByTree[mc.treeId]?.size || 0) / (mc._count?.id ?? 1)) * 100).toFixed(2))
        : 0,
    }));

    return res.json({ trees: result, periodDays: days });
  } catch (err: any) {
    console.error('[Metrics:engagement]', err);
    return res.status(500).json({ error: 'Failed to compute engagement metrics' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/metrics/activity?treeId=...&days=30
// Actividad temporal: eventos/día del EventLog, agrupados por fecha.
// ═══════════════════════════════════════════════════════════════════════════════
export const getActivity = async (req: Request, res: Response) => {
  try {
    const treeId = req.query.treeId as string | undefined;
    const days = parseInt(req.query.days as string || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const events = await prisma.eventLog.findMany({
      where: {
        ...(treeId ? { treeId } : {}),
        createdAt: { gte: since },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por día (YYYY-MM-DD)
    const byDay: Record<string, number> = {};
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }

    // Rellenar días sin eventos con 0
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      daily.push({ date: d, count: byDay[d] || 0 });
    }

    return res.json({ daily, totalEvents: events.length, periodDays: days });
  } catch (err: any) {
    console.error('[Metrics:activity]', err);
    return res.status(500).json({ error: 'Failed to compute activity metrics' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/metrics/top-skills?treeId=...&limit=20
// Top skills: más comunes entre miembros del árbol (del campo JSON TreeMember.skills)
// y con más XP acumulado en UserSkillXP. Se devuelven ambas perspectivas.
// ═══════════════════════════════════════════════════════════════════════════════
export const getTopSkills = async (req: Request, res: Response) => {
  try {
    const treeId = req.query.treeId as string | undefined;
    const limit = parseInt(req.query.limit as string || '20', 10);

    // Skills desde TreeMember.skills (campo JSON string)
    const members = await prisma.treeMember.findMany({
      where: { ...(treeId ? { treeId } : {}), status: 'VERIFIED' },
      select: { skills: true },
    });

    const skillCount: Record<string, number> = {};
    for (const m of members) {
      try {
        const arr: string[] = JSON.parse(m.skills || '[]');
        for (const s of arr) {
          const normalized = s.replace(/^#/, '').toLowerCase();
          skillCount[normalized] = (skillCount[normalized] || 0) + 1;
        }
      } catch { /* skip malformed JSON */ }
    }
    const byAdoption = Object.entries(skillCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([skill, count]) => ({ skill, memberCount: count }));

    // Skills por XP acumulado en UserSkillXP
    const xpAgg = await (prisma as any).userSkillXP.groupBy({
      by: ['skillTag'],
      where: { ...(treeId ? { treeId } : {}), accumulatedPoints: { gt: 0 } },
      _sum: { accumulatedPoints: true },
      _count: { id: true },
      orderBy: { _sum: { accumulatedPoints: 'desc' } },
      take: limit,
    });
    const byXP = (xpAgg as any[]).map((row: any) => ({
      skill: (row.skillTag || '').replace(/^#/, '').toLowerCase(),
      totalXP: row._sum?.accumulatedPoints || 0,
      userCount: row._count?.id || 0,
    }));

    return res.json({ byAdoption, byXP });
  } catch (err: any) {
    console.error('[Metrics:topSkills]', err);
    return res.status(500).json({ error: 'Failed to compute top skills' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/metrics/xp-distribution?treeId=...
// Distribución de XP entre miembros de un árbol. Histograma en buckets:
// [0-100), [100-500), [500-1000), [1000-5000), [5000-10000), [10000+)
// ═══════════════════════════════════════════════════════════════════════════════
export const getXpDistribution = async (req: Request, res: Response) => {
  try {
    const treeId = req.query.treeId as string | undefined;

    const members = await prisma.treeMember.findMany({
      where: { ...(treeId ? { treeId } : {}), status: 'VERIFIED' },
      select: { xp: true },
    });

    const buckets = [
      { label: '0-100', min: 0, max: 99, count: 0 },
      { label: '100-500', min: 100, max: 499, count: 0 },
      { label: '500-1K', min: 500, max: 999, count: 0 },
      { label: '1K-5K', min: 1000, max: 4999, count: 0 },
      { label: '5K-10K', min: 5000, max: 9999, count: 0 },
      { label: '10K+', min: 10000, max: Infinity, count: 0 },
    ];

    for (const m of members) {
      const xp = m.xp || 0;
      for (const b of buckets) {
        if (xp >= b.min && xp <= b.max) {
          b.count++;
          break;
        }
      }
    }

    const total = members.length;
    const avgXP = total > 0
      ? parseFloat((members.reduce((s, m) => s + (m.xp || 0), 0) / total).toFixed(2))
      : 0;
    const maxXP = total > 0 ? Math.max(...members.map(m => m.xp || 0)) : 0;

    return res.json({
      totalMembers: total,
      averageXP: avgXP,
      maxXP,
      distribution: buckets.map(b => ({
        ...b,
        percentage: total > 0 ? parseFloat(((b.count / total) * 100).toFixed(2)) : 0,
      })),
    });
  } catch (err: any) {
    console.error('[Metrics:xpDistribution]', err);
    return res.status(500).json({ error: 'Failed to compute XP distribution' });
  }
};
