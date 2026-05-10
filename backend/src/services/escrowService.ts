import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ── Types ──────────────────────────────────────────────────────────────

export interface SatisfactionTier {
  min: number;
  max: number;
  releasePct: number;
}

export interface ReleaseResult {
  releasedAmount: number;
  refundedAmount: number;
}

export interface QuorumStatus {
  quorumMet: boolean;
  evaluatorCount: number;
  ratedCount: number;
  quorumPct: number;
  threshold: number; // 60
}

// ── Default satisfaction tiers ─────────────────────────────────────────

const DEFAULT_SATISFACTION_TIERS: SatisfactionTier[] = [
  { min: 0, max: 20, releasePct: 0 },
  { min: 20, max: 40, releasePct: 30 },
  { min: 40, max: 60, releasePct: 50 },
  { min: 60, max: 80, releasePct: 75 },
  { min: 80, max: 100, releasePct: 100 },
];

const QUORUM_THRESHOLD = 60; // ≥60% of evaluators must have rated

// ── 1. pledgePayment ───────────────────────────────────────────────────

export async function pledgePayment(
  treeId: string,
  memberId: string,
  amount: number,
  taskId: string,
) {
  if (amount <= 0) throw new Error('Pledge amount must be positive');

  // Verify member exists and has funds or active subscription
  const member = await prisma.treeMember.findUnique({ where: { id: memberId } });
  if (!member || member.treeId !== treeId) {
    throw new Error('Member not found in this tree');
  }
  if (!member.isPayingMember && member.subscriptionStatus !== 'ACTIVE') {
    throw new Error('Member must have an active subscription to pledge funds');
  }

  // Verify task exists and belongs to this tree
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { branch: { select: { treeId: true } } },
  });
  if (!task) throw new Error('Task not found');
  if (task.branch.treeId !== treeId) {
    throw new Error('Task does not belong to this tree');
  }

  // Ensure treasury exists
  await prisma.treeTreasury.upsert({
    where: { treeId },
    create: { treeId, balance: 0, committedBalance: 0 },
    update: {},
  });

  const period = new Date().toISOString().slice(0, 7);

  const payment = await prisma.memberPayment.create({
    data: {
      treeId,
      memberId,
      amount,
      taskId,
      period,
      status: 'PLEDGED',
    },
  });

  // Update committedBalance
  await prisma.treeTreasury.update({
    where: { treeId },
    data: { committedBalance: { increment: amount } },
  });

  void logEvent({
    treeId,
    actorId: member.userId,
    action: 'PAYMENT_PLEDGED',
    entityType: 'MemberPayment',
    entityId: payment.id,
    metadataJson: { amount, taskId, memberId },
    severity: 'INFO',
    source: 'USER',
  });

  return payment;
}

// ── 2. checkQuorum ─────────────────────────────────────────────────────
// Returns quorum status for a branch: ≥60% of evaluators must have rated.

