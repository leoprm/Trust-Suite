import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import {
  assertFiatDoesNotAffectReputation,
  assertNoFiatToBerriesConversion,
  canManageFiatLedger,
  createFiatTransaction,
  getFiatLedger,
  getFiatLedgerSummary,
  safeFiatTransaction,
  updateTreeEconomyMode,
} from '../services/fiatLedgerService';

async function ensureFiatManager(req: Request, res: Response, treeId: string) {
  if (!req.user?.id) {
    res.status(401).json({ error: 'auth required' });
    return false;
  }

  const allowed = await canManageFiatLedger(req.user.id, treeId, req.user.role);
  if (!allowed) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'FiatLedger',
      metadataJson: getRequestMetadata(req, { reason: 'fiat_ledger_admin_required' }),
      severity: 'WARNING',
    });
    res.status(403).json({ error: 'Only Tree owners/admins can manage the external fiat ledger' });
    return false;
  }

  return true;
}

async function applyTemplateLogic(input: any) {
  const {
    treeId,
    amount,
    type,
    category,
    description,
    date,
    isRecurring,
    isPeriodic,
    periodicity,
    daysCount,
    isFixed,
    templateId,
  } = input;

  const numAmount = Number(amount);
  let finalTemplateId = templateId || null;

  if (isRecurring && !templateId) {
    const newTemplate = await (prisma as any).fiatTemplate.create({
      data: {
        treeId,
        amount: isFixed ? numAmount : null,
        type,
        category,
        description,
        isPeriodic: !!isPeriodic,
        periodicity,
        daysCount: daysCount ? Number(daysCount) : null,
        isFixed: !!isFixed,
        lastUsedAt: new Date(date || new Date()),
      },
    });
    finalTemplateId = newTemplate.id;
  } else if (templateId) {
    await (prisma as any).fiatTemplate.update({
      where: { id: templateId },
      data: {
        lastUsedAt: new Date(date || new Date()),
        amount: isFixed ? numAmount : null,
        isFixed: !!isFixed,
        isPeriodic: !!isPeriodic,
        periodicity,
        daysCount: daysCount ? Number(daysCount) : null,
      },
    });
  }

  return finalTemplateId;
}

export const addTransaction = async (req: Request, res: Response) => {
  const { treeId } = req.body;
  try {
    assertNoFiatToBerriesConversion(req.body);
    assertFiatDoesNotAffectReputation(req.body);

    if (!treeId) return res.status(400).json({ error: 'treeId is required' });
    if (!await ensureFiatManager(req, res, treeId)) return;

    const templateId = await applyTemplateLogic(req.body);
    const transaction = await createFiatTransaction({
      ...req.body,
      templateId,
      createdById: req.user?.id,
      metadataJson: {
        ledgerRole: 'external',
        purpose: 'external_resource_record',
        noReputationEffect: true,
      },
      isAutomatic: false,
    }, {
      ...getRequestContext(req),
      metadataJson: getRequestMetadata(req, { hasTemplate: Boolean(templateId), result: 'success' }),
    });

    res.status(201).json(safeFiatTransaction(transaction));
  } catch (error: any) {
    const isBlockedReputationEffect = /XP|level|vote|reputation|Berries|conversion|authority/i.test(error.message || '');
    if (isBlockedReputationEffect) {
      console.warn('[Fiat Ledger] blocked reputation/authority effect:', error.message);
    } else {
      console.error('[Fiat Ledger] addTransaction:', error);
    }
    if (treeId && isBlockedReputationEffect) {
      void logEvent({
        ...getRequestContext(req),
        treeId,
        action: 'FIAT_REPUTATION_EFFECT_BLOCKED',
        entityType: 'FiatLedger',
        metadataJson: getRequestMetadata(req, { reason: error.message }),
        severity: 'WARNING',
      });
    }
    res.status(400).json({ error: error.message || 'Failed to add fiat ledger transaction' });
  }
};

