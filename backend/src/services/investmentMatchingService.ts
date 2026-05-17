// ── Investment Matching Service ───────────────────────────────────────────────
// Cross-tree matching algorithm: investor ↔ seeker.
// Matches based on industry overlap, amount compatibility, investment type,
// revenue share %, and term constraints. Anonymized until mutual acceptance.
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

function scoreMatch(
  investor: any,
  seeker: any,
): number {
  let score = 0;

  // Industry overlap (0–40 points)
  const invIndustries: string[] = parseJson(investor.industries);
  const sekIndustries: string[] = parseJson(seeker.industries);
  const overlap = invIndustries.filter((i: string) => sekIndustries.includes(i));
  if (overlap.length > 0) {
    score += Math.min(40, overlap.length * 20);
  }

  // Investment type overlap (0–20 points)
  const invTypes: string[] = parseJson(investor.investmentTypes);
  const sekTypes: string[] = parseJson(seeker.investmentTypes);
  const typeOverlap = invTypes.filter((t: string) => sekTypes.includes(t));
  if (typeOverlap.length > 0) {
    score += Math.min(20, typeOverlap.length * 10);
  }

  // Amount compatibility (0–20 points)
  if (investor.capitalAvailable && seeker.amountSeeking && investor.capitalAvailable > 0) {
    const ratio = seeker.amountSeeking / investor.capitalAvailable;
    if (ratio >= 0.5 && ratio <= 1.0) score += 20;      // perfect fit
    else if (ratio >= 0.2 && ratio <= 1.2) score += 12;  // close
    else if (ratio <= 2.0) score += 5;                   // stretch
  }

  // Revenue share compatibility (0–10 points)
  if (investor.maxRevenueShare && seeker.maxRevenueShare) {
    const diff = Math.abs(investor.maxRevenueShare - seeker.maxRevenueShare);
    if (diff <= 2) score += 10;
    else if (diff <= 5) score += 6;
    else if (diff <= 10) score += 3;
  }

  // Term compatibility (0–10 points)
  if (investor.maxTermMonths && seeker.maxTermMonths) {
    if (investor.maxTermMonths >= seeker.maxTermMonths) score += 10;
    else if (investor.maxTermMonths >= seeker.maxTermMonths * 0.7) score += 5;
  }

  return score;
}

function pickBestInvestmentType(investor: any, seeker: any): string {
  const invTypes: string[] = parseJson(investor.investmentTypes);
  const sekTypes: string[] = parseJson(seeker.investmentTypes);

  const priority = ['REVENUE_SHARE', 'LOAN', 'EQUITY'];
  for (const t of priority) {
    if (invTypes.includes(t) && sekTypes.includes(t)) return t;
  }
  return invTypes[0] || 'REVENUE_SHARE';
}

// ── public API ───────────────────────────────────────────────────────────────

