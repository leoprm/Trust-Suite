// ── Investment Routes ─────────────────────────────────────────────────────────
// Endpoints for investment matching, profiles, and market stats.
// Mounted at /api/investment and /api/trees/:id/investment-profile.
// ──────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import {
  upsertInvestmentProfileHandler,
  getInvestmentProfileHandler,
  listMatchesHandler,
  findSuggestedMatchesHandler,
  proposeMatchHandler,
  acceptMatchHandler,
  rejectMatchHandler,
  rateInvestmentHandler,
  marketStatsHandler,
} from '../controllers/investmentController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// All investment routes require auth
router.use(authenticateJWT);

// ── Matches ──────────────────────────────────────────────────────────────────
router.get('/matches',           listMatchesHandler);
router.get('/matches/suggested', findSuggestedMatchesHandler);
router.post('/matches',          proposeMatchHandler);
router.post('/matches/:id/accept',   acceptMatchHandler);
router.post('/matches/:id/reject',   rejectMatchHandler);
router.post('/matches/:id/rate',     rateInvestmentHandler);

// ── Market Stats ─────────────────────────────────────────────────────────────
router.get('/market-stats', marketStatsHandler);

export default router;
