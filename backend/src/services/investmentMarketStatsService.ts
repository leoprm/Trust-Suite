// ── Investment Market Stats Service ───────────────────────────────────────────
// Computes market averages for investment terms grouped by industry.
// Used to show benchmarks before negotiation (e.g. "avg revenue-share for
// construction in Chile is 8-12% over 2-3 years").
// ──────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';

// ── helpers ──────────────────────────────────────────────────────────────────

function parseJson(raw: any, fallback: any[] = []): any[] {
  if (typeof raw === 'string') {
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : fallback; }
    catch { return fallback; }
  }
  return Array.isArray(raw) ? raw : fallback;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── public API ───────────────────────────────────────────────────────────────

export interface MarketStats {
  industry: string;
  sampleSize: number;
  avgAmount: number | null;
  avgRevenueShare: number | null;
  revenueShareRange: { min: number; max: number } | null;
  avgTermMonths: number | null;
  termMonthsRange: { min: number; max: number } | null;
  commonInvestmentTypes: { type: string; count: number }[];
}

export async function getMarketStats(prisma: PrismaClient, industry?: string): Promise<MarketStats[]> {
  const matches = await prisma.investmentMatch.findMany({
    where: {
      status: { in: ['ACTIVE', 'COMPLETED'] },
      revenueShare: { not: null },
      termMonths: { not: null },
    },
  });

  const invIds = new Set<string>();
  const sekIds = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    invIds.add(matches[i].investorTreeId);
    sekIds.add(matches[i].seekerTreeId);
  }
  const investorIds = Array.from(invIds);
  const seekerIds = Array.from(sekIds);

  const profiles = await prisma.treeInvestmentProfile.findMany({
    where: {
      treeId: { in: [...investorIds, ...seekerIds] },
    },
  });

  const profileMap = new Map<string, any>();
  for (let i = 0; i < profiles.length; i++) {
    profileMap.set(profiles[i].treeId, profiles[i]);
  }

  // Group matches by industry
  const byIndustry = new Map<string, {
    amounts: number[];
    revenueShares: number[];
    termMonths: number[];
    investmentTypes: string[];
  }>();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const seekerProfile = profileMap.get(match.seekerTreeId);
    const industries: string[] = seekerProfile
      ? parseJson(seekerProfile.industries)
      : [];

    const targetIndustries = industry
      ? industries.filter(ind => ind.toLowerCase().includes(industry.toLowerCase()))
      : industries;

    if (targetIndustries.length === 0 && industries.length > 0) continue;

    const effectiveIndustries = targetIndustries.length > 0 ? targetIndustries : ['General'];

    for (let j = 0; j < effectiveIndustries.length; j++) {
      const ind = effectiveIndustries[j];
      if (!byIndustry.has(ind)) {
        byIndustry.set(ind, { amounts: [], revenueShares: [], termMonths: [], investmentTypes: [] });
      }
      const bucket = byIndustry.get(ind)!;
      bucket.amounts.push(match.amount);
      if (match.revenueShare !== null) bucket.revenueShares.push(match.revenueShare);
      if (match.termMonths !== null) bucket.termMonths.push(match.termMonths);
      bucket.investmentTypes.push(match.investmentType);
    }
  }

  if (industry && byIndustry.size === 0) {
    return [];
  }

  const result: MarketStats[] = [];
  const industriesList = Array.from(byIndustry.keys());

  for (let i = 0; i < industriesList.length; i++) {
    const ind = industriesList[i];
    const bucket = byIndustry.get(ind)!;

    const revenueShares = bucket.revenueShares.slice().sort((a, b) => a - b);
    const termMonths = bucket.termMonths.slice().sort((a, b) => a - b);

    const typeCounts = new Map<string, number>();
    for (let j = 0; j < bucket.investmentTypes.length; j++) {
      const t = bucket.investmentTypes[j];
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }

    const typesList = Array.from(typeCounts.keys());
    const commonTypes: { type: string; count: number }[] = [];
    for (let j = 0; j < typesList.length; j++) {
      commonTypes.push({ type: typesList[j], count: typeCounts.get(typesList[j])! });
    }
    commonTypes.sort((a, b) => b.count - a.count);

    result.push({
      industry: ind,
      sampleSize: bucket.amounts.length,
      avgAmount: avg(bucket.amounts),
      avgRevenueShare: avg(revenueShares),
      revenueShareRange: revenueShares.length > 0
        ? { min: revenueShares[0], max: revenueShares[revenueShares.length - 1] }
        : null,
      avgTermMonths: avg(termMonths),
      termMonthsRange: termMonths.length > 0
        ? { min: termMonths[0], max: termMonths[termMonths.length - 1] }
        : null,
      commonInvestmentTypes: commonTypes,
    });
  }

  return result.sort((a, b) => b.sampleSize - a.sampleSize);
}
