import { Request, Response } from 'express';
import { getAiReputation, getAiLeaderboard } from '../services/aiReputation';

/**
 * GET /api/ai/:memberId/reputation
 * Returns the AI Reputation Card for a specific AI TreeMember.
 */
export const aiReputation = async (req: Request, res: Response) => {
  try {
    const memberId = req.params.memberId as string;

    const card = await getAiReputation(memberId);
    if (!card) {
      return res.status(404).json({ error: 'AI member not found or not an AI' });
    }

    res.json(card);
  } catch (error: any) {
    console.error('[aiReputation] Error:', error);
    res.status(500).json({ error: 'Failed to fetch AI reputation', detail: error.message });
  }
};

/**
 * GET /api/trees/:id/ai/leaderboard
 * Returns the AI leaderboard for a tree, ranked by XP.
 */
export const aiLeaderboard = async (req: Request, res: Response) => {
  try {
    const treeId = req.params.id as string;

    const leaderboard = await getAiLeaderboard(treeId);
    res.json({
      treeId,
      entries: leaderboard,
      total: leaderboard.length,
    });
  } catch (error: any) {
    console.error('[aiLeaderboard] Error:', error);
    res.status(500).json({ error: 'Failed to fetch AI leaderboard', detail: error.message });
  }
};
