import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import {
  canManageAutosustento,
  canProposeAutosustento,
  changeAutosustentoStatus,
  createAutosustentoBranch,
  getAutosustentoByBranchId,
  getAutosustentoFinancialSummary as calculateAutosustentoFinancialSummary,
  safeAutosustentoConfig,
  safeSustainabilitySplit,
  updateAutosustentoConfig,
  upsertSustainabilitySplit,
} from '../services/autosustentoBranchService';

async function requireMember(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (!await canProposeAutosustento(userId, treeId, req.user?.role)) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'AutosustentoBranch',
      metadataJson: getRequestMetadata(req, { reason: 'tree_member_required' }),
      severity: 'WARNING',
    });
    res.status(403).json({ error: 'Tree membership required' });
    return null;
  }
  return { userId };
}

async function requireAdmin(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (!await canManageAutosustento(userId, treeId, req.user?.role)) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'AutosustentoBranch',
      metadataJson: getRequestMetadata(req, { reason: 'tree_admin_required' }),
      severity: 'WARNING',
    });
    res.status(403).json({ error: 'Tree admin required' });
    return null;
  }
  return { userId };
}

async function loadConfigWithAccess(req: Request, res: Response, branchId: string, admin = false) {
  const config = await getAutosustentoByBranchId(branchId);
  if (!config) {
    res.status(404).json({ error: 'Autosustento branch not found' });
    return null;
  }
  const access = admin
    ? await requireAdmin(req, res, config.treeId)
    : await requireMember(req, res, config.treeId);
  if (!access) return null;
  return { config, access };
}

export const listAutosustentoBranches = async (req: Request, res: Response) => {
  try {
    const treeId = String(req.params.treeId || '');
    const access = await requireMember(req, res, treeId);
    if (!access) return;
    const configs = await (prisma as any).autosustentoBranchConfig.findMany({
      where: { treeId },
      include: { branch: true, split: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(configs.map(safeAutosustentoConfig));
  } catch (error: any) {
    console.error('[Autosustento] list:', error);
    res.status(500).json({ error: 'Failed to list Autosustento branches' });
  }
};

export const createAutosustentoBranchController = async (req: Request, res: Response) => {
  const treeId = String(req.params.treeId || '');
  try {
    const access = await requireMember(req, res, treeId);
    if (!access) return;
    const config = await createAutosustentoBranch(treeId, access.userId, req.body);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AUTOSUSTENTO_BRANCH_CREATED',
      entityType: 'AutosustentoBranch',
      entityId: config.branchId,
      afterJson: safeAutosustentoConfig(config),
      metadataJson: getRequestMetadata(req, {
        status: config.status,
        expectedMonthlyIncomeFiat: config.expectedMonthlyIncomeFiat,
        expectedMonthlyCostFiat: config.expectedMonthlyCostFiat,
        currency: config.currency,
        noXpFromFiat: true,
        noAuthorityEffect: true,
      }),
    });

    res.status(201).json(safeAutosustentoConfig(config));
  } catch (error: any) {
    console.error('[Autosustento] create:', error);
    res.status(400).json({ error: error.message || 'Failed to create Autosustento branch' });
  }
};

export const getAutosustentoBranch = async (req: Request, res: Response) => {
  try {
    const loaded = await loadConfigWithAccess(req, res, String(req.params.branchId || ''));
    if (!loaded) return;
    res.json(safeAutosustentoConfig(loaded.config));
  } catch (error: any) {
    console.error('[Autosustento] get:', error);
    res.status(500).json({ error: 'Failed to fetch Autosustento branch' });
  }
};

export const updateAutosustentoConfigController = async (req: Request, res: Response) => {
  try {
    const loaded = await loadConfigWithAccess(req, res, String(req.params.branchId || ''));
    if (!loaded) return;
    const isAdmin = await canManageAutosustento(loaded.access.userId, loaded.config.treeId, req.user?.role);
    const canCreatorEditProposal = loaded.config.createdById === loaded.access.userId && loaded.config.status === 'PROPOSED';
    if (!isAdmin && !canCreatorEditProposal) return res.status(403).json({ error: 'Cannot update this Autosustento branch' });

    const updated = await updateAutosustentoConfig(loaded.config.branchId, req.body);
    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.config.treeId,
      action: 'AUTOSUSTENTO_BRANCH_CONFIG_UPDATED',
      entityType: 'AutosustentoBranch',
      entityId: loaded.config.branchId,
      beforeJson: safeAutosustentoConfig(loaded.config),
      afterJson: safeAutosustentoConfig(updated),
      metadataJson: getRequestMetadata(req, { noXpFromFiat: true, noAuthorityEffect: true }),
      source: isAdmin ? 'ADMIN' : 'USER',
    });
    res.json(safeAutosustentoConfig(updated));
  } catch (error: any) {
    console.error('[Autosustento] update config:', error);
    res.status(400).json({ error: error.message || 'Failed to update Autosustento branch config' });
  }
};

