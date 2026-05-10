import { Router } from 'express';
import { createTree, joinTree, getMyTrees, getGlobalTrees, getTreeMembers, getTree, leaveTree, inviteMember, removeMember, updateMemberPower, getNetworkGraph, getPendingEvidence, generateGuestToken, consumeGuestToken, toggleCrisisMode, broadcastCrisisSignal } from '../controllers/treeController';
import { addTransaction, getFiatLedgerSummaryController, getTransactions, updateEconomyMode } from '../controllers/fiatController';
import { authenticateJWT, requireAdmin, optionalAuth } from '../middleware/authMiddleware';
import { aiGate } from '../middleware/aiEthicsMiddleware';

const router = Router();

// Specific routes before generic /:id capture
router.get('/global', authenticateJWT, getGlobalTrees);
router.get('/network', optionalAuth, getNetworkGraph);
router.get('/network/:centerId', optionalAuth, getNetworkGraph);
router.get('/:treeId/fiat-ledger', authenticateJWT, getTransactions);
router.get('/:treeId/fiat-ledger/summary', authenticateJWT, getFiatLedgerSummaryController);
router.post('/:treeId/fiat-ledger/transactions', authenticateJWT, (req, _res, next) => {
  req.body = { ...req.body, treeId: req.params.treeId };
  next();
}, addTransaction);
router.patch('/:treeId/economy-mode', authenticateJWT, updateEconomyMode);

// Routes that can optionally be public
router.get('/:id', optionalAuth, getTree);
router.get('/:id/members', optionalAuth, getTreeMembers);

// All other tree actions require being logged in
router.use(authenticateJWT); 

router.post('/', createTree);
router.post('/join', joinTree);
router.post('/consume-guest-token', consumeGuestToken);
router.get('/', getMyTrees);
router.get('/:id/pending-evidence', getPendingEvidence);
router.post('/:id/invite', inviteMember);
router.post('/:id/guest-token', generateGuestToken);
router.post('/:id/crisis', toggleCrisisMode);
router.post('/:id/crisis/broadcast', broadcastCrisisSignal);
router.delete('/:treeId/members/:userId', removeMember);
router.patch('/:id/members/:userId/power', updateMemberPower);
router.delete('/:id/leave', leaveTree);

export default router;
