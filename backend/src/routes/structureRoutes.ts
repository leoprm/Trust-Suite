import { Router } from 'express';
import { recommend, adopt, progress, history } from '../controllers/structureController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/structure/recommend — public (onboarding flow)
router.post('/recommend', recommend);

// POST /api/structure/adopt — requires auth (modifies tree data)
router.post('/adopt', authenticateJWT, adopt);

// GET /api/structure/progress/:treeId — public (dashboard widget)
router.get('/progress/:treeId', progress);

// GET /api/structure/history/:treeId — public
router.get('/history/:treeId', history);

export default router;