export async function findMatchesForTree(prisma: PrismaClient, treeId: string) {
  // Get the caller's profile
  const myProfile = await prisma.treeInvestmentProfile.findUnique({ where: { treeId } });
  if (!myProfile) throw new Error('No investment profile configured. Use PUT /api/trees/:id/investment-profile first.');

  const results: any[] = [];

  // If I'm an investor, find seekers
  if (myProfile.isInvestor) {
    const seekers = await prisma.treeInvestmentProfile.findMany({
      where: { seekingInvestment: true, treeId: { not: treeId } },
    });

    for (const seeker of seekers) {
      const existing = await prisma.investmentMatch.findFirst({
        where: {
          investorTreeId: treeId,
          seekerTreeId: seeker.treeId,
          status: { notIn: ['REJECTED'] },
        },
      });
      if (existing) continue;

      const score = scoreMatch(myProfile, seeker);
      if (score < 15) continue;

      const investmentType = pickBestInvestmentType(myProfile, seeker);

      results.push({
        investorTreeId: treeId,
        seekerTreeId: seeker.treeId,
        score,
        matchSummary: {
          investmentType,
          amount: seeker.amountSeeking,
          revenueShare: Math.min(
            myProfile.maxRevenueShare ?? 100,
            seeker.maxRevenueShare ?? 100,
          ),
          termMonths: seeker.maxTermMonths,
          industries: parseJson(seeker.industries),
        },
        seekerRef: `G-${seeker.treeId.slice(0, 6)}`,
      });
    }
  }

  // If I'm seeking investment, find investors
  if (myProfile.seekingInvestment) {
    const investors = await prisma.treeInvestmentProfile.findMany({
      where: { isInvestor: true, treeId: { not: treeId } },
      orderBy: { confidenceScore: 'desc' },
    });

    for (const investor of investors) {
      const existing = await prisma.investmentMatch.findFirst({
        where: {
          seekerTreeId: treeId,
          investorTreeId: investor.treeId,
          status: { notIn: ['REJECTED'] },
        },
      });
      if (existing) continue;

      const score = scoreMatch(investor, myProfile);
      if (score < 15) continue;

      const investmentType = pickBestInvestmentType(investor, myProfile);

      results.push({
        investorTreeId: investor.treeId,
        seekerTreeId: treeId,
        score,
        matchSummary: {
          investmentType,
          amount: myProfile.amountSeeking,
          revenueShare: Math.min(
            investor.maxRevenueShare ?? 100,
            myProfile.maxRevenueShare ?? 100,
          ),
          termMonths: myProfile.maxTermMonths,
          industries: parseJson(investor.industries),
        },
        investorRef: `I-${investor.treeId.slice(0, 6)}`,
        investorConfidenceScore: investor.confidenceScore,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export async function proposeMatch(
  prisma: PrismaClient,
  proposerId: string,
  investorTreeId: string,
  seekerTreeId: string,
  amount: number,
  investmentType: any,
  revenueShare?: number,
  termMonths?: number,
) {
  const [investor, seeker] = await Promise.all([
    prisma.tree.findUnique({ where: { id: investorTreeId } }),
    prisma.tree.findUnique({ where: { id: seekerTreeId } }),
  ]);
  if (!investor || !seeker) throw new Error('One or both trees not found');
  if (investorTreeId === seekerTreeId) throw new Error('A tree cannot match with itself');

  const existing = await prisma.investmentMatch.findFirst({
    where: {
      investorTreeId,
      seekerTreeId,
      status: { notIn: ['REJECTED', 'COMPLETED'] },
    },
  });
  if (existing) throw new Error('An active match already exists between these trees');

  const match = await prisma.investmentMatch.create({
    data: {
      investorTreeId,
      seekerTreeId,
      amount,
      investmentType: investmentType as any,
      revenueShare: revenueShare ?? null,
      termMonths: termMonths ?? null,
      status: 'PROPOSED',
      proposedBy: proposerId,
    },
  });

  return match;
}

export async function acceptMatch(prisma: PrismaClient, matchId: string, treeId: string) {
  const match = await prisma.investmentMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('Match not found');
  if (match.status !== 'PROPOSED' && match.status !== 'NEGOTIATING') {
    throw new Error(`Match is in status ${match.status}, cannot accept`);
  }

  if (match.investorTreeId !== treeId && match.seekerTreeId !== treeId) {
    throw new Error('You are not a party to this match');
  }

  const otherSideAccepted = match.acceptedAt !== null;

  if (otherSideAccepted) {
    const updated = await prisma.investmentMatch.update({
      where: { id: matchId },
      data: {
        status: 'ACTIVE',
        completedAt: null,
        updatedAt: new Date(),
      },
    });
    return { match: updated, bothAccepted: true };
  } else {
    const updated = await prisma.investmentMatch.update({
      where: { id: matchId },
      data: {
        status: 'NEGOTIATING',
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return { match: updated, bothAccepted: false };
  }
}

export async function rejectMatch(prisma: PrismaClient, matchId: string, treeId: string) {
  const match = await prisma.investmentMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('Match not found');
  if (match.investorTreeId !== treeId && match.seekerTreeId !== treeId) {
    throw new Error('You are not a party to this match');
  }

  return prisma.investmentMatch.update({
    where: { id: matchId },
    data: { status: 'REJECTED' },
  });
}

export async function rateInvestment(
  prisma: PrismaClient,
  matchId: string,
  raterTreeId: string,
  score: number,
  comment?: string,
) {
  const match = await prisma.investmentMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('Match not found');
  if (match.status !== 'ACTIVE' && match.status !== 'COMPLETED') {
    throw new Error('Can only rate active or completed matches');
  }

  const ratedTreeId = match.investorTreeId === raterTreeId
    ? match.seekerTreeId
    : match.investorTreeId;

  if (match.investorTreeId !== raterTreeId && match.seekerTreeId !== raterTreeId) {
    throw new Error('You are not a party to this match');
  }

  if (score < 1 || score > 5) throw new Error('Score must be 1–5');

  const rating = await prisma.investmentRating.upsert({
    where: {
      matchId_raterTreeId: { matchId, raterTreeId },
    },
    create: {
      matchId,
      raterTreeId,
      ratedTreeId,
      score,
      comment: comment ?? null,
    },
    update: {
      score,
      comment: comment ?? null,
    },
  });

  // Recalculate confidence score for rated tree
  const allRatings = await prisma.investmentRating.findMany({
    where: { ratedTreeId },
  });
  if (allRatings.length > 0) {
    const avg = allRatings.reduce((s: number, r: any) => s + r.score, 0) / allRatings.length;
    const confidence = Math.round(((avg - 1) / 4) * 100);
    await prisma.treeInvestmentProfile.updateMany({
      where: { treeId: ratedTreeId },
      data: { confidenceScore: confidence },
    });
  }

  return rating;
}

export async function getMatchesForTree(prisma: PrismaClient, treeId: string) {
  const matches = await prisma.investmentMatch.findMany({
    where: {
      OR: [
        { investorTreeId: treeId },
        { seekerTreeId: treeId },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      ratings: true,
    },
  });

  return matches.map((m: any) => {
    const isInvestor = m.investorTreeId === treeId;
    const partnerId = isInvestor ? m.seekerTreeId : m.investorTreeId;
    const partnerRef = isInvestor
      ? `G-${partnerId.slice(0, 6)}`
      : `I-${partnerId.slice(0, 6)}`;

    return {
      ...m,
      isInvestor,
      partnerRef,
      partnerTreeId: ['NEGOTIATING', 'ACTIVE', 'COMPLETED'].includes(m.status)
        ? partnerId
        : undefined,
    };
  });
}
