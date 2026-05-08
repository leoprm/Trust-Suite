import { Request, Response } from 'express';
import { prisma } from '../index';

// ── In-memory response cache (TTL 5 min) ──────────────────────────────────

interface CachedMetrics {
  data: any;
  storedAt: number;
}

let metricsCache: CachedMetrics | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Lightweight IP rate limiter to prevent cache-busting abuse ─────────────

interface RateWindow {
  count: number;
  resetAt: number;
}

const rateMap = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT = 30; // max 30 requests per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;

  entry.count++;
  return false;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now >= entry.resetAt) rateMap.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ── Public Metrics Handler ─────────────────────────────────────────────────

export const getPublicMetrics = async (req: Request, res: Response) => {
  try {
    // Rate limiting
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';

    if (isRateLimited(clientIp)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    // Serve from cache if fresh
    if (metricsCache && (Date.now() - metricsCache.storedAt) < CACHE_TTL_MS) {
      return res.json(metricsCache.data);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Total public trees (visibility=PUBLIC — GLOBAL is a discoverability filter, not a visibility level)
    const totalTrees = await prisma.tree.count({
      where: { visibility: 'PUBLIC' },
    });

    // Total members across public trees (VERIFIED = active members)
    const totalMembersResult = await prisma.treeMember.count({
      where: {
        tree: { visibility: 'PUBLIC' },
        status: 'VERIFIED',
      },
    });

    // Total fiat volume last 30 days across public trees
    const fiatVolumeResult = await prisma.fiatTransaction.aggregate({
      _sum: { amount: true },
      where: {
        tree: { visibility: 'PUBLIC' },
        date: { gte: thirtyDaysAgo },
      },
    });

    // Average satisfaction across all deliveries in public trees
    const satResult = await prisma.satisfactionRating.aggregate({
      _avg: { rating: true },
      where: {
        deliverable: {
          branch: {
            tree: { visibility: 'PUBLIC' },
          },
        },
      },
    });

    // Top 5 trees by monthly fiat profit (INCOME only, last 30 days)
    const topTreesRaw = await prisma.fiatTransaction.groupBy({
      by: ['treeId'],
      _sum: { amount: true },
      where: {
        tree: { visibility: 'PUBLIC' },
        type: 'INCOME',
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });

    // Enrich top trees: name, memberCount, sector, capacidades
    const topTreeIds = topTreesRaw.map(t => t.treeId);

    // Fetch member counts in parallel (separate query avoids Prisma _count typing issues)
    const memberCounts = topTreeIds.length > 0
      ? await prisma.treeMember.groupBy({
          by: ['treeId'],
          _count: { id: true },
          where: {
            treeId: { in: topTreeIds },
            status: 'VERIFIED',
          },
        })
      : [];

    const memberCountMap = new Map<string, number>();
    for (const mc of memberCounts) {
      memberCountMap.set(mc.treeId, mc._count.id);
    }

    const topTreesData = await prisma.tree.findMany({
      where: { id: { in: topTreeIds } },
      select: {
        id: true,
        name: true,
        sector: true,
        capacidades: true,
      },
    });

    const profitMap = new Map<string, number>();
    for (const t of topTreesRaw) {
      profitMap.set(t.treeId, t._sum.amount || 0);
    }

    // Build top trees sorted by profit descending
    const topTrees = topTreesData
      .map(t => ({
        name: t.name,
        memberCount: memberCountMap.get(t.id) || 0,
        fiatMonthlyProfit: profitMap.get(t.id) || 0,
        sector: t.sector || null,
        capacidades: t.capacidades || '[]',
      }))
      .sort((a, b) => b.fiatMonthlyProfit - a.fiatMonthlyProfit);

    const payload = {
      totalTrees,
      totalMembers: totalMembersResult,
      totalFiatVolume: Math.round((fiatVolumeResult._sum.amount || 0) * 100) / 100,
      avgSatisfaction: satResult._avg.rating
        ? Math.round(satResult._avg.rating * 100) / 100
        : 0,
      topTrees,
    };

    // Store in cache
    metricsCache = { data: payload, storedAt: Date.now() };

    res.json(payload);
  } catch (error) {
    console.error('[PublicMetrics] Error:', error);
    res.status(500).json({ error: 'Failed to fetch public metrics' });
  }
};
