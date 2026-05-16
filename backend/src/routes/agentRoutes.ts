import { Router } from 'express';
import {
  getAgents,
  getAgentLeaderboard,
  getAgentProfile,
  getAgentById,
  getAgentRanking,
} from '../controllers/agentController';
import { getAgentTreeStats } from '../controllers/ratingController';
import { rateAgent, penalizeAgentEndpoint, getPublicStats } from '../controllers/agentRatingController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// GET /api/agents — list (with optional ?role=analyst filter)
router.get('/', getAgents);

// GET /api/agents/leaderboard?role=analyst — top 20 by confidenceScore
router.get('/leaderboard', getAgentLeaderboard);

// GET /api/agents/ranking?treeId=X — top 20 by confidenceScore, optional tree filter
router.get('/ranking', getAgentRanking);

// POST /api/agents/:agentId/rate — public rating (auth required)
router.post('/:agentId/rate', authenticateJWT, rateAgent);

// POST /api/agents/:agentId/penalize — penalty vote (auth required)
router.post('/:agentId/penalize', authenticateJWT, penalizeAgentEndpoint);

// GET /api/agents/:agentId/public-stats?treeId=X — public stats
router.get('/:agentId/public-stats', getPublicStats);

// GET /api/agents/:id — simple agent + profile + recent ratings
router.get('/:id', getAgentById);

// GET /api/agents/:id/trees/:treeId/stats — public: level, xp, totalRatings
router.get('/:id/trees/:treeId/stats', getAgentTreeStats);

// GET /api/agents/:id/profile — detailed profile + ratings + role history
router.get('/:id/profile', getAgentProfile);

export default router;
