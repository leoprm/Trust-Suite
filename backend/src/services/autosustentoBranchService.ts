import { prisma } from '../index';
import { getTreeAccess, parseCurrency } from './externalNeedService';

export type AutosustentoStatus =
  | 'PROPOSED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'REJECTED'
  | 'CLOSED';

const AUTOSUSTENTO_STATUSES = new Set(['PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'REJECTED', 'CLOSED']);
const TERMINAL_STATUSES = new Set(['REJECTED', 'CLOSED']);

const SPLIT_FIELDS = [
  'materialsPct',
  'laborPct',
  'operationsPct',
  'taxPct',
  'reservePct',
  'maintenancePct',
  'treeFundPct',
  'otherPct',
];

function optionalTrim(value: unknown, maxLength?: number) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (maxLength && text.length > maxLength) throw new Error(`Field must be at most ${maxLength} characters`);
  return text;
}

function optionalMoney(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number`);
  return parsed;
}

function optionalPositiveInteger(value: unknown, field: string, fallback?: number | null) {
  if (value === undefined || value === null || value === '') return fallback ?? null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
  return parsed;
}

function nextReviewDate(days: number | null) {
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function canManageAutosustento(userId: string, treeId: string, role?: string | null) {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isAdmin;
}

export async function canProposeAutosustento(userId: string, treeId: string, role?: string | null) {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isMember;
}

export function assertNoAutosustentoAuthorityEffects(payload?: unknown) {
  const keys: string[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      walk(nested, depth + 1);
    }
  };
  walk(payload);
  const blocked = keys.find((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
      'xp',
      'level',
      'reputation',
      'authority',
      'vote',
      'votes',
      'voteweight',
      'governance',
      'weeklyneedpoints',
      'needpoints',
      'bayasbalance',
      'berriesbalance',
      'fiattoberries',
      'conversion',
      'permission',
    ].includes(normalized)
      || /^grant.*xp$|^set.*level$|^level.*update$|^vote.*weight$|^convert.*berries$|^berries.*transfer$/i.test(key);
  });
  if (blocked) {
    throw new Error(`Autosustento fiat cannot modify XP, level, votes, authority, Berries or reputation. Blocked field: ${blocked}`);
  }
}

export function normalizeAutosustentoConfigInput(body: any, existing?: any) {
  const source = { ...(existing || {}), ...(body || {}) };
  const name = String(source.name ?? source.businessName ?? '').trim();
  const productOrService = String(source.productOrService || '').trim();
  if (!productOrService) throw new Error('productOrService is required');
  if (name && name.length > 120) throw new Error('name must be at most 120 characters');
  if (productOrService.length > 160) throw new Error('productOrService must be at most 160 characters');

  const reviewPeriodDays = optionalPositiveInteger(source.reviewPeriodDays, 'reviewPeriodDays', existing?.reviewPeriodDays ?? 90);

  return {
    branchName: name,
    businessName: optionalTrim(source.businessName ?? name, 120),
    productOrService,
    targetClient: optionalTrim(source.targetClient),
    valueProposition: optionalTrim(source.valueProposition),
    viabilitySummary: optionalTrim(source.viabilitySummary ?? source.description),
    requiredResources: optionalTrim(source.requiredResources),
    legalRisks: optionalTrim(source.legalRisks),
    operationalRisks: optionalTrim(source.operationalRisks),
    startupCostFiat: optionalMoney(source.startupCostFiat, 'startupCostFiat'),
    expectedMonthlyIncomeFiat: optionalMoney(source.expectedMonthlyIncomeFiat, 'expectedMonthlyIncomeFiat'),
    expectedMonthlyCostFiat: optionalMoney(source.expectedMonthlyCostFiat, 'expectedMonthlyCostFiat'),
    currency: parseCurrency(source.currency),
    reviewPeriodDays,
    nextReviewAt: source.nextReviewAt ? new Date(source.nextReviewAt) : (existing?.nextReviewAt ?? nextReviewDate(reviewPeriodDays)),
    closureCriteria: optionalTrim(source.closureCriteria),
  };
}

export function normalizeSplitInput(body: any): any {
  const data: Record<string, number> = {};
  for (const field of SPLIT_FIELDS) {
    const value = body?.[field] === undefined || body?.[field] === null || body?.[field] === '' ? 0 : Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${field} must be between 0 and 100`);
    data[field] = value;
  }
  const total = SPLIT_FIELDS.reduce((sum, field) => sum + data[field], 0);
  if (Math.abs(total - 100) > 0.0001) {
    throw new Error(`Sustainability split must sum 100. Current total: ${total}`);
  }
  return {
    ...data,
    notes: optionalTrim(body?.notes),
    totalPct: total,
  };
}

