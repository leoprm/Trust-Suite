import { Router } from 'express';
import {
  createTreeSandbox,
  getTreeSandbox,
  removeTreeSandbox,
  healthCheckTreeSandbox,
} from '../controllers/sandboxController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/:id/sandbox', getTreeSandbox);
router.get('/:id/sandbox/health', healthCheckTreeSandbox);

// ── JWT-protected endpoints ───────────────────────────────────────────────────
router.post('/:id/sandbox', authenticateJWT, createTreeSandbox);
router.delete('/:id/sandbox', authenticateJWT, removeTreeSandbox);

export default router;
