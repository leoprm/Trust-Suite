import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  addSupportController,
  approveIdeaController,
  archiveIdeaController,
  convertToBranchController,
  createAutosustentoIdeaController,
  getAutosustentoIdeaController,
  getSupportSummaryController,
  listAutosustentoIdeasController,
  rejectIdeaController,
  removeSupportController,
  submitForReviewController,
  updateAutosustentoIdeaController,
} from '../controllers/autosustentoIdeaController';

const router = Router();

router.use(authenticateJWT);

// Collection endpoints (scoped to Tree)
router.get('/trees/:treeId/autosustento-ideas', listAutosustentoIdeasController);
router.post('/trees/:treeId/autosustento-ideas', createAutosustentoIdeaController);

// Individual idea endpoints
router.get('/autosustento-ideas/:ideaId', getAutosustentoIdeaController);
router.patch('/autosustento-ideas/:ideaId', updateAutosustentoIdeaController);

// Status transitions (admin only)
router.post('/autosustento-ideas/:ideaId/submit-review', submitForReviewController);
router.post('/autosustento-ideas/:ideaId/approve', approveIdeaController);
router.post('/autosustento-ideas/:ideaId/reject', rejectIdeaController);
router.post('/autosustento-ideas/:ideaId/archive', archiveIdeaController);
router.post('/autosustento-ideas/:ideaId/convert-to-branch', convertToBranchController);

// Support endpoints
router.post('/autosustento-ideas/:ideaId/support', addSupportController);
router.delete('/autosustento-ideas/:ideaId/support/:supportType', removeSupportController);
router.get('/autosustento-ideas/:ideaId/support-summary', getSupportSummaryController);

export default router;
