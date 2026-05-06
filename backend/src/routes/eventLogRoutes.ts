import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { getEntityEventLogs, getMyEventLogs, getTreeEventLogs } from '../controllers/eventLogController';

const router = Router();

router.use(authenticateJWT);

router.get('/me', getMyEventLogs);
router.get('/tree/:treeId', getTreeEventLogs);
router.get('/entity/:entityType/:entityId', getEntityEventLogs);

export default router;
