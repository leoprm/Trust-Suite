import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { prisma } from '../index';
import { Request } from 'express';
import { logEvent, getRequestContext, getRequestMetadata } from './eventLogService';
import {
  assertFiatDoesNotAffectReputation,
  canManageFiatLedger,
} from './fiatLedgerService';
import {
  buildEvidenceStoragePath,
  calculateSha256,
  canAccessEvidenceFile,
  ensureUploadRoot,
  resolveStoragePath,
  sanitizeOriginalName,
  toSafeEvidenceMetadata,
  validateUploadFile,
} from '../utils/fileSecurity';
import { getTreeAccess } from './externalNeedService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerFiatVerificationStatus =
  | 'DECLARED'
  | 'BACKED_BY_RECEIPT'
  | 'RECONCILED'
  | 'AUDITED'
  | 'API_VERIFIED'
  | 'REJECTED';

export type LedgerTransactionType =
  | 'INCOME' | 'EXPENSE' | 'INVESTMENT'
  | 'SALARY' | 'MATERIALS' | 'INFRASTRUCTURE'
  | 'TAX' | 'RESERVE' | 'MAINTENANCE'
  | 'TREE_FUND' | 'EXTERNAL_CONTRACT' | 'REFUND';

export type FiatCounterpartyType =
  | 'CLIENT' | 'SUPPLIER' | 'MEMBER' | 'EXTERNAL_WORKER' | 'INSTITUTION' | 'OTHER';

// Valid status transitions: from → allowed targets
const CERTIFICATION_TRANSITIONS: Record<LedgerFiatVerificationStatus, LedgerFiatVerificationStatus[]> = {
  DECLARED:         ['BACKED_BY_RECEIPT', 'REJECTED'],
  BACKED_BY_RECEIPT:['RECONCILED', 'REJECTED'],
  RECONCILED:       ['AUDITED', 'REJECTED'],
  AUDITED:          [],
  API_VERIFIED:     [],
  REJECTED:         [],
};

// Statuses that require admin role to certify
const ADMIN_ONLY_TARGETS = new Set<LedgerFiatVerificationStatus>(['RECONCILED', 'AUDITED', 'REJECTED']);

const INCOME_TYPES = new Set(['INCOME', 'EXTERNAL_CONTRACT', 'REFUND']);
const EXPENSE_TYPES = new Set(['EXPENSE', 'SALARY', 'MATERIALS', 'INFRASTRUCTURE', 'TAX', 'RESERVE', 'MAINTENANCE', 'TREE_FUND']);

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

export async function canReadLedger(userId: string, treeId: string, role?: string | null) {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isMember;
}

export { canManageFiatLedger as canManageLedger };

// ─────────────────────────────────────────────────────────────────────────────
// Safe output helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeTransaction(tx: any) {
  return {
    id:                 tx.id,
    treeId:             tx.treeId,
    branchId:           tx.branchId ?? null,
    taskId:             tx.taskId ?? null,
    externalNeedId:     tx.externalNeedId ?? null,
    solutionProposalId: tx.solutionProposalId ?? null,
    createdById:        tx.createdById ?? null,
    certifiedById:      tx.certifiedById ?? null,
    amount:             Number(tx.amount),
    currency:           tx.currency ?? 'CLP',
    type:               tx.type,
    category:           tx.category,
    description:        tx.description ?? null,
    counterpartyName:   tx.counterpartyName ?? null,
    counterpartyType:   tx.counterpartyType ?? null,
    verificationStatus: tx.verificationStatus,
    receiptEvidenceId:  tx.receiptEvidenceId ?? null,
    rejectionReason:    tx.rejectionReason ?? null,
    certifiedAt:        tx.certifiedAt ?? null,
    isAutomatic:        tx.isAutomatic ?? false,
    date:               tx.date,
    createdAt:          tx.createdAt,
    updatedAt:          tx.updatedAt,
    createdBy:          tx.createdBy ? { id: tx.createdBy.id, username: tx.createdBy.username } : null,
    certifiedBy:        tx.certifiedBy ? { id: tx.certifiedBy.id, username: tx.certifiedBy.username } : null,
    receiptMetadata:    tx._receiptMeta ?? null,
    note:               'El fiat certifica transacciones externas. No otorga XP, autoridad, votos ni Berries.',
  };
}

