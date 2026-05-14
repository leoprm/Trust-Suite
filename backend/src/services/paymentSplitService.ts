/**
 * Payment Split Service
 *
 * Handles distribution of task budgets when a task is paid:
 *   - 20% to the need creator (via their TreeMember)
 *   - 80% to the task executor (via their TreeMember)
 *
 * Flow:
 *   1. Look up task + need + both TreeMembers
 *   2. Calculate split amounts
 *   3. Create PaymentSplit records
 *   4. For each recipient with Stripe Connect: create Stripe Transfer → availableBalance
 *   5. For recipients without Stripe Connect: accumulate in pendingBalance
 *
 * Triggered after task verification (VERIFIED → PAID).
 */

import Stripe from 'stripe';
import { prisma } from '../index';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';

let _stripe: Stripe | null = null;
function stripeClient(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET, {
      apiVersion: '2025-03-31.basil' as any,
    });
  }
  return _stripe;
}

// ── Split ratios ──────────────────────────────────────────────────────────────

const CREATOR_PERCENTAGE = 20;
const EXECUTOR_PERCENTAGE = 80;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SplitEntry {
  memberId: string;
  memberUserId: string;
  reason: 'need_creator' | 'task_executor';
  percentage: number;
  amountClp: number;
  stripeAccountId: string | null;
  hasStripeConnect: boolean;
}

interface SplitResult {
  taskId: string;
  budget: number;
  splits: {
    memberId: string;
    reason: string;
    percentage: number;
    amountClp: number;
    destination: 'available' | 'pending';
    stripeTransferId?: string;
  }[];
  errors: string[];
}

// ── Main: process payment split for a task ────────────────────────────────────

