import { Router } from 'express';
import { getSocialMap, refreshSocialMap } from '../controllers/teamController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// GET /api/teams/:treeId/social-map — social map for a team's members
router.get('/:treeId/social-map', authenticateJWT, getSocialMap);

// POST /api/teams/:treeId/social-map/refresh — force regenerate the social map
router.post('/:treeId/social-map/refresh', authenticateJWT, refreshSocialMap);

export default router;
