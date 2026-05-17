import { Response } from 'express';
import {
  rateAgentIntervention,
  penalizeAgent,
  getAgentPublicStats,
} from '../services/agentRatingService';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

/**
 * POST /api/agents/:agentId/rate
 * Body: { treeId, dimensions: { useful, annoying, correct }, comment?, description? }
 * Public rating of an agent's intervention — any tree member can rate.
 * Does NOT require a taskId (unlike POST /api/ratings).
 */
export const rateAgent = async (req: any, res: Response) => {
  try {
    const { agentId } = req.params;
    const { treeId, dimensions, description } = req.body;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    if (!dimensions || typeof dimensions !== 'object') {
      return res.status(400).json({
        error: 'dimensions is required and must be an object with useful, annoying, correct booleans',
      });
    }

    const { useful, annoying, correct } = dimensions;

    if (typeof useful !== 'boolean' || typeof annoying !== 'boolean' || typeof correct !== 'boolean') {
      return res.status(400).json({
        error: 'dimensions.useful, dimensions.annoying, and dimensions.correct must be booleans',
      });
    }

    const userId = req.user!.id;
    const result = await rateAgentIntervention(agentId, treeId, userId, dimensions, description);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AGENT_INTERVENTION_RATED',
      entityType: 'AgentIntervention',
      entityId: result.intervention.id,
      metadataJson: getRequestMetadata(req, {
        agentId,
        useful,
        annoying,
        correct,
        xpDelta: result.xpResult?.xpDelta,
        afterLevel: result.xpResult?.afterLevel,
      }),
      source: 'USER',
    });

    res.status(201).json({
      ...result,
      message: result.xpResult?.leveledUp
        ? `¡${result.xpResult?.afterLevel === 1 ? 'Subió' : 'Subió'} a nivel ${result.xpResult.afterLevel}!`
        : result.xpResult?.xpDelta < 0
        ? 'La comunidad ha notado que esta intervención fue molesta.'
        : 'Gracias por calificar.',
    });
  } catch (error: any) {
    console.error('[rateAgent] ERROR:', error?.message || error);
    if (error.message?.includes('is not a member')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to rate agent', detail: error?.message || String(error) });
  }
};

/**
 * POST /api/agents/:agentId/penalize
 * Body: { treeId, interventionId, penalty: 'XP_LOSS' | 'BEHAVIOR_REVIEW' | 'NO_ACTION' }
 * Casts a penalty vote. If >50% of tree members vote, penalty is auto-applied.
 */
export const penalizeAgentEndpoint = async (req: any, res: Response) => {
  try {
    const { agentId } = req.params;
    const { treeId, interventionId, penalty } = req.body;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    if (!interventionId) {
      return res.status(400).json({ error: 'interventionId is required' });
    }

    const validPenalties = ['XP_LOSS', 'BEHAVIOR_REVIEW', 'NO_ACTION'];
    if (!penalty || !validPenalties.includes(penalty)) {
      return res.status(400).json({
        error: `penalty must be one of: ${validPenalties.join(', ')}`,
      });
    }

    const userId = req.user!.id;
    const result = await penalizeAgent(agentId, treeId, interventionId, userId, penalty);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AGENT_PENALTY_VOTED',
      entityType: 'AgentPenaltyVote',
      entityId: result.vote.id,
      metadataJson: getRequestMetadata(req, {
        agentId,
        interventionId,
        penalty,
        thresholdMet: result.thresholdMet,
        penaltyApplied: result.penaltyApplied,
        appliedPenalty: result.appliedPenalty,
      }),
      severity: result.penaltyApplied ? 'WARNING' : 'INFO',
      source: 'USER',
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('[penalizeAgent] ERROR:', error?.message || error);
    if (error.message?.includes('not an active member')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to penalize agent', detail: error?.message || String(error) });
  }
};

/**
 * GET /api/agents/:agentId/public-stats?treeId=X
 * Public stats for an agent: level, xp, rating summary, recent interventions.
 */
export const getPublicStats = async (req: any, res: Response) => {
  try {
    const { agentId } = req.params;
    const { treeId } = req.query;

    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId query parameter is required' });
    }

    const stats = await getAgentPublicStats(agentId, treeId);

    if (!stats) {
      return res.status(404).json({ error: 'Agent is not a member of this tree' });
    }

    res.json(stats);
  } catch (error: any) {
    console.error('[getPublicStats] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get agent stats' });
  }
};
