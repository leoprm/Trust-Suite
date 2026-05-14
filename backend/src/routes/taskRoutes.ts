import { Router } from 'express';
import { createTask, getTasks, getTask, routeTaskEndpoint } from '../controllers/taskController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/tasks — create task (auto-evaluates difficulty + routes via TaskRouter)
router.post('/', authenticateJWT, createTask);

// POST /api/tasks/:id/route — manual re-routing (JWT required)
router.post('/:id/route', authenticateJWT, routeTaskEndpoint);

// GET /api/tasks — list tasks (filter by treeId, status, assignedTo)
router.get('/', authenticateJWT, getTasks);

// GET /api/tasks/:id — get single task
router.get('/:id', authenticateJWT, getTask);

export default router;
