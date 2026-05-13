import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  createFineTuneJob,
  listFineTuneJobs,
  getFineTuneJob,
  startFineTuneJob,
} from '../controllers/finetuneController';

const router = Router();

// POST   /api/finetune/create      — create + optionally auto-start
// GET    /api/finetune/jobs         — list user's jobs
// GET    /api/finetune/jobs/:id     — job detail
// POST   /api/finetune/jobs/:id/start  — manually start a QUEUED job

router.post('/create', authenticateJWT, createFineTuneJob);
router.get('/jobs', authenticateJWT, listFineTuneJobs);
router.get('/jobs/:id', authenticateJWT, getFineTuneJob);
router.post('/jobs/:id/start', authenticateJWT, startFineTuneJob);

export default router;
