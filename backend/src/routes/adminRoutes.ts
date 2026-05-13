import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/authMiddleware';
import {
  getAdminStats,
  createUser, getUsers, updateUser, deleteUser,
  createTree, getTrees, updateTree, deleteTree,
  createNeed, getNeeds, updateNeed, deleteNeed,
  getBranches, updateBranch, deleteBranch,
  getDeliverables, updateDeliverable, deleteDeliverable
} from '../controllers/adminController';

const router = Router();

// Secure all admin routes
router.use(authenticateJWT);
router.use(requireAdmin);

// Stats (dashboard)
router.get('/stats', getAdminStats);

// Users
router.get('/users', getUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Trees
router.get('/trees', getTrees);
router.post('/trees', createTree);
router.patch('/trees/:id', updateTree);
router.delete('/trees/:id', deleteTree);

// Needs
router.get('/needs', getNeeds);
router.post('/needs', createNeed);
router.patch('/needs/:id', updateNeed);
router.delete('/needs/:id', deleteNeed);

// Branches
router.get('/branches', getBranches);
router.patch('/branches/:id', updateBranch);
router.delete('/branches/:id', deleteBranch);

// Deliverables
router.get('/deliverables', getDeliverables);
router.patch('/deliverables/:id', updateDeliverable);
router.delete('/deliverables/:id', deleteDeliverable);

export default router;
