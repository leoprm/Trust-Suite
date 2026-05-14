import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../index';

// ── Stripe initialization ─────────────────────────────────────────────────────

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

let _stripe: any = null;
function stripe(): any {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET, {
      apiVersion: '2025-03-31.basil' as any,
    });
  }
  return _stripe;
}

// ── POST /api/members/me/stripe-onboard ──────────────────────────────────────

export const stripeOnboard = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;

    // Find member record — user must belong to at least one tree
    const member = await prisma.treeMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { tree: true, user: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'No active tree membership found. Join a tree first.' });
    }

    // Upsert MemberBalance
    let balance = await prisma.memberBalance.findUnique({ where: { memberId: member.id } });

    // If already has stripeAccountId, return existing onboarding
    if (balance?.stripeAccountId) {
      const existingAccount = await stripe().accounts.retrieve(balance.stripeAccountId);
      if (existingAccount.charges_enabled && existingAccount.payouts_enabled) {
        return res.json({
          stripeAccountId: balance.stripeAccountId,
          chargesEnabled: true,
          payoutsEnabled: true,
          message: 'Stripe Connect already active',
        });
      }
      // Account exists but not fully onboarded — create new account link
      const accountLink = await stripe().accountLinks.create({
        account: balance.stripeAccountId,
        refresh_url: `${BASE_URL}/api/members/me/stripe-onboard?refresh=true`,
        return_url: `${BASE_URL}/api/stripe/onboard/return?memberId=${member.id}`,
        type: 'account_onboarding',
      });
      return res.json({ url: accountLink.url, stripeAccountId: balance.stripeAccountId });
    }

    // Create new Stripe Connect Express account
    const account = await stripe().accounts.create({
      type: 'express',
      country: 'CL',
      email: member.user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: {
        memberId: member.id,
        userId: userId,
        treeId: member.treeId,
      },
    });

    // Create MemberBalance if not exists
    if (!balance) {
      balance = await prisma.memberBalance.create({
        data: {
          memberId: member.id,
          stripeAccountId: account.id,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
    } else {
      balance = await prisma.memberBalance.update({
        where: { memberId: member.id },
        data: { stripeAccountId: account.id },
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe().accountLinks.create({
      account: account.id,
      refresh_url: `${BASE_URL}/api/members/me/stripe-onboard?refresh=true`,
      return_url: `${BASE_URL}/api/stripe/onboard/return?memberId=${member.id}`,
      type: 'account_onboarding',
    });

    res.json({
      url: accountLink.url,
      stripeAccountId: account.id,
      message: 'Redirect to this URL to complete Stripe Connect onboarding',
    });
  } catch (error: any) {
    console.error('[stripeOnboard]', error);
    res.status(500).json({ error: error.message || 'Stripe onboarding failed' });
  }
};

// ── GET /api/stripe/onboard/return?memberId=X ────────────────────────────────

export const stripeOnboardReturn = async (req: Request, res: Response) => {
  try {
    const { memberId } = req.query;

    if (!memberId || typeof memberId !== 'string') {
      return res.status(400).json({ error: 'memberId query parameter is required' });
    }

    const balance = await prisma.memberBalance.findUnique({ where: { memberId } });

    if (!balance || !balance.stripeAccountId) {
      return res.status(404).json({ error: 'No Stripe Connect account found for this member' });
    }

    // Retrieve account to verify onboarding status
    const account = await stripe().accounts.retrieve(balance.stripeAccountId);

    // Update MemberBalance with current status (stripeAccountId already saved)
    // The account.charges_enabled tells us if onboarding is complete

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (account.charges_enabled) {
      // Redirect to frontend with success
      return res.redirect(`${frontendUrl}/wallet?stripe=success&memberId=${memberId}`);
    } else {
      // Onboarding incomplete
      return res.redirect(`${frontendUrl}/wallet?stripe=pending&memberId=${memberId}`);
    }
  } catch (error: any) {
    console.error('[stripeOnboardReturn]', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/wallet?stripe=error`);
  }
};

// ── GET /api/members/:id/balance ─────────────────────────────────────────────

export const getMemberBalance = async (req: any, res: Response) => {
  try {
    const memberId = req.params.id;

    const balance = await prisma.memberBalance.findUnique({ where: { memberId } });

    if (!balance) {
      return res.json({ availableBalance: 0, pendingBalance: 0, stripeAccountId: null });
    }

    res.json({
      availableBalance: balance.availableBalance,
      pendingBalance: balance.pendingBalance,
      stripeAccountId: balance.stripeAccountId,
    });
  } catch (error: any) {
    console.error('[getMemberBalance]', error);
    res.status(500).json({ error: error.message || 'Failed to fetch balance' });
  }
};

// ── POST /api/stripe/create-task-checkout ────────────────────────────────────
// Creates a Stripe Checkout session for a task's budget.
// The task must have a budget > 0 and status VERIFIED.
// Body: { taskId: string }

export const createTaskCheckout = async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { taskId } = req.body;

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'taskId (string) is required' });
    }

    // Look up task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { tree: true },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify membership
    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: task.treeId } },
    });
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this tree' });
    }

    // Budget must be set
    if (!task.budget || task.budget <= 0) {
      return res.status(400).json({ error: 'Task has no budget set' });
    }

    // Status gate: must be VERIFIED to pay
    if (task.status !== 'VERIFIED') {
      return res.status(400).json({
        error: `Task must be VERIFIED to pay. Current status: ${task.status}`,
      });
    }

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'clp',
            product_data: {
              name: task.title,
              description: task.description?.substring(0, 200) || `Task: ${task.title}`,
            },
            unit_amount: task.budget, // CLP — no decimal subunit
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/tasks/${taskId}?payment=success`,
      cancel_url: `${FRONTEND_URL}/tasks/${taskId}?payment=canceled`,
      metadata: {
        taskId,
        needId: task.needId,
        treeId: task.treeId,
      },
    });

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('[createTaskCheckout]', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
};
