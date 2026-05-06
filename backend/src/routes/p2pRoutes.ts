import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  createPledge,
  sendFiatPayment,
  confirmPaymentReceived,
  cancelPromise,
  rejectCancellationStampingStrike
} from '../controllers/p2pPromiseController';

const router = Router();

// Todas las operaciones económicas requieren autenticación
router.use(authenticateJWT);

// Pozo Creciente (Fiat & Berries)
router.post('/pledge', createPledge);

// Pago y Verificación (Off-Chain Fiat)
router.post('/:id/payment-sent', sendFiatPayment);
router.post('/:id/payment-received', confirmPaymentReceived);

// Resoluciones y Disputas de Dunbar
router.post('/:id/cancel', cancelPromise);
router.post('/:id/dispute/verify-strike', rejectCancellationStampingStrike);

export default router;
