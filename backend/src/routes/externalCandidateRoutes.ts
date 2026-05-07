import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  apply,
  get,
  list,
  review,
  assignEvals,
  promote,
  beginTest,
  finishTest,
  reject,
  getEvaluation,
  listMyEvaluations,
  evaluate,
} from '../controllers/externalCandidateController';

const router = Router();

router.use(authenticateJWT);

router.post('/', apply);
router.get('/', list);
router.get('/:id', get);
router.post('/:id/review', review);
router.post('/:id/assign-evaluators', assignEvals);
router.post('/:id/promote', promote);
router.post('/:id/start-test', beginTest);
router.post('/:id/complete-test', finishTest);
router.post('/:id/reject', reject);

// Evaluator-facing (anonymized)
router.get('/:id/evaluation', getEvaluation);
router.post('/:id/evaluate', evaluate);

export default router;
