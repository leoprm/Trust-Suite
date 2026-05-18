import { Router } from 'express';
import { externalTaskCompleted } from '../controllers/hooksController';

const router = Router();

// POST /api/hooks/external-task-completed
router.post('/external-task-completed', externalTaskCompleted);

export default router;
