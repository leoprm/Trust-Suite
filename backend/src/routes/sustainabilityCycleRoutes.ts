import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  approveSustainabilityCycle,
  calculateSustainabilityCycle,
  deleteSustainabilityCycle,
  getSustainabilityCycle,
  getSustainabilitySummary,
  listSustainabilityCycles,
  lockSustainabilityCycle,
  updateSustainabilityCycle,
  upsertCycleAllocation,
} from '../controllers/sustainabilityCycleController';

const router = Router();
router.use(authenticateJWT);

// Branch-scoped: quick summary and cycle list
router.get('/autosustento-branches/:branchId/sustainability-summary', getSustainabilitySummary);
router.get('/autosustento-branches/:branchId/sustainability-cycles', listSustainabilityCycles);
router.post('/autosustento-branches/:branchId/sustainability-cycles/calculate', calculateSustainabilityCycle);

// Cycle-level operations
router.get('/sustainability-cycles/:cycleId', getSustainabilityCycle);
router.patch('/sustainability-cycles/:cycleId', updateSustainabilityCycle);
router.delete('/sustainability-cycles/:cycleId', deleteSustainabilityCycle);
router.post('/sustainability-cycles/:cycleId/approve', approveSustainabilityCycle);
router.post('/sustainability-cycles/:cycleId/lock', lockSustainabilityCycle);
router.post('/sustainability-cycles/:cycleId/allocations', upsertCycleAllocation);

export default router;
