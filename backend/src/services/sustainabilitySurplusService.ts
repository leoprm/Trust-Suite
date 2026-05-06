import { prisma } from '../index';
import { getTreeAccess } from './externalNeedService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CycleStatus = 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'APPROVED' | 'LOCKED';
export type AllocationType = 'RESERVE' | 'MAINTENANCE' | 'TREE_FUND' | 'REINVESTMENT' | 'OTHER';

const CYCLE_STATUSES = new Set<CycleStatus>([
  'DRAFT', 'CALCULATED', 'REVIEWED', 'APPROVED', 'LOCKED',
]);

// Allowed forward transitions
const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  DRAFT: ['CALCULATED'],
  CALCULATED: ['REVIEWED', 'APPROVED'],
  REVIEWED: ['APPROVED'],
  APPROVED: ['LOCKED'],
  LOCKED: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Category → Sustainability bucket mapping
// Maps TransactionCategory enum values to financial buckets.
// LABOR/SALARY don't exist as TransactionCategory; MONEY is the closest proxy.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_TO_BUCKET: Record<string, keyof BucketAccumulator> = {
  MATERIAL:     'materialsFiat',
  EQUIPMENT:    'materialsFiat',
  WATER:        'operationsFiat',
  ELECTRICITY:  'operationsFiat',
  GAS:          'operationsFiat',
  FUEL:         'operationsFiat',
  MORTGAGE:     'maintenanceFiat',
  SHOPPING:     'otherFiat',
  MONEY:        'laborFiat',   // closest approximation for salary/labor payments
  OTHER:        'otherFiat',
};

interface BucketAccumulator {
  materialsFiat: number;
  laborFiat: number;
  operationsFiat: number;
  taxFiat: number;
  reserveFiat: number;
  maintenanceFiat: number;
  reinvestmentFiat: number;
  otherFiat: number;
}

