import { Router } from 'express';
import { optionalAuth, authenticateJWT } from '../middleware/authMiddleware';
import { searchPublicTrees } from '../services/conciergeService';
import { handleConcierge, handleConciergeChat } from '../controllers/conciergeController';

const router = Router();

console.log('[conciergeRoutes] Router created, registering /chat and /test routes');

// POST /api/concierge — Main conversational endpoint (legacy, no tools)
// Body: { message: "...", mode?: "temporary", contextId?: "<branchId>" }
// Accepts both authenticated and guest users (temp participants use mode='temporary')
router.post('/', optionalAuth, handleConcierge);

// POST /api/concierge/chat — Tool-calling concierge with Hermes Agent
// Body: { message: "...", treeId?: "<treeId>" }
// Requires authentication
router.post('/chat', authenticateJWT, handleConciergeChat);

// GET /api/concierge/test — Quick test endpoint
router.get('/test', (_req: any, res: any) => {
  res.json({ ok: true, chatRoute: 'registered' });
});

// POST /api/concierge/search-trees — Search public trees for member tutorial
// Body: { query: "frontend developer" }
router.post('/search-trees', authenticateJWT, async (req: any, res: any) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Se requiere un query de búsqueda (campo "query").' });
    }
    const userId = req.user!.id;
    const results = await searchPublicTrees(query.trim(), userId);
    return res.json({ trees: results });
  } catch (err: any) {
    console.error('[concierge] search-trees error:', err);
    return res.json({ trees: [] });
  }
});

// /api/concierge/configure-tree was removed — configureTreeFromNL was deleted (TM1-TM6)

export default router;
