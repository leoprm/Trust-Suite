import { Router } from 'express';
import { recommendRoles, feedbackRoles } from '../controllers/roleRecommendationController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/roles/recommend — auth recommended but optional (public discoverability)
router.post('/recommend', recommendRoles);

// POST /api/roles/feedback — requires auth (user confirms their group's roles)
router.post('/feedback', authenticateJWT, feedbackRoles);

export default router;
