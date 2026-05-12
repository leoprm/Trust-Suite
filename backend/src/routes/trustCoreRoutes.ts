import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireServerAdmin } from '../middleware/authMiddleware';
import {
  optIn,
  optOut,
  updateConfig,
  activate,
  deactivate,
  getGlobalConfig,
  updateGlobalConfig,
  withdraw,
} from '../controllers/trustCoreController';

const router = Router();

// ── Tree owner endpoints ────────────────────────────────────────────────
router.patch('/trees/:id/trustcore/opt-in', authenticateJWT, optIn);
router.patch('/trees/:id/trustcore/opt-out', authenticateJWT, optOut);

// ── Tree admin endpoints ────────────────────────────────────────────────
router.patch('/trees/:id/trustcore/config', authenticateJWT, updateConfig);
router.post('/trees/:id/trustcore/withdraw', authenticateJWT, withdraw);

// ── Server admin endpoints ──────────────────────────────────────────────
router.post('/admin/trustcore/:treeId/activate', authenticateJWT, requireServerAdmin, activate);
router.post('/admin/trustcore/:treeId/deactivate', authenticateJWT, requireServerAdmin, deactivate);
router.get('/admin/trustcore/config', authenticateJWT, requireServerAdmin, getGlobalConfig);
router.put('/admin/trustcore/config', authenticateJWT, requireServerAdmin, updateGlobalConfig);

export default router;
