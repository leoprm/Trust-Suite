import { Router } from 'express';
import { createResult, getResults, evaluateResult } from '../controllers/resultController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.post('/', createResult);
router.get('/', getResults);
router.patch('/:id/evaluate', evaluateResult);

export default router;
