import { Router } from 'express';
import { createIdea, getIdeas, voteIdea, unvoteIdea, getTopIdeas } from '../controllers/ideaController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// GET /api/ideas?needId=X — list ideas for a need (optional auth for public needs)
router.get('/', optionalAuth, getIdeas);

// POST /api/ideas — create idea (auth required)
router.post('/', authenticateJWT, createIdea);

// POST /api/ideas/:id/vote — vote for an idea
router.post('/:id/vote', authenticateJWT, voteIdea);

// DELETE /api/ideas/:id/vote — remove vote
router.delete('/:id/vote', authenticateJWT, unvoteIdea);

// GET /api/needs/:id/top-ideas (mounted on needs router via index.ts)
// We export getTopIdeas for direct mounting

export { getTopIdeas };
export default router;
