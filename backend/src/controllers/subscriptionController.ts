import { Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { calculateNextDueDate, reactivateMember } from '../services/subscriptionService';

/**
 * POST /api/trees/:id/members/:memberId/payment
 * Register a manual payment for a member (admin or system only).
 * Reactivates the member's subscription.
 */
export const registerPayment = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const memberId = req.params.memberId;
    const userId = req.user!.id;
    const { amount, currency, period, fiatTxId } = req.body;

    if (amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'amount debe ser mayor a 0' });
    }
    if (!period) {
      return res.status(400).json({ error: 'period es requerido (ej: "2026-05")' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, financingMode: true, subscriptionDayOfMonth: true, creatorId: true },
    });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Verify member exists and belongs to this tree
    const member = await prisma.treeMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        treeId: true,
        userId: true,
        subscriptionStatus: true,
        isPayingMember: true,
      },
    });
    if (!member || member.treeId !== treeId) {
      return res.status(404).json({ error: 'Member not found in this tree' });
    }

    // Admin check: must be tree admin or system
    const requesterMember = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { role: true },
    });
    const isAdmin = tree.creatorId === userId || requesterMember?.role === 'ADMIN';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden registrar pagos' });
    }

    // Create MemberPayment record
    const payment = await prisma.memberPayment.create({
      data: {
        treeId,
        memberId,
        amount,
        currency: currency || 'CLP',
        period,
        fiatTxId: fiatTxId || null,
      },
    });

    // Calculate next due date
    const subDayOfMonth = tree.subscriptionDayOfMonth || 1;
    const nextDue = calculateNextDueDate(subDayOfMonth);

    // Reactivate member
    await reactivateMember(memberId, nextDue);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'MEMBER_PAYMENT_REGISTERED',
      entityType: 'MemberPayment',
      entityId: payment.id,
      afterJson: {
        memberId,
        amount,
        currency: currency || 'CLP',
        period,
        fiatTxId: fiatTxId || null,
        subscriptionStatus: 'ACTIVE',
        paymentDueDate: nextDue,
      },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      severity: 'INFO',
      source: 'USER',
    });

    res.status(201).json({
      payment,
      subscription: {
        status: 'ACTIVE',
        isPayingMember: true,
        lastPaymentDate: new Date(),
        paymentDueDate: nextDue,
      },
    });
  } catch (error) {
    console.error('[Subscription] Error registering payment:', error);
    res.status(500).json({ error: 'Failed to register payment' });
  }
};

/**
 * GET /api/trees/:id/members/:memberId/payment-status
 * Query payment status for a member.
 */
export const getPaymentStatus = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const memberId = req.params.memberId;
    const userId = req.user!.id;

    // Verify tree exists
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, financingMode: true, subscriptionAmount: true, subscriptionCurrency: true, subscriptionDayOfMonth: true, subscriptionBillingMode: true, creatorId: true },
    });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Verify member exists and belongs to this tree
    const member = await prisma.treeMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        treeId: true,
        userId: true,
        isPayingMember: true,
        lastPaymentDate: true,
        paymentDueDate: true,
        subscriptionStatus: true,
      },
    });
    if (!member || member.treeId !== treeId) {
      return res.status(404).json({ error: 'Member not found in this tree' });
    }

    // Access control: only the member themselves, tree admin, or system can see payment status
    const isSelf = member.userId === userId;
    let isAdmin = tree.creatorId === userId;
    if (!isAdmin) {
      const requesterMember = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId, treeId } },
        select: { role: true },
      });
      isAdmin = requesterMember?.role === 'ADMIN';
    }
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Solo el miembro o administradores pueden consultar el estado de pago' });
    }

    // Get recent payments
    const recentPayments = await prisma.memberPayment.findMany({
      where: { memberId },
      orderBy: { paidAt: 'desc' },
      take: 12,
      select: {
        id: true,
        amount: true,
        currency: true,
        period: true,
        paidAt: true,
        status: true,
        receiptAttempts: true,
        releasedAmount: true,
        refundedAmount: true,
      },
    });

    // ── Tree-level treasury snapshot ──
    let balance = 0;
    let committedBalance = 0;

    // Compute from aggregated results — released = income, refunded = outflow, pledged = committed
    const allGroups = await prisma.memberPayment.groupBy({
      by: ['status'],
      where: { treeId },
      _sum: { amount: true, releasedAmount: true, refundedAmount: true },
    });

    for (const g of allGroups) {
      if (g.status === 'PLEDGED') {
        committedBalance += (g._sum?.amount ?? 0);
      }
      if (g.status === 'RELEASED') {
        balance += (g._sum?.releasedAmount ?? 0);
      }
      if (g.status === 'REFUNDED') {
        balance -= (g._sum?.refundedAmount ?? 0);
      }
    }

    const graceEndDate = member.paymentDueDate
      ? new Date(member.paymentDueDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      : null;

    const now = new Date();
    const daysUntilDue = member.paymentDueDate
      ? Math.ceil((member.paymentDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const daysInGrace = member.paymentDueDate && member.subscriptionStatus === 'GRACE'
      ? Math.ceil((now.getTime() - member.paymentDueDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    res.json({
      memberId: member.id,
      userId: member.userId,
      subscriptionStatus: member.subscriptionStatus,
      isPayingMember: member.isPayingMember,
      lastPaymentDate: member.lastPaymentDate,
      paymentDueDate: member.paymentDueDate,
      graceEndDate,
      daysUntilDue,
      daysInGrace,
      gracePeriodDays: 7,
      tree: {
        financingMode: tree.financingMode,
        subscriptionAmount: tree.subscriptionAmount,
        subscriptionCurrency: tree.subscriptionCurrency,
        subscriptionDayOfMonth: tree.subscriptionDayOfMonth,
        subscriptionBillingMode: tree.subscriptionBillingMode,
      },
      recentPayments,
      treeTreasury: {
        balance,
        committedBalance,
      },
    });
  } catch (error) {
    console.error('[Subscription] Error fetching payment status:', error);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
};
