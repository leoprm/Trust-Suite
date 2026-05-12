import { Router } from 'express';
import { createNeed, getNeeds, getNeed, assignPointsToNeed, updateNeed, deleteNeed, getHashtagProposals, searchNeeds } from '../controllers/needController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';
import { aiGate } from '../middleware/aiEthicsMiddleware';

const router = Router();

router.get('/', optionalAuth, getNeeds);
router.get('/search', optionalAuth, searchNeeds);
router.get('/hashtag-proposals', authenticateJWT, getHashtagProposals);
router.get('/:id', optionalAuth, getNeed);

router.use(authenticateJWT);
router.post('/', aiGate('CREATE_NEED'), createNeed);
router.patch('/:id', updateNeed);
router.delete('/:id', deleteNeed);
router.post('/:id/fund', assignPointsToNeed);

export default router;
