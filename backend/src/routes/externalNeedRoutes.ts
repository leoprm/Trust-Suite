import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  addExternalAgent,
  addBudgetLine,
  addScopePreference,
  approveClientSolutionProposal,
  approveExternalNeed,
  approveTreeSolutionProposal,
  archiveSolutionProposal,
  cancelExternalNeed,
  createExternalNeed,
  createSolutionProposal,
  deleteBudgetLine,
  deleteExternalAgent,
  deleteExternalNeed,
  deleteSolutionProposal,
  deleteScopePreference,
  getBudgetSummaryController,
  getExternalNeed,
  getScopeSummaryController,
  getSolutionProposal,
  listExternalNeedsForTree,
  listScopePreferences,
  listSolutions,
  openExternalNeed,
  rejectExternalNeed,
  rejectSolutionProposal,
  reviewSolutionProposal,
  selectSolutionProposal,
  submitSolutionProposal,
  updateBudgetLine,
  updateExternalAgent,
  updateExternalNeed,
  updateScopePreference,
  updateSolutionProposal,
} from '../controllers/externalNeedController';

const router = Router();

router.use(authenticateJWT);

router.get('/trees/:treeId/external-needs', listExternalNeedsForTree);
router.post('/trees/:treeId/external-needs', createExternalNeed);

router.get('/external-needs/:id', getExternalNeed);
router.patch('/external-needs/:id', updateExternalNeed);
router.delete('/external-needs/:id', deleteExternalNeed);
router.post('/external-needs/:id/open', openExternalNeed);
router.post('/external-needs/:id/cancel', cancelExternalNeed);
router.post('/external-needs/:id/approve', approveExternalNeed);
router.post('/external-needs/:id/reject', rejectExternalNeed);

router.post('/external-needs/:id/agents', addExternalAgent);
router.patch('/external-agents/:agentId', updateExternalAgent);
router.delete('/external-agents/:agentId', deleteExternalAgent);

router.post('/external-needs/:id/scope-preferences', addScopePreference);
router.get('/external-needs/:id/scope-preferences', listScopePreferences);
router.get('/external-needs/:id/scope-summary', getScopeSummaryController);
router.patch('/scope-preferences/:scopeId', updateScopePreference);
router.delete('/scope-preferences/:scopeId', deleteScopePreference);

router.get('/external-needs/:id/solutions', listSolutions);
router.post('/external-needs/:id/solutions', createSolutionProposal);
router.get('/solution-proposals/:solutionId', getSolutionProposal);
router.patch('/solution-proposals/:solutionId', updateSolutionProposal);
router.delete('/solution-proposals/:solutionId', deleteSolutionProposal);
router.post('/solution-proposals/:solutionId/submit', submitSolutionProposal);
router.post('/solution-proposals/:solutionId/review', reviewSolutionProposal);
router.post('/solution-proposals/:solutionId/approve-tree', approveTreeSolutionProposal);
router.post('/solution-proposals/:solutionId/approve-client', approveClientSolutionProposal);
router.post('/solution-proposals/:solutionId/select', selectSolutionProposal);
router.post('/solution-proposals/:solutionId/reject', rejectSolutionProposal);
router.post('/solution-proposals/:solutionId/archive', archiveSolutionProposal);

router.post('/solution-proposals/:solutionId/budget-lines', addBudgetLine);
router.get('/solution-proposals/:solutionId/budget-summary', getBudgetSummaryController);
router.patch('/budget-lines/:budgetLineId', updateBudgetLine);
router.delete('/budget-lines/:budgetLineId', deleteBudgetLine);

export default router;
