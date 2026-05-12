import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { getWallet, getTransactions } from '../controllers/walletController';

const router = Router();
router.get('/me', authenticateJWT, getWallet);
router.get('/transactions', authenticateJWT, getTransactions);

export default router;