async function buildReceiptMeta(tx: any, req: Request) {
  if (!tx.receiptEvidenceId) return null;
  const file = await (prisma as any).evidenceFile.findUnique({
    where: { id: tx.receiptEvidenceId },
    include: { task: true },
  });
  if (!file) return { hasReceipt: false };
  const allowed = await canAccessEvidenceFile(file, req);
  return toSafeEvidenceMetadata(file, allowed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtered transaction list
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerFilters {
  branchId?:          string;
  taskId?:            string;
  externalNeedId?:    string;
  type?:              string;
  category?:          string;
  verificationStatus?:string;
  dateFrom?:          string;
  dateTo?:            string;
  minAmount?:         number;
  maxAmount?:         number;
  search?:            string;
  page?:              number;
  pageSize?:          number;
}

export async function getFilteredTransactions(
  treeId: string,
  filters: LedgerFilters,
  req: Request,
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: any = { treeId };
  if (filters.branchId)          where.branchId = filters.branchId;
  if (filters.taskId)            where.taskId = filters.taskId;
  if (filters.externalNeedId)    where.externalNeedId = filters.externalNeedId;
  if (filters.type)              where.type = filters.type;
  if (filters.category)          where.category = filters.category;
  if (filters.verificationStatus)where.verificationStatus = filters.verificationStatus;
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo)   where.date.lte = new Date(filters.dateTo);
  }
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amount = {};
    if (filters.minAmount !== undefined) where.amount.gte = filters.minAmount;
    if (filters.maxAmount !== undefined) where.amount.lte = filters.maxAmount;
  }
  if (filters.search) {
    where.OR = [
      { description: { contains: filters.search } },
      { counterpartyName: { contains: filters.search } },
    ];
  }

  const [total, transactions] = await Promise.all([
    (prisma as any).fiatTransaction.count({ where }),
    (prisma as any).fiatTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: pageSize,
      include: {
        createdBy: { select: { id: true, username: true } },
        certifiedBy: { select: { id: true, username: true } },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    items: transactions.map(safeTransaction),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single transaction (with receipt metadata)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionWithReceipt(transactionId: string, req: Request) {
  const tx = await (prisma as any).fiatTransaction.findUnique({
    where: { id: transactionId },
    include: {
      createdBy: { select: { id: true, username: true } },
      certifiedBy: { select: { id: true, username: true } },
    },
  });
  if (!tx) return null;
  const receiptMeta = await buildReceiptMeta(tx, req);
  return safeTransaction({ ...tx, _receiptMeta: receiptMeta });
}

// ─────────────────────────────────────────────────────────────────────────────
// Create transaction
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_CATEGORIES = new Set([
  'WATER', 'ELECTRICITY', 'GAS', 'MORTGAGE', 'FUEL', 'SHOPPING', 'EQUIPMENT', 'MATERIAL', 'MONEY', 'OTHER',
]);

const ALLOWED_TYPES = new Set<LedgerTransactionType>([
  'INCOME', 'EXPENSE', 'INVESTMENT',
  'SALARY', 'MATERIALS', 'INFRASTRUCTURE',
  'TAX', 'RESERVE', 'MAINTENANCE',
  'TREE_FUND', 'EXTERNAL_CONTRACT', 'REFUND',
]);

const ALLOWED_COUNTERPARTY_TYPES = new Set<FiatCounterpartyType>([
  'CLIENT', 'SUPPLIER', 'MEMBER', 'EXTERNAL_WORKER', 'INSTITUTION', 'OTHER',
]);

const ISO_CURRENCY_RE = /^[A-Z]{3}$/;

export interface CreateLedgerTransactionInput {
  treeId:              string;
  branchId?:           string | null;
  taskId?:             string | null;
  externalNeedId?:     string | null;
  solutionProposalId?: string | null;
  createdById?:        string | null;
  type:                string;
  amount:              number;
  currency?:           string;
  category?:           string;
  description?:        string | null;
  counterpartyName?:   string | null;
  counterpartyType?:   string | null;
  date?:               string | Date | null;
  verificationStatus?: string;
  metadataJson?:       unknown;
  isAutomatic?:        boolean;
}

function validateTransactionInput(input: CreateLedgerTransactionInput) {
  if (!ALLOWED_TYPES.has(input.type as LedgerTransactionType)) {
    throw new Error(`Invalid transaction type: ${input.type}`);
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  const currency = (input.currency ?? 'CLP').toUpperCase();
  if (!ISO_CURRENCY_RE.test(currency)) {
    throw new Error('currency must be a 3-letter ISO code');
  }
  const category = input.category ?? 'OTHER';
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (input.counterpartyType && !ALLOWED_COUNTERPARTY_TYPES.has(input.counterpartyType as FiatCounterpartyType)) {
    throw new Error(`Invalid counterpartyType: ${input.counterpartyType}`);
  }
  return { amount, currency, category };
}

export async function createLedgerTransaction(
  input: CreateLedgerTransactionInput,
  req: Request,
) {
  assertFiatDoesNotAffectReputation(input.metadataJson);
  const { amount, currency, category } = validateTransactionInput(input);

  const data: any = {
    treeId:              input.treeId,
    amount,
    currency,
    type:                input.type,
    category,
    description:         input.description ?? null,
    counterpartyName:    input.counterpartyName ?? null,
    counterpartyType:    input.counterpartyType ?? null,
    branchId:            input.branchId ?? null,
    taskId:              input.taskId ?? null,
    externalNeedId:      input.externalNeedId ?? null,
    solutionProposalId:  input.solutionProposalId ?? null,
    createdById:         input.createdById ?? null,
    verificationStatus:  'DECLARED',
    isAutomatic:         input.isAutomatic ?? false,
    metadataJson:        input.metadataJson ?? null,
  };
  if (input.date) {
    const d = new Date(input.date as string);
    if (!isNaN(d.getTime())) data.date = d;
  }

  const tx = await (prisma as any).fiatTransaction.create({ data });

  void logEvent({
    ...getRequestContext(req),
    treeId: input.treeId,
    action: 'FIAT_TRANSACTION_CREATED',
    entityType: 'FiatTransaction',
    entityId: tx.id,
    metadataJson: getRequestMetadata(req, { type: tx.type, amount, currency }),
    severity: 'INFO',
    source: 'USER',
  });

  return safeTransaction(tx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update transaction (only DECLARED allowed without admin override)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateLedgerTransaction(
  transactionId: string,
  body: Partial<CreateLedgerTransactionInput> & { date?: string | Date | null },
  actorId: string,
  isAdmin: boolean,
  req: Request,
) {
  const existing = await (prisma as any).fiatTransaction.findUnique({ where: { id: transactionId } });
  if (!existing) throw new Error('Transaction not found');

  if (!isAdmin && existing.verificationStatus !== 'DECLARED') {
    throw new Error('Only DECLARED transactions can be edited by non-admins');
  }
  if (!isAdmin && existing.createdById !== actorId) {
    throw new Error('Only the creator can edit this transaction');
  }

  const updates: any = {};
  if (body.description   !== undefined) updates.description    = body.description;
  if (body.counterpartyName !== undefined) updates.counterpartyName = body.counterpartyName;
  if (body.counterpartyType !== undefined) {
    if (body.counterpartyType && !ALLOWED_COUNTERPARTY_TYPES.has(body.counterpartyType as FiatCounterpartyType)) {
      throw new Error(`Invalid counterpartyType: ${body.counterpartyType}`);
    }
    updates.counterpartyType = body.counterpartyType;
  }
  if (body.amount !== undefined) {
    const a = Number(body.amount);
    if (!Number.isFinite(a) || a <= 0) throw new Error('amount must be positive');
    updates.amount = a;
  }
  if (body.currency !== undefined) {
    const c = (body.currency ?? 'CLP').toUpperCase();
    if (!ISO_CURRENCY_RE.test(c)) throw new Error('currency must be 3-letter ISO');
    updates.currency = c;
  }
  if (body.category !== undefined) {
    if (!ALLOWED_CATEGORIES.has(body.category ?? 'OTHER')) throw new Error('Invalid category');
    updates.category = body.category;
  }
  if (body.type !== undefined) {
    if (!ALLOWED_TYPES.has(body.type as LedgerTransactionType)) throw new Error('Invalid type');
    updates.type = body.type;
  }
  if (body.branchId           !== undefined) updates.branchId           = body.branchId;
  if (body.taskId             !== undefined) updates.taskId             = body.taskId;
  if (body.externalNeedId     !== undefined) updates.externalNeedId     = body.externalNeedId;
  if (body.solutionProposalId !== undefined) updates.solutionProposalId = body.solutionProposalId;
  if (body.date !== undefined && body.date !== null) {
    const d = new Date(body.date as string);
    if (!isNaN(d.getTime())) updates.date = d;
  }
  if (body.metadataJson !== undefined) {
    assertFiatDoesNotAffectReputation(body.metadataJson);
    updates.metadataJson = body.metadataJson;
  }

  const updated = await (prisma as any).fiatTransaction.update({
    where: { id: transactionId },
    data: updates,
    include: { createdBy: { select: { id: true, username: true } }, certifiedBy: { select: { id: true, username: true } } },
  });

  void logEvent({
    ...getRequestContext(req),
    treeId: updated.treeId,
    action: 'FIAT_TRANSACTION_UPDATED',
    entityType: 'FiatTransaction',
    entityId: transactionId,
    metadataJson: getRequestMetadata(req, { updatedFields: Object.keys(updates) }),
    severity: 'INFO',
    source: 'USER',
  });

  return safeTransaction(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Attach receipt file (upload + link)
// ─────────────────────────────────────────────────────────────────────────────

export async function attachReceiptUpload(
  transactionId: string,
  uploaderId: string,
  file: Express.Multer.File,
  visibility: string | undefined,
  req: Request,
) {
  const tx = await (prisma as any).fiatTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new Error('Transaction not found');
  if (tx.receiptEvidenceId) throw new Error('Receipt already attached. Use replaceReceipt to update.');

  const validation = validateUploadFile(file);
  if (!validation.ok) throw new Error(`Arquivo rejeitado: ${validation.reason}`);

  const allowedVisibilities = new Set(['PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'TASK_PARTICIPANTS', 'PUBLIC_METADATA', 'PUBLIC']);
  const vis = visibility && allowedVisibilities.has(visibility) ? visibility : 'TREE_ONLY';

  ensureUploadRoot();
  const { storedName, relativeDir, relativePath } = buildEvidenceStoragePath(validation.extension);
  const absDir = resolveStoragePath(relativeDir);
  await fs.mkdir(absDir, { recursive: true });
  const absPath = resolveStoragePath(relativePath);
  await fs.writeFile(absPath, file.buffer);
  const checksum = await calculateSha256(absPath);

  const evidenceFile = await (prisma as any).evidenceFile.create({
    data: {
      uploaderId,
      treeId: tx.treeId,
      originalName: sanitizeOriginalName(file.originalname),
      storedName,
      storagePath: relativePath,
      mimeType: file.mimetype,
      extension: validation.extension,
      sizeBytes: file.size,
      visibility: vis,
      checksumSha256: checksum,
    },
  });

  const newStatus = tx.verificationStatus === 'DECLARED' ? 'BACKED_BY_RECEIPT' : tx.verificationStatus;
  const updated = await (prisma as any).fiatTransaction.update({
    where: { id: transactionId },
    data: { receiptEvidenceId: evidenceFile.id, verificationStatus: newStatus },
    include: { createdBy: { select: { id: true, username: true } }, certifiedBy: { select: { id: true, username: true } } },
  });

  void logEvent({
    ...getRequestContext(req),
    treeId: tx.treeId,
    action: 'FIAT_TRANSACTION_RECEIPT_ATTACHED',
    entityType: 'FiatTransaction',
    entityId: transactionId,
    metadataJson: getRequestMetadata(req, { evidenceFileId: evidenceFile.id, newStatus }),
    severity: 'INFO',
    source: 'USER',
  });

  return safeTransaction({ ...updated, _receiptMeta: toSafeEvidenceMetadata(evidenceFile, true) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Link an existing EvidenceFile as receipt
// ─────────────────────────────────────────────────────────────────────────────

export async function attachReceiptByFileId(
  transactionId: string,
  evidenceFileId: string,
  req: Request,
) {
  const [tx, file] = await Promise.all([
    (prisma as any).fiatTransaction.findUnique({ where: { id: transactionId } }),
    (prisma as any).evidenceFile.findUnique({ where: { id: evidenceFileId } }),
  ]);
  if (!tx) throw new Error('Transaction not found');
  if (!file) throw new Error('EvidenceFile not found');

  const newStatus = tx.verificationStatus === 'DECLARED' ? 'BACKED_BY_RECEIPT' : tx.verificationStatus;
  const updated = await (prisma as any).fiatTransaction.update({
    where: { id: transactionId },
    data: { receiptEvidenceId: evidenceFileId, verificationStatus: newStatus },
    include: { createdBy: { select: { id: true, username: true } }, certifiedBy: { select: { id: true, username: true } } },
  });

  void logEvent({
    ...getRequestContext(req),
    treeId: tx.treeId,
    action: 'FIAT_TRANSACTION_RECEIPT_ATTACHED',
    entityType: 'FiatTransaction',
    entityId: transactionId,
    metadataJson: getRequestMetadata(req, { evidenceFileId, newStatus }),
    severity: 'INFO',
    source: 'USER',
  });

  const allowed = await canAccessEvidenceFile(file, req);
  return safeTransaction({ ...updated, _receiptMeta: toSafeEvidenceMetadata(file, allowed) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Certify / change verification status
// ─────────────────────────────────────────────────────────────────────────────

export async function certifyTransaction(
  transactionId: string,
  toStatus: string,
  actorId: string,
  isAdmin: boolean,
  reason: string | undefined,
  req: Request,
) {
  const tx = await (prisma as any).fiatTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new Error('Transaction not found');

  const from = tx.verificationStatus as LedgerFiatVerificationStatus;
  const to   = toStatus as LedgerFiatVerificationStatus;

  const allowed = CERTIFICATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Cannot transition from ${from} to ${to}. Allowed: ${allowed.join(', ') || 'none'}`);
  }

  if (ADMIN_ONLY_TARGETS.has(to) && !isAdmin) {
    throw new Error(`Only tree admins can certify as ${to}`);
  }

  if (to === 'REJECTED') {
    if (!reason || reason.trim().length < 5) {
      throw new Error('A rejection reason (min 5 characters) is required');
    }
  }

  const update: any = {
    verificationStatus: to,
    certifiedById:       actorId,
    certifiedAt:         new Date(),
  };
  if (to === 'REJECTED') update.rejectionReason = reason!.trim();

  const updated = await (prisma as any).fiatTransaction.update({
    where: { id: transactionId },
    data: update,
    include: { createdBy: { select: { id: true, username: true } }, certifiedBy: { select: { id: true, username: true } } },
  });

  const actionMap: Record<string, string> = {
    BACKED_BY_RECEIPT: 'FIAT_TRANSACTION_BACKED',
    RECONCILED:        'FIAT_TRANSACTION_RECONCILED',
    AUDITED:           'FIAT_TRANSACTION_AUDITED',
    REJECTED:          'FIAT_TRANSACTION_REJECTED',
    API_VERIFIED:      'FIAT_TRANSACTION_API_VERIFIED',
  };
  const action = actionMap[to] ?? 'FIAT_TRANSACTION_CERTIFICATION_UPDATED';

  void logEvent({
    ...getRequestContext(req),
    treeId: tx.treeId,
    action,
    entityType: 'FiatTransaction',
    entityId: transactionId,
    metadataJson: getRequestMetadata(req, { from, to, reason: reason ?? null }),
    severity: to === 'REJECTED' ? 'WARNING' : 'INFO',
    source: 'USER',
  });

  const receiptMeta = await buildReceiptMeta(updated, req);
  return safeTransaction({ ...updated, _receiptMeta: receiptMeta });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-level summary (extended)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTreeLedgerSummary(treeId: string, branchId?: string) {
  const where: any = { treeId };
  if (branchId) where.branchId = branchId;

  const transactions = await (prisma as any).fiatTransaction.findMany({
    where,
    select: { amount: true, type: true, verificationStatus: true, currency: true, category: true },
  });

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalIncome = 0, totalExpense = 0, totalInvestment = 0;
  let verifiedAmount = 0;

  const INCOME_T = new Set(['INCOME', 'EXTERNAL_CONTRACT', 'REFUND']);
  const INVEST_T = new Set(['INVESTMENT']);

  for (const tx of transactions) {
    const amount = Number(tx.amount ?? 0);
    byType[tx.type] = (byType[tx.type] ?? 0) + amount;
    byStatus[tx.verificationStatus] = (byStatus[tx.verificationStatus] ?? 0) + amount;

    if (INCOME_T.has(tx.type)) totalIncome += amount;
    else if (INVEST_T.has(tx.type)) totalInvestment += amount;
    else totalExpense += amount;

    if (['BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED'].includes(tx.verificationStatus)) {
      verifiedAmount += amount;
    }
  }

  const net = totalIncome - totalExpense - totalInvestment;
  const total = transactions.length;

  return {
    treeId,
    branchId: branchId ?? null,
    totalTransactions: total,
    totalIncomeFiat:     totalIncome,
    totalExpenseFiat:    totalExpense,
    totalInvestmentFiat: totalInvestment,
    netFiat:             net,
    verifiedAmountFiat:  verifiedAmount,
    verifiedRatioPct:    total > 0 ? Math.round((transactions.filter((t: any) =>
      ['BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED'].includes(t.verificationStatus)
    ).length / total) * 10000) / 100 : 0,
    byType,
    byVerificationStatus: byStatus,
    note: 'El fiat certifica transacciones externas. No otorga XP, autoridad, votos ni Berries.',
  };
}
