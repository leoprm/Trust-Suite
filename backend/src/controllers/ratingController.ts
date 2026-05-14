import { Response } from 'express';
import { applyRatings, getAgentStats } from '../services/ratingService';
import { updateProfileFromRating } from '../services/agentProfileService';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

/**
 * POST /api/ratings
 * Body: { agentId, treeId, taskId, ratings: [{ role, stars }] }
 * Applies ratings → XP → level-up for an agent in a tree.
 */
export const createRating = async (req: any, res: Response) => {
  try {
    const { agentId, treeId, taskId, ratings, crossTreeContribution } = req.body;

    if (!agentId || !treeId || !taskId) {
      return res.status(400).json({ error: 'agentId, treeId, and taskId are required' });
    }

    if (!Array.isArray(ratings) || ratings.length === 0) {
      return res.status(400).json({ error: 'ratings must be a non-empty array of { role, stars }' });
    }

    for (const r of ratings) {
      if (!r.role || typeof r.stars !== 'number' || r.stars < 1 || r.stars > 10) {
        return res.status(400).json({
          error: 'Each rating must have a role (string) and stars (1-10)',
          invalid: r,
        });
      }
    }

    const shouldCrossTree = crossTreeContribution !== false; // default true
    const result = await applyRatings(agentId, treeId, taskId, ratings, shouldCrossTree);

    // Update cross-tree profile if applicable
    if (shouldCrossTree) {
      for (const r of ratings) {
        await updateProfileFromRating(agentId, r.role, r.stars);
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AGENT_RATED',
      entityType: 'Rating',
      entityId: agentId,
      metadataJson: getRequestMetadata(req, {
        agentId,
        taskId,
        xpGained: result.xpGained,
        beforeLevel: result.beforeLevel,
        afterLevel: result.afterLevel,
        leveledUp: result.leveledUp,
        ratingCount: ratings.length,
        result: 'success',
      }),
      source: 'SYSTEM',
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('[createRating] ERROR:', error?.message || error);
    if (error.message?.includes('not a member')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create rating', detail: error?.message || String(error) });
  }
};

/**
 * GET /api/agents/:id/trees/:treeId/stats
 * Returns level, xp, and totalRatings for an agent in a tree.
 */
export const getAgentTreeStats = async (req: any, res: Response) => {
  try {
    const { id: agentId, treeId } = req.params;

    const stats = await getAgentStats(agentId, treeId);

    if (!stats) {
      return res.status(404).json({ error: 'Agent is not a member of this tree' });
    }

    res.json(stats);
  } catch (error: any) {
    console.error('[getAgentTreeStats] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get agent stats' });
  }
};
