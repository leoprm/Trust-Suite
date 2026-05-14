import { Router } from 'express';
import { createTree, joinTree, getMyTrees, getGlobalTrees, getTreeMembers, getTree, leaveTree, inviteMember, removeMember, generateGuestToken, consumeGuestToken, updateTree, getNetworkGraph, getPendingEvidence, toggleCrisisMode, broadcastCrisisSignal, updateMemberPower, inviteAI, getMyLevel, getTreeLedger } from '../controllers/treeController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Specific routes before generic /:id capture
router.get('/global', authenticateJWT, getGlobalTrees);
router.get('/network', optionalAuth, getNetworkGraph);
router.get('/network/:centerId', optionalAuth, getNetworkGraph);

// Routes that can optionally be public
router.get('/:id', optionalAuth, getTree);
router.get('/:id/members', optionalAuth, getTreeMembers);

// All other tree actions require being logged in
router.use(authenticateJWT);

router.post('/', createTree);
router.post('/join', joinTree);
router.post('/consume-guest-token', consumeGuestToken);
router.get('/', getMyTrees);
router.get('/:id/my-level', getMyLevel);
router.get('/:id/pending-evidence', getPendingEvidence);
router.post('/:id/invite', inviteMember);
router.post('/:id/guest-token', generateGuestToken);
router.post('/:id/crisis', toggleCrisisMode);
router.post('/:id/crisis/broadcast', broadcastCrisisSignal);
router.get('/:id/ledger', getTreeLedger);
router.delete('/:treeId/members/:userId', removeMember);
router.patch('/:id/members/:userId/power', updateMemberPower);
router.delete('/:id/leave', leaveTree);
router.put('/:id', updateTree);
router.post('/:id/invite-ai', inviteAI);

export default router;
