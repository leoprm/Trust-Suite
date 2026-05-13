import { Router } from 'express';
import { createTask, getTasks, getTask } from '../controllers/taskController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/tasks — create task (auto-evaluates difficulty + assigns AI)
router.post('/', authenticateJWT, createTask);

// GET /api/tasks — list tasks (filter by treeId, status, assignedTo)
router.get('/', authenticateJWT, getTasks);

// GET /api/tasks/:id — get single task
router.get('/:id', authenticateJWT, getTask);

export default router;
