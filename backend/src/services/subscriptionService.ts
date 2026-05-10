const GRACE_PERIOD_DAYS = 7;

import { prisma } from '../index';
import { logEvent } from './eventLogService';
import { createNotification } from '../controllers/notificationController';

/**
 * Transition a member from ACTIVE → GRACE.
 * Called when paymentDueDate passes without payment.
 */
export async function enterGracePeriod(memberId: string): Promise<void> {
  const member = await prisma.treeMember.findUnique({ where: { id: memberId } });
  if (!member) {
    console.warn(`[Subscription] Member ${memberId} not found — skipping grace entry.`);
    return;
  }
  if (member.subscriptionStatus !== 'ACTIVE') {
    return; // already in grace or suspended
  }

  const beforeStatus = member.subscriptionStatus;
  await prisma.treeMember.update({
    where: { id: memberId },
    data: { subscriptionStatus: 'GRACE' },
  });

  void logEvent({
    treeId: member.treeId,
    actorId: null,
    action: 'SUBSCRIPTION_ENTERED_GRACE',
    entityType: 'TreeMember',
    entityId: memberId,
    beforeJson: { subscriptionStatus: beforeStatus },
    afterJson: { subscriptionStatus: 'GRACE' },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  // Notify the user they entered grace period
  await createNotification({
    userId: member.userId,
    type: 'SYSTEM',
    category: 'MEMBERSHIP',
    title: '⚠️ Tu membresía entró en período de gracia',
    body: `Tu pago venció. Tienes ${GRACE_PERIOD_DAYS} días para regularizar antes de la suspensión. Durante la gracia conservas todos tus derechos de gobernanza.`,
    entityType: 'TreeMember',
    entityAction: 'SUBSCRIPTION_ENTERED_GRACE',
    entityId: memberId,
  });

  console.log(`[Subscription] Member ${memberId} entered GRACE (tree=${member.treeId}, user=${member.userId})`);
}

/**
 * Suspend a member: GRACE → SUSPENDED, isPayingMember=false.
 * Called when grace period expires without payment.
 */
export async function suspendMember(memberId: string): Promise<void> {
  const member = await prisma.treeMember.findUnique({ where: { id: memberId } });
  if (!member) {
    console.warn(`[Subscription] Member ${memberId} not found — skipping suspension.`);
    return;
  }
  if (member.subscriptionStatus !== 'GRACE') {
    return; // only suspend from grace
  }

  const beforeJson = {
    subscriptionStatus: member.subscriptionStatus,
    isPayingMember: member.isPayingMember,
  };

  await prisma.treeMember.update({
    where: { id: memberId },
    data: {
      subscriptionStatus: 'SUSPENDED',
      isPayingMember: false,
    },
  });

  void logEvent({
    treeId: member.treeId,
    actorId: null,
    action: 'SUBSCRIPTION_SUSPENDED',
    entityType: 'TreeMember',
    entityId: memberId,
    beforeJson,
    afterJson: { subscriptionStatus: 'SUSPENDED', isPayingMember: false },
    severity: 'WARNING',
    source: 'AUTOMATION',
  });

  // Notify the user they've been suspended
  await createNotification({
    userId: member.userId,
    type: 'SYSTEM',
    category: 'MEMBERSHIP',
    title: '🚫 Tu membresía ha sido suspendida',
    body: `Tu período de gracia expiró sin pago. Has perdido acceso a tareas remuneradas, recepción de berries y participación en el fondo del Tree. Tu poder de gobernanza (voto, elegibilidad, pipeline) se mantiene intacto. Realiza un pago para reactivar.`,
    entityType: 'TreeMember',
    entityAction: 'SUBSCRIPTION_SUSPENDED',
    entityId: memberId,
  });

  console.log(`[Subscription] Member ${memberId} SUSPENDED (tree=${member.treeId}, user=${member.userId})`);
}

/**
 * Reactivate a member on payment: SUSPENDED/GRACE → ACTIVE, isPayingMember=true.
 * Updates lastPaymentDate and extends paymentDueDate.
 */
export async function reactivateMember(
  memberId: string,
  newPaymentDueDate: Date,
): Promise<void> {
  const member = await prisma.treeMember.findUnique({ where: { id: memberId } });
  if (!member) {
    console.warn(`[Subscription] Member ${memberId} not found — skipping reactivation.`);
    return;
  }

  const beforeJson = {
    subscriptionStatus: member.subscriptionStatus,
    isPayingMember: member.isPayingMember,
    lastPaymentDate: member.lastPaymentDate,
    paymentDueDate: member.paymentDueDate,
  };

  const now = new Date();
  await prisma.treeMember.update({
    where: { id: memberId },
    data: {
      subscriptionStatus: 'ACTIVE',
      isPayingMember: true,
      lastPaymentDate: now,
      paymentDueDate: newPaymentDueDate,
    },
  });

  void logEvent({
    treeId: member.treeId,
    actorId: null,
    action: 'SUBSCRIPTION_REACTIVATED',
    entityType: 'TreeMember',
    entityId: memberId,
    beforeJson,
    afterJson: {
      subscriptionStatus: 'ACTIVE',
      isPayingMember: true,
      lastPaymentDate: now,
      paymentDueDate: newPaymentDueDate,
    },
    severity: 'INFO',
    source: 'SYSTEM',
  });

  // Notify the user they've been reactivated
  await createNotification({
    userId: member.userId,
    type: 'SYSTEM',
    category: 'MEMBERSHIP',
    title: '✅ Tu membresía ha sido reactivada',
    body: `Tu pago fue registrado. Has recuperado acceso completo: tareas remuneradas, berries y fondo del Tree. Próximo vencimiento: ${newPaymentDueDate.toISOString().split('T')[0]}.`,
    entityType: 'TreeMember',
    entityAction: 'SUBSCRIPTION_REACTIVATED',
    entityId: memberId,
  });

  console.log(`[Subscription] Member ${memberId} REACTIVATED (tree=${member.treeId}, user=${member.userId})`);
}

/**
 * Calculate the next payment due date based on the tree's subscriptionDayOfMonth.
 * If today's day <= subDayOfMonth, nextDue is this month on that day.
 * Otherwise, nextDue is next month on that day.
 */
export function calculateNextDueDate(subDayOfMonth: number): Date {
  const now = new Date();
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), subDayOfMonth, 0, 0, 0));

  if (due <= now) {
    // Next month
    due.setUTCMonth(due.getUTCMonth() + 1);
  }

  return due;
}

