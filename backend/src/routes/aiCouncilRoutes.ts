import { Router } from 'express';
import { voteImportance, getNeedImportance, getRankedNeeds, generateAuditReport, approveNeeds, getPublicReport } from '../controllers/aiCouncilController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Need-based routes (mounted at /api)
router.post('/needs/:id/vote-importance', authenticateJWT, voteImportance);
router.get('/needs/:id/importance', authenticateJWT, getNeedImportance);

// Tree-based routes (mounted at /api)
router.get('/trees/:id/needs/ranked', optionalAuth, getRankedNeeds);
router.post('/trees/:id/audit-report', authenticateJWT, generateAuditReport);
router.post('/trees/:id/approve-needs', authenticateJWT, approveNeeds);
router.get('/trees/:id/public-report', getPublicReport);

export default router;