export const getTransactions = async (req: Request, res: Response) => {
  try {
    const treeId = req.params.treeId as string;
    res.json(await getFiatLedger(treeId));
  } catch (error: any) {
    console.error('[Fiat Ledger] getTransactions:', error);
    res.status(500).json({ error: 'Failed to fetch fiat ledger transactions' });
  }
};

export const getFinancialSummary = async (req: Request, res: Response) => {
  try {
    const summary = await getFiatLedgerSummary(req.params.treeId as string);
    res.json({
      income: summary.fiatLedger.income,
      expense: summary.fiatLedger.expenses,
      investment: summary.fiatLedger.investment,
      balance: summary.fiatLedger.net,
      fiatLedger: summary.fiatLedger,
      berries: summary.berries,
    });
  } catch (error: any) {
    console.error('[Fiat Ledger] getFinancialSummary:', error);
    res.status(500).json({ error: 'Failed to fetch fiat ledger summary' });
  }
};

export const getFiatLedgerSummaryController = async (req: Request, res: Response) => {
  try {
    res.json(await getFiatLedgerSummary(req.params.treeId as string));
  } catch (error: any) {
    console.error('[Fiat Ledger] getFiatLedgerSummary:', error);
    res.status(500).json({ error: 'Failed to fetch fiat ledger summary' });
  }
};

export const getGlobalTransactions = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'auth required' });

    const transactions = await (prisma as any).fiatTransaction.findMany({
      where: { tree: { members: { some: { userId } } } },
      orderBy: { date: 'asc' },
    });

    res.json(transactions.map(safeFiatTransaction));
  } catch (error: any) {
    console.error('[Fiat Ledger] getGlobalTransactions:', error);
    res.status(500).json({ error: 'Failed to fetch global fiat ledger transactions' });
  }
};

export const getGlobalFinancialSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'auth required' });

    const aggregate = await (prisma as any).fiatTransaction.groupBy({
      by: ['type'],
      where: { tree: { members: { some: { userId } } } },
      _sum: { amount: true },
    });

    const income = Number((aggregate as any[]).find((a) => a.type === 'INCOME')?._sum?.amount || 0);
    const expense = Number((aggregate as any[]).find((a) => a.type === 'EXPENSE')?._sum?.amount || 0);
    const investment = Number((aggregate as any[]).find((a) => a.type === 'INVESTMENT')?._sum?.amount || 0);
    res.json({
      income,
      expense,
      investment,
      balance: income - expense - investment,
      fiatLedger: {
        currency: 'CLP',
        income,
        expenses: expense,
        investment,
        net: income - expense - investment,
        note: 'Fiat is an external ledger. It does not grant XP, levels, votes, authority or Trace reputation.',
      },
      berries: {
        enabled: false,
        note: 'Berries are internal circulation, not equivalent to fiat.',
      },
    });
  } catch (error: any) {
    console.error('[Fiat Ledger] getGlobalFinancialSummary:', error);
    res.status(500).json({ error: 'Failed to fetch global fiat ledger summary' });
  }
};

