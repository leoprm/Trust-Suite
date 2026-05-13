import { Router } from 'express';
import {
  createNeed,
  getNeeds,
  getNeed,
  updateImportance,
  updateStatus,
} from '../controllers/needV3Controller';
import { getTopIdeas } from '../controllers/ideaController';
import { authenticateJWT, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// ── TMV3 NEED endpoints ─────────────────────────────────────────

// POST /api/needs — crear necesidad con auto-match cross-tree
router.post('/', authenticateJWT, createNeed);

// GET /api/needs?treeId=X — listar necesidades con conteo de ideas
router.get('/', optionalAuth, getNeeds);

// GET /api/needs/:id/top-ideas — top 3 ideas + preValidated flag
// (MUST be before /:id to avoid Express catching 'top-ideas' as param)
router.get('/:id/top-ideas', optionalAuth, getTopIdeas);

// GET /api/needs/:id — detalle con ideas propias + cross-tree
router.get('/:id', optionalAuth, getNeed);

// PATCH /api/needs/:id/importance
router.patch('/:id/importance', authenticateJWT, updateImportance);

// PATCH /api/needs/:id/status
router.patch('/:id/status', authenticateJWT, updateStatus);

export default router;
