import { Router } from 'express';
import { createIdea, getIdeasForNeed, toggleLikeIdea, fundIdeaWithBayas } from '../controllers/ideaController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.post('/', createIdea);
router.get('/need/:needId', getIdeasForNeed);
router.post('/:id/like', toggleLikeIdea);
router.post('/:id/fund', fundIdeaWithBayas);

export default router;
