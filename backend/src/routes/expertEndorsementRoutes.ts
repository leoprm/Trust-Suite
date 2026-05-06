import { Router } from 'express';
import {
  createEndorsementHandler,
  resolveEndorsementHandler,
  getEndorsementsHandler,
  getEndorsementBoostHandler,
} from '../controllers/expertEndorsementController';

import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/',    getEndorsementsHandler);
router.get('/boost', getEndorsementBoostHandler);
router.post('/',   createEndorsementHandler);
router.post('/:endorsementId/resolve', resolveEndorsementHandler);

export default router;
