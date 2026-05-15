import { Router } from 'express';
import { createTree, joinTree, getMyTrees, getGlobalTrees, getTreeMembers, getTree, leaveTree, inviteMember, removeMember, generateGuestToken, consumeGuestToken, updateTree, deleteTree, getNetworkGraph, getPendingEvidence, toggleCrisisMode, broadcastCrisisSignal, updateMemberPower, inviteAI, getMyLevel, getTreeLedger, createSubTree, getTreeHierarchy, suggestStructure, setBudgetAllocation, getBudgetOverview, getSkillPricing, getMigrationSuggestions, getTechStack, getTreeServers } from '../controllers/treeController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Specific routes before generic /:id capture
router.get('/global', authenticateJWT, getGlobalTrees);
router.get('/network', optionalAuth, getNetworkGraph);
router.get('/network/:centerId', optionalAuth, getNetworkGraph);

// Routes that can optionally be public
router.get('/:id', optionalAuth, getTree);
router.get('/:id/members', optionalAuth, getTreeMembers);
router.get('/:id/hierarchy', optionalAuth, getTreeHierarchy);
router.get('/:id/skill-pricing', optionalAuth, getSkillPricing);
router.get('/:id/tech-stack', optionalAuth, getTechStack);
router.get('/:id/budget-overview', optionalAuth, getBudgetOverview);
router.get('/:id/migration-suggestions', optionalAuth, getMigrationSuggestions);

// All other tree actions require being logged in
router.use(authenticateJWT);

router.post('/', createTree);
router.post('/join', joinTree);
router.post('/suggest-structure', suggestStructure);
router.post('/consume-guest-token', consumeGuestToken);
router.get('/', getMyTrees);
router.get('/:id/my-level', getMyLevel);
router.get('/:id/pending-evidence', getPendingEvidence);
router.post('/:id/invite', inviteMember);
router.post('/:treeId/subtree', createSubTree);
router.put('/:treeId/budget-allocation', setBudgetAllocation);
router.post('/:id/guest-token', generateGuestToken);
router.post('/:id/crisis', toggleCrisisMode);
router.post('/:id/crisis/broadcast', broadcastCrisisSignal);
router.get('/:id/ledger', getTreeLedger);
router.get('/:id/servers', getTreeServers);
router.delete('/:treeId/members/:userId', removeMember);
router.patch('/:id/members/:userId/power', updateMemberPower);
router.delete('/:id/leave', leaveTree);
router.put('/:id', updateTree);
router.post('/:id/invite-ai', inviteAI);
router.delete('/:id', deleteTree);

export default router;
