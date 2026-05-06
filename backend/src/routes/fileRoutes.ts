import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { serveEvidenceFile } from '../controllers/fileController';

const router = Router();

router.get('/:fileId', optionalAuth, serveEvidenceFile);

export default router;
