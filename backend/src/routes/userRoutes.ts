import { Router } from 'express';
import { getUserSkills, getUserXpHistory, getMySkills, getWorkerLevels } from '../controllers/userController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// GET /api/users/me/skills → cross-tree profile (skills + level + top 3)
router.get('/me/skills', authenticateJWT, getMySkills);

// GET /api/users/:id/skills → { skills: { design: 45, frontend: 72 }, totalXp: 117 }
router.get('/:id/skills', authenticateJWT, getUserSkills);

// GET /api/users/:id/xp → historial de XP ganado
router.get('/:id/xp', authenticateJWT, getUserXpHistory);

// GET /api/workers/:userId/levels → worker skill levels + history (dashboard)
router.get('/workers/:userId/levels', authenticateJWT, getWorkerLevels);

export default router;
