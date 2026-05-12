import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/authMiddleware';
import {
  findPath,
  getGraphEndpoint,
  getSkills,
  getSkillStats,
  rebuildGraph,
} from '../controllers/careerPathController';

const router = Router();

// ── Career path finding ─────────────────────────────────────────────────
router.post('/find', authenticateJWT, findPath);

router.get('/graph/:treeId', authenticateJWT, getGraphEndpoint);

router.get('/skills/:treeId', authenticateJWT, getSkills);

router.get('/stats/:treeId/:skillTag', authenticateJWT, getSkillStats);

router.post('/rebuild/:treeId', authenticateJWT, requireAdmin, rebuildGraph);

export default router;
