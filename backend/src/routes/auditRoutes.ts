import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  auditPromotion,
  auditInfluence,
  auditQuorum,
  auditConcentration,
} from '../controllers/auditController';

const router = Router();

// Full promotion audit: Need → Branch
router.get('/promotion/:needId', authenticateJWT, auditPromotion);

// Influence snapshot per tree
router.get('/influence/:treeId', authenticateJWT, auditInfluence);

// Quorum breakdown for a Need
router.get('/quorum/:needId', authenticateJWT, auditQuorum);

// Concentration analysis for a Need
router.get('/concentration/:needId', authenticateJWT, auditConcentration);

export default router;
