import { Router } from 'express';
import { getDeliverable, submitDeliverable, rateDeliverable, completeDeliverable } from '../controllers/deliverableController';
import { authenticateJWT } from '../middleware/authMiddleware';
import { aiGate } from '../middleware/aiEthicsMiddleware';

const router = Router();

router.use(authenticateJWT);

// Branch-specific deliverable submission
router.get('/branches/:branchId/phases/:phase', getDeliverable);
router.post('/branches/:branchId/phases/:phase', submitDeliverable);

// Rating and completion
router.post('/:id/rate', aiGate('RATE'), rateDeliverable);
router.post('/:id/complete', completeDeliverable);

export default router;
