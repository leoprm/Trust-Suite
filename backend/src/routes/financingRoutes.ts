import { Router } from 'express';
import {
  getFinancingConfig,
  updateFinancingConfig,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/financingController';

const router = Router({ mergeParams: true });

// Financing config
router.get('/', getFinancingConfig);
router.put('/', updateFinancingConfig);

// Expenses
router.get('/expenses', getExpenses);
router.post('/expenses', addExpense);
router.put('/expenses/:expenseId', updateExpense);
router.delete('/expenses/:expenseId', deleteExpense);

export default router;
