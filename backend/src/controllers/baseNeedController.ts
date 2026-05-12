/**
 * baseNeedController.ts
 *
 * HTTP handlers para el protocolo de Necesidad Base.
 * Responde a secciones 6.2, 6.3, 6.4 del diseño.
 */

import { Request, Response } from 'express';
import { prisma } from '../index';
import {
  sedimentNeed,
  checkSedimentationEligibility,
} from '../services/baseNeedService';

/**
 * POST /api/needs/:id/sediment
 * Fuerza la sedimentación manual (solo ADMINISTRATOR).
 */
export const forceSediment = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { id } = req.params;
    const updated = await sedimentNeed(id, req.user.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * GET /api/needs/base
 * Lista necesidades base de un árbol (query: ?treeId=...).
 */
export const getBaseNeeds = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;
    if (!treeId) return res.status(400).json({ error: 'treeId required' });

    const needs = await prisma.need.findMany({
      where: {
        isBase: true,
        treeLinks: { some: { treeId: treeId as string } },
      },
      include: {
        creator: { select: { username: true } },
        _count: { select: { ideas: true, fundings: true } },
        ideas: { select: { id: true, branch: { select: { id: true } } }, orderBy: { likesCount: 'desc' }, take: 1 },
      },
      orderBy: { sedimentedAt: 'desc' },
    });

    res.json(
      needs.map((n: any) => ({
        ...n,
        branchId: n.ideas[0]?.branch?.id ?? null,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch base needs' });
  }
};

/**
 * GET /api/needs/:id/base-status
 * Estado detallado de sedimentación / decay de una necesidad.
 */
export const getBaseStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const need = await prisma.need.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isBase: true,
        sedimentedAt: true,
        baselineUserCount: true,
        createdAt: true,
        status: true,
        relevanceThresholdMet: true,
        lastReviewCycle1: true,
        lastReviewCycle2: true,
        userCountCycle1: true,
        userCountCycle2: true,
      },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Calcular elegibilidad
    const eligibility = need.isBase
      ? null
      : await checkSedimentationEligibility(id);

    const twelveMonthsMs = 365 * 24 * 60 * 60 * 1000;
    const twelveMonthsAgo = new Date(Date.now() - twelveMonthsMs);
    const daysUntilEligible =
      need.createdAt > twelveMonthsAgo
        ? Math.ceil(
            (need.createdAt.getTime() - twelveMonthsAgo.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

    // Si es base, calcular estado actual de decay
    let decayStatus = null;
    if (need.isBase && need.baselineUserCount) {
      const needWithTrees = await prisma.need.findUnique({
        where: { id },
        include: { treeLinks: { select: { treeId: true } } },
      });
      const treeIds =
        needWithTrees?.treeLinks.map(tl => tl.treeId) || [];

      const currentUsers = await prisma.treeMember.count({
        where: { treeId: { in: treeIds }, status: 'VERIFIED' },
      });

      const threshold = Math.floor(need.baselineUserCount * 0.66);
      const cycle2Below =
        need.userCountCycle2 !== null &&
        need.userCountCycle2 < threshold;
      const cycle1Below =
        need.userCountCycle1 !== null &&
        need.userCountCycle1 < threshold;
      const currentBelow = currentUsers < threshold;

      const consecutiveCyclesBelow = [
        currentBelow,
        cycle1Below,
        cycle2Below,
      ].filter(Boolean).length;

      decayStatus = {
        currentUsers,
        baseline: need.baselineUserCount,
        threshold,
        belowThreshold: currentUsers < threshold,
        consecutiveCyclesBelow,
        willDegradeNextCycle:
          currentBelow && need.userCountCycle1 !== null && cycle1Below,
      };
    }

    res.json({
      ...need,
      eligibility: eligibility || {
        eligible: false,
        reason: 'Already Base',
      },
      daysUntilEligible,
      decayStatus,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch base status' });
  }
};
