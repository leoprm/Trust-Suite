import { Router } from 'express';
import { conciergeHandler, contextHandler, getHistoryHandler, suggestHandler, deltaHandler, snapshotHandler, historyEventsHandler } from '../controllers/conciergeController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/concierge/context — returns fresh tree context (needs, members, social map)
router.post('/context', authenticateJWT, contextHandler);

// POST /api/concierge — authenticated concierge query
router.post('/', authenticateJWT, conciergeHandler);

// POST /api/concierge/suggest — system endpoint for cron-driven notifications (Ari)
// No JWT required — uses HERMES_API_SERVER_KEY header for auth
router.post('/suggest', suggestHandler);

// GET /api/concierge/history — authenticated chat history for a tree
router.get('/history', authenticateJWT, getHistoryHandler);

// ══════════════════════════════════════════════════════════════════════════
// Ari: Caché local + delta sync — new endpoints
// ══════════════════════════════════════════════════════════════════════════

// POST /api/concierge/delta — lightweight push of external-only data
// Auth: HERMES_API_SERVER_KEY (same as suggest)
// Body: { treeId }
router.post('/delta', deltaHandler);

// GET /api/concierge/snapshot?treeId=X — full tree state snapshot
// Auth: HERMES_API_SERVER_KEY
// Called once on Ari startup/reconnect. 5-min cache.
router.get('/snapshot', snapshotHandler);

// GET /api/concierge/history-events?treeId=X&from=YYYY-MM-DD&limit=100
// Auth: JWT — returns event log timeline for a tree with optional date range
router.get('/history-events', authenticateJWT, historyEventsHandler);

export default router;