export function safeSustainabilitySplit(split: any) {
  if (!split) return null;
  return {
    id: split.id,
    configId: split.configId,
    materialsPct: split.materialsPct,
    laborPct: split.laborPct,
    operationsPct: split.operationsPct,
    taxPct: split.taxPct,
    reservePct: split.reservePct,
    maintenancePct: split.maintenancePct,
    treeFundPct: split.treeFundPct,
    otherPct: split.otherPct,
    totalPct: SPLIT_FIELDS.reduce((sum, field) => sum + Number(split[field] || 0), 0),
    notes: split.notes,
    createdAt: split.createdAt,
    updatedAt: split.updatedAt,
  };
}

export function safeAutosustentoConfig(config: any) {
  return {
    id: config.id,
    branchId: config.branchId,
    treeId: config.treeId,
    branch: config.branch ? {
      id: config.branch.id,
      name: config.branch.name,
      type: config.branch.type,
      phase: config.branch.phase,
      createdAt: config.branch.createdAt,
    } : undefined,
    businessName: config.businessName,
    productOrService: config.productOrService,
    targetClient: config.targetClient,
    valueProposition: config.valueProposition,
    status: config.status,
    viabilitySummary: config.viabilitySummary,
    requiredResources: config.requiredResources,
    legalRisks: config.legalRisks,
    operationalRisks: config.operationalRisks,
    startupCostFiat: config.startupCostFiat,
    expectedMonthlyIncomeFiat: config.expectedMonthlyIncomeFiat,
    expectedMonthlyCostFiat: config.expectedMonthlyCostFiat,
    expectedMonthlyNetFiat: Number(config.expectedMonthlyIncomeFiat || 0) - Number(config.expectedMonthlyCostFiat || 0),
    currency: config.currency || 'CLP',
    reviewPeriodDays: config.reviewPeriodDays,
    nextReviewAt: config.nextReviewAt,
    closureCriteria: config.closureCriteria,
    createdById: config.createdById,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    split: safeSustainabilitySplit(config.split),
  };
}

export async function getAutosustentoByBranchId(branchId: string) {
  return (prisma as any).autosustentoBranchConfig.findUnique({
    where: { branchId },
    include: { branch: true, split: true },
  });
}

export async function createAutosustentoBranch(treeId: string, actorId: string, body: any) {
  assertNoAutosustentoAuthorityEffects(body);
  const data = normalizeAutosustentoConfigInput(body);
  if (!data.branchName) throw new Error('name is required');
  const split = body.split ? normalizeSplitInput(body.split) : null;

  const result = await (prisma as any).$transaction(async (tx: any) => {
    const branch = await tx.branch.create({
      data: {
        treeId,
        name: data.branchName,
        type: 'AUTOSUSTENTO',
        isHashtag: false,
        phase: 'PRODUCTION',
        activePhasesJson: '["PRODUCTION","DISTRIBUTION","MAINTENANCE"]',
        esVotable: false,
      },
    });
    await tx.branchMember.create({
      data: {
        branchId: branch.id,
        userId: actorId,
        joinedPhases: '["PRODUCTION","DISTRIBUTION","MAINTENANCE"]',
      },
    });

    const config = await tx.autosustentoBranchConfig.create({
      data: {
        branchId: branch.id,
        treeId,
        createdById: actorId,
        businessName: data.businessName,
        productOrService: data.productOrService,
        targetClient: data.targetClient,
        valueProposition: data.valueProposition,
        viabilitySummary: data.viabilitySummary,
        requiredResources: data.requiredResources,
        legalRisks: data.legalRisks,
        operationalRisks: data.operationalRisks,
        startupCostFiat: data.startupCostFiat,
        expectedMonthlyIncomeFiat: data.expectedMonthlyIncomeFiat,
        expectedMonthlyCostFiat: data.expectedMonthlyCostFiat,
        currency: data.currency,
        reviewPeriodDays: data.reviewPeriodDays,
        nextReviewAt: data.nextReviewAt,
        closureCriteria: data.closureCriteria,
        metadataJson: {
          branchKind: 'autosustento',
          fiatRole: 'external_ledger_only',
          noAuthorityEffect: true,
          noXpFromFiat: true,
        },
        split: split ? {
          create: {
            materialsPct: split.materialsPct,
            laborPct: split.laborPct,
            operationsPct: split.operationsPct,
            taxPct: split.taxPct,
            reservePct: split.reservePct,
            maintenancePct: split.maintenancePct,
            treeFundPct: split.treeFundPct,
            otherPct: split.otherPct,
            notes: split.notes,
          },
        } : undefined,
      },
      include: { branch: true, split: true },
    });
    return config;
  });

  return result;
}

