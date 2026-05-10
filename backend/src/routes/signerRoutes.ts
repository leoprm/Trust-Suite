import { Router } from 'express';
import {
  listSignersHandler,
  createSignerHandler,
  deleteSignerHandler,
} from '../controllers/signerController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router({ mergeParams: true });

router.use(authenticateJWT);

router.get('/', listSignersHandler);
router.post('/', createSignerHandler);
router.delete('/:userId', deleteSignerHandler);

export default router;
