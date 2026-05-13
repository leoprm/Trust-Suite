import { Response } from 'express';
import * as crypto from 'crypto';
import { prisma } from '../index';

// ── Paddle Config ──

const PADDLE_API = process.env.PADDLE_ENVIRONMENT === 'sandbox'
  ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

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

function mapPaddleStatus(s: string): 'ACTIVE' | 'CANCELED' {
  switch (s) { case 'active': case 'trialing': case 'past_due': return 'ACTIVE'; case 'canceled': return 'CANCELED'; default: return 'ACTIVE'; }
}

// ── Stripe Connect (stubbed — model removed in V3) ──

export const connectOnboarding = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Stripe Connect removed in V3' });
};

export const connectStatus = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Stripe Connect removed in V3' });
};

export const payout = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Payout system removed in V3' });
};

// ── Paddle Billing ────────────────────────────────────────────────────

export const createCheckout = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { priceId, successUrl } = req.body;
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

export const paddleWebhook = async (req: any, res: Response) => {
  try {
    const signature = (req.headers['p_signature'] as string) || '';
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
        await (prisma as any).subscription.upsert({
          where: { paddleSubscriptionId: sub.id },
          create: {
            userId, paddleSubscriptionId: sub.id, status,
            currentPeriodStart: sub.current_billing_period?.starts_at ? new Date(sub.current_billing_period.starts_at) : new Date(),
            currentPeriodEnd: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : new Date(Date.now() + 30 * 86400000),
          },
          update: { status, currentPeriodEnd: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : undefined },
        });
        console.log(`[billing] Subscription ${sub.id} synced for user ${userId} (${status})`);
        break;
      }
      case 'subscription.canceled': {
        await (prisma as any).subscription.updateMany({ where: { paddleSubscriptionId: eventData.id }, data: { status: 'CANCELED' } });
        break;
      }
      case 'transaction.completed': case 'transaction.paid': {
        if (eventData?.subscription_id) await (prisma as any).subscription.updateMany({ where: { paddleSubscriptionId: eventData.subscription_id }, data: { status: 'ACTIVE' } });
        break;
      }
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[billing] paddleWebhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed', detail: err.message });
  }
};

export const cancelSubscription = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await (prisma as any).subscription.findFirst({ where: { userId } });
    if (!sub) return res.status(404).json({ error: 'No subscription found' });
    if (sub.status === 'CANCELED') return res.status(400).json({ error: 'Already canceled' });
    try { await paddleRequest('POST', `/subscriptions/${sub.paddleSubscriptionId}/cancel`, { effectiveFrom: 'next_billing_period' }); }
    catch (e: any) { if (!e.message.includes('404')) return res.status(502).json({ error: 'Failed to cancel in Paddle', detail: e.message }); }
    const updated = await (prisma as any).subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } });
    return res.json({ subscription: { id: updated.id, status: updated.status } });
  } catch (err: any) {
    console.error('[billing] cancelSubscription error:', err);
    return res.status(500).json({ error: 'Failed to cancel', detail: err.message });
  }
};

export const currentCost = async (_req: any, res: Response) => {
  res.json({ monthlyCost: 0, currency: 'CLP', message: 'Cost engine removed in V3' });
};

export const mySubscription = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const sub = await (prisma as any).subscription.findFirst({ where: { userId } });
    if (!sub) return res.json({ hasSubscription: false, status: 'NONE' });
    return res.json({
      hasSubscription: true,
      id: sub.id,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      paddleSubscriptionId: sub.paddleSubscriptionId,
    });
  } catch (error: any) {
    console.error('[Billing] mySubscription error:', error.message);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
};

export const recalculateNow = async (_req: any, res: Response) => {
  res.json({ monthlyCost: 0, currency: 'CLP', message: 'Cost recalculation removed in V3' });
};

// ── Stripe Webhook (stubbed — connect removed) ──

export const stripeWebhook = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Stripe webhook removed in V3' });
};
