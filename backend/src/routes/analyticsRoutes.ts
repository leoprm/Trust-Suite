import { Router } from 'express';
import {
  getEcosystem,
  getAgentsHeatmap,
  getAgentTimeline,
  getTreeHealth,
  compareModels,
} from '../controllers/analyticsController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// All analytics endpoints require authentication
router.use(authenticateJWT);

// GET /api/analytics/ecosystem
router.get('/ecosystem', getEcosystem);

// GET /api/analytics/agents/heatmap
router.get('/agents/heatmap', getAgentsHeatmap);

// GET /api/analytics/agents/:id/timeline
router.get('/agents/:id/timeline', getAgentTimeline);

// GET /api/analytics/trees/:id/health
router.get('/trees/:id/health', getTreeHealth);

// GET /api/analytics/models/compare
router.get('/models/compare', compareModels);

export default router;
