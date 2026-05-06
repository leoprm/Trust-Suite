import { Request, Response } from 'express';
import { logEvent, getRequestContext, getRequestMetadata } from '../services/eventLogService';
import { canManageFiatLedger } from '../services/fiatLedgerService';
import {
  attachReceiptByFileId,
  attachReceiptUpload,
  canManageLedger,
  canReadLedger,
  certifyTransaction,
  createLedgerTransaction,
  getFilteredTransactions,
  getTransactionWithReceipt,
  getTreeLedgerSummary,
  updateLedgerTransaction,
  type LedgerFilters,
} from '../services/branchOsLedgerService';
import { getTreeAccess } from '../services/externalNeedService';

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureReadAccess(req: Request, res: Response, treeId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  const role = req.user?.role;
  const ok = await canReadLedger(userId, treeId, role);
  if (!ok) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'FiatTransaction',
      entityId: treeId,
      metadataJson: getRequestMetadata(req, { reason: 'ledger_read_denied' }),
      severity: 'WARNING',
      source: 'USER',
    });
    res.status(403).json({ error: 'You must be a tree member to view the ledger' });
    return false;
  }
  return true;
}

async function ensureManageAccess(req: Request, res: Response, treeId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  const role = req.user?.role;
  const ok = await canManageFiatLedger(userId, treeId, role);
  if (!ok) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'FiatTransaction',
      entityId: treeId,
      metadataJson: getRequestMetadata(req, { reason: 'ledger_manage_denied' }),
      severity: 'WARNING',
      source: 'USER',
    });
    res.status(403).json({ error: 'Only tree admins or creators can manage the ledger' });
    return false;
  }
  return true;
}

async function resolveTreeIdForTransaction(transactionId: string): Promise<string | null> {
  const { prisma } = await import('../index');
  const tx = await (prisma as any).fiatTransaction.findUnique({
    where: { id: transactionId },
    select: { treeId: true },
  });
  return tx?.treeId ?? null;
}

async function getIsAdmin(userId: string, treeId: string, role?: string): Promise<boolean> {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// List transactions (tree scope, optional branch filter)
// ─────────────────────────────────────────────────────────────────────────────

export async function listTransactions(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId is required' });

  if (!await ensureReadAccess(req, res, treeId)) return;

  const filters: LedgerFilters = {
    branchId:           req.query.branchId           as string | undefined,
    taskId:             req.query.taskId             as string | undefined,
    externalNeedId:     req.query.externalNeedId     as string | undefined,
    type:               req.query.type               as string | undefined,
    category:           req.query.category           as string | undefined,
    verificationStatus: req.query.verificationStatus as string | undefined,
    dateFrom:           req.query.dateFrom           as string | undefined,
    dateTo:             req.query.dateTo             as string | undefined,
    search:             req.query.search             as string | undefined,
    minAmount:          req.query.minAmount ? Number(req.query.minAmount) : undefined,
    maxAmount:          req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
    page:               req.query.page     ? Number(req.query.page)     : 1,
    pageSize:           req.query.pageSize ? Number(req.query.pageSize) : 20,
  };

  const result = await getFilteredTransactions(treeId, filters, req);
  return res.json(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Create transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function createTransaction(req: Request, res: Response) {
  const treeId = String(req.params.treeId || req.body.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId is required' });

  if (!await ensureManageAccess(req, res, treeId)) return;

  try {
    const tx = await createLedgerTransaction(
      { ...req.body, treeId, createdById: req.user!.id },
      req,
    );
    return res.status(201).json(tx);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get single transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransaction(req: Request, res: Response) {
  const transactionId = String(req.params.transactionId || '');
  if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

  const treeId = await resolveTreeIdForTransaction(transactionId);
  if (!treeId) return res.status(404).json({ error: 'Transaction not found' });

  if (!await ensureReadAccess(req, res, treeId)) return;

  const tx = await getTransactionWithReceipt(transactionId, req);
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  return res.json(tx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function updateTransaction(req: Request, res: Response) {
  const transactionId = String(req.params.transactionId || '');
  if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

  const treeId = await resolveTreeIdForTransaction(transactionId);
  if (!treeId) return res.status(404).json({ error: 'Transaction not found' });

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const isAdmin = await getIsAdmin(userId, treeId, req.user?.role);

  try {
    const updated = await updateLedgerTransaction(
      transactionId, req.body, userId, isAdmin, req,
    );
    return res.json(updated);
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 400;
    return res.status(code).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Attach receipt (file upload or link existing)
// ─────────────────────────────────────────────────────────────────────────────

export async function attachReceipt(req: Request, res: Response) {
  const transactionId = String(req.params.transactionId || '');
  if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

  const treeId = await resolveTreeIdForTransaction(transactionId);
  if (!treeId) return res.status(404).json({ error: 'Transaction not found' });

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const access = await getTreeAccess(userId, treeId, req.user?.role);
  if (!access.isMember) return res.status(403).json({ error: 'Tree membership required' });

  try {
    let result: any;
    if (req.file) {
      // File upload path
      result = await attachReceiptUpload(
        transactionId, userId, req.file, req.body?.visibility, req,
      );
    } else if (req.body?.evidenceFileId) {
      // Link existing EvidenceFile
      result = await attachReceiptByFileId(transactionId, req.body.evidenceFileId, req);
    } else {
      return res.status(400).json({ error: 'Provide a file upload or evidenceFileId' });
    }
    return res.json(result);
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 400;
    return res.status(code).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Certify (change verification status)
// ─────────────────────────────────────────────────────────────────────────────

export async function certify(req: Request, res: Response) {
  const transactionId = String(req.params.transactionId || '');
  if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

  const treeId = await resolveTreeIdForTransaction(transactionId);
  if (!treeId) return res.status(404).json({ error: 'Transaction not found' });

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const isAdmin = await getIsAdmin(userId, treeId, req.user?.role);
  if (!isAdmin) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'FiatTransaction',
      entityId: transactionId,
      metadataJson: getRequestMetadata(req, { reason: 'certify_denied' }),
      severity: 'WARNING',
      source: 'USER',
    });
    return res.status(403).json({ error: 'Only tree admins can certify transactions' });
  }

  const { toStatus, reason } = req.body;
  if (!toStatus) return res.status(400).json({ error: 'toStatus is required' });

  try {
    const result = await certifyTransaction(
      transactionId, toStatus, userId, isAdmin, reason, req,
    );
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-level summary
// ─────────────────────────────────────────────────────────────────────────────

export async function getTreeSummary(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId is required' });

  if (!await ensureReadAccess(req, res, treeId)) return;

  const branchId = req.query.branchId as string | undefined;
  const summary = await getTreeLedgerSummary(treeId, branchId);
  return res.json(summary);
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch-level summary
// ─────────────────────────────────────────────────────────────────────────────

export async function getBranchSummary(req: Request, res: Response) {
  const branchId = String(req.params.branchId || '');
  if (!branchId) return res.status(400).json({ error: 'branchId is required' });

  const { prisma } = await import('../index');
  const branch = await (prisma as any).branch.findUnique({
    where: { id: branchId },
    select: { treeId: true },
  });
  if (!branch) return res.status(404).json({ error: 'Branch not found' });

  if (!await ensureReadAccess(req, res, branch.treeId)) return;

  const summary = await getTreeLedgerSummary(branch.treeId, branchId);
  return res.json(summary);
}
