import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { upload } from '../middleware/upload';
import {
  listTransactions,
  createTransaction,
  getTransaction,
  updateTransaction,
  attachReceipt,
  certify,
  getTreeSummary,
  getBranchSummary,
} from '../controllers/branchOsLedgerController';

const router = Router();

router.use(authenticateJWT);

// Receipt upload middleware helper
const receiptUpload = [
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'receipt', maxCount: 1 }]),
  (req: any, _res: any, next: any) => {
    req.file = req.files?.file?.[0] || req.files?.receipt?.[0];
    next();
  },
];

// ─── Tree-scoped ledger ───────────────────────────────────────────────────────
router.get(   '/trees/:treeId/ledger/fiat',              listTransactions);
router.post(  '/trees/:treeId/ledger/fiat/transactions', createTransaction);
router.get(   '/trees/:treeId/ledger/fiat/summary',      getTreeSummary);

// ─── Branch-scoped summary ───────────────────────────────────────────────────
router.get(   '/branches/:branchId/ledger/fiat/summary', getBranchSummary);

// ─── Transaction-level operations ───────────────────────────────────────────
router.get(   '/ledger/fiat/transactions/:transactionId',          getTransaction);
router.patch( '/ledger/fiat/transactions/:transactionId',          updateTransaction);
router.post(  '/ledger/fiat/transactions/:transactionId/receipt',  receiptUpload as any, attachReceipt);
router.post(  '/ledger/fiat/transactions/:transactionId/certify',  certify);

export default router;
