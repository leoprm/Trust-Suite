import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { getCostSummary } from '../controllers/costController';

const router = Router();
router.get('/summary', authenticateJWT, getCostSummary);

export default router;
