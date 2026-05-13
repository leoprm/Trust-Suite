import { Router } from 'express';
import { conciergeHandler } from '../controllers/conciergeController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/concierge — authenticated concierge query
router.post('/', authenticateJWT, conciergeHandler);

export default router;
