import { Request, Response } from 'express';
import { prisma } from '../index';

// Helper: add XP to a tree member and recalculate level
async function addXP(treeId: string, userId: string, amount: number): Promise<void> {
  const member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
  });
  if (!member) return;

  const newXP = (member as any).xp + amount;
  const newLevel = Math.floor(newXP / 100) + 1;

  await (prisma as any).treeMember.update({
    where: { userId_treeId: { userId, treeId } },
    data: { xp: newXP, level: newLevel },
  });
}

// Stub: needSearchService was removed in V3 cleanup.
// FTS5 search is optional — the try/catch in createIdea handles unavailability gracefully.
const searchNeedsService = async (_query: string): Promise<Array<{ id: string; score: number }>> => [];

// ── POST /api/ideas ────────────────────────────────────────────────────────
// Creates an idea and auto-matches it to needs via FTS5/LIKE.
// Body: { content, treeId? }
//  - treeId provided → match only to needs of THAT tree
//  - NO treeId → match to ALL needs of ALL trees the user belongs to
export const createIdea = async (req: any, res: Response) => {
  try {
    const { content, treeId } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const userId = req.user.id;

    // 1. Create the idea
    const idea = await (prisma as any).idea.create({
      data: {
        content: content.trim(),
        creatorId: userId,
        isGlobal: false,
        totalLikes: 0,
      },
    });

    // 2. Determine which needs to match against
    let targetNeeds: any[];

    if (treeId) {
      // Match only to needs of the specified tree
      targetNeeds = await (prisma as any).need.findMany({
        where: {
          treeId,
          status: 'OPEN',
        },
        select: { id: true, title: true, description: true },
      });
    } else {
      // Match to ALL needs of ALL trees the user belongs to
      const memberships = await prisma.treeMember.findMany({
        where: { userId },
        select: { treeId: true },
      });
      const userTreeIds = memberships.map((m: any) => m.treeId).filter(Boolean);

      if (userTreeIds.length === 0) {
        // No trees — just return the idea without matches
        return res.status(201).json({ idea, matches: [] });
      }

      targetNeeds = await (prisma as any).need.findMany({
        where: {
          treeId: { in: userTreeIds },
          status: 'OPEN',
        },
        select: { id: true, title: true, description: true },
      });
    }

    // 3. Match idea content against needs using simple relevance scoring
    const matches: { needId: string; matchScore: number }[] = [];
    const contentLower = content.toLowerCase();
    const contentWords = contentLower.split(/\s+/).filter((w: string) => w.length > 2);

    for (const need of targetNeeds) {
      const needText = `${need.title} ${need.description || ''}`.toLowerCase();
      let score = 0;

      // Word overlap scoring
      for (const word of contentWords) {
        if (needText.includes(word)) {
          score += 1;
        }
      }

      // Bonus for title match
      if (need.title.toLowerCase().includes(contentLower.substring(0, 30))) {
        score += 2;
      }

      // Normalize: max score = number of words + 2
      const maxScore = contentWords.length + 2;
      const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) / 100 : 0;

      if (normalizedScore > 0) {
        matches.push({ needId: need.id, matchScore: normalizedScore });
      }
    }

    // Sort by score descending, take top 10
    matches.sort((a, b) => b.matchScore - a.matchScore);
    const topMatches = matches.slice(0, 10);

    // 4. Create NeedIdea entries for matches
    const needIdeas = [];
    for (const match of topMatches) {
      const ni = await (prisma as any).needIdea.create({
        data: {
          needId: match.needId,
          ideaId: idea.id,
          matchedBy: 'AI',
          matchScore: match.matchScore,
        },
      });
      needIdeas.push(ni);
    }

    // 5. Also try FTS search if available (via existing needSearchService)
    try {
      const ftsResults = await searchNeedsService(content.trim());
      for (const ftsNeed of ftsResults) {
        // Check if already matched
        if (!topMatches.find((m: any) => m.needId === ftsNeed.id)) {
          // Only add if the need belongs to user's trees (or specified tree)
          const need = targetNeeds.find((n: any) => n.id === ftsNeed.id);
          if (need) {
            await (prisma as any).needIdea.create({
              data: {
                needId: ftsNeed.id,
                ideaId: idea.id,
                matchedBy: 'AI',
                matchScore: ftsNeed.score,
              },
            });
          }
        }
      }
    } catch (_) {
      // FTS may not be available; ignore
    }

    res.status(201).json({ idea, matchCount: topMatches.length });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[createIdea] error:', errMsg);
    res.status(500).json({ error: 'Failed to create Idea' });
  }
};

// ── GET /api/ideas?needId=X ────────────────────────────────────────────────
// Lists ideas for a need, ordered by totalLikes DESC
export const getIdeas = async (req: any, res: Response) => {
  try {
    const { needId } = req.query;
    if (!needId || typeof needId !== 'string') {
      return res.status(400).json({ error: 'needId query parameter is required' });
    }

    // Get ideas linked to this need via NeedIdea
    const needIdeas = await (prisma as any).needIdea.findMany({
      where: { needId },
      include: {
        idea: {
          include: {
            creator: { select: { id: true, username: true } },
            _count: { select: { votes: true } },
          },
        },
      },
      orderBy: { idea: { totalLikes: 'desc' } },
    });

    const ideas = needIdeas.map((ni: any) => ({
      ...ni.idea,
      matchScore: ni.matchScore,
      matchedBy: ni.matchedBy,
    }));

    res.json(ideas);
  } catch (error) {
    console.error('[getIdeas] error:', error);
    res.status(500).json({ error: 'Failed to fetch Ideas' });
  }
};