export async function checkQuorum(branchId: string): Promise<QuorumStatus> {
  // Get all deliverables for this branch
  const deliverables = await prisma.phaseDeliverable.findMany({
    where: { branchId },
    select: { id: true },
  });

  if (deliverables.length === 0) {
    return {
      quorumMet: false,
      evaluatorCount: 0,
      ratedCount: 0,
      quorumPct: 0,
      threshold: QUORUM_THRESHOLD,
    };
  }

  const deliverableIds = deliverables.map((d) => d.id);

  // Get all assigned evaluators (unique users)
  const evaluators = await prisma.satisfaccionEvaluador.findMany({
    where: { deliverableId: { in: deliverableIds } },
    select: { userId: true },
    distinct: ['userId'],
  });

  const evaluatorCount = evaluators.length;

  if (evaluatorCount === 0) {
    return {
      quorumMet: false,
      evaluatorCount: 0,
      ratedCount: 0,
      quorumPct: 0,
      threshold: QUORUM_THRESHOLD,
    };
  }

  // Count how many unique evaluators have submitted a SatisfactionRating
  const rated = await prisma.satisfactionRating.findMany({
    where: {
      deliverableId: { in: deliverableIds },
      userId: { in: evaluators.map((e) => e.userId) },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  const ratedCount = rated.length;
  const quorumPct = Math.round((ratedCount / evaluatorCount) * 100);
  const quorumMet = quorumPct >= QUORUM_THRESHOLD;

  return { quorumMet, evaluatorCount, ratedCount, quorumPct, threshold: QUORUM_THRESHOLD };
}

// ── 3. releasePayment ──────────────────────────────────────────────────

export async function releasePayment(paymentId: string): Promise<ReleaseResult> {
  const payment = await prisma.memberPayment.findUnique({
    where: { id: paymentId },
    include: {
      tree: { select: { satisfactionTiers: true } },
      task: { select: { branchId: true } },
    },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PLEDGED') {
    throw new Error(`Cannot release payment with status ${payment.status}`);
  }

  // Quorum gate: ≥60% of evaluators must have rated
  if (payment.task?.branchId) {
    const quorum = await checkQuorum(payment.task.branchId);
    if (!quorum.quorumMet) {
      throw new Error(
        `Quorum not met: ${quorum.ratedCount}/${quorum.evaluatorCount} evaluators have rated (${quorum.quorumPct}%, need ≥${QUORUM_THRESHOLD}%)`,
      );
    }
  }

  // Determine satisfaction percentage from the task's branch deliverables
  let satisfactionPct = 0;
  if (payment.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: payment.taskId },
      select: { branchId: true },
    });
    if (task) {
      const ratings = await prisma.satisfactionRating.findMany({
        where: { deliverable: { branchId: task.branchId } },
        select: { rating: true },
      });
      if (ratings.length > 0) {
        satisfactionPct =
          ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
      }
    }
  }

  // Determine tiers
  let tiers: SatisfactionTier[] = DEFAULT_SATISFACTION_TIERS;
  if (payment.tree.satisfactionTiers) {
    const configured = payment.tree.satisfactionTiers as unknown;
    if (Array.isArray(configured) && configured.length > 0) {
      tiers = configured as SatisfactionTier[];
    }
  }

  const releasePct = calculateTieredRelease(satisfactionPct, tiers);
  const releasedAmount = Math.round((payment.amount * releasePct) / 100 * 100) / 100;
  const refundedAmount = Math.round((payment.amount - releasedAmount) * 100) / 100;

  // Update payment
  await prisma.memberPayment.update({
    where: { id: paymentId },
    data: {
      status: 'RELEASED',
      releasedAmount,
      refundedAmount,
    },
  });

  // Update treasury
  await prisma.treeTreasury.update({
    where: { treeId: payment.treeId },
    data: {
      balance: { decrement: releasedAmount },
      committedBalance: { decrement: payment.amount },
    },
  });

  void logEvent({
    treeId: payment.treeId,
    action: 'PAYMENT_RELEASED',
    entityType: 'MemberPayment',
    entityId: paymentId,
    metadataJson: { satisfactionPct, releasePct, releasedAmount, refundedAmount },
    severity: 'INFO',
    source: 'SYSTEM',
  });

  return { releasedAmount, refundedAmount };
}

// ── 4. refundPayment ───────────────────────────────────────────────────

export async function refundPayment(paymentId: string) {
  const payment = await prisma.memberPayment.findUnique({
    where: { id: paymentId },
    include: { task: { include: { branch: { select: { treeId: true } } } } },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PLEDGED') {
    throw new Error(`Cannot refund payment with status ${payment.status}`);
  }

  // Determine satisfaction percentage
  let satisfactionPct = 0;
  if (payment.task) {
    const ratings = await prisma.satisfactionRating.findMany({
      where: { deliverable: { branchId: payment.task.branchId } },
      select: { rating: true },
    });
    if (ratings.length > 0) {
      satisfactionPct =
        ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    }
  }

  // Only refund if < 20% satisfaction
  if (satisfactionPct >= 20) {
    throw new Error(
      `Refund not allowed: satisfaction is ${satisfactionPct}% (threshold is < 20%)`,
    );
  }

  // Update payment
  await prisma.memberPayment.update({
    where: { id: paymentId },
    data: {
      status: 'REFUNDED',
      releasedAmount: 0,
      refundedAmount: payment.amount,
    },
  });

  // Update treasury
  await prisma.treeTreasury.update({
    where: { treeId: payment.treeId },
    data: { committedBalance: { decrement: payment.amount } },
  });

  void logEvent({
    treeId: payment.treeId,
    action: 'PAYMENT_REFUNDED',
    entityType: 'MemberPayment',
    entityId: paymentId,
    metadataJson: { satisfactionPct, amount: payment.amount },
    severity: 'WARNING',
    source: 'SYSTEM',
  });

  return await prisma.memberPayment.findUnique({ where: { id: paymentId } });
}

// ── 5. disputePayment ──────────────────────────────────────────────────

export async function disputePayment(paymentId: string, reason: string) {
  const payment = await prisma.memberPayment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PLEDGED' && payment.status !== 'RELEASED') {
    throw new Error(`Cannot dispute payment with status ${payment.status}`);
  }

  await prisma.memberPayment.update({
    where: { id: paymentId },
    data: { status: 'DISPUTED' },
  });

  void logEvent({
    treeId: payment.treeId,
    action: 'PAYMENT_DISPUTED',
    entityType: 'MemberPayment',
    entityId: paymentId,
    metadataJson: { reason, previousStatus: payment.status },
    severity: 'WARNING',
    source: 'USER',
  });

  return await prisma.memberPayment.findUnique({ where: { id: paymentId } });
}

// ── 6. calculateTieredRelease ──────────────────────────────────────────

export function calculateTieredRelease(
  satisfactionPct: number,
  tiers: SatisfactionTier[],
): number {
  if (!tiers || tiers.length === 0) {
    tiers = DEFAULT_SATISFACTION_TIERS;
  }

  // Find the matching tier
  for (const tier of tiers) {
    if (satisfactionPct >= tier.min && satisfactionPct < tier.max) {
      return tier.releasePct;
    }
  }

  // If exactly 100, use the last tier
  const lastTier = tiers[tiers.length - 1];
  if (satisfactionPct >= lastTier.max) {
    return lastTier.releasePct;
  }

  // Fallback: 0% release
  return 0;
}

// ── 7. quorumTimeoutRefund ─────────────────────────────────────────────
// Called by releaseCron when a payment's quorum timeout has expired.

export async function quorumTimeoutRefund(paymentId: string, branchId: string) {
  const payment = await prisma.memberPayment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PLEDGED') {
    throw new Error(`Cannot auto-refund payment with status ${payment.status}`);
  }

  const quorum = await checkQuorum(branchId);

  // Update payment
  await prisma.memberPayment.update({
    where: { id: paymentId },
    data: {
      status: 'REFUNDED',
      releasedAmount: 0,
      refundedAmount: payment.amount,
    },
  });

  // Update treasury
  await prisma.treeTreasury.update({
    where: { treeId: payment.treeId },
    data: { committedBalance: { decrement: payment.amount } },
  });

  void logEvent({
    treeId: payment.treeId,
    action: 'PAYMENT_QUORUM_TIMEOUT_REFUND',
    entityType: 'MemberPayment',
    entityId: paymentId,
    metadataJson: {
      amount: payment.amount,
      quorum,
      reason: 'Quorum timeout expired',
    },
    severity: 'WARNING',
    source: 'AUTOMATION',
  });

  return await prisma.memberPayment.findUnique({ where: { id: paymentId } });
}
