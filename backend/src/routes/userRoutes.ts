import { Router } from 'express';
import { getUserSkills, getUserXpHistory } from '../controllers/userController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// GET /api/users/:id/skills → { skills: { design: 45, frontend: 72 }, totalXp: 117 }
router.get('/:id/skills', authenticateJWT, getUserSkills);

// GET /api/users/:id/xp → historial de XP ganado
router.get('/:id/xp', authenticateJWT, getUserXpHistory);

export default router;
