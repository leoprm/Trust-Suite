import { Request, Response } from 'express';
import { logEvent, getRequestContext, getRequestMetadata } from '../services/eventLogService';
import { getTreeAccess } from '../services/externalNeedService';
import {
  addBerryReward,
  applyMonthlyBerryFlowForTree,
  getBerryBalance,
  getBerryTransactionHistory,
  getOrCreateBerryConfig,
  getTreeBerrySummary,
  getCurrentCycleKey,
  previewMonthlyBerryFlow,
  updateBerryConfig,
} from '../services/berryFlowService';

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireMember(req: Request, res: Response, treeId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return false; }
  const access = await getTreeAccess(userId, treeId, req.user?.role);
  if (!access.isMember) {
    res.status(403).json({ error: 'Tree membership required' });
    return false;
  }
  return true;
}

async function requireAdmin(req: Request, res: Response, treeId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return false; }
  const access = await getTreeAccess(userId, treeId, req.user?.role);
  if (!access.isAdmin) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'BerryConfig',
      entityId: treeId,
      metadataJson: getRequestMetadata(req, { reason: 'berry_admin_required' }),
      severity: 'WARNING',
      source: 'USER',
    });
    res.status(403).json({ error: 'Tree admin required' });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /trees/:treeId/berries/config
// ─────────────────────────────────────────────────────────────────────────────

export async function getBerryConfig(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireMember(req, res, treeId)) return;

  const config = await getOrCreateBerryConfig(treeId);
  return res.json(config);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /trees/:treeId/berries/config
// ─────────────────────────────────────────────────────────────────────────────

export async function putBerryConfig(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireAdmin(req, res, treeId)) return;

  const { berriesEnabled, monthlyFlowRate, monthlyFlowDay, allowP2PTransfers, allowTaskRewards, allowAuditRewards } = req.body;

  try {
    const updated = await updateBerryConfig(treeId, {
      ...(berriesEnabled !== undefined && { berriesEnabled: Boolean(berriesEnabled) }),
      ...(monthlyFlowRate !== undefined && { monthlyFlowRate: Number(monthlyFlowRate) }),
      ...(monthlyFlowDay !== undefined && { monthlyFlowDay: Number(monthlyFlowDay) }),
      ...(allowP2PTransfers !== undefined && { allowP2PTransfers: Boolean(allowP2PTransfers) }),
      ...(allowTaskRewards !== undefined && { allowTaskRewards: Boolean(allowTaskRewards) }),
      ...(allowAuditRewards !== undefined && { allowAuditRewards: Boolean(allowAuditRewards) }),
    }, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /trees/:treeId/berries/me
// ─────────────────────────────────────────────────────────────────────────────

export async function getMyBalance(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireMember(req, res, treeId)) return;

  const userId = req.user!.id;
  const balance = await getBerryBalance(userId, treeId);
  return res.json({
    treeId,
    userId,
    balance: Number(balance.bayasBalance ?? 0),
    lastCycleKey: balance.lastCycleKey ?? null,
    lastBerriesUpdate: balance.lastBerriesUpdate ?? null,
    note: 'Las Berries coordinan circulación interna. No representan fiat ni otorgan XP.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /trees/:treeId/berries/me/monthly-flow-preview
// ─────────────────────────────────────────────────────────────────────────────

export async function getMonthlyFlowPreview(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireMember(req, res, treeId)) return;

  const preview = await previewMonthlyBerryFlow(req.user!.id, treeId);
  return res.json(preview);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /trees/:treeId/berries/me/transactions
// ─────────────────────────────────────────────────────────────────────────────

export async function getMyTransactions(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireMember(req, res, treeId)) return;

  const limit  = Number(req.query.limit  ?? 50);
  const offset = Number(req.query.offset ?? 0);
  const history = await getBerryTransactionHistory(req.user!.id, treeId, limit, offset);
  return res.json(history);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /trees/:treeId/berries/summary  (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function getBerrySummary(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireAdmin(req, res, treeId)) return;

  const summary = await getTreeBerrySummary(treeId);
  return res.json(summary);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /trees/:treeId/berries/apply-monthly-flow  (admin only)
// ─────────────────────────────────────────────────────────────────────────────

export async function applyMonthlyFlow(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireAdmin(req, res, treeId)) return;

  const cycleKey = String(req.body?.cycleKey || getCurrentCycleKey());
  if (!/^\d{4}-\d{2}$/.test(cycleKey)) {
    return res.status(400).json({ error: 'cycleKey must be in YYYY-MM format' });
  }

  try {
    const result = await applyMonthlyBerryFlowForTree(treeId, cycleKey);
    return res.json({
      ...result,
      cycleKey,
      message: result.skipped
        ? `Ciclo ${cycleKey} ya fue aplicado para este Tree.`
        : `Ciclo ${cycleKey} completado: ${result.usersProcessed} usuarios procesados, ${result.totalDestroyed} Berries destruidas.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
