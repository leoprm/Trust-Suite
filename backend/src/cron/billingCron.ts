import cron from 'node-cron';
import { prisma } from '../index';

/**
 * Monthly billing cron for Mode 3 — PROPORTIONAL.
 * Runs on the last day of each month at 23:00 UTC.
 *
 * 1. Find all Trees with financingMode=SUBSCRIPCION & subscriptionBillingMode=PROPORTIONAL
 * 2. Sum TreeExpenses for current month
 * 3. Count active members (subscriptionStatus ∈ {ACTIVE, GRACE})
 * 4. Calculate amountPerMember = totalExpenses / activeMembers
 * 5. Generate MemberPayment records (period="YYYY-MM")
 * 6. Update paymentDueDate to next month's billing day
 *
 * MVP: no prorrateo — member pays full month regardless of join/leave date.
 *      Flag `prorrateoActivado` in tree.settings.financing reserved for future.
 */

function isLastDayOfMonth(date: Date): boolean {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getUTCDate() === lastDay;
}

function formatMonth(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function runBillingCron(): Promise<void> {
  const now = new Date();

  if (!isLastDayOfMonth(now)) {
    return; // silently skip — not the last day of the month
  }

  console.log('[BillingCron] Monthly billing started.');
  const currentMonth = formatMonth(now);

  // Find all subscription trees with proportional billing
  const trees = await prisma.tree.findMany({
    where: {
      financingMode: 'SUBSCRIPCION',
      subscriptionBillingMode: 'PROPORTIONAL',
    },
  });

  let totalTrees = 0;
  let totalBilled = 0;
  let totalErrors = 0;
  let totalPayments = 0;

  for (const tree of trees) {
    try {
      // ── a. Sum expenses for current month ──
      const expenseAgg = await prisma.treeExpense.aggregate({
        where: { treeId: tree.id, month: currentMonth },
        _sum: { amount: true },
      });

      const totalExpenses = expenseAgg._sum.amount ?? 0;

      if (totalExpenses <= 0) {
        console.log(`[BillingCron] Tree ${tree.id} — no expenses for ${currentMonth}, skipping.`);
        continue;
      }

      // ── b. Count active members ──
      const activeMembers = await prisma.treeMember.count({
        where: {
          treeId: tree.id,
          subscriptionStatus: { in: ['ACTIVE', 'GRACE'] },
        },
      });

      if (activeMembers === 0) {
        console.log(`[BillingCron] Tree ${tree.id} — no active members, skipping.`);
        continue;
      }

      // ── c. Per-member amount ──
      const amountPerMember = totalExpenses / activeMembers;

      // ── d. Prorrateo flag check (future feature) ──
      let prorrateoActivado = false;
      if (tree.settings) {
        try {
          const settings = JSON.parse(tree.settings);
          prorrateoActivado = settings?.financing?.prorrateoActivado === true;
        } catch {
          // malformed JSON — ignore
        }
      }

      if (prorrateoActivado) {
        console.log(`[BillingCron] Tree ${tree.id} — prorrateoActivado=true but not yet implemented, using flat split.`);
      }

      // ── e. Fetch active members ──
      const members = await prisma.treeMember.findMany({
        where: {
          treeId: tree.id,
          subscriptionStatus: { in: ['ACTIVE', 'GRACE'] },
        },
      });

      // ── f. Calculate next payment due date ──
      const billingDay = tree.subscriptionDayOfMonth ?? 1;
      const nextPaymentDue = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
        billingDay,
      ));

      // ── e + f. Generate payments + update due date ──
      for (const member of members) {
        await prisma.memberPayment.create({
          data: {
            treeId: tree.id,
            memberId: member.id,
            amount: amountPerMember,
            currency: tree.subscriptionCurrency ?? 'CLP',
            period: currentMonth,
          },
        });

        await prisma.treeMember.update({
          where: { id: member.id },
          data: { paymentDueDate: nextPaymentDue },
        });

        totalPayments++;
      }

      totalTrees++;
      totalBilled += totalExpenses;

      console.log(
        `[BillingCron] Tree ${tree.id} ("${tree.name}"): ` +
        `${activeMembers} members × ${amountPerMember.toFixed(2)} ${tree.subscriptionCurrency ?? 'CLP'} ` +
        `= ${totalExpenses.toFixed(2)}`
      );
    } catch (err: any) {
      console.error(`[BillingCron] Error processing tree ${tree.id}:`, err.message);
      totalErrors++;
    }
  }

  console.log(
    `[BillingCron] Done. Trees processed: ${totalTrees}, ` +
    `Total billed: ${totalBilled.toFixed(2)}, ` +
    `Payments generated: ${totalPayments}, ` +
    `Errors: ${totalErrors}`
  );
}

/**
 * Start the monthly billing cron.
 * Called from index.ts on server start.
 */
export function startBillingCron(): void {
  // Fire on days 28–31 at 23:00 UTC; isLastDayOfMonth() gates actual execution
  cron.schedule('0 23 28-31 * *', () => {
    runBillingCron().catch(err =>
      console.error('[BillingCron] Cron run failed:', err.message)
    );
  });

  console.log('[BillingCron] Monthly billing cron scheduled (last day of month, 23:00 UTC).');
}
