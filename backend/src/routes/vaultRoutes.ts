import { Router } from 'express';
import { submitVaultReport } from '../controllers/vaultController';

const router = Router();

// POST /api/trees/:treeId/vault/report
// Child tree submits a report to its parent's vault.
router.post('/:treeId/vault/report', submitVaultReport);

export default router;
