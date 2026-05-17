// ── Investment Controller ─────────────────────────────────────────────────────
// Handlers for investment profile, matching, acceptance, and rating.
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { prisma } from '../index';
import {
  upsertInvestmentProfile,
  getInvestmentProfile,
} from '../services/investmentProfileService';
import {
  findMatchesForTree,
  proposeMatch,
  acceptMatch,
  rejectMatch,
  rateInvestment,
  getMatchesForTree,
} from '../services/investmentMatchingService';
import { getMarketStats } from '../services/investmentMarketStatsService';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ── Profile ──────────────────────────────────────────────────────────────────

export async function upsertInvestmentProfileHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.params.id || '');
    const result = await upsertInvestmentProfile(prisma, treeId, req.body);

    void logEvent({
      ...getRequestContext(req),
      treeId: String(req.params.id || ''),
      actorId: req.user!.id,
      action: 'INVESTMENT_PROFILE_UPDATED',
      entityType: 'TreeInvestmentProfile',
      entityId: String(result.id),
      metadataJson: getRequestMetadata(req, {
        isInvestor: result.isInvestor,
        seekingInvestment: result.seekingInvestment,
      }),
      source: 'USER',
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function getInvestmentProfileHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.params.id || '');
    const profile = await getInvestmentProfile(prisma, treeId);
    if (!profile) return res.status(404).json({ error: 'No investment profile configured' });
    return res.json(profile);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── Matches ──────────────────────────────────────────────────────────────────

export async function listMatchesHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.query.treeId || '');

    if (treeId) {
      const matches = await getMatchesForTree(prisma, treeId);
      return res.json(matches);
    }

    // Otherwise, use the authenticated user's trees
    const memberships = await prisma.treeMember.findMany({
      where: { userId: req.user!.id },
      select: { treeId: true },
    });

    const allMatches: any[] = [];
    for (const m of memberships) {
      const treeMatches = await getMatchesForTree(prisma, m.treeId);
      allMatches.push(...treeMatches);
    }

    const seen = new Set<string>();
    const unique = allMatches.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return res.json(unique);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function findSuggestedMatchesHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.query.treeId || '');

    if (treeId) {
      const matches = await findMatchesForTree(prisma, treeId);
      return res.json(matches);
    }

    const memberships = await prisma.treeMember.findMany({
      where: { userId: req.user!.id },
      select: { treeId: true },
    });

    const allSuggestions: any[] = [];
    for (const m of memberships) {
      try {
        const suggestions = await findMatchesForTree(prisma, m.treeId);
        allSuggestions.push(...suggestions);
      } catch {
        // Skip trees without investment profiles
      }
    }

    return res.json(allSuggestions);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── Match Actions ────────────────────────────────────────────────────────────

export async function proposeMatchHandler(req: Request, res: Response) {
  try {
    const { investorTreeId, seekerTreeId, amount, investmentType, revenueShare, termMonths } = req.body;
    if (!investorTreeId || !seekerTreeId || !amount || !investmentType) {
      return res.status(400).json({ error: 'investorTreeId, seekerTreeId, amount, and investmentType are required' });
    }

    const match = await proposeMatch(
      prisma,
      req.user!.id,
      investorTreeId,
      seekerTreeId,
      amount,
      investmentType,
      revenueShare,
      termMonths,
    );

    void logEvent({
      ...getRequestContext(req),
      actorId: req.user!.id,
      action: 'INVESTMENT_MATCH_PROPOSED',
      entityType: 'InvestmentMatch',
      entityId: match.id,
      metadataJson: getRequestMetadata(req, {
        investorTreeId,
        seekerTreeId,
        amount,
        investmentType,
      }),
      source: 'USER',
    });

    return res.status(201).json(match);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function acceptMatchHandler(req: Request, res: Response) {
  try {
    const matchId = String(req.params.id || '');
    const treeId = String(req.body.treeId || req.query.treeId || '');

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required (which tree is accepting?)' });
    }

    const result = await acceptMatch(prisma, matchId, treeId);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: req.user!.id,
      action: 'INVESTMENT_MATCH_ACCEPTED',
      entityType: 'InvestmentMatch',
      entityId: matchId,
      metadataJson: getRequestMetadata(req, { bothAccepted: result.bothAccepted }),
      source: 'USER',
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function rejectMatchHandler(req: Request, res: Response) {
  try {
    const matchId = String(req.params.id || '');
    const treeId = String(req.body.treeId || req.query.treeId || '');

    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    const match = await rejectMatch(prisma, matchId, treeId);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: req.user!.id,
      action: 'INVESTMENT_MATCH_REJECTED',
      entityType: 'InvestmentMatch',
      entityId: matchId,
      source: 'USER',
    });

    return res.json(match);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function rateInvestmentHandler(req: Request, res: Response) {
  try {
    const matchId = String(req.params.id || '');
    const { treeId, score, comment } = req.body;

    if (!treeId) return res.status(400).json({ error: 'treeId is required (which tree is rating?)' });
    if (!score) return res.status(400).json({ error: 'score (1-5) is required' });

    const rating = await rateInvestment(prisma, matchId, treeId, score, comment);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: req.user!.id,
      action: 'INVESTMENT_PARTNER_RATED',
      entityType: 'InvestmentRating',
      entityId: rating.id,
      metadataJson: getRequestMetadata(req, { matchId, score }),
      source: 'USER',
    });

    return res.status(201).json(rating);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── Market Stats ─────────────────────────────────────────────────────────────

export async function marketStatsHandler(req: Request, res: Response) {
  try {
    const industry = req.query.industry ? String(req.query.industry) : undefined;
    const stats = await getMarketStats(prisma, industry);
    return res.json(stats);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
