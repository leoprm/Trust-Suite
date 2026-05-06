import { Router } from 'express';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';
import { deleteEvidenceFile, getEvidenceMetadata, verifyEvidenceChecksum } from '../controllers/fileController';

const router = Router();

router.get('/:evidenceId/metadata', optionalAuth, getEvidenceMetadata);
router.post('/:evidenceId/verify-checksum', authenticateJWT, verifyEvidenceChecksum);
router.delete('/:evidenceId', authenticateJWT, deleteEvidenceFile);

export default router;