function emptyBuckets(): BucketAccumulator {
  return {
    materialsFiat: 0,
    laborFiat: 0,
    operationsFiat: 0,
    taxFiat: 0,
    reserveFiat: 0,
    maintenanceFiat: 0,
    reinvestmentFiat: 0,
    otherFiat: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

export async function canViewCycles(userId: string, treeId: string, role?: string | null) {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isMember;
}

export async function canManageCycles(userId: string, treeId: string, role?: string | null) {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard: no authority effects
// ─────────────────────────────────────────────────────────────────────────────

export function assertNoCycleAuthorityEffects(payload?: unknown): void {
  const keys: string[] = [];
  const walk = (val: unknown, depth = 0) => {
    if (!val || typeof val !== 'object' || depth > 4) return;
    if (Array.isArray(val)) return void val.forEach((v) => walk(v, depth + 1));
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      keys.push(k);
      walk(v, depth + 1);
    }
  };
  walk(payload);
  const blocked = keys.find((k) => {
    const n = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ['xp', 'level', 'reputation', 'authority', 'vote', 'votes', 'voteweight',
      'weeklyneedpoints', 'needpoints', 'bayasbalance', 'berriesbalance', 'permission'].includes(n);
  });
  if (blocked) {
    throw new Error(
      `Sustainability Cycles cannot modify XP, levels, votes, Need Points, authority, Berries or reputation. Blocked field: ${blocked}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadBranchConfig(branchId: string) {
  const branch = await (prisma as any).branch.findUnique({
    where: { id: branchId },
    include: { autosustentoConfig: { include: { split: true } } },
  });
  if (!branch) throw new Error('Branch not found');
  if (branch.type !== 'AUTOSUSTENTO') throw new Error('Sustainability cycles are only available for AUTOSUSTENTO branches');
  return branch;
}

async function loadCycle(cycleId: string) {
  const cycle = await (prisma as any).sustainabilityCycle.findUnique({
    where: { id: cycleId },
    include: { allocations: true },
  });
  if (!cycle) throw new Error('Sustainability cycle not found');
  return cycle;
}

function safeCycle(cycle: any) {
  const net = Number(cycle.netFiat ?? 0);
  const income = Number(cycle.totalIncomeFiat ?? 0);
  return {
    id: cycle.id,
    treeId: cycle.treeId,
    branchId: cycle.branchId,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    currency: cycle.currency,
    totalIncomeFiat: Number(cycle.totalIncomeFiat ?? 0),
    totalExpenseFiat: Number(cycle.totalExpenseFiat ?? 0),
    totalInvestmentFiat: Number(cycle.totalInvestmentFiat ?? 0),
    netFiat: net,
    surplusFiat: Number(cycle.surplusFiat ?? 0),
    deficitFiat: Number(cycle.deficitFiat ?? 0),
    marginPct: income > 0 ? Math.round((net / income) * 10000) / 100 : 0,
    materialsFiat: Number(cycle.materialsFiat ?? 0),
    laborFiat: Number(cycle.laborFiat ?? 0),
    operationsFiat: Number(cycle.operationsFiat ?? 0),
    taxFiat: Number(cycle.taxFiat ?? 0),
    reserveFiat: Number(cycle.reserveFiat ?? 0),
    maintenanceFiat: Number(cycle.maintenanceFiat ?? 0),
    reinvestmentFiat: Number(cycle.reinvestmentFiat ?? 0),
    otherFiat: Number(cycle.otherFiat ?? 0),
    treeFundFiat: Number(cycle.treeFundFiat ?? 0),
    transactionsCount: cycle.transactionsCount,
    verifiedAmountFiat: Number(cycle.verifiedAmountFiat ?? 0),
    includeOnlyVerified: cycle.includeOnlyVerified,
    multiCurrencyWarning: cycle.multiCurrencyWarning,
    status: cycle.status,
    calculatedAt: cycle.calculatedAt,
    approvedAt: cycle.approvedAt,
    approvedById: cycle.approvedById,
    lockedAt: cycle.lockedAt,
    lockedById: cycle.lockedById,
    notes: cycle.notes,
    allocations: (cycle.allocations ?? []).map((a: any) => ({
      id: a.id,
      type: a.type,
      amountFiat: Number(a.amountFiat),
      currency: a.currency,
      notes: a.notes,
      createdAt: a.createdAt,
    })),
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
    note: 'This surplus is a sustainability indicator. It does not grant XP, levels, votes, authority or Berries.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick summary (no persistence) — reuses existing financial summary pattern
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuickSummary(
  branchId: string,
  from?: string,
  to?: string,
) {
  const branch = await loadBranchConfig(branchId);
  const where: any = { branchId };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const [transactions, allCount] = await Promise.all([
    (prisma as any).fiatTransaction.findMany({ where, select: { amount: true, type: true, category: true, currency: true, verificationStatus: true } }),
    (prisma as any).fiatTransaction.count({ where: { branchId } }),
  ]);

  // Detect multi-currency
  const currencies = [...new Set(transactions.map((t: any) => t.currency))];
  const multiCurrencyWarning = currencies.length > 1;
  const currency = branch.autosustentoConfig?.currency ?? currencies[0] ?? 'CLP';

  let totalIncome = 0, totalExpense = 0, totalInvestment = 0, verifiedAmount = 0;
  const buckets = emptyBuckets();

  for (const tx of transactions) {
    const amount = Number(tx.amount ?? 0);
    if (tx.type === 'INCOME' || tx.type === 'EXTERNAL_CONTRACT' || tx.type === 'REFUND') {
      totalIncome += amount;
    } else if (tx.type === 'INVESTMENT') {
      totalInvestment += amount;
      buckets.reinvestmentFiat += amount;
    } else if (tx.type === 'SALARY') {
      totalExpense += amount;
      buckets.laborFiat += amount;
    } else if (tx.type === 'MATERIALS') {
      totalExpense += amount;
      buckets.materialsFiat += amount;
    } else if (tx.type === 'INFRASTRUCTURE') {
      totalExpense += amount;
      buckets.operationsFiat += amount;
    } else if (tx.type === 'TAX') {
      totalExpense += amount;
      buckets.taxFiat += amount;
    } else if (tx.type === 'RESERVE') {
      totalExpense += amount;
      buckets.reserveFiat += amount;
    } else if (tx.type === 'MAINTENANCE') {
      totalExpense += amount;
      buckets.maintenanceFiat += amount;
    } else if (tx.type === 'TREE_FUND') {
      totalExpense += amount;
      buckets.otherFiat += amount;
    } else if (tx.type === 'EXPENSE') {
      totalExpense += amount;
      const bucket = CATEGORY_TO_BUCKET[tx.category ?? 'OTHER'] ?? 'otherFiat';
      (buckets as any)[bucket] += amount;
    }
    if (['BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED'].includes(tx.verificationStatus ?? '')) {
      verifiedAmount += amount;
    }
  }

  const net = totalIncome - totalExpense - totalInvestment;
  const surplus = Math.max(net, 0);
  const deficit = Math.max(-net, 0);
  const split = branch.autosustentoConfig?.split ?? null;

  // Compute tree fund suggestion from split
  const treeFundFiat = split?.treeFundPct > 0 && surplus > 0
    ? Math.round(surplus * (split.treeFundPct / 100) * 100) / 100
    : 0;

  return {
    branchId,
    treeId: branch.treeId,
    from: from ?? null,
    to: to ?? null,
    currency,
    multiCurrencyWarning,
    totalIncomeFiat: totalIncome,
    totalExpenseFiat: totalExpense,
    totalInvestmentFiat: totalInvestment,
    netFiat: net,
    surplusFiat: surplus,
    deficitFiat: deficit,
    marginPct: totalIncome > 0 ? Math.round((net / totalIncome) * 10000) / 100 : 0,
    ...buckets,
    treeFundFiat,
    transactionsCount: transactions.length,
    allTimeTransactionsCount: allCount,
    verifiedAmountFiat: verifiedAmount,
    splitObjective: split
      ? {
          materialsPct: split.materialsPct,
          laborPct: split.laborPct,
          operationsPct: split.operationsPct,
          taxPct: split.taxPct,
          reservePct: split.reservePct,
          maintenancePct: split.maintenancePct,
          treeFundPct: split.treeFundPct,
          otherPct: split.otherPct,
        }
      : null,
    note: 'Sustainability surplus is not private profit, XP, authority or Berries. It reflects the branch\'s capacity to sustain, protect and expand the Tree.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculate & persist a cycle
// ─────────────────────────────────────────────────────────────────────────────

export async function calculateCycle(
  branchId: string,
  actorId: string,
  periodStart: string,
  periodEnd: string,
  includeOnlyVerified = false,
) {
  const branch = await loadBranchConfig(branchId);

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid periodStart or periodEnd dates');
  if (start >= end) throw new Error('periodStart must be before periodEnd');

  // Reject unreasonably large periods (> 5 years) to protect performance
  const diffMs = end.getTime() - start.getTime();
  if (diffMs > 5 * 365 * 24 * 60 * 60 * 1000) throw new Error('Period exceeds 5 years — please split into smaller cycles');

  const verifiedStatuses = ['BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED'];
  const where: any = { branchId, date: { gte: start, lte: end } };
  if (includeOnlyVerified) where.verificationStatus = { in: verifiedStatuses };

  const transactions = await (prisma as any).fiatTransaction.findMany({
    where,
    select: { amount: true, type: true, category: true, currency: true, verificationStatus: true },
  });

  // Multi-currency detection
  const currencies = [...new Set(transactions.map((t: any) => t.currency))];
  const multiCurrencyWarning = currencies.length > 1;
  const currency = branch.autosustentoConfig?.currency ?? currencies[0] ?? 'CLP';

  let totalIncome = 0, totalExpense = 0, totalInvestment = 0, verifiedAmount = 0;
  const buckets = emptyBuckets();

  for (const tx of transactions) {
    const amount = Number(tx.amount ?? 0);
    if (tx.type === 'INCOME' || tx.type === 'EXTERNAL_CONTRACT' || tx.type === 'REFUND') {
      totalIncome += amount;
    } else if (tx.type === 'INVESTMENT') {
      totalInvestment += amount;
      buckets.reinvestmentFiat += amount;
    } else if (tx.type === 'SALARY') {
      totalExpense += amount;
      buckets.laborFiat += amount;
    } else if (tx.type === 'MATERIALS') {
      totalExpense += amount;
      buckets.materialsFiat += amount;
    } else if (tx.type === 'INFRASTRUCTURE') {
      totalExpense += amount;
      buckets.operationsFiat += amount;
    } else if (tx.type === 'TAX') {
      totalExpense += amount;
      buckets.taxFiat += amount;
    } else if (tx.type === 'RESERVE') {
      totalExpense += amount;
      buckets.reserveFiat += amount;
    } else if (tx.type === 'MAINTENANCE') {
      totalExpense += amount;
      buckets.maintenanceFiat += amount;
    } else if (tx.type === 'TREE_FUND') {
      totalExpense += amount;
      buckets.otherFiat += amount;
    } else if (tx.type === 'EXPENSE') {
      totalExpense += amount;
      const bucket = CATEGORY_TO_BUCKET[tx.category ?? 'OTHER'] ?? 'otherFiat';
      (buckets as any)[bucket] += amount;
    }
    if (verifiedStatuses.includes(tx.verificationStatus ?? '')) verifiedAmount += amount;
  }

  const net = totalIncome - totalExpense - totalInvestment;
  const surplus = Math.max(net, 0);
  const deficit = Math.max(-net, 0);
  const split = branch.autosustentoConfig?.split;
  const treeFundFiat = split?.treeFundPct > 0 && surplus > 0
    ? Math.round(surplus * (split.treeFundPct / 100) * 100) / 100
    : 0;
  const marginPct = totalIncome > 0 ? Math.round((net / totalIncome) * 10000) / 100 : 0;

  // Check if a non-locked cycle exists for the same period (allow recalculate)
  const existing = await (prisma as any).sustainabilityCycle.findFirst({
    where: { branchId, periodStart: start, periodEnd: end },
  });

  if (existing?.status === 'LOCKED') {
    throw new Error('Cannot recalculate a LOCKED cycle. It is a permanent historical snapshot.');
  }

  const cycleData = {
    treeId: branch.treeId,
    branchId,
    periodStart: start,
    periodEnd: end,
    currency,
    totalIncomeFiat: totalIncome,
    totalExpenseFiat: totalExpense,
    totalInvestmentFiat: totalInvestment,
    netFiat: net,
    surplusFiat: surplus,
    deficitFiat: deficit,
    marginPct,
    ...buckets,
    treeFundFiat,
    transactionsCount: transactions.length,
    verifiedAmountFiat: verifiedAmount,
    includeOnlyVerified,
    multiCurrencyWarning,
    status: 'CALCULATED' as CycleStatus,
    calculatedAt: new Date(),
    metadataJson: {
      calculatedBy: actorId,
      noXpFromFiat: true,
      noAuthorityEffect: true,
      surplusIsNotPrivateProfit: true,
    },
  };

  let cycle: any;
  if (existing) {
    cycle = await (prisma as any).sustainabilityCycle.update({
      where: { id: existing.id },
      data: cycleData,
      include: { allocations: true },
    });
  } else {
    cycle = await (prisma as any).sustainabilityCycle.create({
      data: cycleData,
      include: { allocations: true },
    });
  }

  return { cycle: safeCycle(cycle), recalculated: Boolean(existing) };
}

// ─────────────────────────────────────────────────────────────────────────────
// List cycles for a branch
// ─────────────────────────────────────────────────────────────────────────────

export async function listCycles(branchId: string) {
  await loadBranchConfig(branchId); // validates AUTOSUSTENTO type
  const cycles = await (prisma as any).sustainabilityCycle.findMany({
    where: { branchId },
    include: { allocations: true },
    orderBy: [{ periodStart: 'desc' }],
  });
  return cycles.map(safeCycle);
}

// ─────────────────────────────────────────────────────────────────────────────
// Get single cycle
// ─────────────────────────────────────────────────────────────────────────────

export async function getCycle(cycleId: string) {
  const cycle = await loadCycle(cycleId);
  return safeCycle(cycle);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update notes (any non-locked status)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCycleNotes(cycleId: string, notes: string) {
  const cycle = await loadCycle(cycleId);
  if (cycle.status === 'LOCKED') throw new Error('Cannot update a LOCKED cycle');
  const updated = await (prisma as any).sustainabilityCycle.update({
    where: { id: cycleId },
    data: { notes: String(notes).substring(0, 2000) },
    include: { allocations: true },
  });
  return safeCycle(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Approve cycle
// ─────────────────────────────────────────────────────────────────────────────

export async function approveCycle(cycleId: string, actorId: string) {
  const cycle = await loadCycle(cycleId);
  const allowed = CYCLE_TRANSITIONS[cycle.status as CycleStatus] ?? [];
  if (!allowed.includes('APPROVED')) {
    throw new Error(`Cannot approve a cycle in status ${cycle.status}`);
  }
  if (cycle.transactionsCount === 0) {
    throw new Error('Warning: Cycle has zero transactions. Cannot approve an empty cycle without data.');
  }
  const updated = await (prisma as any).sustainabilityCycle.update({
    where: { id: cycleId },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: actorId },
    include: { allocations: true },
  });
  return safeCycle(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock cycle
// ─────────────────────────────────────────────────────────────────────────────

export async function lockCycle(cycleId: string, actorId: string) {
  const cycle = await loadCycle(cycleId);
  if (cycle.status !== 'APPROVED') {
    throw new Error('Only APPROVED cycles can be locked. Approve it first.');
  }
  const updated = await (prisma as any).sustainabilityCycle.update({
    where: { id: cycleId },
    data: { status: 'LOCKED', lockedAt: new Date(), lockedById: actorId },
    include: { allocations: true },
  });
  return safeCycle(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete cycle (DRAFT or CALCULATED only)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteCycle(cycleId: string) {
  const cycle = await loadCycle(cycleId);
  if (!['DRAFT', 'CALCULATED'].includes(cycle.status)) {
    throw new Error(`Cannot delete a cycle in status ${cycle.status}. Only DRAFT or CALCULATED cycles can be deleted.`);
  }
  await (prisma as any).sustainabilityCycle.delete({ where: { id: cycleId } });
  return { deleted: true, id: cycleId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage allocations (assign surplus portions contably)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOCATION_TYPES = new Set(['RESERVE', 'MAINTENANCE', 'TREE_FUND', 'REINVESTMENT', 'OTHER']);

export async function upsertAllocation(
  cycleId: string,
  type: unknown,
  amountFiat: unknown,
  currency: unknown,
  notes: unknown,
) {
  if (!ALLOCATION_TYPES.has(type as string)) {
    throw new Error(`Invalid allocation type. Must be one of: ${[...ALLOCATION_TYPES].join(', ')}`);
  }
  const cycle = await loadCycle(cycleId);
  if (cycle.status === 'LOCKED') throw new Error('Cannot modify allocations on a LOCKED cycle');

  const amount = Number(amountFiat);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('amountFiat must be a non-negative number');
  if (amount > Number(cycle.surplusFiat ?? 0) + 0.01) {
    throw new Error(`Allocation amount (${amount}) exceeds available surplus (${cycle.surplusFiat})`);
  }

  const existing = await (prisma as any).sustainabilityAllocation.findFirst({
    where: { cycleId, type },
  });

  if (existing) {
    return (prisma as any).sustainabilityAllocation.update({
      where: { id: existing.id },
      data: { amountFiat: amount, currency: currency ?? 'CLP', notes: notes ?? null },
    });
  }
  return (prisma as any).sustainabilityAllocation.create({
    data: { cycleId, type, amountFiat: amount, currency: currency ?? 'CLP', notes: notes ?? null },
  });
}
