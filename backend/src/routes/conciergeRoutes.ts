import { Router } from 'express';
import { optionalAuth, authenticateJWT } from '../middleware/authMiddleware';
import { configureTreeFromNL, searchPublicTrees } from '../services/conciergeService';
import { handleConcierge } from '../controllers/conciergeController';

const router = Router();

// POST /api/concierge — Main conversational endpoint
// Body: { message: "...", mode?: "temporary", contextId?: "<branchId>" }
// Accepts both authenticated and guest users (temp participants use mode='temporary')
router.post('/', optionalAuth, handleConcierge);

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
    return res.status(500).json({ error: 'Error interno al buscar árboles.' });
  }
});

// POST /api/concierge/configure-tree — Tree config extraction from NL
// Body: { message: "descripción en lenguaje natural" }
router.post('/configure-tree', authenticateJWT, async (req: any, res: any) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Se requiere un mensaje en lenguaje natural (campo "message").' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'El mensaje no puede exceder 2000 caracteres.' });
    }

    const result = configureTreeFromNL(message.trim());

    return res.json({
      config: result.config,
      ambiguousFields: result.ambiguousFields,
      warnings: result.warnings,
    });
  } catch (err: any) {
    console.error('[concierge] configure-tree error:', err);
    return res.status(500).json({ error: 'Error interno al procesar la configuración.' });
  }
});

export default router;
