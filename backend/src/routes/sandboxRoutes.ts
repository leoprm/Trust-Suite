import { Router } from 'express';
import {
  createTreeSandbox,
  getTreeSandbox,
  removeTreeSandbox,
  healthCheckTreeSandbox,
  searchMediaInSandbox,
} from '../controllers/sandboxController';
import {
  execTreeSandbox,
  readTreeSandbox,
  writeTreeSandbox,
  convertTreeSandbox,
  uploadTreeSandbox,
  sandboxUpload,
} from '../controllers/treeSandboxController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/:id/sandbox', getTreeSandbox);
router.get('/:id/sandbox/health', healthCheckTreeSandbox);

// ── JWT-protected endpoints ───────────────────────────────────────────────────
router.post('/:id/sandbox', authenticateJWT, createTreeSandbox);
router.delete('/:id/sandbox', authenticateJWT, removeTreeSandbox);

// ── API Key-protected sandbox ops (Hermes agent calls) ────────────────────────
router.post('/:id/sandbox/exec', execTreeSandbox);
router.post('/:id/sandbox/read', readTreeSandbox);
router.post('/:id/sandbox/write', writeTreeSandbox);
router.post('/:id/sandbox/convert', convertTreeSandbox);
router.post('/:id/sandbox/upload', sandboxUpload.single('file'), uploadTreeSandbox);
router.post('/:id/sandbox/media-search', searchMediaInSandbox);

export default router;
