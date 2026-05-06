import { Router } from 'express';
import { login, register, getMe, guestJoin } from '../controllers/authController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/guest-join', guestJoin);
router.get('/me', authenticateJWT, getMe);

export default router;
