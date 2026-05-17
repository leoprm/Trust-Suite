import { Router } from 'express';
import { rateAgent, penalizeAgentEndpoint, getPublicStats } from '../controllers/agentRatingController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/agents/:agentId/rate — requires auth (public rating)
router.post('/:agentId/rate', authenticateJWT, rateAgent);

// POST /api/agents/:agentId/penalize — requires auth (penalty vote)
router.post('/:agentId/penalize', authenticateJWT, penalizeAgentEndpoint);

// GET /api/agents/:agentId/public-stats?treeId=X — public stats
router.get('/:agentId/public-stats', getPublicStats);

export default router;
