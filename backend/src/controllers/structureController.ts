import { Request, Response } from 'express';
import {
  recommendStructure,
  adoptStructure,
  getStructureProgress,
  getAdoptionHistory,
} from '../services/structureService';

/**
 * POST /api/structure/recommend
 * Body: { groupType, memberCount, totalBudget, roles?, tools? }
 * Returns recommended sub-trees, budget allocation, milestones, capitalInicial, ROI, break-even.
 */
export const recommend = async (req: Request, res: Response) => {
  try {
    const { groupType, memberCount, totalBudget, roles, tools } = req.body;

    if (!groupType || !memberCount || memberCount < 1) {
      return res.status(400).json({
        error: 'groupType (string), memberCount (int >= 1), y totalBudget (float) son requeridos',
      });
    }

    const recommendation = await recommendStructure({
      groupType,
      memberCount: Number(memberCount),
      totalBudget: Number(totalBudget) || 0,
      roles,
      tools,
    });

    res.json(recommendation);
  } catch (error: any) {
    console.error('[structure/recommend] ERROR:', error?.message || error);
    res.status(500).json({
      error: 'Error generando recomendación de estructura',
      detail: error?.message || String(error),
    });
  }
};

/**
 * POST /api/structure/adopt
 * Body: { treeId }
 * Adopts the last recommendation (or creates from tree objectives) as the tree's structure.
 */
export const adopt = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.body;
    const userId = (req as any).user?.id;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId (string) es requerido' });
    }

    // Regenerate recommendation from tree data
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
      return res.status(404).json({ error: 'Árbol no encontrado' });
    }

    const groupType = tree.objectives?.split(',')[0]?.trim() || 'general';

    // Get member count
    const memberCount = await prisma.treeMember.count({
      where: { treeId, status: 'ACTIVE' },
    });

    const totalBudget = tree.totalBudget || 0;

    const recommendation = await recommendStructure({
      groupType,
      memberCount: Math.max(1, memberCount),
      totalBudget,
    });

    const result = await adoptStructure(treeId, recommendation, userId);

    res.json({
      ok: true,
      treeId,
      structure: result.structure,
      milestones: result.milestones,
    });
  } catch (error: any) {
    console.error('[structure/adopt] ERROR:', error?.message || error);
    res.status(500).json({
      error: 'Error adoptando estructura',
      detail: error?.message || String(error),
    });
  }
};

/**
 * GET /api/structure/progress/:treeId
 * Returns live progress vs milestones for a tree's adopted structure.
 */
export const progress = async (req: Request, res: Response) => {
  try {
    const treeId = String(req.params.treeId);

    if (!treeId) {
      return res.status(400).json({ error: 'treeId es requerido' });
    }

    const result = await getStructureProgress(treeId);

    if ('error' in result) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[structure/progress] ERROR:', error?.message || error);
    res.status(500).json({
      error: 'Error consultando progreso',
      detail: error?.message || String(error),
    });
  }
};

/**
 * GET /api/structure/history/:treeId
 * Returns the tree's adopted structure + expense history.
 */
export const history = async (req: Request, res: Response) => {
  try {
    const treeId = String(req.params.treeId);

    if (!treeId) {
      return res.status(400).json({ error: 'treeId es requerido' });
    }

    const result = await getAdoptionHistory(treeId);

    if ('error' in result) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[structure/history] ERROR:', error?.message || error);
    res.status(500).json({
      error: 'Error consultando historial',
      detail: error?.message || String(error),
    });
  }
};
