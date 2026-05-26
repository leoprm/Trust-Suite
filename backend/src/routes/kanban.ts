import { Router } from 'express';
import { kanbanWebhook, kanbanBatchWebhook } from '../controllers/kanbanController';

const router = Router();

// POST /api/kanban-webhook — individual task completion (dispatcher per-task webhook)
router.post('/', kanbanWebhook);

// Also accept the full path variant for flexibility
router.post('/webhook', kanbanWebhook);

// POST /api/kanban-webhook/batch — batch completion (fire when ALL tasks done)
router.post('/batch', kanbanBatchWebhook);

export default router;
