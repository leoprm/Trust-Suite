import { Router } from 'express';
import { aiReputation, aiLeaderboard } from '../controllers/aiReputationController';

const router = Router();

// GET /api/ai/:memberId/reputation — AI reputation card
router.get('/:memberId/reputation', aiReputation);

export default router;