export const updateSustainabilitySplit = async (req: Request, res: Response) => {
  try {
    const loaded = await loadConfigWithAccess(req, res, String(req.params.branchId || ''), true);
    if (!loaded) return;
    const split = await upsertSustainabilitySplit(loaded.config.branchId, req.body);
    const refreshed = await getAutosustentoByBranchId(loaded.config.branchId);

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.config.treeId,
      action: 'AUTOSUSTENTO_BRANCH_SPLIT_UPDATED',
      entityType: 'SustainabilitySplit',
      entityId: split.id,
      beforeJson: safeSustainabilitySplit(loaded.config.split),
      afterJson: safeSustainabilitySplit(split),
      metadataJson: getRequestMetadata(req, {
        branchId: loaded.config.branchId,
        totalPct: 100,
        noXpFromFiat: true,
        noAuthorityEffect: true,
      }),
      source: 'ADMIN',
    });

    res.json(safeAutosustentoConfig(refreshed));
  } catch (error: any) {
    console.error('[Autosustento] update split:', error);
    res.status(400).json({ error: error.message || 'Failed to update sustainability split' });
  }
};

const statusActionMap: Record<string, { status: any; action: string }> = {
  'submit-review': { status: 'UNDER_REVIEW', action: 'AUTOSUSTENTO_BRANCH_SUBMITTED_FOR_REVIEW' },
  approve: { status: 'APPROVED', action: 'AUTOSUSTENTO_BRANCH_APPROVED' },
  activate: { status: 'ACTIVE', action: 'AUTOSUSTENTO_BRANCH_ACTIVATED' },
  pause: { status: 'PAUSED', action: 'AUTOSUSTENTO_BRANCH_PAUSED' },
  close: { status: 'CLOSED', action: 'AUTOSUSTENTO_BRANCH_CLOSED' },
  reject: { status: 'REJECTED', action: 'AUTOSUSTENTO_BRANCH_REJECTED' },
};

async function changeStatus(req: Request, res: Response, key: keyof typeof statusActionMap) {
  try {
    const loaded = await loadConfigWithAccess(req, res, String(req.params.branchId || ''), true);
    if (!loaded) return;
    const target = statusActionMap[key];
    const updated = await changeAutosustentoStatus(loaded.config.branchId, target.status, req.body?.closureNote || req.body?.reason || null);

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.config.treeId,
      action: target.action,
      entityType: 'AutosustentoBranch',
      entityId: loaded.config.branchId,
      beforeJson: { status: loaded.config.status },
      afterJson: { status: updated.status, nextReviewAt: updated.nextReviewAt },
      metadataJson: getRequestMetadata(req, {
        expectedMonthlyIncomeFiat: loaded.config.expectedMonthlyIncomeFiat,
        expectedMonthlyCostFiat: loaded.config.expectedMonthlyCostFiat,
        currency: loaded.config.currency,
        noXpFromFiat: true,
        noAuthorityEffect: true,
      }),
      source: 'ADMIN',
    });

    res.json(safeAutosustentoConfig(updated));
  } catch (error: any) {
    console.error('[Autosustento] status:', error);
    res.status(400).json({ error: error.message || 'Failed to update Autosustento branch status' });
  }
}

export const submitAutosustentoForReview = (req: Request, res: Response) => changeStatus(req, res, 'submit-review');
export const approveAutosustentoBranch = (req: Request, res: Response) => changeStatus(req, res, 'approve');
export const activateAutosustentoBranch = (req: Request, res: Response) => changeStatus(req, res, 'activate');
export const pauseAutosustentoBranch = (req: Request, res: Response) => changeStatus(req, res, 'pause');
export const closeAutosustentoBranch = (req: Request, res: Response) => changeStatus(req, res, 'close');
export const rejectAutosustentoBranch = (req: Request, res: Response) => changeStatus(req, res, 'reject');

export const getAutosustentoFinancialSummary = async (req: Request, res: Response) => {
  try {
    const loaded = await loadConfigWithAccess(req, res, String(req.params.branchId || ''));
    if (!loaded) return;
    const summary = await calculateAutosustentoFinancialSummary(loaded.config.branchId);
    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.config.treeId,
      action: 'AUTOSUSTENTO_BRANCH_FINANCIAL_SUMMARY_VIEWED',
      entityType: 'AutosustentoBranch',
      entityId: loaded.config.branchId,
      metadataJson: getRequestMetadata(req, {
        transactionsCount: summary?.transactionsCount || 0,
        noXpFromFiat: true,
      }),
    });
    res.json(summary);
  } catch (error: any) {
    console.error('[Autosustento] financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch Autosustento financial summary' });
  }
};
