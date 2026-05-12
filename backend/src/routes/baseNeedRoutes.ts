import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  forceSediment,
  getBaseNeeds,
  getBaseStatus,
} from '../controllers/baseNeedController';

const router = Router();

// Static segment 'base' — must be mounted before /api/needs router's /:id
router.get('/base', authenticateJWT, getBaseNeeds);

// Specific sub-routes on /:id
router.get('/:id/base-status', authenticateJWT, getBaseStatus);
router.post('/:id/sediment', authenticateJWT, forceSediment);

export default router;
