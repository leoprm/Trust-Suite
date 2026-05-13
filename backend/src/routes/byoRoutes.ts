import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { registerAI, listMyAIs, deleteAI, getSavings } from '../controllers/byoController';

const router = Router();
router.use(authenticateJWT);

router.post('/register', registerAI);
router.get('/my-ais', listMyAIs);
router.get('/savings', getSavings);
router.delete('/:id', deleteAI);

export default router;
