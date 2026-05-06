import { Router } from 'express';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';
import {
  getBonuses,
  createBonus,
  voteBonus,
  deleteBonus,
} from '../controllers/bonusController';

const router = Router();

// Public read (any member can see the bonus pool)
router.get('/', optionalAuth, getBonuses);

// Authenticated operations
router.use(authenticateJWT);
router.post('/', createBonus);
router.post('/:id/vote', voteBonus);
router.delete('/:id', deleteBonus);

export default router;
