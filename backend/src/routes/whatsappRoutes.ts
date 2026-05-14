import { Router } from 'express';
import { whatsappVerify } from '../controllers/whatsappController';
import { checkWhatsAppConfig } from '../services/whatsappService';

const router = Router();

// GET /api/whatsapp/webhook — verificación del webhook (Meta configuración)
// POST /api/whatsapp/webhook — handled inline in index.ts (raw body before express.json())
router.get('/webhook', whatsappVerify);

// GET /api/whatsapp/health — diagnóstico de conectividad con Cloud API
router.get('/health', async (_req, res) => {
  try {
    const result = await checkWhatsAppConfig();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

export default router;
