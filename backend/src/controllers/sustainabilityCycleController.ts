import { Request, Response } from 'express';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import {
  assertNoCycleAuthorityEffects,
  approveCycle,
  calculateCycle,
  canManageCycles,
  canViewCycles,
  deleteCycle,
  getCycle,
  getQuickSummary,
  listCycles,
  lockCycle,
  updateCycleNotes,
  upsertAllocation,
} from '../services/sustainabilitySurplusService';
import { getTreeAccess } from '../services/externalNeedService';

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireMember(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const ok = await canViewCycles(userId, treeId, req.user?.role);
  if (!ok) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'SustainabilityCycle',
      metadataJson: getRequestMetadata(req, { reason: 'not_tree_member', module: 'sustainabilityCycles' }),
    });
    res.status(403).json({ error: 'Tree membership required to view sustainability cycles' });
    return null;
  }
  return userId;
}

async function requireAdmin(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const ok = await canManageCycles(userId, treeId, req.user?.role);
  if (!ok) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'SustainabilityCycle',
      metadataJson: getRequestMetadata(req, { reason: 'not_tree_admin', module: 'sustainabilityCycles' }),
    });
    res.status(403).json({ error: 'Tree admin required to manage sustainability cycles' });
    return null;
  }
  return userId;
}

// Helper to load a cycle and derive treeId from it for permission checks
async function loadCycleWithAccess(req: Request, res: Response, cycleId: string, adminRequired = false) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  let cycle: any;
  try {
    cycle = await getCycle(cycleId);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Cycle not found' });
    return null;
  }
  const access = await getTreeAccess(userId, cycle.treeId, req.user?.role);
  if (!access.isMember) {
    void logEvent({
      ...getRequestContext(req),
      treeId: cycle.treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'SustainabilityCycle',
      metadataJson: getRequestMetadata(req, { reason: 'not_tree_member', cycleId }),
    });
    res.status(403).json({ error: 'Tree membership required' });
    return null;
  }
  if (adminRequired && !access.isAdmin) {
    void logEvent({
      ...getRequestContext(req),
      treeId: cycle.treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'SustainabilityCycle',
      metadataJson: getRequestMetadata(req, { reason: 'not_tree_admin', cycleId }),
    });
    res.status(403).json({ error: 'Tree admin required' });
    return null;
  }
  return { cycle, userId, access };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /autosustento-branches/:branchId/sustainability-summary
// Quick summary (no persistence)
// ─────────────────────────────────────────────────────────────────────────────

