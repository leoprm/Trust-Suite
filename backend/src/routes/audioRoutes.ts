import { Router } from 'express';
import multer from 'multer';
import { transcribe } from '../controllers/audioController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max audio
});

// POST /api/audio/transcribe — internal endpoint, no auth required
router.post('/transcribe', upload.single('audio'), transcribe);

export default router;
