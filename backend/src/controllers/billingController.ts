import { Response } from 'express';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import { prisma } from '../index';
import { getCurrentCost, getMySubscription } from '../services/billingService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-04-22.dahlia' as any,
});

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

// ── Raw query helpers for StripeConnectAccount ──

async function findConnectAccount(userId: string) {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM StripeConnectAccount WHERE userId = ?`, userId
  );
  return rows[0] || null;
}

async function findConnectAccountByStripeId(stripeAccountId: string) {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM StripeConnectAccount WHERE stripeAccountId = ?`, stripeAccountId
  );
  return rows[0] || null;
}

async function createConnectAccount(userId: string, stripeAccountId: string, chargesEnabled: boolean, payoutsEnabled: boolean) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO StripeConnectAccount (id, userId, stripeAccountId, chargesEnabled, payoutsEnabled, createdAt, updatedAt)
     VALUES (UUID(), ?, ?, ?, ?, NOW(), NOW())`,
    userId, stripeAccountId, chargesEnabled, payoutsEnabled
  );
}

async function updateConnectAccountStatus(userId: string, chargesEnabled: boolean, payoutsEnabled: boolean) {
  await prisma.$executeRawUnsafe(
    `UPDATE StripeConnectAccount SET chargesEnabled = ?, payoutsEnabled = ?, updatedAt = NOW() WHERE userId = ?`,
    chargesEnabled, payoutsEnabled, userId
  );
}

async function updateConnectAccountStatusByStripeId(stripeAccountId: string, chargesEnabled: boolean, payoutsEnabled: boolean) {
  await prisma.$executeRawUnsafe(
    `UPDATE StripeConnectAccount SET chargesEnabled = ?, payoutsEnabled = ?, updatedAt = NOW() WHERE stripeAccountId = ?`,
    chargesEnabled, payoutsEnabled, stripeAccountId
  );
}

// ── POST /api/billing/connect-onboarding ──

export const connectOnboarding = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await findConnectAccount(userId);
    let stripeAccountId = existing?.stripeAccountId;
    if (!stripeAccountId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, username: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const account = await stripe.accounts.create({
        type: 'express', country: 'CL', email: user.email || undefined,
        metadata: { userId }, capabilities: { transfers: { requested: true } }, business_type: 'individual',
      });
      stripeAccountId = account.id;
      await createConnectAccount(userId, stripeAccountId, account.charges_enabled, account.payouts_enabled);
    }
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId, refresh_url: `${BASE_URL}/api/billing/connect-onboarding?refresh=true`,
      return_url: `${BASE_URL}/api/billing/connect-status?success=true`, type: 'account_onboarding',
    });
    res.json({ url: accountLink.url, stripeAccountId, message: 'Completa el onboarding en Stripe para recibir pagos' });
  } catch (error: any) {
    console.error('[connectOnboarding]', error);
    res.status(500).json({ error: 'Failed to create Stripe Connect onboarding', detail: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};

// ── GET /api/billing/connect-status ──

export const connectStatus = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const account = await findConnectAccount(userId);
    if (!account) return res.status(404).json({ error: 'No Stripe Connect account found. Start onboarding first.' });
    const stripeAccount = await stripe.accounts.retrieve(account.stripeAccountId);
    await updateConnectAccountStatus(userId, stripeAccount.charges_enabled, stripeAccount.payouts_enabled);
    res.json({ stripeAccountId: account.stripeAccountId, chargesEnabled: stripeAccount.charges_enabled, payoutsEnabled: stripeAccount.payouts_enabled, detailsSubmitted: stripeAccount.details_submitted, canAcceptPayments: stripeAccount.charges_enabled && stripeAccount.payouts_enabled });
  } catch (error: any) {
    console.error('[connectStatus]', error);
    res.status(500).json({ error: 'Failed to check Stripe Connect status', detail: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};

// ── POST /api/billing/payout ──

export const payout = async (req: any, res: Response) => {
  try {
    const { userId, amount, currency } = req.body;
    if (!userId || !amount || amount <= 0) return res.status(400).json({ error: 'userId and positive amount are required' });
    const account = await findConnectAccount(userId);
    if (!account) return res.status(404).json({ error: 'User has no Stripe Connect account.' });
    if (!account.payoutsEnabled) return res.status(400).json({ error: 'Payouts not yet enabled.' });
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), currency: currency || 'clp', destination: account.stripeAccountId,
      metadata: { userId, initiatedBy: req.user?.id || 'cron' },
    });
    res.json({ success: true, transferId: transfer.id, amount: transfer.amount / 100, currency: transfer.currency, message: 'Transfer initiated.' });
  } catch (error: any) {
    console.error('[payout]', error);
    res.status(500).json({ error: 'Failed to initiate payout', detail: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};

// ── Stripe Webhook ──

export const stripeWebhook = async (req: any, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) return res.status(400).json({ error: 'Missing stripe-signature or webhook secret' });
  let event: any;
  try { event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret); }
  catch (err: any) { return res.status(400).json({ error: 'Webhook signature verification failed' }); }
  try {
    switch (event.type) {
      case 'account.updated': {
        const acct: any = event.data.object;
        const c = await findConnectAccountByStripeId(acct.id);
        if (c) await updateConnectAccountStatusByStripeId(acct.id, acct.charges_enabled, acct.payouts_enabled);
        break;
      }
      case 'payout.created': case 'payout.paid': case 'payout.failed':
        console.log(`[stripeWebhook] Payout ${(event.data.object as any).id}: ${event.type}`);
        break;
      default: console.log(`[stripeWebhook] Unhandled: ${event.type}`);
    }
    res.json({ received: true });
  } catch (error: any) { console.error('[stripeWebhook]', error); res.status(500).json({ error: 'Internal webhook processing error' }); }
};

// ── Paddle Config ──

const PADDLE_API = process.env.PADDLE_ENVIRONMENT === 'sandbox'
  ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || '';

async function paddleRequest(method: string, path: string, body?: any) {
  const url = `${PADDLE_API}${path}`;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PADDLE_API_KEY}` }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(`Paddle error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function verifyPaddleSignature(rawBody: string, signature: string): boolean {
  if (!PADDLE_WEBHOOK_SECRET) { console.warn('[billing] PADDLE_WEBHOOK_SECRET not set — skipping verification'); return true; }
  try {
    const hmac = crypto.createHmac('sha256', PADDLE_WEBHOOK_SECRET);
    hmac.update(rawBody);
    return crypto.timingSafeEqual(Buffer.from(hmac.digest('hex')), Buffer.from(signature));
  } catch { return false; }
}

function mapPaddleStatus(s: string) {
  switch (s) { case 'active': case 'trialing': return 'ACTIVE'; case 'past_due': return 'PAST_DUE'; case 'canceled': return 'CANCELED'; default: return 'ACTIVE'; }
}

// ── POST /api/billing/create-checkout ──

export const createCheckout = async (req: any, res: Response) => {
  try {
    const { userId, priceId, successUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const effectivePriceId = priceId || process.env.PADDLE_DEFAULT_PRICE_ID || 'pri_01h7qj7xqj7xqj7xqj7xqj7x';
    const paddleRes = await paddleRequest('POST', '/checkouts', {
      items: [{ priceId: effectivePriceId, quantity: 1 }],
      customData: { userId },
      settings: { successUrl: successUrl || `${BASE_URL}/api/billing/success` },
    });
    const checkoutUrl = paddleRes.data?.checkout?.url;
    if (!checkoutUrl) return res.status(500).json({ error: 'Paddle did not return a checkout URL', paddleRes });
    return res.json({ checkoutUrl });
  } catch (err: any) {
    console.error('[billing] createCheckout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout', detail: err.message });
  }
};

// ── POST /api/billing/paddle-webhook ──

export const paddleWebhook = async (req: any, res: Response) => {
  try {
    const signature = (req.headers['p_signature'] as string) || '';
    // express.raw() gives a Buffer; handle both Buffer and string
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    if (!verifyPaddleSignature(rawBody, signature)) return res.status(403).json({ error: 'Invalid webhook signature' });
    const event = JSON.parse(rawBody);
    const eventType = event?.event_type, eventData = event?.data;
    if (!eventType || !eventData) return res.status(400).json({ error: 'Invalid webhook payload' });
    console.log(`[billing] Paddle webhook: ${eventType}`);

    switch (eventType) {
      case 'subscription.created': case 'subscription.updated': {
        const sub = eventData, userId = sub?.custom_data?.userId;
        if (!userId) break;
        const status = mapPaddleStatus(sub.status);
        await prisma.userSubscription.upsert({
          where: { paddleSubscriptionId: sub.id },
          create: {
            userId, paddleSubscriptionId: sub.id, status,
            planId: sub.items?.[0]?.price?.id || null,
            currentPeriodStart: sub.current_billing_period?.starts_at ? new Date(sub.current_billing_period.starts_at) : new Date(),
            currentPeriodEnd: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : new Date(Date.now() + 30 * 86400000),
          },
          update: { status, planId: sub.items?.[0]?.price?.id || undefined, currentPeriodEnd: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : undefined, canceledAt: null },
        });
        console.log(`[billing] Subscription ${sub.id} synced for user ${userId} (${status})`);
        break;
      }
      case 'subscription.canceled': {
        await prisma.userSubscription.updateMany({ where: { paddleSubscriptionId: eventData.id }, data: { status: 'CANCELED', canceledAt: new Date(eventData.canceled_at || Date.now()) } });
        break;
      }
      case 'transaction.completed': case 'transaction.paid': {
        if (eventData?.subscription_id) await prisma.userSubscription.updateMany({ where: { paddleSubscriptionId: eventData.subscription_id }, data: { status: 'ACTIVE', canceledAt: null } });
        break;
      }
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[billing] paddleWebhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed', detail: err.message });
  }
};

// ── POST /api/billing/cancel ──

export const cancelSubscription = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await prisma.userSubscription.findFirst({ where: { userId } });
    if (!sub) return res.status(404).json({ error: 'No subscription found' });
    if (sub.status === 'CANCELED') return res.status(400).json({ error: 'Already canceled' });
    try { await paddleRequest('POST', `/subscriptions/${sub.paddleSubscriptionId}/cancel`, { effectiveFrom: 'next_billing_period' }); }
    catch (e: any) { if (!e.message.includes('404')) return res.status(502).json({ error: 'Failed to cancel in Paddle', detail: e.message }); }
    const updated = await prisma.userSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    return res.json({ subscription: { id: updated.id, status: updated.status, canceledAt: updated.canceledAt } });
  } catch (err: any) {
    console.error('[billing] cancelSubscription error:', err);
    return res.status(500).json({ error: 'Failed to cancel', detail: err.message });
  }
};

// ── Trust Maker Subscription Engine ──

export const currentCost = async (_req: any, res: Response) => {
  try {
    const data = await getCurrentCost();
    res.json(data);
  } catch (error: any) {
    console.error('[Billing] currentCost error:', error.message);
    res.status(500).json({ error: 'Failed to get current cost' });
  }
};

export const mySubscription = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const data = await getMySubscription(userId);
    res.json(data);
  } catch (error: any) {
    console.error('[Billing] mySubscription error:', error.message);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
};

// ── GET /api/billing/recalculate ──

export const recalculateNow = async (_req: any, res: Response) => {
  try {
    const { recalculateCost } = await import('../services/billingService');
    const { plan, breakdown } = await recalculateCost();
    res.json({ monthlyCost: plan.currentMonthlyCost, currency: 'CLP', breakdown, calculatedAt: plan.calculatedAt });
  } catch (error: any) {
    console.error('[Billing] recalculate error:', error.message);
    res.status(500).json({ error: 'Failed to recalculate cost', detail: error.message });
  }
};
