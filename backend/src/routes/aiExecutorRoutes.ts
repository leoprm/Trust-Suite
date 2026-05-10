import { Router } from 'express';
import { webhookDelivery } from '../controllers/aiExecutorController';

const router = Router();

// POST /api/ai/webhook/delivery — Hermes Agent notifica cuando termina una tarea kanban
router.post('/webhook/delivery', webhookDelivery);

export default router;
