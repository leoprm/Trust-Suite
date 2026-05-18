import { Router } from 'express';
import multer from 'multer';
import {
  createExternalTask,
  getExternalTaskById,
  getAvailableTasks,
  getMyTasks,
  claimTask,
  deliverTask,
  approveTask,
  rejectTask,
} from '../controllers/externalTaskController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// Multer: memory storage for deliverable uploads (saved to tree sandbox by controller)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// POST /api/external-tasks — create task (JWT required)
router.post('/', authenticateJWT, createExternalTask);

// GET /api/external-tasks/available — list OPEN tasks (public, optional ?skills=)
router.get('/available', getAvailableTasks);

// GET /api/external-tasks/my — tasks where workerId = authenticated user
router.get('/my', authenticateJWT, getMyTasks);

// GET /api/external-tasks/:id — task detail with dynamic price (public)
router.get('/:id', getExternalTaskById);

// POST /api/external-tasks/:id/claim — OPEN → CLAIMED
router.post('/:id/claim', authenticateJWT, claimTask);

// POST /api/external-tasks/:id/deliver — CLAIMED → DELIVERED (multipart)
router.post('/:id/deliver', authenticateJWT, upload.single('deliverable'), deliverTask);

// POST /api/external-tasks/:id/approve — DELIVERED → APPROVED (tree member)
router.post('/:id/approve', authenticateJWT, approveTask);

// POST /api/external-tasks/:id/reject — DELIVERED → REJECTED (tree member)
router.post('/:id/reject', authenticateJWT, rejectTask);

export default router;
