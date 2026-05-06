import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { deleteTransaction, updateTransaction } from '../controllers/fiatController';

const router = Router();

router.use(authenticateJWT);
router.patch('/:id', updateTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
