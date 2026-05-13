import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/authMiddleware';
import {
  connectOnboarding,
  connectStatus,
  payout,
  createCheckout,
  paddleWebhook,
  cancelSubscription,
  currentCost,
  mySubscription,
  recalculateNow,
} from '../controllers/billingController';

const router = Router();

// Stripe Connect onboarding (requires auth)
router.post('/connect-onboarding', authenticateJWT, connectOnboarding);
router.get('/connect-status', authenticateJWT, connectStatus);

// Payout (admin only)
router.post('/payout', authenticateJWT, requireAdmin, payout);

// ── Paddle Billing ────────────────────────────────────────────────────

// Create checkout session → returns Paddle checkout URL
router.post('/create-checkout', authenticateJWT, createCheckout);

// Cancel subscription (authenticated user)
router.post('/cancel', authenticateJWT, cancelSubscription);

// Get authenticated user's subscription status
router.get('/subscription', authenticateJWT, mySubscription);

// Get current platform subscription cost (public)
router.get('/current-cost', currentCost);

// Recalculate subscription cost (public — triggers manual recalculation)
router.get('/recalculate', recalculateNow);

// Paddle webhook (no auth — called by Paddle)
router.post('/webhook', paddleWebhook);

export default router;
