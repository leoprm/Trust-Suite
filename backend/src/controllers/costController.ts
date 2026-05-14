import { Request, Response } from 'express';
import { prisma } from '../index';

// GET /api/costs/summary — desglose de costos por árbol (autenticado)
export const getCostSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // 1. Leer costos fijos de PlatformConfig
    const configs = await (prisma as any).platformConfig.findMany();
    const getConfig = (key: string): string => {
      const c = configs.find((c: any) => c.key === key);
      return c?.value ?? '0';
    };

    const salaries = parseFloat(getConfig('cost_salaries'));
    const infra = parseFloat(getConfig('cost_infrastructure'));
    const fixed = parseFloat(getConfig('cost_fixed'));
    const margin = parseFloat(getConfig('growth_margin_pct'));
    const totalFixed = salaries + infra + fixed;

    // 2. Calcular uso de APIs este mes
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const apiUsageThisMonth = await (prisma as any).apiUsage.findMany({
      where: { createdAt: { gte: startOfMonth } },
    });

    // Agrupar por provider (global)
    const byProvider: Record<string, { tokensIn: number; tokensOut: number; cost: number; queries: number }> = {};
    for (const u of apiUsageThisMonth) {
      const p = u.provider || 'unknown';
      if (!byProvider[p]) byProvider[p] = { tokensIn: 0, tokensOut: 0, cost: 0, queries: 0 };
      byProvider[p].tokensIn += u.tokensIn;
      byProvider[p].tokensOut += u.tokensOut;
      byProvider[p].cost += u.cost;
      byProvider[p].queries++;
    }

    const totalApiCost = Object.values(byProvider).reduce((sum, v) => sum + v.cost, 0);

    // 2b. Costo absorbido por período gratuito este mes
    const absorbedThisMonth = await (prisma as any).apiUsage.aggregate({
      where: { createdAt: { gte: startOfMonth }, isFreePeriod: true },
      _sum: { absorbedByPlatform: true },
    });
    const absorbed = absorbedThisMonth._sum?.absorbedByPlatform || 0;

    // 2c. Usuarios en período gratuito
    const freeUsersSet = new Set(
      apiUsageThisMonth.filter((u: any) => u.isFreePeriod).map((u: any) => u.userId.toString())
    );
    const freeUserCount = freeUsersSet.size;

    // ── NUEVO: Cálculo por árbol ─────────────────────────────────────────

    // Obtener membresías del usuario
    const memberships = await (prisma as any).treeMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { tree: { select: { id: true, name: true } } },
    });

    // Árboles activos totales (para dividir costos fijos)
    const activeTrees = await (prisma as any).treeMember.groupBy({
      by: ['treeId'],
      where: { status: 'ACTIVE' },
    });
    const activeTreeCount = activeTrees.length || 1;
    const fixedPerTree = totalFixed / activeTreeCount;

    // Calcular por árbol
    const perTree = await Promise.all(
      memberships.map(async (m: any) => {
        const treeId = m.treeId;

        // Uso de APIs este mes en este árbol (sin período gratuito)
        const apiUsage = await (prisma as any).apiUsage.aggregate({
          where: {
            treeId,
            createdAt: { gte: startOfMonth },
            isFreePeriod: false,
          },
          _sum: { cost: true, tokensIn: true, tokensOut: true },
        });

        const apiCost = apiUsage._sum?.cost || 0;

        // Miembros activos del árbol
        const memberCount = await (prisma as any).treeMember.count({
          where: { treeId, status: 'ACTIVE' },
        });

        const treeTotal = apiCost + fixedPerTree;
        const perPerson = treeTotal / (memberCount || 1);

        return {
          treeId,
          treeName: m.tree.name,
          memberCount,
          apiCost: Math.round(apiCost * 100) / 100,
          fixedShare: Math.round(fixedPerTree * 100) / 100,
          treeTotal: Math.round(treeTotal * 100) / 100,
          perPerson: Math.round(perPerson * 100) / 100,
        };
      })
    );

    res.json({
      fixed_costs: {
        salaries,
        infrastructure: infra,
        fixed,
        total: totalFixed,
        active_trees: activeTreeCount,
        per_tree: Math.round(fixedPerTree * 100) / 100,
      },
      api_costs: {
        this_month: {
          total: Math.round(totalApiCost * 100) / 100,
          by_provider: Object.entries(byProvider).map(([provider, data]) => ({
            provider,
            queries: data.queries,
            tokens_in: data.tokensIn,
            tokens_out: data.tokensOut,
            cost: Math.round(data.cost * 100) / 100,
          })),
        },
      },
      growth_margin_pct: margin,
      free_period: {
        users_in_trial: freeUserCount,
        absorbed_this_month: Math.round(absorbed * 100) / 100,
      },
      per_tree: perTree,
    });
  } catch (error: any) {
    console.error('[costs] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
};
