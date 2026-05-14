import { Router } from 'express';
import { getCostSummary } from '../controllers/costController';

const router = Router();
router.get('/summary', getCostSummary);

export default router;
