/**
 * teamController.ts — Social map endpoint for team analytics.
 *
 * GET /api/teams/:treeId/social-map — Returns the social map for a tree's members,
 *   with contribution patterns, voting behavior, and topic specializations.
 *   Auth required. Only tree members can view.
 */

import { Request, Response } from 'express';
import { prisma } from '../index';
import { analyzeTreeSocialMap, getTreeSocialProfiles } from '../services/socialMapService';

// ── GET /api/teams/:treeId/social-map ─────────────────────────────────────

export const getSocialMap = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId is required' });
    }

    // Verify tree exists and user is a member
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, name: true, icono: true },
    });

    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { status: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'You must be an active member of this tree' });
    }

    // Check if user requested a refresh (?refresh=true)
    const shouldRefresh = req.query.refresh === 'true';

    let profiles;
    if (shouldRefresh) {
      profiles = await analyzeTreeSocialMap(treeId);
    } else {
      profiles = await getTreeSocialProfiles(treeId);

      // If no profiles exist yet, run analysis
      if (profiles.length === 0) {
        profiles = await analyzeTreeSocialMap(treeId);
      }
    }

    res.json({
      tree: { id: tree.id, name: tree.name, icono: tree.icono },
      members: profiles,
      memberCount: profiles.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[teams/social-map] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to generate social map' });
  }
};

// ── POST /api/teams/:treeId/social-map/refresh ────────────────────────────

export const refreshSocialMap = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId is required' });
    }

    // Verify membership
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { status: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'You must be an active member of this tree' });
    }

    const profiles = await analyzeTreeSocialMap(treeId);

    res.json({
      ok: true,
      memberCount: profiles.length,
      message: `Social map refreshed for ${profiles.length} members`,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[teams/social-map/refresh] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to refresh social map' });
  }
};
