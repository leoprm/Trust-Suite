import { Router } from 'express';
import { externalTaskCompleted, kanbanTaskCompleted } from '../controllers/hooksController';

const router = Router();

// POST /api/hooks/external-task-completed
router.post('/external-task-completed', externalTaskCompleted);

// POST /api/hooks/kanban-task-completed
router.post('/kanban-task-completed', kanbanTaskCompleted);

export default router;
