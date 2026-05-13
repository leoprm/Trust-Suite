import { Router } from 'express';
import { getAgentTreeStats } from '../controllers/ratingController';

const router = Router();

// GET /api/agents/:id/trees/:treeId/stats — public: level, xp, totalRatings
router.get('/:id/trees/:treeId/stats', getAgentTreeStats);

export default router;