export async function processTaskPayment(taskId: string): Promise<SplitResult> {
  const errors: string[] = [];

  // 1. Fetch task with need, creator, and assignee
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      need: {
        include: {
          creator: {
            include: { memberships: { where: { status: 'ACTIVE' }, take: 1 } },
          },
        },
      },
      assignee: {
        include: { memberships: { where: { status: 'ACTIVE' }, take: 1 } },
      },
    },
  });

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const budget = task.budget || 0;
  if (budget <= 0) {
    return {
      taskId,
      budget: 0,
      splits: [],
      errors: ['Task has no budget — nothing to split'],
    };
  }

  // 2. Identify need creator's TreeMember and task executor's TreeMember
  const treeId = task.treeId;

  const needCreator = task.need?.creator;
  const taskExecutor = task.assignee;

  if (!needCreator) {
    return {
      taskId,
      budget,
      splits: [],
      errors: ['Need has no creator — cannot calculate split'],
    };
  }

  // Find TreeMember for need creator
  let creatorMember = needCreator.memberships?.[0] || null;
  if (!creatorMember && needCreator.id) {
    creatorMember = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: needCreator.id, treeId } },
      include: { balance: true },
    });
  } else if (creatorMember) {
    creatorMember = await prisma.treeMember.findUnique({
      where: { id: creatorMember.id },
      include: { balance: true },
    });
  }

  // Find TreeMember for task executor
  let executorMember: any = null;
  if (taskExecutor) {
    executorMember = taskExecutor.memberships?.[0] || null;
    if (!executorMember && taskExecutor.id) {
      executorMember = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: taskExecutor.id, treeId } },
        include: { balance: true },
      });
    } else if (executorMember) {
      executorMember = await prisma.treeMember.findUnique({
        where: { id: executorMember.id },
        include: { balance: true },
      });
    }
  }

  // 3. Build split entries
  const entries: SplitEntry[] = [];

  // Creator gets 20%
  if (creatorMember) {
    entries.push({
      memberId: creatorMember.id,
      memberUserId: needCreator.id,
      reason: 'need_creator',
      percentage: CREATOR_PERCENTAGE,
      amountClp: Math.round(budget * CREATOR_PERCENTAGE / 100),
      stripeAccountId: creatorMember.balance?.stripeAccountId || null,
      hasStripeConnect: !!(creatorMember.balance?.stripeAccountId),
    });
  } else {
    errors.push('Need creator is not a member of this tree — creator split skipped');
  }

  // Executor gets 80%
  if (executorMember) {
    entries.push({
      memberId: executorMember.id,
      memberUserId: taskExecutor!.id,
      reason: 'task_executor',
      percentage: EXECUTOR_PERCENTAGE,
      amountClp: Math.round(budget * EXECUTOR_PERCENTAGE / 100),
      stripeAccountId: executorMember.balance?.stripeAccountId || null,
      hasStripeConnect: !!(executorMember.balance?.stripeAccountId),
    });
  } else {
    // If no executor assigned, executor portion goes to need creator too
    errors.push('Task has no assignee — executor split skipped');
  }

  // 4. Process each split entry
  const splitResults: SplitResult['splits'] = [];

  for (const entry of entries) {
    // Create PaymentSplit record
    await prisma.paymentSplit.create({
      data: {
        needId: task.needId,
        memberId: entry.memberId,
        percentage: entry.percentage,
        reason: entry.reason,
      },
    });

    // Ensure MemberBalance exists
    let balance = await prisma.memberBalance.findUnique({
      where: { memberId: entry.memberId },
    });
    if (!balance) {
      balance = await prisma.memberBalance.create({
        data: {
          memberId: entry.memberId,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
    }

    // 5. Stripe Transfer or pendingBalance
    if (entry.hasStripeConnect && entry.stripeAccountId) {
      try {
        // Create Stripe Transfer to connected account
        // Amount is in CLP — Stripe requires the smallest currency unit.
        // CLP has no decimal subunit, so amount is the same.
        const transfer = await stripeClient().transfers.create({
          amount: entry.amountClp,
          currency: 'clp',
          destination: entry.stripeAccountId,
          description: `Task ${taskId} — ${entry.reason} split (${entry.percentage}%)`,
          metadata: {
            taskId,
            needId: task.needId,
            reason: entry.reason,
            memberId: entry.memberId,
          },
        });

        // Update availableBalance
        await prisma.memberBalance.update({
          where: { memberId: entry.memberId },
          data: { availableBalance: { increment: entry.amountClp } },
        });

        splitResults.push({
          memberId: entry.memberId,
          reason: entry.reason,
          percentage: entry.percentage,
          amountClp: entry.amountClp,
          destination: 'available',
          stripeTransferId: transfer.id,
        });

        console.log(
          `[paymentSplit] Stripe transfer ${transfer.id}: ${entry.amountClp} CLP → member ${entry.memberId} (${entry.reason})`,
        );
      } catch (stripeErr: any) {
        // Stripe transfer failed — accumulate in pendingBalance
        console.error(
          `[paymentSplit] Stripe transfer failed for member ${entry.memberId}: ${stripeErr.message}`,
        );

        await prisma.memberBalance.update({
          where: { memberId: entry.memberId },
          data: { pendingBalance: { increment: entry.amountClp } },
        });

        splitResults.push({
          memberId: entry.memberId,
          reason: entry.reason,
          percentage: entry.percentage,
          amountClp: entry.amountClp,
          destination: 'pending',
        });

        errors.push(
          `Stripe transfer failed for ${entry.reason} (member ${entry.memberId}): ${stripeErr.message}. Accumulated in pendingBalance.`,
        );
      }
    } else {
      // No Stripe Connect — accumulate in pendingBalance
      await prisma.memberBalance.update({
        where: { memberId: entry.memberId },
        data: { pendingBalance: { increment: entry.amountClp } },
      });

      splitResults.push({
        memberId: entry.memberId,
        reason: entry.reason,
        percentage: entry.percentage,
        amountClp: entry.amountClp,
        destination: 'pending',
      });

      console.log(
        `[paymentSplit] No Stripe Connect for member ${entry.memberId} — ${entry.amountClp} CLP → pendingBalance (${entry.reason})`,
      );
    }
  }

  return {
    taskId,
    budget,
    splits: splitResults,
    errors,
  };
}

/**
 * Calculate and return the expected split breakdown without executing.
 * Used for preview before actual payment.
 */
export async function previewTaskSplit(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      need: { include: { creator: true } },
      assignee: true,
    },
  });

  if (!task) throw new Error(`Task ${taskId} not found`);

  const budget = task.budget || 0;
  const creatorAmount = Math.round(budget * CREATOR_PERCENTAGE / 100);
  const executorAmount = Math.round(budget * EXECUTOR_PERCENTAGE / 100);

  return {
    taskId,
    budget,
    splits: [
      {
        reason: 'need_creator',
        percentage: CREATOR_PERCENTAGE,
        amountClp: creatorAmount,
        recipient: task.need?.creator?.username || 'unknown',
      },
      {
        reason: 'task_executor',
        percentage: EXECUTOR_PERCENTAGE,
        amountClp: executorAmount,
        recipient: task.assignee?.username || 'unassigned',
      },
    ],
  };
}
