import { Router } from 'express';
import { createTask, assignTask, completeTask, getPendingTasks, approveTaskEvidence, createExpressTask, checkEliteForTask } from '../controllers/taskController';
import { authenticateJWT } from '../middleware/authMiddleware';
import { upload } from '../middleware/upload';
import { uploadTaskEvidence } from '../controllers/uploadController';

const router = Router();

router.use(authenticateJWT);

router.get('/pending', getPendingTasks);
router.post('/', createTask);
router.post('/express', createExpressTask);
router.post('/:id/evidence',
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  (req: any, _res, next) => {
    req.file = req.files?.file?.[0] || req.files?.image?.[0];
    next();
  },
  uploadTaskEvidence
);
router.post('/:id/assign', assignTask);
router.get('/:id/elite-check', checkEliteForTask);
router.post('/:id/complete', completeTask);
router.put('/:id/approve-evidence', approveTaskEvidence);

// Difficulty voting
import { submitDifficultyVote, toggleDifficultyVoteLike, submitAudit, submitCivicAudit } from '../controllers/taskController';
router.post('/:id/difficulty-vote', submitDifficultyVote);
router.post('/difficulty-votes/:voteId/like', toggleDifficultyVoteLike);
router.post('/:id/audit', submitAudit);
router.post('/:id/civic-audit', submitCivicAudit);

export default router;
