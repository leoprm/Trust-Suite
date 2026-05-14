import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { stripeOnboard, getMemberBalance } from '../controllers/stripeController';

const router = Router();

// All member endpoints require authentication
router.use(authenticateJWT);

router.post('/me/stripe-onboard', stripeOnboard);
router.get('/:id/balance', getMemberBalance);

export default router;