export async function updateAutosustentoConfig(branchId: string, body: any) {
  assertNoAutosustentoAuthorityEffects(body);
  const existing = await getAutosustentoByBranchId(branchId);
  if (!existing) throw new Error('Autosustento branch not found');
  if (TERMINAL_STATUSES.has(existing.status)) throw new Error(`Cannot update Autosustento branch in ${existing.status}`);
  const data = normalizeAutosustentoConfigInput(body, existing);
  const config = await (prisma as any).autosustentoBranchConfig.update({
    where: { branchId },
    data: {
      businessName: data.businessName,
      productOrService: data.productOrService,
      targetClient: data.targetClient,
      valueProposition: data.valueProposition,
      viabilitySummary: data.viabilitySummary,
      requiredResources: data.requiredResources,
      legalRisks: data.legalRisks,
      operationalRisks: data.operationalRisks,
      startupCostFiat: data.startupCostFiat,
      expectedMonthlyIncomeFiat: data.expectedMonthlyIncomeFiat,
      expectedMonthlyCostFiat: data.expectedMonthlyCostFiat,
      currency: data.currency,
      reviewPeriodDays: data.reviewPeriodDays,
      nextReviewAt: data.nextReviewAt,
      closureCriteria: data.closureCriteria,
    },
    include: { branch: true, split: true },
  });
  if (data.branchName && data.branchName !== existing.branch?.name) {
    await (prisma as any).branch.update({ where: { id: branchId }, data: { name: data.branchName } });
    config.branch.name = data.branchName;
  }
  return config;
}

export async function upsertSustainabilitySplit(branchId: string, body: any) {
  const config = await getAutosustentoByBranchId(branchId);
  if (!config) throw new Error('Autosustento branch not found');
  if (TERMINAL_STATUSES.has(config.status)) throw new Error(`Cannot update split in ${config.status}`);
  const split = normalizeSplitInput(body);
  return (prisma as any).sustainabilitySplit.upsert({
    where: { configId: config.id },
    update: {
      materialsPct: split.materialsPct,
      laborPct: split.laborPct,
      operationsPct: split.operationsPct,
      taxPct: split.taxPct,
      reservePct: split.reservePct,
      maintenancePct: split.maintenancePct,
      treeFundPct: split.treeFundPct,
      otherPct: split.otherPct,
      notes: split.notes,
    },
    create: {
      configId: config.id,
      materialsPct: split.materialsPct,
      laborPct: split.laborPct,
      operationsPct: split.operationsPct,
      taxPct: split.taxPct,
      reservePct: split.reservePct,
      maintenancePct: split.maintenancePct,
      treeFundPct: split.treeFundPct,
      otherPct: split.otherPct,
      notes: split.notes,
    },
  });
}

export async function changeAutosustentoStatus(branchId: string, status: AutosustentoStatus, closureNote?: string | null) {
  if (!AUTOSUSTENTO_STATUSES.has(status)) throw new Error('Invalid Autosustento status');
  const existing = await getAutosustentoByBranchId(branchId);
  if (!existing) throw new Error('Autosustento branch not found');
  if (existing.status === status) return existing;
  if (TERMINAL_STATUSES.has(existing.status)) throw new Error(`Cannot transition from ${existing.status}`);
  if (status === 'ACTIVE') {
    if (!existing.productOrService || !existing.split) throw new Error('Cannot activate without minimum config and valid sustainability split');
  }
  if (status === 'CLOSED' && !closureNote && !existing.closureCriteria) {
    throw new Error('closureCriteria or closure note is required to close an Autosustento branch');
  }
  const data: any = { status };
  if (status === 'ACTIVE' || status === 'APPROVED') {
    data.nextReviewAt = nextReviewDate(existing.reviewPeriodDays || 90);
  }
  if (status === 'CLOSED' && closureNote) {
    data.closureCriteria = closureNote;
  }
  return (prisma as any).autosustentoBranchConfig.update({
    where: { branchId },
    data,
    include: { branch: true, split: true },
  });
}

export async function getAutosustentoFinancialSummary(branchId: string) {
  const config = await getAutosustentoByBranchId(branchId);
  if (!config) return null;
  const [aggregate, count, recentTransactions] = await Promise.all([
    (prisma as any).fiatTransaction.groupBy({
      by: ['type'],
      where: { branchId },
      _sum: { amount: true },
    }),
    (prisma as any).fiatTransaction.count({ where: { branchId } }),
    (prisma as any).fiatTransaction.findMany({
      where: { branchId },
      orderBy: { date: 'desc' },
      take: 8,
    }),
  ]);
  const incomeFiat = Number((aggregate as any[]).find((a) => a.type === 'INCOME')?._sum?.amount || 0);
  const expensesFiat = Number((aggregate as any[]).find((a) => a.type === 'EXPENSE')?._sum?.amount || 0);
  const investmentFiat = Number((aggregate as any[]).find((a) => a.type === 'INVESTMENT')?._sum?.amount || 0);
  return {
    branchId,
    treeId: config.treeId,
    currency: config.currency || 'CLP',
    incomeFiat,
    expensesFiat,
    investmentFiat,
    netFiat: incomeFiat - expensesFiat - investmentFiat,
    transactionsCount: count,
    split: safeSustainabilitySplit(config.split),
    recentTransactions: recentTransactions.map((transaction: any) => ({
      id: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      type: transaction.type,
      category: transaction.category,
      description: transaction.description,
      verificationStatus: transaction.verificationStatus,
      date: transaction.date,
    })),
    note: 'Fiat records are external ledger entries. They do not grant XP, levels, votes, authority or Trace reputation.',
  };
}
