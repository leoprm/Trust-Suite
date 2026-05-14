import { Router } from 'express';
import { conciergeHandler, getHistoryHandler } from '../controllers/conciergeController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/concierge — authenticated concierge query
router.post('/', authenticateJWT, conciergeHandler);

// GET /api/concierge/history — authenticated chat history for a tree
router.get('/history', authenticateJWT, getHistoryHandler);

export default router;
