import { Router } from 'express';
import { submitVaultReport } from '../controllers/vaultController';

const router = Router();

// POST /api/trees/:id/vault/report
// Child tree submits a report to its parent's vault.
// Auth: API key (master or tree-specific). No JWT — only Hermes agents call this.
router.post('/:id/vault/report', submitVaultReport);

export default router;
