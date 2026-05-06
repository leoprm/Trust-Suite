import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  proposeSkill,
  endorseSkillProposal,
  recordTrialTask,
  getProposals,
  getMyProposals,
  getPhaseInfo,
} from '../controllers/skillController';

const router = Router();
router.use(authenticateJWT);

router.post('/propose', proposeSkill);
router.post('/endorse', endorseSkillProposal);
router.post('/record-trial', recordTrialTask);
router.get('/proposals', getProposals);
router.get('/my-proposals', getMyProposals);
router.get('/phase', getPhaseInfo);

export default router;
