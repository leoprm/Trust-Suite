import { prisma } from '../index';
import { logEvent, LogEventInput } from './eventLogService';

export type TreeEconomyMode = 'NO_ECONOMY' | 'LEGACY_FIAT' | 'BERRIES_LATENT' | 'BERRIES_ACTIVE' | 'TRUST_FULL';
export type FiatTransactionType =
  | 'INCOME' | 'EXPENSE' | 'INVESTMENT'
  | 'SALARY' | 'MATERIALS' | 'INFRASTRUCTURE'
  | 'TAX' | 'RESERVE' | 'MAINTENANCE'
  | 'TREE_FUND' | 'EXTERNAL_CONTRACT' | 'REFUND';
export type FiatVerificationStatus = 'DECLARED' | 'BACKED_BY_RECEIPT' | 'RECONCILED' | 'AUDITED' | 'API_VERIFIED' | 'REJECTED';

export type CreateFiatTransactionInput = {
  treeId: string;
  branchId?: string | null;
  taskId?: string | null;
  externalNeedId?: string | null;
  createdById?: string | null;
  templateId?: string | null;
  type: FiatTransactionType;
  amount: string | number;
  currency?: string;
  category?: string;
  description?: string | null;
  date?: string | Date | null;
  verificationStatus?: FiatVerificationStatus;
  receiptEvidenceId?: string | null;
  metadataJson?: unknown;
  isAutomatic?: boolean;
};

const TRANSACTION_TYPES = new Set([
  'INCOME', 'EXPENSE', 'INVESTMENT',
  'SALARY', 'MATERIALS', 'INFRASTRUCTURE',
  'TAX', 'RESERVE', 'MAINTENANCE',
  'TREE_FUND', 'EXTERNAL_CONTRACT', 'REFUND',
]);
const VERIFICATION_STATUSES = new Set(['DECLARED', 'BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED', 'REJECTED']);
const ECONOMY_MODES = new Set(['NO_ECONOMY', 'LEGACY_FIAT', 'BERRIES_LATENT', 'BERRIES_ACTIVE', 'TRUST_FULL']);
const FIAT_CATEGORIES = new Set(['WATER', 'ELECTRICITY', 'GAS', 'MORTGAGE', 'FUEL', 'SHOPPING', 'EQUIPMENT', 'MATERIAL', 'MONEY', 'OTHER']);
const REPUTATION_EFFECT_KEYS = /xp|level|vote|votes|authority|reputation|trace|expert|expertWeight|permission|governance|berries|bayas|fiatToBerries|conversion/i;

function walkKeys(value: unknown, keys: string[] = [], depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 5) return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, keys, depth + 1));
    return keys;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.push(key);
    walkKeys(nested, keys, depth + 1);
  }
  return keys;
}

export function assertFiatDoesNotAffectReputation(payload?: unknown) {
  const keys = walkKeys(payload);
  const blocked = keys.find((key) => REPUTATION_EFFECT_KEYS.test(key));
  if (blocked) {
    throw new Error(`Fiat ledger cannot modify reputation, authority, XP, levels, votes or Berries. Blocked field: ${blocked}`);
  }
}

export function validateFiatTransactionPurpose(input: CreateFiatTransactionInput) {
  if (!input.treeId) throw new Error('treeId is required');
  if (!TRANSACTION_TYPES.has(input.type)) throw new Error('Invalid fiat transaction type');
  if (input.verificationStatus && !VERIFICATION_STATUSES.has(input.verificationStatus)) {
    throw new Error('Invalid fiat verification status');
  }
  if (input.category && !FIAT_CATEGORIES.has(input.category)) throw new Error('Invalid fiat category');

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');

  const currency = (input.currency || 'CLP').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be an ISO-like 3-letter code');

  // Client payloads are checked by controllers before reaching this service.
  // Server-side ledger metadata may explicitly document that reputation effects are blocked.
  return { amount, currency };
}

export async function canManageFiatLedger(userId: string, treeId: string, role?: string | null): Promise<boolean> {
  if (role === 'ADMINISTRATOR') return true;
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      creatorId: true,
      members: { where: { userId }, select: { role: true }, take: 1 },
    },
  });
  if (!tree) return false;
  return tree.creatorId === userId || tree.members.some((member: any) => member.role === 'ADMIN');
}

