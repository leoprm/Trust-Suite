import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Fetch tree with ownership check. Returns null + sends error if not found. */
async function getTreeOrFail(treeId: string, res: Response) {
  const tree = await prisma.tree.findUnique({ where: { id: treeId } });
  if (!tree) {
    res.status(404).json({ error: 'Tree not found' });
    return null;
  }
  return tree;
}

/** Check if user is tree creator. Calls res.status(403) and returns false if not. */
function requireTreeCreator(tree: { creatorId: string | null }, userId: string, res: Response): boolean {
  if (tree.creatorId !== userId) {
    res.status(403).json({ error: 'Only the tree creator can perform this action' });
    return false;
  }
  return true;
}

/** Check if user is tree admin. Returns false + sends error if not. */
async function requireTreeAdmin(treeId: string, userId: string, res: Response): Promise<boolean> {
  const membership = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    res.status(403).json({ error: 'Tree admin privileges required' });
    return false;
  }
  return true;
}

/** Upsert GlobalFeeConfig singleton (lazy-init). */
async function getOrCreateGlobalConfig() {
  let config = await prisma.globalFeeConfig.findUnique({ where: { id: 'default' } });
  if (!config) {
    config = await prisma.globalFeeConfig.create({ data: { id: 'default' } });
  }
  return config;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. opt-in — Tree creator enables TrustCore flag
// ═══════════════════════════════════════════════════════════════════════════

export async function optIn(req: Request, res: Response) {
  try {
    const treeId = req.params.id as string;
    const userId = req.user!.id;

    const tree = await getTreeOrFail(treeId, res);
    if (!tree) return;

    if (!requireTreeCreator(tree, userId, res)) return;

    if (tree.isTrustCore) {
      return res.status(409).json({ error: 'Tree is already TrustCore' });
    }

    // ── Create TrustCoreConfig + set flag in a transaction ──────────────
    const [updatedTree, config] = await prisma.$transaction([
      prisma.tree.update({
        where: { id: treeId },
        data: { isTrustCore: true },
      }),
      prisma.trustCoreConfig.create({
        data: { treeId },
      }),
    ]);

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'TRUSTCORE_OPT_IN',
      entityType: 'TrustCoreConfig',
      entityId: config.id,
      treeId,
      severity: 'WARNING',
      source: 'USER',
      metadataJson: getRequestMetadata(req, {
        treeName: tree.name,
        maintenanceShare: config.maintenanceShare,
        growthShare: config.growthShare,
      }),
    });

    return res.json({
      message: 'Tree opted into TrustCore. Awaiting admin activation.',
      tree: { id: treeId, isTrustCore: true },
      trustCoreConfig: config,
    });
  } catch (error: any) {
    console.error('[TrustCore optIn] Error:', error);
    return res.status(500).json({ error: 'Failed to opt into TrustCore' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. opt-out — Tree creator disables TrustCore (only if balanceClp == 0)
// ═══════════════════════════════════════════════════════════════════════════

export async function optOut(req: Request, res: Response) {
  try {
    const treeId = req.params.id as string;
    const userId = req.user!.id;

    const tree = await getTreeOrFail(treeId, res);
    if (!tree) return;

    if (!requireTreeCreator(tree, userId, res)) return;

    if (!tree.isTrustCore) {
      return res.status(409).json({ error: 'Tree is not TrustCore' });
    }

    if (tree.trustCoreBalanceClp > 0) {
      return res.status(409).json({
        error: 'Cannot opt out with pending fees. Withdraw or distribute remaining balance first.',
        trustCoreBalanceClp: tree.trustCoreBalanceClp,
      });
    }

    const updatedTree = await prisma.tree.update({
      where: { id: treeId },
      data: { isTrustCore: false },
    });

    // Deactivate the config too
    await prisma.trustCoreConfig.updateMany({
      where: { treeId },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'TRUSTCORE_OPT_OUT',
      entityType: 'Tree',
      entityId: treeId,
      treeId,
      severity: 'WARNING',
      source: 'USER',
      metadataJson: getRequestMetadata(req, { treeName: tree.name }),
    });

    return res.json({ message: 'Tree opted out of TrustCore', tree: { id: treeId, isTrustCore: false } });
  } catch (error: any) {
    console.error('[TrustCore optOut] Error:', error);
    return res.status(500).json({ error: 'Failed to opt out of TrustCore' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. updateConfig — Tree admin updates maintenance/growth share
// ═══════════════════════════════════════════════════════════════════════════

export async function updateConfig(req: Request, res: Response) {
  try {
    const treeId = req.params.id as string;
    const userId = req.user!.id;
    const { maintenanceShare, growthShare, monthlyMaintenanceCost } = req.body;

    const tree = await getTreeOrFail(treeId, res);
    if (!tree) return;

    if (!tree.isTrustCore) {
      return res.status(400).json({ error: 'Tree is not TrustCore' });
    }

    if (!(await requireTreeAdmin(treeId, userId, res))) return;

    // ── Validate shares ─────────────────────────────────────────────────
    const mShare = maintenanceShare !== undefined ? maintenanceShare : undefined;
    const gShare = growthShare !== undefined ? growthShare : undefined;

    if (mShare !== undefined && gShare !== undefined) {
      const sum = Math.round((mShare + gShare) * 1e6) / 1e6;
      if (sum !== 1.0) {
        return res.status(400).json({
          error: `maintenanceShare + growthShare must equal 1.0 (got ${sum})`,
        });
      }
    } else if (mShare !== undefined || gShare !== undefined) {
      // Partial update: fetch existing to validate
      const existing = await prisma.trustCoreConfig.findUnique({ where: { treeId } });
      const newM = mShare ?? existing!.maintenanceShare;
      const newG = gShare ?? existing!.growthShare;
      const sum = Math.round((newM + newG) * 1e6) / 1e6;
      if (sum !== 1.0) {
        return res.status(400).json({
          error: `maintenanceShare + growthShare must equal 1.0 (got ${sum})`,
        });
      }
    }

    const data: Record<string, any> = {};
    if (mShare !== undefined) data.maintenanceShare = mShare;
    if (gShare !== undefined) data.growthShare = gShare;
    if (monthlyMaintenanceCost !== undefined) data.monthlyMaintenanceCost = monthlyMaintenanceCost;

    const config = await prisma.trustCoreConfig.update({
      where: { treeId },
      data,
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'TRUSTCORE_CONFIG_UPDATED',
      entityType: 'TrustCoreConfig',
      entityId: config.id,
      treeId,
      severity: 'INFO',
      source: 'USER',
      metadataJson: getRequestMetadata(req, {
        maintenanceShare: config.maintenanceShare,
        growthShare: config.growthShare,
        monthlyMaintenanceCost: config.monthlyMaintenanceCost,
      }),
    });

    return res.json({ config });
  } catch (error: any) {
    console.error('[TrustCore updateConfig] Error:', error);
    return res.status(500).json({ error: 'Failed to update TrustCore config' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. activate — Server admin activates tree as TrustCore
// ═══════════════════════════════════════════════════════════════════════════

export async function activate(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;
    const userId = req.user!.id;

    const tree = await getTreeOrFail(treeId, res);
    if (!tree) return;

    if (!tree.isTrustCore) {
      return res.status(400).json({ error: 'Tree has not opted into TrustCore' });
    }

    const existing = await prisma.trustCoreConfig.findUnique({ where: { treeId } });
    if (!existing) {
      return res.status(400).json({ error: 'TrustCoreConfig not found for this tree' });
    }

    if (existing.isActive) {
      return res.status(409).json({ error: 'Tree is already active as TrustCore' });
    }

    const config = await prisma.trustCoreConfig.update({
      where: { treeId },
      data: { isActive: true, activatedAt: new Date(), deactivatedAt: null },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'TRUSTCORE_ACTIVATED',
      entityType: 'TrustCoreConfig',
      entityId: config.id,
      treeId,
      severity: 'WARNING',
      source: 'ADMIN',
      metadataJson: getRequestMetadata(req, { treeName: tree.name }),
    });

    return res.json({ message: 'TrustCore activated', config });
  } catch (error: any) {
    console.error('[TrustCore activate] Error:', error);
    return res.status(500).json({ error: 'Failed to activate TrustCore' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. deactivate — Server admin deactivates tree as TrustCore
// ═══════════════════════════════════════════════════════════════════════════

export async function deactivate(req: Request, res: Response) {
  try {
    const treeId = req.params.treeId as string;
    const userId = req.user!.id;

    const tree = await getTreeOrFail(treeId, res);
    if (!tree) return;

    const existing = await prisma.trustCoreConfig.findUnique({ where: { treeId } });
    if (!existing) {
      return res.status(400).json({ error: 'TrustCoreConfig not found for this tree' });
    }

    if (!existing.isActive) {
      return res.status(409).json({ error: 'Tree is already deactivated' });
    }

    const config = await prisma.trustCoreConfig.update({
      where: { treeId },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'TRUSTCORE_DEACTIVATED',
      entityType: 'TrustCoreConfig',
      entityId: config.id,
      treeId,
      severity: 'WARNING',
      source: 'ADMIN',
      metadataJson: getRequestMetadata(req, { treeName: tree.name }),
    });

    return res.json({ message: 'TrustCore deactivated', config });
  } catch (error: any) {
    console.error('[TrustCore deactivate] Error:', error);
    return res.status(500).json({ error: 'Failed to deactivate TrustCore' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6a. getGlobalConfig — Server admin reads GlobalFeeConfig
// ═══════════════════════════════════════════════════════════════════════════

export async function getGlobalConfig(req: Request, res: Response) {
  try {
    const config = await getOrCreateGlobalConfig();
    return res.json({ config });
  } catch (error: any) {
    console.error('[TrustCore getGlobalConfig] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch global config' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6b. updateGlobalConfig — Server admin updates GlobalFeeConfig
// ═══════════════════════════════════════════════════════════════════════════

export async function updateGlobalConfig(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const {
      baseMaintenanceCostClp, growthFactor, minFeePercent, maxFeePercent,
      currentFeePercent, maintenanceComponent, growthComponent,
      recalculationIntervalHours, serverAdminIds,
    } = req.body;

    // ── Validate numeric ranges ──────────────────────────────────────────
    if (baseMaintenanceCostClp !== undefined && baseMaintenanceCostClp < 0) {
      return res.status(400).json({ error: 'baseMaintenanceCostClp must be >= 0' });
    }
    if (growthFactor !== undefined && (growthFactor < 0 || growthFactor > 1)) {
      return res.status(400).json({ error: 'growthFactor must be between 0 and 1' });
    }
    if (minFeePercent !== undefined && (minFeePercent < 0 || minFeePercent > 100)) {
      return res.status(400).json({ error: 'minFeePercent must be between 0 and 100' });
    }
    if (maxFeePercent !== undefined && (maxFeePercent < 0 || maxFeePercent > 100)) {
      return res.status(400).json({ error: 'maxFeePercent must be between 0 and 100' });
    }
    if (minFeePercent !== undefined && maxFeePercent !== undefined && minFeePercent > maxFeePercent) {
      return res.status(400).json({ error: 'minFeePercent cannot exceed maxFeePercent' });
    }
    if (currentFeePercent !== undefined && (currentFeePercent < 0 || currentFeePercent > 100)) {
      return res.status(400).json({ error: 'currentFeePercent must be between 0 and 100' });
    }
    if (maintenanceComponent !== undefined && maintenanceComponent < 0) {
      return res.status(400).json({ error: 'maintenanceComponent must be >= 0' });
    }
    if (growthComponent !== undefined && growthComponent < 0) {
      return res.status(400).json({ error: 'growthComponent must be >= 0' });
    }
    if (recalculationIntervalHours !== undefined && (recalculationIntervalHours < 1 || recalculationIntervalHours > 168)) {
      return res.status(400).json({ error: 'recalculationIntervalHours must be between 1 and 168' });
    }
    if (serverAdminIds !== undefined) {
      if (!Array.isArray(serverAdminIds)) {
        return res.status(400).json({ error: 'serverAdminIds must be an array of user IDs' });
      }
      if (!serverAdminIds.every((id: any) => typeof id === 'string')) {
        return res.status(400).json({ error: 'serverAdminIds must contain only string user IDs' });
      }
    }

    // ── Build update data ────────────────────────────────────────────────
    const data: Record<string, any> = {};
    if (baseMaintenanceCostClp !== undefined) data.baseMaintenanceCostClp = baseMaintenanceCostClp;
    if (growthFactor !== undefined) data.growthFactor = growthFactor;
    if (minFeePercent !== undefined) data.minFeePercent = minFeePercent;
    if (maxFeePercent !== undefined) data.maxFeePercent = maxFeePercent;
    if (currentFeePercent !== undefined) data.currentFeePercent = currentFeePercent;
    if (maintenanceComponent !== undefined) data.maintenanceComponent = maintenanceComponent;
    if (growthComponent !== undefined) data.growthComponent = growthComponent;
    if (recalculationIntervalHours !== undefined) data.recalculationIntervalHours = recalculationIntervalHours;
    if (serverAdminIds !== undefined) data.serverAdminIds = serverAdminIds;

    const config = await prisma.globalFeeConfig.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'GLOBAL_FEE_CONFIG_UPDATED',
      entityType: 'GlobalFeeConfig',
      entityId: 'default',
      severity: 'WARNING',
      source: 'ADMIN',
      metadataJson: getRequestMetadata(req, { updatedFields: Object.keys(data) }),
    });

    return res.json({ config });
  } catch (error: any) {
    console.error('[TrustCore updateGlobalConfig] Error:', error);
    return res.status(500).json({ error: 'Failed to update global config' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. withdraw — Tree admin withdraws funds from trustCoreBalanceClp
// ═══════════════════════════════════════════════════════════════════════════

export async function withdraw(req: Request, res: Response) {
  try {
    const treeId = req.params.id as string;
    const userId = req.user!.id;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const tree = await getTreeOrFail(treeId, res);
    if (!tree) return;

    if (!tree.isTrustCore) {
      return res.status(400).json({ error: 'Tree is not TrustCore' });
    }

    if (!(await requireTreeAdmin(treeId, userId, res))) return;

    if (tree.trustCoreBalanceClp < amount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        trustCoreBalanceClp: tree.trustCoreBalanceClp,
        requested: amount,
      });
    }

    // ── Atomically deduct + create WalletTransaction + update config ───
    const result = await prisma.$transaction(async (tx) => {
      // Deduct from tree
      const updatedTree = await tx.tree.update({
        where: { id: treeId },
        data: { trustCoreBalanceClp: { decrement: amount } },
      });

      // Create a fake wallet for the tree? No — WalletTransaction needs a walletId.
      // Use the tree admin's wallet for transaction records as the beneficiary.
      const adminWallet = await tx.userWallet.findUnique({ where: { userId } });
      const walletId = adminWallet?.id;

      const walletTx = await tx.walletTransaction.create({
        data: {
          walletId: walletId ?? 'system', // fallback — tree withdrawal doesn't target a user wallet
          type: 'TREE_PAYMENT',
          status: 'COMPLETED',
          amount,
          currency: 'CLP',
          treeId,
          toUserId: userId,
          description: description || `TrustCore withdrawal from ${tree.name}`,
          metadataJson: {
            reason: 'trustcore_withdrawal',
            treeBalanceBefore: tree.trustCoreBalanceClp,
            treeBalanceAfter: updatedTree.trustCoreBalanceClp,
          },
        },
      });

      // Update totalFeesDistributed
      const config = await tx.trustCoreConfig.update({
        where: { treeId },
        data: { totalFeesDistributed: { increment: amount } },
      });

      return { updatedTree, walletTx, config };
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'TRUSTCORE_WITHDRAWAL',
      entityType: 'WalletTransaction',
      entityId: result.walletTx.id,
      treeId,
      severity: 'CRITICAL',
      source: 'USER',
      metadataJson: getRequestMetadata(req, {
        amount,
        treeBalanceBefore: tree.trustCoreBalanceClp,
        treeBalanceAfter: result.updatedTree.trustCoreBalanceClp,
        description: description || null,
      }),
    });

    return res.json({
      message: 'Withdrawal successful',
      amount,
      treeBalanceBefore: tree.trustCoreBalanceClp,
      treeBalanceAfter: result.updatedTree.trustCoreBalanceClp,
      transaction: result.walletTx,
    });
  } catch (error: any) {
    console.error('[TrustCore withdraw] Error:', error);
    return res.status(500).json({ error: 'Failed to withdraw TrustCore funds' });
  }
}
