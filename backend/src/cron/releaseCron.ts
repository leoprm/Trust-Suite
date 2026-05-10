import cron from 'node-cron';
import { prisma } from '../index';
import { releasePayment, refundPayment } from '../services/escrowService';
import { logEvent } from '../services/eventLogService';

// ── Config ─────────────────────────────────────────────────────────────

const DRY_RUN = process.env.CRON_TIERED_RELEASE !== 'true';
const REFLECTION_HOURS = 24;

// ── Helpers ────────────────────────────────────────────────────────────

function hoursAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// ── Main ───────────────────────────────────────────────────────────────

async function runReleaseCron(): Promise<void> {
  const now = new Date();

  console.log(
    `[ReleaseCron] Starting daily settlement run. DRY_RUN=${DRY_RUN}`,
  );

  // 1. Find all PLEDGED payments with a taskId (task payments only)
  const payments = await prisma.memberPayment.findMany({
    where: {
      status: 'PLEDGED',
      taskId: { not: null },
    },
    include: {
      task: { select: { id: true, branchId: true } },
    },
  });

  if (payments.length === 0) {
    console.log('[ReleaseCron] No PLEDGED task payments found. Done.');
    return;
  }

  console.log(`[ReleaseCron] Found ${payments.length} PLEDGED task payments.`);

  let totalProcessed = 0;
  let totalReleased = 0;
  let totalRefunded = 0;
  let totalSkippedNoRating = 0;
  let totalSkippedReflection = 0;
  let totalErrors = 0;

  for (const payment of payments) {
    try {
      const task = payment.task;
      if (!task) {
        console.log(
          `[ReleaseCron] Payment ${payment.id} — task not found, skipping.`,
        );
        continue;
      }

      // 2b. Find branch deliverables
      const deliverables = await prisma.phaseDeliverable.findMany({
        where: { branchId: task.branchId },
        select: { id: true },
      });

      if (deliverables.length === 0) {
        console.log(
          `[ReleaseCron] Payment ${payment.id} — branch ${task.branchId} has no deliverables, skipping.`,
        );
        totalSkippedNoRating++;
        continue;
      }

      const deliverableIds = deliverables.map((d) => d.id);

      // 2c. Find satisfaction ratings for all deliverables in the branch
      const ratings = await prisma.satisfactionRating.findMany({
        where: { deliverableId: { in: deliverableIds } },
        orderBy: { createdAt: 'desc' },
      });

      // 2d. No ratings yet → skip
      if (ratings.length === 0) {
        console.log(
          `[ReleaseCron] Payment ${payment.id} — no ratings yet for branch ${task.branchId}, skipping.`,
        );
        totalSkippedNoRating++;
        continue;
      }

      // 2e. Reflection period: check most recent rating age
      const newestRating = ratings[0];
      const ageHours = hoursAgo(newestRating.createdAt);

      if (ageHours < REFLECTION_HOURS) {
        console.log(
          `[ReleaseCron] Payment ${payment.id} — newest rating is ${ageHours.toFixed(1)}h old (< ${REFLECTION_HOURS}h), skipping.`,
        );
        totalSkippedReflection++;
        continue;
      }

      // Calculate average satisfaction across all ratings
      const satisfactionPct = avg(ratings.map((r) => r.rating));

      console.log(
        `[ReleaseCron] Payment ${payment.id} — branch ${task.branchId}, ` +
          `${ratings.length} ratings, avg=${satisfactionPct.toFixed(1)}%, ` +
          `newest ${ageHours.toFixed(1)}h old`,
      );

      if (DRY_RUN) {
        const action = satisfactionPct >= 20 ? 'RELEASE' : 'REFUND';
        console.log(
          `[ReleaseCron]   DRY RUN — would ${action} payment ${payment.id} (amount=${payment.amount})`,
        );
        totalProcessed++;
        if (satisfactionPct >= 20) totalReleased++;
        else totalRefunded++;
        continue;
      }

      // 2f/2g. Route to escrow
      if (satisfactionPct >= 20) {
        await releasePayment(payment.id);
        totalReleased++;

        void logEvent({
          treeId: payment.treeId,
          action: 'PAYMENT_AUTO_RELEASED',
          entityType: 'MemberPayment',
          entityId: payment.id,
          metadataJson: {
            satisfactionPct: Math.round(satisfactionPct * 100) / 100,
            ratingsCount: ratings.length,
            source: 'releaseCron',
          },
          severity: 'INFO',
          source: 'AUTOMATION',
        });
      } else {
        await refundPayment(payment.id);
        totalRefunded++;

        void logEvent({
          treeId: payment.treeId,
          action: 'PAYMENT_AUTO_REFUNDED',
          entityType: 'MemberPayment',
          entityId: payment.id,
          metadataJson: {
            satisfactionPct: Math.round(satisfactionPct * 100) / 100,
            ratingsCount: ratings.length,
            source: 'releaseCron',
          },
          severity: 'WARNING',
          source: 'AUTOMATION',
        });
      }

      totalProcessed++;
    } catch (err: any) {
      console.error(
        `[ReleaseCron] Error processing payment ${payment.id}:`,
        err.message,
      );
      totalErrors++;
    }
  }

  // 3. Daily report
  console.log(
    `[ReleaseCron] Done. ` +
      `Processed: ${totalProcessed}, ` +
      `Released: ${totalReleased}, ` +
      `Refunded: ${totalRefunded}, ` +
      `Skipped (no rating): ${totalSkippedNoRating}, ` +
      `Skipped (reflection): ${totalSkippedReflection}, ` +
      `Errors: ${totalErrors}`,
  );
}

// ── Scheduler ───────────────────────────────────────────────────────────

export function startReleaseCron(): void {
  // Daily at 03:00 UTC
  cron.schedule('0 3 * * *', () => {
    runReleaseCron().catch((err) =>
      console.error('[ReleaseCron] Cron run failed:', err.message),
    );
  });

  console.log(
    `[ReleaseCron] Scheduled daily at 03:00 UTC (CRON_TIERED_RELEASE=${process.env.CRON_TIERED_RELEASE ?? 'false'}, DRY_RUN=${DRY_RUN}).`,
  );
}
