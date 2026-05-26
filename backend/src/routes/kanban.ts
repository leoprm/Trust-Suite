import { Router } from 'express';
import { kanbanWebhook } from '../controllers/kanbanController';

const router = Router();

// POST /api/kanban-webhook
router.post('/', kanbanWebhook);

// Also accept the full path variant for flexibility
router.post('/webhook', kanbanWebhook);

export default router;
