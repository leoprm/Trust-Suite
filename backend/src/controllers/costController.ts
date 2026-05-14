import { Request, Response } from 'express';
import { prisma } from '../index';

// GET /api/costs/summary — desglose público de costos
export const getCostSummary = async (_req: Request, res: Response) => {
  try {
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

    // Agrupar por provider
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

    // 3. Usuarios activos este mes
    const activeUsers = await (prisma as any).apiUsage.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: startOfMonth } },
    });

    // Excluir admins — no cuentan para el promedio
    const adminIds = (await (prisma as any).user.findMany({
      where: { isPlatformAdmin: true },
      select: { telegramUserId: true },
    })).map((u: any) => u.telegramUserId);
    const nonAdminUsers = activeUsers.filter((u: any) => !adminIds.includes(u.userId));
    const userCount = nonAdminUsers.length || 1;

    // 4. Costo promedio por usuario
    const avgApiPerUser = totalApiCost / userCount;
    const avgFixedPerUser = totalFixed / userCount;
    const avgTotalPerUser = avgApiPerUser + avgFixedPerUser;

    res.json({
      fixed_costs: {
        salaries,
        infrastructure: infra,
        fixed,
        total: totalFixed,
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
      per_user_estimate: {
        active_users: userCount,
        avg_api_cost: Math.round(avgApiPerUser * 100) / 100,
        avg_fixed_share: Math.round(avgFixedPerUser * 100) / 100,
        avg_total: Math.round(avgTotalPerUser * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error('[costs] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
};
