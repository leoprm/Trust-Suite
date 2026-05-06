import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  activateAutosustentoBranch,
  approveAutosustentoBranch,
  closeAutosustentoBranch,
  createAutosustentoBranchController,
  getAutosustentoBranch,
  getAutosustentoFinancialSummary,
  listAutosustentoBranches,
  pauseAutosustentoBranch,
  rejectAutosustentoBranch,
  submitAutosustentoForReview,
  updateAutosustentoConfigController,
  updateSustainabilitySplit,
} from '../controllers/autosustentoBranchController';

const router = Router();

router.use(authenticateJWT);

router.get('/trees/:treeId/autosustento-branches', listAutosustentoBranches);
router.post('/trees/:treeId/autosustento-branches', createAutosustentoBranchController);

router.get('/autosustento-branches/:branchId', getAutosustentoBranch);
router.patch('/autosustento-branches/:branchId/config', updateAutosustentoConfigController);
router.put('/autosustento-branches/:branchId/sustainability-split', updateSustainabilitySplit);
router.post('/autosustento-branches/:branchId/submit-review', submitAutosustentoForReview);
router.post('/autosustento-branches/:branchId/approve', approveAutosustentoBranch);
router.post('/autosustento-branches/:branchId/activate', activateAutosustentoBranch);
router.post('/autosustento-branches/:branchId/pause', pauseAutosustentoBranch);
router.post('/autosustento-branches/:branchId/close', closeAutosustentoBranch);
router.post('/autosustento-branches/:branchId/reject', rejectAutosustentoBranch);
router.get('/autosustento-branches/:branchId/financial-summary', getAutosustentoFinancialSummary);

export default router;
