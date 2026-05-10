import cron from 'node-cron';
import { prisma } from '../index';
import { releasePayment, refundPayment, checkQuorum, quorumTimeoutRefund } from '../services/escrowService';
import { logEvent } from '../services/eventLogService';

// ── Config ─────────────────────────────────────────────────────────────

const DRY_RUN = process.env.CRON_TIERED_RELEASE !== 'true';
const REFLECTION_HOURS = 24;
const QUORUM_THRESHOLD = 60;

// ── Helpers ────────────────────────────────────────────────────────────

function hoursAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function daysAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
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
  let totalTimeoutRefunded = 0;
  let totalSkippedNoRating = 0;
  let totalSkippedReflection = 0;
  let totalSkippedNoQuorum = 0;
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

      // 2a. Get branch info (quorumTimeoutDays, deliverables)
      const branch = await prisma.branch.findUnique({
        where: { id: task.branchId },
        select: { id: true, quorumTimeoutDays: true },
      });

      if (!branch) {
        console.log(
          `[ReleaseCron] Payment ${payment.id} — branch ${task.branchId} not found, skipping.`,
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

      // 2d. No ratings yet → check timeout
      if (ratings.length === 0) {
        // Check if timeout has expired
        const timeoutDays = branch.quorumTimeoutDays ?? 30;
        const ageDays = daysAgo(payment.paidAt);

        if (ageDays >= timeoutDays) {
          console.log(
            `[ReleaseCron] Payment ${payment.id} — no ratings and ${ageDays.toFixed(1)}d elapsed (timeout: ${timeoutDays}d), auto-refunding.`,
          );

          if (DRY_RUN) {
            console.log(
              `[ReleaseCron]   DRY RUN — would auto-refund payment ${payment.id} (amount=${payment.amount}) due to quorum timeout`,
            );
            totalTimeoutRefunded++;
            totalProcessed++;
          } else {
            await quorumTimeoutRefund(payment.id, task.branchId);
            totalTimeoutRefunded++;

            void logEvent({
              treeId: payment.treeId,
              action: 'PAYMENT_QUORUM_TIMEOUT_REFUND',
              entityType: 'MemberPayment',
              entityId: payment.id,
              metadataJson: {
                amount: payment.amount,
                ageDays: Math.round(ageDays * 10) / 10,
                timeoutDays,
                reason: 'No ratings after quorum timeout',
                source: 'releaseCron',
              },
              severity: 'WARNING',
              source: 'AUTOMATION',
            });
          }
          totalProcessed++;
        } else {
          console.log(
            `[ReleaseCron] Payment ${payment.id} — no ratings yet, ${ageDays.toFixed(1)}d elapsed (timeout: ${timeoutDays}d), skipping.`,
          );
          totalSkippedNoRating++;
        }
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

      // 2f. Quorum check: ≥60% of evaluators must have rated
      const quorum = await checkQuorum(task.branchId);

      if (!quorum.quorumMet) {
        const timeoutDays = branch.quorumTimeoutDays ?? 30;
        const ageDays = daysAgo(payment.paidAt);

        if (ageDays >= timeoutDays) {
          // Quorum timeout — auto-refund
          console.log(
            `[ReleaseCron] Payment ${payment.id} — quorum not met (${quorum.ratedCount}/${quorum.evaluatorCount}=${quorum.quorumPct}%) and ${ageDays.toFixed(1)}d elapsed (timeout: ${timeoutDays}d), auto-refunding.`,
          );

          if (DRY_RUN) {
            console.log(
              `[ReleaseCron]   DRY RUN — would auto-refund payment ${payment.id} (amount=${payment.amount}) due to quorum timeout`,
            );
            totalTimeoutRefunded++;
            totalProcessed++;
          } else {
            await quorumTimeoutRefund(payment.id, task.branchId);
            totalTimeoutRefunded++;

            void logEvent({
              treeId: payment.treeId,
              action: 'PAYMENT_QUORUM_TIMEOUT_REFUND',
              entityType: 'MemberPayment',
              entityId: payment.id,
              metadataJson: {
                amount: payment.amount,
                quorum,
                ageDays: Math.round(ageDays * 10) / 10,
                timeoutDays,
                reason: 'Quorum not met after timeout',
                source: 'releaseCron',
              },
              severity: 'WARNING',
              source: 'AUTOMATION',
            });
          }
          totalProcessed++;
        } else {
          console.log(
            `[ReleaseCron] Payment ${payment.id} — quorum not met (${quorum.ratedCount}/${quorum.evaluatorCount}=${quorum.quorumPct}%), ` +
              `${ageDays.toFixed(1)}d elapsed (timeout: ${timeoutDays}d), skipping.`,
          );
          totalSkippedNoQuorum++;
        }
        continue;
      }

      // 2g. Quorum met — calculate satisfaction and release
      const satisfactionPct = avg(ratings.map((r) => r.rating));

      console.log(
        `[ReleaseCron] Payment ${payment.id} — branch ${task.branchId}, ` +
          `quorum ${quorum.ratedCount}/${quorum.evaluatorCount}=${quorum.quorumPct}%, ` +
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

      // Route to escrow
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
            quorum,
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
            quorum,
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
      `Timeout-refunded: ${totalTimeoutRefunded}, ` +
      `Skipped (no rating): ${totalSkippedNoRating}, ` +
      `Skipped (reflection): ${totalSkippedReflection}, ` +
      `Skipped (no quorum): ${totalSkippedNoQuorum}, ` +
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
