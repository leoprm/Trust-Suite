import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { uploadReceipt, getReceipt, getPayment } from '../controllers/receiptController';

const router = Router({ mergeParams: true });

// GET /api/payments/:id — Payment metadata including OCR data
router.get('/:id', authenticateJWT, getPayment);

// POST /api/payments/:id/receipt — Upload and verify receipt via OCR
router.post('/:id/receipt', authenticateJWT, uploadReceipt);

// GET /api/payments/:id/receipt — View uploaded receipt
router.get('/:id/receipt', authenticateJWT, getReceipt);

export default router;
