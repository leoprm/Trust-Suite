import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  applyMonthlyFlow,
  getBerryConfig,
  getBerrySummary,
  getMonthlyFlowPreview,
  getMyBalance,
  getMyTransactions,
  putBerryConfig,
} from '../controllers/berryFlowController';

const router = Router();
router.use(authenticateJWT);

// Config
router.get( '/trees/:treeId/berries/config',  getBerryConfig);
router.put( '/trees/:treeId/berries/config',  putBerryConfig);

// My balance & preview
router.get( '/trees/:treeId/berries/me',                    getMyBalance);
router.get( '/trees/:treeId/berries/me/monthly-flow-preview', getMonthlyFlowPreview);
router.get( '/trees/:treeId/berries/me/transactions',       getMyTransactions);

// Admin
router.get( '/trees/:treeId/berries/summary',               getBerrySummary);
router.post('/trees/:treeId/berries/apply-monthly-flow',    applyMonthlyFlow);

export default router;
