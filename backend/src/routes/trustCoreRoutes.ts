import { Router } from 'express';
import { authenticateJWT, requireServerAdmin, requireTreeMember } from '../middleware/authMiddleware';
import {
  optIn,
  optOut,
  updateConfig,
  activate,
  deactivate,
  getGlobalConfig,
  updateGlobalConfig,
  getTreeStats,
  getAdminDashboard,
  withdraw,
} from '../controllers/trustCoreController';

const router = Router();

// ── Tree owner endpoints ────────────────────────────────────────────────
router.patch('/trees/:id/trustcore/opt-in', authenticateJWT, optIn);
router.patch('/trees/:id/trustcore/opt-out', authenticateJWT, optOut);

// ── Tree member endpoints ────────────────────────────────────────────────
router.get('/trees/:id/trustcore/stats', authenticateJWT, requireTreeMember, getTreeStats);

// ── Tree admin endpoints ────────────────────────────────────────────────
router.patch('/trees/:id/trustcore/config', authenticateJWT, updateConfig);
router.post('/trees/:id/trustcore/withdraw', authenticateJWT, withdraw);

// ── Server admin endpoints ──────────────────────────────────────────────
router.get('/admin/trustcore/dashboard', authenticateJWT, requireServerAdmin, getAdminDashboard);
router.post('/admin/trustcore/:treeId/activate', authenticateJWT, requireServerAdmin, activate);
router.post('/admin/trustcore/:treeId/deactivate', authenticateJWT, requireServerAdmin, deactivate);
router.get('/admin/trustcore/config', authenticateJWT, requireServerAdmin, getGlobalConfig);
router.put('/admin/trustcore/config', authenticateJWT, requireServerAdmin, updateGlobalConfig);

export default router;