/**
 * Daily check: find members who need state transitions.
 *
 * Phase A: ACTIVE members whose paymentDueDate has passed → GRACE
 * Phase B: GRACE members whose paymentDueDate + 7 days has passed → SUSPENDED
 */
export async function processDailySubscriptionCheck(): Promise<{
  enteredGrace: number;
  suspended: number;
  errors: number;
}> {
  console.log('[Subscription] Daily subscription check started.');
  const now = new Date();
  const graceDeadline = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  let enteredGrace = 0;
  let suspended = 0;
  let errors = 0;

  try {
    // Phase A: ACTIVE members with expired paymentDueDate → GRACE
    // Only process members in trees with financingMode=SUBSCRIPCION
    const overdueActives = await prisma.treeMember.findMany({
      where: {
        subscriptionStatus: 'ACTIVE',
        isPayingMember: true,
        paymentDueDate: { lt: now },
        tree: { financingMode: 'SUBSCRIPCION' },
      },
      select: { id: true },
    });

    for (const m of overdueActives) {
      try {
        await enterGracePeriod(m.id);
        enteredGrace++;
      } catch (err: any) {
        console.error(`[Subscription] Error entering grace for ${m.id}:`, err.message);
        errors++;
      }
    }

    // Phase B: GRACE members past grace deadline → SUSPENDED
    const expiredGraces = await prisma.treeMember.findMany({
      where: {
        subscriptionStatus: 'GRACE',
        paymentDueDate: { lt: graceDeadline },
      },
      select: { id: true },
    });

    for (const m of expiredGraces) {
      try {
        await suspendMember(m.id);
        suspended++;
      } catch (err: any) {
        console.error(`[Subscription] Error suspending ${m.id}:`, err.message);
        errors++;
      }
    }

    console.log(`[Subscription] Daily check done. Entered grace: ${enteredGrace}, Suspended: ${suspended}, Errors: ${errors}`);
  } catch (err: any) {
    console.error('[Subscription] Daily check failed:', err.message);
    errors++;
  }

  return { enteredGrace, suspended, errors };
}
