import { Router } from 'express';
import { login, register, getMe, guestJoin, getSessionToken, crossLogin } from '../controllers/authController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/guest-join', guestJoin);
router.get('/me', authenticateJWT, getMe);
router.get('/session-token', authenticateJWT, getSessionToken);
router.post('/cross-login', crossLogin);

export default router;
