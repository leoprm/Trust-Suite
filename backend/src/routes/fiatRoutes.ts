import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { 
  addTransaction, 
  getTransactions, 
  getFinancialSummary, 
  getGlobalTransactions, 
  getGlobalFinancialSummary,
  updateTransaction,
  deleteTransaction,
  getEBITDA,
  getFiatLedgerSummaryController
} from '../controllers/fiatController';
import { getTemplates, deleteTemplate } from '../controllers/fiatTemplateController';

const router = Router();

router.use(authenticateJWT);

router.post('/transactions', addTransaction);
router.put('/transactions/:id', updateTransaction);
router.delete('/transactions/:id', deleteTransaction);
router.get('/global/transactions', getGlobalTransactions);
router.get('/global/summary', getGlobalFinancialSummary);
router.get('/tree/:treeId', getTransactions);
router.get('/summary/:treeId', getFinancialSummary);
router.get('/ledger-summary/:treeId', getFiatLedgerSummaryController);
router.get('/ebitda/:treeId', getEBITDA);

// Templates
router.get('/templates/:treeId', getTemplates);
router.delete('/templates/:id', deleteTemplate);

export default router;