export const updateTransaction = async (req: Request, res: Response) => {
  try {
    const transactionId = String(req.params.id || '');
    const existing = await (prisma as any).fiatTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) return res.status(404).json({ error: 'Fiat ledger transaction not found' });
    if (!await ensureFiatManager(req, res, existing.treeId)) return;

    assertNoFiatToBerriesConversion(req.body);
    assertFiatDoesNotAffectReputation(req.body);
    if (req.body.branchId) {
      const branch = await (prisma as any).branch.findUnique({ where: { id: req.body.branchId }, select: { treeId: true } });
      if (!branch || branch.treeId !== existing.treeId) {
        return res.status(400).json({ error: 'branchId must belong to the same Tree as the fiat ledger transaction' });
      }
    }

    let finalTemplateId = req.body.templateId || null;
    if (req.body.isRecurring) {
      finalTemplateId = await applyTemplateLogic({ ...req.body, treeId: existing.treeId });
    }

    const transaction = await (prisma as any).fiatTransaction.update({
      where: { id: transactionId },
      data: {
        amount: req.body.amount === undefined ? undefined : Number(req.body.amount),
        currency: req.body.currency ? String(req.body.currency).toUpperCase() : undefined,
        type: req.body.type,
        category: req.body.category,
        description: req.body.description,
        date: req.body.date ? new Date(req.body.date) : undefined,
        branchId: req.body.branchId === undefined ? undefined : req.body.branchId || null,
        taskId: req.body.taskId === undefined ? undefined : req.body.taskId || null,
        externalNeedId: req.body.externalNeedId === undefined ? undefined : req.body.externalNeedId || null,
        verificationStatus: req.body.verificationStatus,
        receiptEvidenceId: req.body.receiptEvidenceId === undefined ? undefined : req.body.receiptEvidenceId || null,
        templateId: req.body.isRecurring ? finalTemplateId : (req.body.templateId === undefined ? undefined : null),
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: transaction.treeId,
      action: req.body.verificationStatus && req.body.verificationStatus !== existing.verificationStatus ? 'FIAT_TRANSACTION_VERIFIED' : 'FIAT_TRANSACTION_UPDATED',
      entityType: 'FiatTransaction',
      entityId: transaction.id,
      beforeJson: safeFiatTransaction(existing),
      afterJson: safeFiatTransaction(transaction),
      metadataJson: getRequestMetadata(req, { ledgerRole: 'external', noReputationEffect: true }),
      source: 'USER',
    });

    res.json(safeFiatTransaction(transaction));
  } catch (error: any) {
    console.error('[Fiat Ledger] updateTransaction:', error);
    res.status(400).json({ error: error.message || 'Failed to update fiat ledger transaction' });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const transactionId = String(req.params.id || '');
    const existing = await (prisma as any).fiatTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) return res.status(404).json({ error: 'Fiat ledger transaction not found' });
    if (!await ensureFiatManager(req, res, existing.treeId)) return;

    await (prisma as any).fiatTransaction.delete({ where: { id: transactionId } });

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'FIAT_TRANSACTION_DELETED',
      entityType: 'FiatTransaction',
      entityId: transactionId,
      beforeJson: safeFiatTransaction(existing),
      metadataJson: getRequestMetadata(req, { ledgerRole: 'external', result: 'success' }),
      source: 'USER',
    });

    res.status(204).send();
  } catch (error: any) {
    console.error('[Fiat Ledger] deleteTransaction:', error);
    res.status(500).json({ error: 'Failed to delete fiat ledger transaction' });
  }
};

export const updateEconomyMode = async (req: Request, res: Response) => {
  try {
    const treeId = String(req.params.treeId || '');
    if (!await ensureFiatManager(req, res, treeId)) return;
    const result = await updateTreeEconomyMode(treeId, String(req.body.economyMode || ''), req.user!.id, {
      ...getRequestContext(req),
      metadataJson: getRequestMetadata(req, {
        note: 'Fiat can fund external resources but cannot buy authority.',
      }),
    });
    res.json(result);
  } catch (error: any) {
    console.error('[Fiat Ledger] updateEconomyMode:', error);
    res.status(400).json({ error: error.message || 'Failed to update economy mode' });
  }
};

export const getEBITDA = async (req: Request, res: Response) => {
  try {
    const { getTreeEBITDA } = await import('../utils/accountingTriggers');
    const result = await getTreeEBITDA(req.params.treeId as string);
    res.json({
      ...result,
      note: 'EBITDA is derived from external fiat ledger records only. It does not grant XP, levels or authority.',
    });
  } catch (error: any) {
    console.error('[Fiat Ledger] getEBITDA:', error);
    res.status(500).json({ error: 'Failed to calculate external fiat ledger EBITDA' });
  }
};
