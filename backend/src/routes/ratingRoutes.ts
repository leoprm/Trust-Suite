import { Router } from 'express';
import { createRating } from '../controllers/ratingController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/ratings — requires auth
router.post('/', authenticateJWT, createRating);

export default router;
