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

    // fiatTransaction model was deleted (TM1-TM6) — fiat metrics are unavailable
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

    // Top 5 trees by member count (fiatTransaction was deleted, no profit data available)
    const topTrees: Array<{
      name: string;
      memberCount: number;
      monthlyProfit: number;
      sector: string | null;
      capacidades: string;
    }> = [];

    try {
      const topTreeIds = await prisma.treeMember.groupBy({
        by: ['treeId'],
        _count: { id: true },
        where: {
          tree: { visibility: 'PUBLIC' },
          status: 'VERIFIED',
        },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      });

      const memberIds = topTreeIds.map(t => t.treeId);

      const topTreesData = memberIds.length > 0
        ? await prisma.tree.findMany({
            where: { id: { in: memberIds } },
            select: {
              id: true,
              name: true,
              sector: true,
              capacidades: true,
            },
          })
        : [];

      const memberCountMap = new Map<string, number>();
      for (const mc of topTreeIds) {
        memberCountMap.set(mc.treeId, mc._count.id);
      }

      for (const t of topTreesData) {
        topTrees.push({
          name: t.name,
          memberCount: memberCountMap.get(t.id) || 0,
          monthlyProfit: 0, // fiatTransaction model deleted
          sector: t.sector || null,
          capacidades: t.capacidades || '[]',
        });
      }
    } catch {
      // Leave topTrees empty if query fails
    }

    const payload = {
      totalTrees,
      totalMembers: totalMembersResult,
      totalFiatVolume: 0, // fiatTransaction model deleted
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

// ── Public Fee Stats Handler ───────────────────────────────────────────────
// NOTE: globalFeeConfig, feeDistribution, isTrustCore, trustCoreConfig were deleted (TM1-TM6)

export const getPublicFeeStats = async (_req: Request, res: Response) => {
  try {
    return res.json({
      currentFeePercent: 0.5,
      totalFeesCollectedAllTime: 0,
      activeTrustCoreTrees: 0,
      lastRecalculatedAt: null,
    });
  } catch (error) {
    console.error('[PublicFeeStats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch fee stats' });
  }
};
