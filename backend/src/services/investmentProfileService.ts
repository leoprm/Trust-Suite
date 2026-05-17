// ── Investment Profile Service ────────────────────────────────────────────────
// CRUD for TreeInvestmentProfile — investor or seeker profiles.
// Note: isInvestor / seekingInvestment flags live ONLY on TreeInvestmentProfile
// (Tree model does not have those columns in TrustMaker).
// ──────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';

function parseJson(raw: any, fallback: any[] = []): any {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  if (Array.isArray(raw)) return raw;
  return fallback;
}

// ── public API ───────────────────────────────────────────────────────────────

export interface InvestmentProfileInput {
  isInvestor?: boolean;
  seekingInvestment?: boolean;
  capitalAvailable?: number | null;
  amountSeeking?: number | null;
  industries?: string[];
  investmentTypes?: string[];
  maxRevenueShare?: number | null;
  maxTermMonths?: number | null;
  purpose?: string | null;
  portfolioSummary?: string | null;
}

export async function upsertInvestmentProfile(
  prisma: PrismaClient,
  treeId: string,
  data: InvestmentProfileInput,
) {
  // Validate tree exists
  const tree = await prisma.tree.findUnique({ where: { id: treeId } });
  if (!tree) throw new Error('Tree not found');

  // Upsert the profile
  const profile = await prisma.treeInvestmentProfile.upsert({
    where: { treeId },
    create: {
      treeId,
      isInvestor: data.isInvestor ?? false,
      seekingInvestment: data.seekingInvestment ?? false,
      capitalAvailable: data.capitalAvailable ?? null,
      amountSeeking: data.amountSeeking ?? null,
      industries: JSON.stringify(data.industries ?? []),
      investmentTypes: JSON.stringify(data.investmentTypes ?? []),
      maxRevenueShare: data.maxRevenueShare ?? null,
      maxTermMonths: data.maxTermMonths ?? null,
      purpose: data.purpose ?? null,
      portfolioSummary: data.portfolioSummary ?? null,
    },
    update: {
      isInvestor: data.isInvestor ?? false,
      seekingInvestment: data.seekingInvestment ?? false,
      capitalAvailable: data.capitalAvailable ?? null,
      amountSeeking: data.amountSeeking ?? null,
      industries: data.industries !== undefined ? JSON.stringify(data.industries) : undefined,
      investmentTypes: data.investmentTypes !== undefined ? JSON.stringify(data.investmentTypes) : undefined,
      maxRevenueShare: data.maxRevenueShare !== undefined ? data.maxRevenueShare : undefined,
      maxTermMonths: data.maxTermMonths !== undefined ? data.maxTermMonths : undefined,
      purpose: data.purpose !== undefined ? data.purpose : undefined,
      portfolioSummary: data.portfolioSummary !== undefined ? data.portfolioSummary : undefined,
    },
  });

  return {
    ...profile,
    industries: parseJson(profile.industries),
    investmentTypes: parseJson(profile.investmentTypes),
  };
}

export async function getInvestmentProfile(prisma: PrismaClient, treeId: string) {
  const profile = await prisma.treeInvestmentProfile.findUnique({ where: { treeId } });
  if (!profile) return null;
  return {
    ...profile,
    industries: parseJson(profile.industries),
    investmentTypes: parseJson(profile.investmentTypes),
  };
}

export async function getInvestorProfiles(prisma: PrismaClient) {
  const profiles = await prisma.treeInvestmentProfile.findMany({
    where: { isInvestor: true },
    orderBy: { confidenceScore: 'desc' },
    include: {
      tree: {
        select: {
          id: true,
          name: true,
          icono: true,
          description: true,
        },
      },
    },
  });
  return profiles.map((p: any) => ({
    ...p,
    industries: parseJson(p.industries),
    investmentTypes: parseJson(p.investmentTypes),
  }));
}

export async function getSeekerProfiles(prisma: PrismaClient) {
  const profiles = await prisma.treeInvestmentProfile.findMany({
    where: { seekingInvestment: true },
    include: {
      tree: {
        select: {
          id: true,
          name: true,
          icono: true,
          description: true,
        },
      },
    },
  });
  return profiles.map((p: any) => ({
    ...p,
    industries: parseJson(p.industries),
    investmentTypes: parseJson(p.investmentTypes),
  }));
}
