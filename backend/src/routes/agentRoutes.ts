import { Router } from 'express';
import {
  getAgents,
  getAgentLeaderboard,
  getAgentProfile,
  getAgentById,
  getAgentRanking,
} from '../controllers/agentController';
import { getAgentTreeStats } from '../controllers/ratingController';

const router = Router();

// GET /api/agents — list (with optional ?role=analyst filter)
router.get('/', getAgents);

// GET /api/agents/leaderboard?role=analyst — top 20 by confidenceScore
router.get('/leaderboard', getAgentLeaderboard);

// GET /api/agents/ranking?treeId=X — top 20 by confidenceScore, optional tree filter
router.get('/ranking', getAgentRanking);

// GET /api/agents/:id — simple agent + profile + recent ratings
router.get('/:id', getAgentById);

// GET /api/agents/:id/trees/:treeId/stats — public: level, xp, totalRatings
router.get('/:id/trees/:treeId/stats', getAgentTreeStats);

// GET /api/agents/:id/profile — detailed profile + ratings + role history
router.get('/:id/profile', getAgentProfile);

export default router;
