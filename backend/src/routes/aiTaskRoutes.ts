import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  listAvailableAiTasks,
  manualClaimTask,
  manualReleaseTask,
} from '../controllers/aiTaskController';

const router = Router({ mergeParams: true }); // mergeParams to access :treeId from parent

router.get('/ai/tasks', authenticateJWT, listAvailableAiTasks);
router.post('/ai/claim/:taskId', authenticateJWT, manualClaimTask);
router.post('/ai/release/:taskId', authenticateJWT, manualReleaseTask);

export default router;
