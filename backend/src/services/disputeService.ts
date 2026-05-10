import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ── 1. freezeFunds (open dispute) ───────────────────────────────────────

export async function freezeFunds(
  paymentId: string,
  reason: string,
  actorId: string,
) {
  const payment = await prisma.memberPayment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PLEDGED' && payment.status !== 'RELEASED') {
    throw new Error(`Cannot dispute payment with status ${payment.status}`);
  }

  // Mark as DISPUTED — funds stay frozen in committedBalance
  await prisma.memberPayment.update({
    where: { id: paymentId },
    data: { status: 'DISPUTED' },
  });

  void logEvent({
    treeId: payment.treeId,
    actorId,
    action: 'DISPUTE_OPENED',
    entityType: 'MemberPayment',
    entityId: paymentId,
    metadataJson: {
      reason,
      previousStatus: payment.status,
      amount: payment.amount,
    },
    severity: 'WARNING',
    source: 'USER',
  });

  return prisma.memberPayment.findUnique({ where: { id: paymentId } });
}

// ── 2. resolveDispute ───────────────────────────────────────────────────

export interface DisputeResolution {
  action: 'release' | 'refund' | 'split';
  splitPct?: number; // required when action = split, 0–100
}

export async function resolveDispute(
  paymentId: string,
  resolution: DisputeResolution,
  actorId: string,
) {
  const payment = await prisma.memberPayment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'DISPUTED') {
    throw new Error(`Payment is not in dispute (status: ${payment.status})`);
  }

  const { action, splitPct } = resolution;

  if (action === 'split') {
    if (splitPct === undefined || splitPct < 0 || splitPct > 100) {
      throw new Error('splitPct must be between 0 and 100 for split action');
    }
  }

  const originalAmount = payment.amount;
  let releasedAmount = 0;
  let refundedAmount = 0;
  let newStatus: 'RELEASED' | 'REFUNDED' = 'RELEASED';

  switch (action) {
    case 'release':
      releasedAmount = originalAmount;
      newStatus = 'RELEASED';
      break;
    case 'refund':
      refundedAmount = originalAmount;
      newStatus = 'REFUNDED';
      break;
    case 'split': {
      const pct = splitPct!;
      releasedAmount = Math.round((originalAmount * pct / 100) * 100) / 100;
      refundedAmount = Math.round((originalAmount - releasedAmount) * 100) / 100;
      newStatus = 'RELEASED';
      break;
    }
  }

  // Update payment status and amounts
  await prisma.memberPayment.update({
    where: { id: paymentId },
    data: {
      status: newStatus,
      releasedAmount,
      refundedAmount,
    },
  });

  // Update treasury: release funds from committedBalance
  if (releasedAmount > 0) {
    await prisma.treeTreasury.update({
      where: { treeId: payment.treeId },
      data: {
        balance: { decrement: releasedAmount },
        committedBalance: { decrement: originalAmount },
      },
    });
  } else {
    // Pure refund: just release the committed funds
    await prisma.treeTreasury.update({
      where: { treeId: payment.treeId },
      data: { committedBalance: { decrement: originalAmount } },
    });
  }

  void logEvent({
    treeId: payment.treeId,
    actorId,
    action: 'DISPUTE_RESOLVED',
    entityType: 'MemberPayment',
    entityId: paymentId,
    metadataJson: {
      action,
      splitPct: action === 'split' ? splitPct : undefined,
      originalAmount,
      releasedAmount,
      refundedAmount,
    },
    severity: 'INFO',
    source: 'USER',
  });

  return prisma.memberPayment.findUnique({ where: { id: paymentId } });
}

// ── 3. getActiveDisputes ────────────────────────────────────────────────

export async function getActiveDisputes(treeId: string) {
  return prisma.memberPayment.findMany({
    where: { treeId, status: 'DISPUTED' },
    include: {
      member: {
        select: {
          userId: true,
          user: { select: { id: true, username: true } },
        },
      },
      task: { select: { id: true, name: true } },
    },
    orderBy: { paidAt: 'desc' },
  });
}

// ── 4. hasActiveDispute (gate for new pledges) ──────────────────────────

export async function hasActiveDispute(treeId: string): Promise<boolean> {
  const count = await prisma.memberPayment.count({
    where: { treeId, status: 'DISPUTED' },
  });
  return count > 0;
}
