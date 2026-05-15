import { Router } from 'express';
import { createServer, deleteServer, execServerCommand, execServerAgentCommand, getServerStatus } from '../controllers/serverController';
import { authenticateJWT } from '../middleware/authMiddleware';
import { serverExecLimiter } from '../config/rateLimiter';

const router = Router();

router.post('/', authenticateJWT, createServer);
router.delete('/:id', authenticateJWT, deleteServer);
router.get('/:id/status', authenticateJWT, getServerStatus);
router.post('/:id/exec', authenticateJWT, serverExecLimiter, execServerCommand);
// ── API Key auth (Hermes Agent) ──
router.post('/:id/exec-agent', serverExecLimiter, execServerAgentCommand);

export default router;
