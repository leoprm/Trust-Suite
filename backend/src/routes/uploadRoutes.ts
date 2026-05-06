import { Router } from 'express';
import { uploadEvidence } from '../controllers/uploadController';
import { authenticateJWT } from '../middleware/authMiddleware';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticateJWT);

const evidenceUpload = [
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  (req: any, _res: any, next: any) => {
    req.file = req.files?.file?.[0] || req.files?.image?.[0];
    next();
  },
];

// Legacy-compatible endpoint. Prefer POST /api/tasks/:id/evidence.
router.post('/evidence', evidenceUpload, uploadEvidence);

export default router;
