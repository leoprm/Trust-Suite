import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  getConversionRate,
  getEngagement,
  getActivity,
  getTopSkills,
  getXpDistribution,
} from '../controllers/metricsController';

const router = Router();

router.get('/conversion-rate', authenticateJWT, getConversionRate);
router.get('/engagement', authenticateJWT, getEngagement);
router.get('/activity', authenticateJWT, getActivity);
router.get('/top-skills', authenticateJWT, getTopSkills);
router.get('/xp-distribution', authenticateJWT, getXpDistribution);

export default router;
