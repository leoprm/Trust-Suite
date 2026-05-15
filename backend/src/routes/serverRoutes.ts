import { Router } from 'express';
import { createServer, deleteServer, execServerCommand, getServerStatus } from '../controllers/serverController';
import { authenticateJWT } from '../middleware/authMiddleware';
import { serverExecLimiter } from '../config/rateLimiter';

const router = Router();

router.post('/', authenticateJWT, createServer);
router.delete('/:id', authenticateJWT, deleteServer);
router.get('/:id/status', authenticateJWT, getServerStatus);
router.post('/:id/exec', authenticateJWT, serverExecLimiter, execServerCommand);

export default router;
