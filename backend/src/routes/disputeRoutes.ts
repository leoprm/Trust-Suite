import { Router } from 'express';
import {
  openDisputeHandler,
  listDisputesHandler,
  resolveDisputeHandler,
} from '../controllers/disputeController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router({ mergeParams: true });

router.use(authenticateJWT);

// POST /api/payments/:id/dispute
router.post('/payments/:id/dispute', openDisputeHandler);

// GET /api/trees/:id/disputes
router.get('/trees/:id/disputes', listDisputesHandler);

// POST /api/disputes/:paymentId/resolve
router.post('/disputes/:paymentId/resolve', resolveDisputeHandler);

export default router;