export const getSustainabilitySummary = async (req: Request, res: Response) => {
  try {
    const branchId = String(req.params.branchId || '');
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;

    // We need treeId to check membership — retrieve it from branch first
    const { prisma } = require('../index');
    const branch = await (prisma as any).branch.findUnique({ where: { id: branchId }, select: { treeId: true } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const userId = await requireMember(req, res, branch.treeId);
    if (!userId) return;

    const summary = await getQuickSummary(branchId, from, to);

    void logEvent({
      ...getRequestContext(req),
      treeId: branch.treeId,
      action: 'SUSTAINABILITY_SUMMARY_VIEWED',
      entityType: 'AutosustentoBranch',
      entityId: branchId,
      metadataJson: getRequestMetadata(req, {
        from: from ?? null,
        to: to ?? null,
        noXpFromFiat: true,
        noAuthorityEffect: true,
      }),
    });

    res.json(summary);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] summary:', error);
    res.status(error.message?.includes('AUTOSUSTENTO') ? 400 : 500).json({ error: error.message || 'Failed to get sustainability summary' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /autosustento-branches/:branchId/sustainability-cycles/calculate
// ─────────────────────────────────────────────────────────────────────────────

export const calculateSustainabilityCycle = async (req: Request, res: Response) => {
  try {
    const branchId = String(req.params.branchId || '');
    assertNoCycleAuthorityEffects(req.body);

    const { prisma } = require('../index');
    const branch = await (prisma as any).branch.findUnique({ where: { id: branchId }, select: { treeId: true } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const userId = await requireAdmin(req, res, branch.treeId);
    if (!userId) return;

    const { periodStart, periodEnd, includeOnlyVerified } = req.body;
    if (!periodStart || !periodEnd) return res.status(400).json({ error: 'periodStart and periodEnd are required' });

    const result = await calculateCycle(branchId, userId, String(periodStart), String(periodEnd), Boolean(includeOnlyVerified));

    void logEvent({
      ...getRequestContext(req),
      treeId: branch.treeId,
      action: result.recalculated ? 'SUSTAINABILITY_CYCLE_RECALCULATED' : 'SUSTAINABILITY_CYCLE_CALCULATED',
      entityType: 'SustainabilityCycle',
      entityId: result.cycle.id,
      afterJson: { surplusFiat: result.cycle.surplusFiat, deficitFiat: result.cycle.deficitFiat, status: result.cycle.status },
      metadataJson: getRequestMetadata(req, {
        branchId,
        periodStart,
        periodEnd,
        noXpFromFiat: true,
        noAuthorityEffect: true,
        surplusIsNotPrivateProfit: true,
      }),
    });

    res.status(result.recalculated ? 200 : 201).json(result);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] calculate:', error);
    res.status(400).json({ error: error.message || 'Failed to calculate sustainability cycle' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /autosustento-branches/:branchId/sustainability-cycles
// ─────────────────────────────────────────────────────────────────────────────

export const listSustainabilityCycles = async (req: Request, res: Response) => {
  try {
    const branchId = String(req.params.branchId || '');
    const { prisma } = require('../index');
    const branch = await (prisma as any).branch.findUnique({ where: { id: branchId }, select: { treeId: true } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const userId = await requireMember(req, res, branch.treeId);
    if (!userId) return;

    const cycles = await listCycles(branchId);
    res.json({ cycles, count: cycles.length });
  } catch (error: any) {
    console.error('[SustainabilitySurplus] list:', error);
    res.status(500).json({ error: error.message || 'Failed to list sustainability cycles' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /sustainability-cycles/:cycleId
// ─────────────────────────────────────────────────────────────────────────────

export const getSustainabilityCycle = async (req: Request, res: Response) => {
  try {
    const cycleId = String(req.params.cycleId || '');
    const loaded = await loadCycleWithAccess(req, res, cycleId);
    if (!loaded) return;
    res.json(loaded.cycle);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] get:', error);
    res.status(500).json({ error: error.message || 'Failed to get cycle' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sustainability-cycles/:cycleId — update notes
// ─────────────────────────────────────────────────────────────────────────────

export const updateSustainabilityCycle = async (req: Request, res: Response) => {
  try {
    const cycleId = String(req.params.cycleId || '');
    const loaded = await loadCycleWithAccess(req, res, cycleId, true);
    if (!loaded) return;
    const { notes } = req.body;
    if (notes === undefined) return res.status(400).json({ error: 'notes field is required' });

    const updated = await updateCycleNotes(cycleId, String(notes));

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.cycle.treeId,
      action: 'SUSTAINABILITY_CYCLE_UPDATED',
      entityType: 'SustainabilityCycle',
      entityId: cycleId,
      metadataJson: getRequestMetadata(req, { noXpFromFiat: true, noAuthorityEffect: true }),
      source: 'ADMIN',
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] update:', error);
    res.status(400).json({ error: error.message || 'Failed to update cycle' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sustainability-cycles/:cycleId/approve
// ─────────────────────────────────────────────────────────────────────────────

export const approveSustainabilityCycle = async (req: Request, res: Response) => {
  try {
    const cycleId = String(req.params.cycleId || '');
    const loaded = await loadCycleWithAccess(req, res, cycleId, true);
    if (!loaded) return;

    const updated = await approveCycle(cycleId, loaded.userId);

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.cycle.treeId,
      action: 'SUSTAINABILITY_CYCLE_APPROVED',
      entityType: 'SustainabilityCycle',
      entityId: cycleId,
      beforeJson: { status: 'CALCULATED' },
      afterJson: { status: 'APPROVED', surplusFiat: updated.surplusFiat, deficitFiat: updated.deficitFiat },
      metadataJson: getRequestMetadata(req, {
        noXpFromFiat: true,
        noAuthorityEffect: true,
        surplusIsNotPrivateProfit: true,
      }),
      source: 'ADMIN',
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] approve:', error);
    res.status(400).json({ error: error.message || 'Failed to approve cycle' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sustainability-cycles/:cycleId/lock
// ─────────────────────────────────────────────────────────────────────────────

export const lockSustainabilityCycle = async (req: Request, res: Response) => {
  try {
    const cycleId = String(req.params.cycleId || '');
    const loaded = await loadCycleWithAccess(req, res, cycleId, true);
    if (!loaded) return;

    const updated = await lockCycle(cycleId, loaded.userId);

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.cycle.treeId,
      action: 'SUSTAINABILITY_CYCLE_LOCKED',
      entityType: 'SustainabilityCycle',
      entityId: cycleId,
      beforeJson: { status: 'APPROVED' },
      afterJson: { status: 'LOCKED' },
      metadataJson: getRequestMetadata(req, { noXpFromFiat: true, noAuthorityEffect: true }),
      source: 'ADMIN',
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] lock:', error);
    res.status(400).json({ error: error.message || 'Failed to lock cycle' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /sustainability-cycles/:cycleId
// ─────────────────────────────────────────────────────────────────────────────

export const deleteSustainabilityCycle = async (req: Request, res: Response) => {
  try {
    const cycleId = String(req.params.cycleId || '');
    const loaded = await loadCycleWithAccess(req, res, cycleId, true);
    if (!loaded) return;

    const result = await deleteCycle(cycleId);

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.cycle.treeId,
      action: 'SUSTAINABILITY_CYCLE_DELETED',
      entityType: 'SustainabilityCycle',
      entityId: cycleId,
      beforeJson: { status: loaded.cycle.status, surplusFiat: loaded.cycle.surplusFiat },
      metadataJson: getRequestMetadata(req, { noXpFromFiat: true, noAuthorityEffect: true }),
      source: 'ADMIN',
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] delete:', error);
    res.status(400).json({ error: error.message || 'Failed to delete cycle' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /sustainability-cycles/:cycleId/allocations
// ─────────────────────────────────────────────────────────────────────────────

export const upsertCycleAllocation = async (req: Request, res: Response) => {
  try {
    const cycleId = String(req.params.cycleId || '');
    const loaded = await loadCycleWithAccess(req, res, cycleId, true);
    if (!loaded) return;
    assertNoCycleAuthorityEffects(req.body);

    const { type, amountFiat, currency, notes } = req.body;
    if (!type || amountFiat === undefined) return res.status(400).json({ error: 'type and amountFiat are required' });

    const allocation = await upsertAllocation(cycleId, type, amountFiat, currency, notes);

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.cycle.treeId,
      action: 'SUSTAINABILITY_ALLOCATION_UPSERTED',
      entityType: 'SustainabilityCycle',
      entityId: cycleId,
      afterJson: { type, amountFiat },
      metadataJson: getRequestMetadata(req, { noXpFromFiat: true, noAuthorityEffect: true }),
      source: 'ADMIN',
    });

    res.json(allocation);
  } catch (error: any) {
    console.error('[SustainabilitySurplus] allocation:', error);
    res.status(400).json({ error: error.message || 'Failed to upsert allocation' });
  }
};
