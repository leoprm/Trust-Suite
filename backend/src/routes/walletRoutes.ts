import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/authMiddleware';
import {
  getWallet,
  getTransactions,
  deposit,
  withdraw,
  transfer,
  approveDeposit,
  rejectDeposit,
  approveWithdrawal,
  rejectWithdrawal,
} from '../controllers/walletController';

const router = Router();

// ── User wallet ────────────────────────────────────────────────────────
router.get('/me', authenticateJWT, getWallet);
router.get('/transactions', authenticateJWT, getTransactions);

// ── Deposit & Withdraw & Transfer ───────────────────────────────────────
router.post('/deposit', authenticateJWT, deposit);
router.post('/withdraw', authenticateJWT, withdraw);
router.post('/transfer', authenticateJWT, transfer);

// ── Admin: approve/reject ──────────────────────────────────────────────
router.post('/admin/deposits/:id/approve', authenticateJWT, requireAdmin, approveDeposit);
router.post('/admin/deposits/:id/reject', authenticateJWT, requireAdmin, rejectDeposit);
router.post('/admin/withdrawals/:id/approve', authenticateJWT, requireAdmin, approveWithdrawal);
router.post('/admin/withdrawals/:id/reject', authenticateJWT, requireAdmin, rejectWithdrawal);

export default router;
