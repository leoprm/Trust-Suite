import { prisma } from '../index';
import { calculateFeePercent } from '../utils/feeEngine';
import { logEvent } from '../services/eventLogService';

/**
 * Cron: Recalculate the dynamic TrustCore fee.
 *
 * Runs every recalculationIntervalHours (default 6h).
 * Queries system metrics, calculates the new fee, updates GlobalFeeConfig,
 * and logs FEE_RECALCULATED.
 */
export async function runFeeRecalculation(): Promise<void> {
  console.log('[FeeRecalculation] Starting fee recalculation...');

  try {
    // 1. Load current config
    const config = await prisma.globalFeeConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config) {
      console.error('[FeeRecalculation] GlobalFeeConfig not found — skipping.');
      return;
    }

    const beforeSnapshot = {
      currentFeePercent: config.currentFeePercent,
      maintenanceComponent: config.maintenanceComponent,
      growthComponent: config.growthComponent,
      totalActiveUsers: config.totalActiveUsers,
      totalMonthlyVolumeClp: config.totalMonthlyVolumeClp,
      totalActiveTrees: config.totalActiveTrees,
      totalTrustCoreTrees: config.totalTrustCoreTrees,
    };

    // 2. Query system metrics
    const activeUsers = await prisma.user.count({
      where: { is_onboarded: true },
    });

    // Monthly volume: sum of completed P2P transfer amounts (last 30 days, CLP only)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const volumeResult = await prisma.walletTransaction.aggregate({
      _sum: { amount: true },
      where: {
        type: { in: ['P2P_TRANSFER', 'P2P_TRANSFER_OUT'] },
        currency: 'CLP',
        status: 'COMPLETED',
        createdAt: { gte: thirtyDaysAgo },
      },
    });
    const monthlyVolume = volumeResult._sum.amount ?? 0;

    const activeTrees = await prisma.tree.count();
    const trustCoreTrees = await prisma.tree.count({
      where: {
        isTrustCore: true,
        trustCoreConfig: { isActive: true },
      },
    });

    // 3. Calculate the new fee
    const breakdown = calculateFeePercent(
      {
        baseMaintenanceCostClp: config.baseMaintenanceCostClp,
        growthFactor: config.growthFactor,
        minFeePercent: config.minFeePercent,
        maxFeePercent: config.maxFeePercent,
      },
      monthlyVolume,
      activeUsers,
    );

    // 4. Update GlobalFeeConfig with new values + metrics snapshot
    const updated = await prisma.globalFeeConfig.update({
      where: { id: 'default' },
      data: {
        currentFeePercent: breakdown.feePercent,
        maintenanceComponent: breakdown.maintenanceComponent,
        growthComponent: breakdown.growthComponent,
        totalActiveUsers: activeUsers,
        totalMonthlyVolumeClp: monthlyVolume,
        totalActiveTrees: activeTrees,
        totalTrustCoreTrees: trustCoreTrees,
        lastRecalculatedAt: new Date(),
        systemMetricsUpdatedAt: new Date(),
      },
    });

    // 5. Log EventLog FEE_RECALCULATED
    await logEvent({
      action: 'FEE_RECALCULATED',
      entityType: 'GlobalFeeConfig',
      entityId: config.id,
      actorId: null,
      treeId: null,
      source: 'AUTOMATION',
      severity: 'INFO',
      beforeJson: beforeSnapshot,
      afterJson: {
        currentFeePercent: updated.currentFeePercent,
        maintenanceComponent: updated.maintenanceComponent,
        growthComponent: updated.growthComponent,
        totalActiveUsers: updated.totalActiveUsers,
        totalMonthlyVolumeClp: updated.totalMonthlyVolumeClp,
        totalActiveTrees: updated.totalActiveTrees,
        totalTrustCoreTrees: updated.totalTrustCoreTrees,
      },
      metadataJson: {
        reason: 'Scheduled recalculation',
        intervalHours: config.recalculationIntervalHours,
      },
    });

    console.log(
      `[FeeRecalculation] Done. Fee: ${breakdown.feePercent}% ` +
      `(maintenance=${breakdown.maintenanceComponent} growth=${breakdown.growthComponent}) | ` +
      `Users=${activeUsers} Volume=${monthlyVolume} Trees=${trustCoreTrees}/${activeTrees}`,
    );
  } catch (err: any) {
    console.error('[FeeRecalculation] Error:', err.message);
  }
}

/**
 * Start the fee recalculation cron.
 * Runs every recalculationIntervalHours (default 6h). Interval is re-read from
 * GlobalFeeConfig on each tick so admin changes take effect next cycle.
 */
export function startFeeRecalculationCron(): void {
  const DEFAULT_INTERVAL_HOURS = 6;

  // Defer first run to let prisma initialize (circular import safety)
  setTimeout(() => {
    runFeeRecalculation().catch(err =>
      console.error('[FeeRecalculation] Initial run failed:', err.message),
    );

    // Schedule recurring runs — re-reads interval from DB each cycle
    const scheduleNext = () => {
      prisma.globalFeeConfig
        .findUnique({ where: { id: 'default' } })
        .then(cfg => {
          const hours = cfg?.recalculationIntervalHours ?? DEFAULT_INTERVAL_HOURS;
          const ms = hours * 60 * 60 * 1000;
          console.log(`[FeeRecalculation] Next run in ${hours}h.`);
          setTimeout(() => {
            runFeeRecalculation().catch(err =>
              console.error('[FeeRecalculation] Run failed:', err.message),
            );
            scheduleNext();
          }, ms);
        })
        .catch(err => {
          console.error('[FeeRecalculation] Failed to read config for scheduling:', err.message);
          setTimeout(scheduleNext, DEFAULT_INTERVAL_HOURS * 60 * 60 * 1000);
        });
    };

    // Read current interval from DB, then start chain
    prisma.globalFeeConfig
      .findUnique({ where: { id: 'default' } })
      .then(cfg => {
        const hours = cfg?.recalculationIntervalHours ?? DEFAULT_INTERVAL_HOURS;
        setTimeout(scheduleNext, hours * 60 * 60 * 1000);
      })
      .catch(() => {
        setTimeout(scheduleNext, DEFAULT_INTERVAL_HOURS * 60 * 60 * 1000);
      });
  }, 5000); // 5s delay for prisma init
}
