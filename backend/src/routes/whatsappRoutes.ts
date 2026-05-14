import { Router } from 'express';
import { whatsappVerify, whatsappReceive } from '../controllers/whatsappController';

const router = Router();

// GET  /api/whatsapp/webhook — verificación inicial (Meta configuración)
// POST /api/whatsapp/webhook — recepción de mensajes de WhatsApp Cloud API
router.get('/webhook', whatsappVerify);
router.post('/webhook', whatsappReceive);

export default router;