// ── POST /api/ideas/:id/vote ───────────────────────────────────────────────
// Vote for an idea in the context of a need. Body: { needId }
export const voteIdea = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { needId } = req.body;
    const userId = req.user.id;

    if (!needId) {
      return res.status(400).json({ error: 'needId is required in body' });
    }

    // Verify idea exists
    const idea = await (prisma as any).idea.findUnique({ where: { id } });
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    // Verify need exists
    const need = await (prisma as any).need.findUnique({ where: { id: needId } });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Check if already voted
    const existing = await (prisma as any).ideaVote.findUnique({
      where: {
        ideaId_userId_needId: { ideaId: id, userId, needId },
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'Already voted for this idea in this need' });
    }

    // Create vote
    await (prisma as any).ideaVote.create({
      data: { ideaId: id, userId, needId },
    });

    // Increment totalLikes
    const updated = await (prisma as any).idea.update({
      where: { id },
      data: { totalLikes: { increment: 1 } },
    });

    // Award +5 XP to the idea creator in the need's tree
    if (idea.creatorId && need.treeId && idea.creatorId !== userId) {
      addXP(need.treeId, idea.creatorId, 5).catch(err =>
        console.error(`[voteIdea] addXP failed for idea ${id}:`, err)
      );
    }

    res.json({ message: 'Vote registered', totalLikes: updated.totalLikes });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Already voted for this idea in this need' });
    }
    console.error('[voteIdea] error:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
};

// ── DELETE /api/ideas/:id/vote ─────────────────────────────────────────────
// Remove a vote. Body: { needId }
export const unvoteIdea = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { needId } = req.body;
    const userId = req.user.id;

    if (!needId) {
      return res.status(400).json({ error: 'needId is required in body' });
    }

    // Find and delete the vote
    const vote = await (prisma as any).ideaVote.findUnique({
      where: {
        ideaId_userId_needId: { ideaId: id, userId, needId },
      },
    });

    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    await (prisma as any).ideaVote.delete({
      where: { id: vote.id },
    });

    // Decrement totalLikes (don't go below 0)
    const idea = await (prisma as any).idea.findUnique({ where: { id } });
    const newTotal = Math.max(0, (idea?.totalLikes || 1) - 1);

    await (prisma as any).idea.update({
      where: { id },
      data: { totalLikes: newTotal },
    });

    res.json({ message: 'Vote removed', totalLikes: newTotal });
  } catch (error) {
    console.error('[unvoteIdea] error:', error);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
};

// ── GET /api/needs/:id/top-ideas ───────────────────────────────────────────
// Returns top 3 most-voted ideas for a need, with preValidated flag.
// PreValidated: idea was used in a Result with evaluation >= 7 in ANOTHER tree.
export const getTopIdeas = async (req: any, res: Response) => {
  try {
    const { id: needId } = req.params;

    const need = await (prisma as any).need.findUnique({
      where: { id: needId },
      select: { treeId: true },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Get top 3 ideas by totalLikes
    const needIdeas = await (prisma as any).needIdea.findMany({
      where: { needId },
      include: {
        idea: {
          include: {
            creator: { select: { id: true, username: true } },
            results: {
              where: { evaluation: { gte: 7 } },
              include: {
                need: { select: { treeId: true } },
              },
            },
          },
        },
      },
      orderBy: { idea: { totalLikes: 'desc' } },
      take: 3,
    });

    const needTreeId = need.treeId;

    const topIdeas = needIdeas.map((ni: any) => {
      const idea = ni.idea;
      // Check if any result with evaluation >= 7 exists in a DIFFERENT tree
      const preValidated = idea.results?.some(
        (r: any) => r.evaluation && r.evaluation >= 7 && r.need?.treeId !== needTreeId
      ) ?? false;

      return {
        id: idea.id,
        content: idea.content,
        creator: idea.creator,
        totalLikes: idea.totalLikes,
        isGlobal: idea.isGlobal,
        sourceTreeId: idea.sourceTreeId,
        matchScore: ni.matchScore,
        matchedBy: ni.matchedBy,
        preValidated,
      };
    });

    res.json(topIdeas);
  } catch (error) {
    console.error('[getTopIdeas] error:', error);
    res.status(500).json({ error: 'Failed to fetch top ideas' });
  }
};

// ── Global ideas logic ─────────────────────────────────────────────────────
// Called when a need transitions to SATISFIED or CLOSED.
// Marks all its ideas as isGlobal: true so they survive and can be re-proposed.
export const markIdeasGlobal = async (needId: string): Promise<void> => {
  try {
    const needIdeas = await (prisma as any).needIdea.findMany({
      where: { needId },
      select: { ideaId: true, idea: { select: { sourceTreeId: true } } },
    });

    for (const ni of needIdeas) {
      await (prisma as any).idea.update({
        where: { id: ni.ideaId },
        data: {
          isGlobal: true,
          sourceTreeId: ni.idea.sourceTreeId || undefined,
        },
      });
    }
  } catch (error) {
    console.error(`[markIdeasGlobal] error for need ${needId}:`, error);
  }
};
