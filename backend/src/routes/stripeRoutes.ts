import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { stripeOnboardReturn, createTaskCheckout } from '../controllers/stripeController';

const router = Router();

// Public callback — no auth (Stripe redirects here)
router.get('/onboard/return', stripeOnboardReturn);

// Create Stripe Checkout session for a task's budget
router.post('/create-task-checkout', authenticateJWT, createTaskCheckout);

export default router;
