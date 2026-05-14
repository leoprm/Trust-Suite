import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { stripeOnboard, getMemberBalance, withdrawFunds } from '../controllers/stripeController';

const router = Router();

// All member endpoints require authentication
router.use(authenticateJWT);

router.post('/me/stripe-onboard', stripeOnboard);
router.get('/:id/balance', getMemberBalance);
router.post('/:id/withdraw', withdrawFunds);

export default router;
