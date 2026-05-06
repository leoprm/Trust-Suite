import { Router } from 'express';
import { getBranches, updateBranchPhase, joinBranchPhase, getBranchTasks, createHashtagBranch, searchHashtagBranches, deleteBranch, voteBranchNeed, createDirectBranch, injectBerries } from '../controllers/branchController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

router.get('/', optionalAuth, getBranches);
router.get('/hashtags', optionalAuth, searchHashtagBranches);
router.get('/:id/tasks', optionalAuth, getBranchTasks);

router.use(authenticateJWT);
router.patch('/:id/phase', updateBranchPhase);
router.post('/hashtag', createHashtagBranch);
router.post('/direct', createDirectBranch);
router.post('/:id/phases/:phase/join', joinBranchPhase);
router.post('/:id/vote', voteBranchNeed);
router.post('/:id/inject-berries', injectBerries);
router.delete('/:id', authenticateJWT, deleteBranch);

export default router;
