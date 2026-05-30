import { Router } from 'express';
import {
  voteNeed,
  getVotingNeeds,
  rateDifficulty,
  reviveNeed,
  getCycleStatus,
} from '../controllers/cycleController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// All cycle endpoints require authentication
router.use(authenticateJWT);

// POST /api/trees/:treeId/needs/:needId/vote
router.post('/:treeId/needs/:needId/vote', voteNeed);

// GET /api/trees/:treeId/needs/voting
router.get('/:treeId/needs/voting', getVotingNeeds);

// POST /api/trees/:treeId/needs/:needId/difficulty
router.post('/:treeId/needs/:needId/difficulty', rateDifficulty);

// POST /api/trees/:treeId/needs/:needId/revive
router.post('/:treeId/needs/:needId/revive', reviveNeed);

// GET /api/trees/:treeId/cycle/status
router.get('/:treeId/cycle/status', getCycleStatus);

export default router;
