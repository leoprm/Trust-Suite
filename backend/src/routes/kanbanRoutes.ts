import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { proposeKanban, voteKanban, getCostStats, logCost } from '../controllers/kanbanController';

const router = Router();

// POST /api/trees/:treeId/kanban/propose — Crear propuesta kanban y enviar DMs
router.post('/:treeId/kanban/propose', authenticateJWT, proposeKanban);

// POST /api/trees/:treeId/kanban/vote/:proposalId — Votar en propuesta kanban
router.post('/:treeId/kanban/vote/:proposalId', authenticateJWT, voteKanban);

// GET /api/trees/:treeId/kanban/cost-stats — Estadísticas de costos (últimos 30 días)
router.get('/:treeId/kanban/cost-stats', authenticateJWT, getCostStats);

// POST /api/trees/:treeId/kanban/cost-log — Registrar costo real post-ejecución
router.post('/:treeId/kanban/cost-log', authenticateJWT, logCost);

export default router;