export async function createFiatTransaction(input: CreateFiatTransactionInput, event?: Partial<LogEventInput>) {
  const { amount, currency } = validateFiatTransactionPurpose(input);
  if (input.branchId) {
    const branch = await (prisma as any).branch.findUnique({ where: { id: input.branchId }, select: { treeId: true } });
    if (!branch || branch.treeId !== input.treeId) {
      throw new Error('branchId must belong to the same Tree as the fiat ledger transaction');
    }
  }

  const transaction = await (prisma as any).fiatTransaction.create({
    data: {
      treeId: input.treeId,
      branchId: input.branchId || null,
      taskId: input.taskId || null,
      externalNeedId: input.externalNeedId || null,
      createdById: input.createdById || null,
      templateId: input.templateId || null,
      amount,
      currency,
      type: input.type,
      category: input.category || 'OTHER',
      description: input.description || null,
      verificationStatus: input.verificationStatus || 'DECLARED',
      receiptEvidenceId: input.receiptEvidenceId || null,
      metadataJson: input.metadataJson === undefined ? undefined : input.metadataJson,
      date: input.date ? new Date(input.date) : new Date(),
      isAutomatic: input.isAutomatic || false,
    },
  });

  void logEvent({
    treeId: input.treeId,
    actorId: input.createdById || event?.actorId || null,
    action: 'FIAT_TRANSACTION_CREATED',
    entityType: 'FiatTransaction',
    entityId: transaction.id,
    afterJson: safeFiatTransaction(transaction),
    metadataJson: {
      ...(event?.metadataJson as any || {}),
      ledgerRole: 'external',
      reputationEffect: 'blocked_by_design',
      berriesConversion: 'not_enabled',
    },
    ipAddress: event?.ipAddress ?? null,
    userAgent: event?.userAgent ?? null,
    source: event?.source || (input.isAutomatic ? 'AUTOMATION' : 'USER'),
    severity: event?.severity || 'INFO',
  });

  return transaction;
}

export function safeFiatTransaction(transaction: any) {
  return {
    id: transaction.id,
    treeId: transaction.treeId,
    branchId: transaction.branchId,
    taskId: transaction.taskId,
    externalNeedId: transaction.externalNeedId,
    createdById: transaction.createdById,
    amount: transaction.amount,
    currency: transaction.currency || 'CLP',
    type: transaction.type,
    category: transaction.category,
    description: transaction.description,
    verificationStatus: transaction.verificationStatus || 'DECLARED',
    receiptEvidenceId: transaction.receiptEvidenceId,
    date: transaction.date,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    isAutomatic: transaction.isAutomatic,
    metadataJson: transaction.metadataJson,
  };
}

export async function getFiatLedger(treeId: string) {
  const transactions = await (prisma as any).fiatTransaction.findMany({
    where: { treeId },
    include: { template: true },
    orderBy: { date: 'asc' },
  });
  return transactions.map(safeFiatTransaction);
}

export async function getFiatLedgerSummary(treeId: string) {
  const [aggregate, byCategory, byVerification, tree] = await Promise.all([
    (prisma as any).fiatTransaction.groupBy({
      by: ['type'],
      where: { treeId },
      _sum: { amount: true },
    }),
    (prisma as any).fiatTransaction.groupBy({
      by: ['category'],
      where: { treeId },
      _sum: { amount: true },
    }),
    (prisma as any).fiatTransaction.groupBy({
      by: ['verificationStatus'],
      where: { treeId },
      _count: { id: true },
    }),
    (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { economyMode: true },
    }),
  ]);

  const income = Number((aggregate as any[]).find((a) => a.type === 'INCOME')?._sum?.amount || 0);
  const expenses = Number((aggregate as any[]).find((a) => a.type === 'EXPENSE')?._sum?.amount || 0);
  const investment = Number((aggregate as any[]).find((a) => a.type === 'INVESTMENT')?._sum?.amount || 0);

  return {
    fiatLedger: {
      currency: 'CLP',
      economyMode: tree?.economyMode || 'NO_ECONOMY',
      income,
      expenses,
      investment,
      net: income - expenses - investment,
      byCategory,
      byVerificationStatus: byVerification,
      note: 'Fiat is an external ledger. It does not grant XP, levels, votes, authority or Trace reputation.',
    },
    berries: {
      enabled: tree?.economyMode === 'BERRIES_ACTIVE' || tree?.economyMode === 'TRUST_FULL',
      note: 'Berries are internal circulation, not equivalent to fiat.',
    },
  };
}

export async function updateTreeEconomyMode(treeId: string, mode: string, actorId: string, event?: Partial<LogEventInput>) {
  if (!ECONOMY_MODES.has(mode)) throw new Error('Invalid economy mode');
  const before = await (prisma as any).tree.findUnique({ where: { id: treeId }, select: { economyMode: true } });
  const tree = await (prisma as any).tree.update({
    where: { id: treeId },
    data: { economyMode: mode },
    select: { id: true, economyMode: true },
  });

  void logEvent({
    treeId,
    actorId,
    action: 'TREE_ECONOMY_MODE_UPDATED',
    entityType: 'Tree',
    entityId: treeId,
    beforeJson: before,
    afterJson: tree,
    metadataJson: event?.metadataJson,
    ipAddress: event?.ipAddress ?? null,
    userAgent: event?.userAgent ?? null,
    source: 'ADMIN',
  });

  return tree;
}

export function assertNoFiatToBerriesConversion(payload?: unknown) {
  const keys = walkKeys(payload);
  const requested = keys.some((key) => /fiatToBerries|convert.*berries|berries.*convert|bayas/i.test(key));
  if (requested) {
    throw new Error('La conversion directa fiat -> Berries no esta habilitada. Fiat es ledger externo.');
  }
}
