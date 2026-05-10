import { Router } from 'express';
import { registerPayment, getPaymentStatus } from '../controllers/subscriptionController';

const router = Router({ mergeParams: true });

// POST /api/trees/:id/members/:memberId/payment
router.post('/payment', registerPayment);

// GET /api/trees/:id/members/:memberId/payment-status
router.get('/payment-status', getPaymentStatus);

export default router;
