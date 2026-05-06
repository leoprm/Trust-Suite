import { Router } from 'express';
import { createNeed, getNeeds, assignPointsToNeed, updateNeed, deleteNeed, getHashtagProposals } from '../controllers/needController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

router.get('/', optionalAuth, getNeeds);
router.get('/hashtag-proposals', authenticateJWT, getHashtagProposals);

router.use(authenticateJWT);
router.post('/', createNeed);
router.patch('/:id', updateNeed);
router.delete('/:id', deleteNeed);
router.post('/:id/fund', assignPointsToNeed);

export default router;
