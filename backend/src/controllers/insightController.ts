import { Request, Response } from 'express';
import { getTreeAccess } from '../services/externalNeedService';
import { logEvent, getRequestContext, getRequestMetadata } from '../services/eventLogService';
import {
  createInsightSignal, getInsightSignals, getInsightSignalById, updateInsightSignal,
  activateInsightSignal, startInternalSearch, markInternalSolutionFound,
  escalateToExternalPeople, markExternalPeopleFailed, escalateToCorporate,
  resolveInsight, cancelInsight, archiveInsight,
} from '../services/insightService';
import {
  addInternalMatch, getInternalMatches, updateInternalMatch, deleteInternalMatch,
  suggestInternalCandidates,
} from '../services/insightInternalSearchService';
import {
  createExternalOpening, getExternalOpenings, getExternalOpeningById, updateExternalOpening,
  openExternalOpening, closeExternalOpening, markEnoughCandidates, markNotEnoughCandidates,
  submitExternalApplication, getApplications, updateApplicationStatus,
  submitOpeningForReview, pauseExternalOpening, cancelExternalOpening, archiveOpening,
  getExternalOpeningByShareToken,
  getApplicationById, startBasicReview, requestMoreInfo,
  inviteApplicationToEndorsement, acceptApplicationNextStep, rejectApplicationFull, archiveApplication,
} from '../services/insightOpeningService';
import {
  createCorporateReferral, getCorporateReferrals, updateCorporateReferral,
  contactCorporateReferral, selectCorporateReferral, rejectCorporateReferral, cancelCorporateReferral,
} from '../services/insightCorporateReferralService';

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireMember(req: Request, res: Response, treeId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return false; }
  const access = await getTreeAccess(userId, treeId, req.user?.role);
  if (!access.isMember) {
    void logEvent({
      ...getRequestContext(req), treeId,
      action: 'PERMISSION_DENIED', entityType: 'InsightSignal', entityId: treeId,
      metadataJson: getRequestMetadata(req, { reason: 'insight_member_required' }),
      severity: 'WARNING', source: 'USER',
    });
    res.status(403).json({ error: 'Tree membership required' });
    return false;
  }
  return true;
}

async function requireAdmin(req: Request, res: Response, treeId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return false; }
  const access = await getTreeAccess(userId, treeId, req.user?.role);
  if (!access.isAdmin) {
    void logEvent({
      ...getRequestContext(req), treeId,
      action: 'PERMISSION_DENIED', entityType: 'InsightSignal', entityId: treeId,
      metadataJson: getRequestMetadata(req, { reason: 'insight_admin_required' }),
      severity: 'WARNING', source: 'USER',
    });
    res.status(403).json({ error: 'Tree admin required' });
    return false;
  }
  return true;
}

async function getInsightAndCheckTree(insightId: string): Promise<{ signal: any; treeId: string } | null> {
  const signal = await getInsightSignalById(insightId);
  if (!signal) return null;
  return { signal, treeId: signal.treeId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight Signals
// ─────────────────────────────────────────────────────────────────────────────

export async function listInsightSignals(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireMember(req, res, treeId)) return;

  const { status, escalationLevel, sourceType, limit, offset } = req.query as Record<string, string>;
  const result = await getInsightSignals(treeId, {
    status, escalationLevel, sourceType,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  return res.json(result);
}

export async function createInsight(req: Request, res: Response) {
  const treeId = String(req.params.treeId || '');
  if (!treeId) return res.status(400).json({ error: 'treeId required' });
  if (!await requireMember(req, res, treeId)) return;

  try {
    const signal = await createInsightSignal({ ...req.body, treeId, createdById: req.user!.id });
    return res.status(201).json(signal);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function getInsight(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireMember(req, res, result.treeId)) return;
  return res.json(result.signal);
}

export async function patchInsight(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;

  try {
    const updated = await updateInsightSignal(insightId, req.body, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// State transitions

async function insightTransition(
  req: Request, res: Response,
  handler: (id: string, actorId: string, ...args: any[]) => Promise<any>,
  ...extraArgs: any[]
) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  try {
    const updated = await handler(insightId, req.user!.id, ...extraArgs);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function activateInsight(req: Request, res: Response) {
  return insightTransition(req, res, activateInsightSignal);
}

export async function startSearch(req: Request, res: Response) {
  return insightTransition(req, res, startInternalSearch);
}

export async function markInternalFound(req: Request, res: Response) {
  return insightTransition(req, res, markInternalSolutionFound, req.body?.notes);
}

export async function escalateExternal(req: Request, res: Response) {
  return insightTransition(req, res, escalateToExternalPeople, req.body?.reason);
}

export async function markExternalFailed(req: Request, res: Response) {
  return insightTransition(req, res, markExternalPeopleFailed, req.body?.notes);
}

export async function escalateCorporate(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  const reason = String(req.body?.reason || '');
  if (!reason) return res.status(400).json({ error: 'reason is required to escalate to corporate' });
  try {
    const updated = await escalateToCorporate(insightId, req.user!.id, reason);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function resolveInsightHandler(req: Request, res: Response) {
  return insightTransition(req, res, resolveInsight, req.body?.notes);
}

export async function cancelInsightHandler(req: Request, res: Response) {
  return insightTransition(req, res, cancelInsight, req.body?.reason);
}

export async function archiveInsightHandler(req: Request, res: Response) {
  return insightTransition(req, res, archiveInsight);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Matches
// ─────────────────────────────────────────────────────────────────────────────

export async function listInternalMatches(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireMember(req, res, result.treeId)) return;
  const matches = await getInternalMatches(insightId);
  return res.json(matches);
}

export async function createInternalMatch(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  try {
    const match = await addInternalMatch({
      ...req.body,
      insightSignalId: insightId,
      treeId: result.treeId,
      actorId: req.user!.id,
    });
    return res.status(201).json(match);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function getCandidateSuggestions(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  const candidates = await suggestInternalCandidates(result.treeId);
  return res.json(candidates);
}

export async function patchInternalMatch(req: Request, res: Response) {
  const matchId = String(req.params.matchId || '');
  const match = await (await import('../index')).prisma.treeMember.findFirst().catch(() => null);
  // Look up the match to find its treeId
  const { prisma } = await import('../index');
  const matchRecord = await (prisma as any).insightInternalMatch.findUnique({
    where: { id: matchId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!matchRecord) return res.status(404).json({ error: 'InsightInternalMatch not found' });
  if (!await requireAdmin(req, res, matchRecord.insightSignal.treeId)) return;
  try {
    const updated = await updateInternalMatch(matchId, req.body, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function removeInternalMatch(req: Request, res: Response) {
  const matchId = String(req.params.matchId || '');
  const { prisma } = await import('../index');
  const matchRecord = await (prisma as any).insightInternalMatch.findUnique({
    where: { id: matchId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!matchRecord) return res.status(404).json({ error: 'InsightInternalMatch not found' });
  if (!await requireAdmin(req, res, matchRecord.insightSignal.treeId)) return;
  await deleteInternalMatch(matchId, req.user!.id);
  return res.status(204).send();
}

export async function selectMatchHandler(req: Request, res: Response) {
  const matchId = String(req.params.matchId || '');
  const { prisma } = await import('../index');
  const matchRecord = await (prisma as any).insightInternalMatch.findUnique({
    where: { id: matchId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!matchRecord) return res.status(404).json({ error: 'InsightInternalMatch not found' });
  if (!await requireAdmin(req, res, matchRecord.insightSignal.treeId)) return;
  const updated = await updateInternalMatch(matchId, { status: 'SELECTED' }, req.user!.id);
  return res.json(updated);
}

export async function declineMatchHandler(req: Request, res: Response) {
  const matchId = String(req.params.matchId || '');
  const { prisma } = await import('../index');
  const matchRecord = await (prisma as any).insightInternalMatch.findUnique({
    where: { id: matchId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!matchRecord) return res.status(404).json({ error: 'InsightInternalMatch not found' });
  if (!await requireAdmin(req, res, matchRecord.insightSignal.treeId)) return;
  const updated = await updateInternalMatch(matchId, { status: 'DECLINED' }, req.user!.id);
  return res.json(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// External Openings
// ─────────────────────────────────────────────────────────────────────────────

export async function listExternalOpenings(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireMember(req, res, result.treeId)) return;
  const openings = await getExternalOpenings(insightId);
  return res.json(openings);
}

export async function createOpening(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  try {
    const opening = await createExternalOpening({
      ...req.body,
      insightSignalId: insightId,
      treeId: result.treeId,
      createdById: req.user!.id,
    });
    return res.status(201).json(opening);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function getOpening(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireMember(req, res, opening.insightSignal.treeId)) return;

  // Return public-safe view (no admin-only fields for non-admins)
  const access = await getTreeAccess(req.user!.id, opening.insightSignal.treeId, req.user?.role);
  if (!access.isAdmin) {
    const { createdById, ...safeOpening } = opening;
    return res.json(safeOpening);
  }
  return res.json(opening);
}

export async function patchOpening(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    const updated = await updateExternalOpening(openingId, req.body, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function openOpening(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    const updated = await openExternalOpening(openingId, opening.insightSignal.treeId, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function closeOpening(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    const updated = await closeExternalOpening(openingId, opening.insightSignal.treeId, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function markEnoughHandler(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    const result = await markEnoughCandidates(openingId, opening.insightSignal.treeId, req.user!.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function markNotEnoughHandler(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    const result = await markNotEnoughCandidates(openingId, opening.insightSignal.treeId, req.user!.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// External Applications
// ─────────────────────────────────────────────────────────────────────────────

export async function listApplications(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  const apps = await getApplications(openingId);
  return res.json(apps);
}

export async function applyToOpening(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  try {
    const application = await submitExternalApplication({
      ...req.body,
      openingId,
      linkedUserId: req.user?.id ?? req.body.linkedUserId,
    });
    // Return minimal confirmation — not the full record with contact data
    return res.status(201).json({
      id: application.id,
      status: application.status,
      message: 'Postulación recibida. Revisaremos tu perfil pronto.',
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function patchApplication(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const { prisma } = await import('../index');
  const app = await (prisma as any).insightExternalApplication.findUnique({
    where: { id: applicationId },
    include: { opening: { include: { insightSignal: { select: { treeId: true } } } } },
  });
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  if (!await requireAdmin(req, res, app.opening.insightSignal.treeId)) return;
  try {
    const allowedPatchStatuses = new Set(['BASIC_REVIEW', 'MORE_INFO_REQUESTED']);
    if (!allowedPatchStatuses.has(String(req.body.status || ''))) {
      return res.status(400).json({ error: 'Use explicit endorsement/reject/archive endpoints for this application status transition' });
    }
    const updated = await updateApplicationStatus(applicationId, req.body.status, req.user!.id, app.opening.insightSignal.treeId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// External Openings — new state transitions
// ─────────────────────────────────────────────────────────────────────────────

export async function submitForReviewHandler(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    return res.json(await submitOpeningForReview(openingId, opening.insightSignal.treeId, req.user!.id));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function pauseOpeningHandler(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    return res.json(await pauseExternalOpening(openingId, opening.insightSignal.treeId, req.user!.id));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function cancelOpeningHandler(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  const { reason } = req.body;
  try {
    return res.json(await cancelExternalOpening(openingId, opening.insightSignal.treeId, req.user!.id, reason));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function archiveOpeningHandler(req: Request, res: Response) {
  const openingId = String(req.params.openingId || '');
  const { prisma } = await import('../index');
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) return res.status(404).json({ error: 'InsightExternalOpening not found' });
  if (!await requireAdmin(req, res, opening.insightSignal.treeId)) return;
  try {
    return res.json(await archiveOpening(openingId, opening.insightSignal.treeId, req.user!.id));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// External Applications — granular handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function getApplicationByIdHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  return res.json(app);
}

export async function startBasicReviewHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  try {
    return res.json(await startBasicReview(applicationId, req.user!.id, treeId));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function requestMoreInfoHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  const { note } = req.body;
  try {
    return res.json(await requestMoreInfo(applicationId, req.user!.id, treeId, note));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function inviteToEndorsementHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  try {
    return res.json(await inviteApplicationToEndorsement(applicationId, req.user!.id, treeId));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function acceptNextStepFullHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  const { reviewNotes } = req.body;
  try {
    return res.json(await acceptApplicationNextStep(applicationId, req.user!.id, treeId, reviewNotes));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function rejectApplicationHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  const { reason } = req.body;
  try {
    return res.json(await rejectApplicationFull(applicationId, req.user!.id, treeId, reason));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

export async function archiveApplicationHandler(req: Request, res: Response) {
  const applicationId = String(req.params.applicationId || '');
  const app = await getApplicationById(applicationId);
  if (!app) return res.status(404).json({ error: 'InsightExternalApplication not found' });
  const treeId = app.opening?.insightSignal?.treeId;
  if (!treeId) return res.status(500).json({ error: 'Application has no associated tree' });
  if (!await requireAdmin(req, res, treeId)) return;
  try {
    return res.json(await archiveApplication(applicationId, req.user!.id, treeId));
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoints (no auth required)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPublicOpening(req: Request, res: Response) {
  const shareToken = String(req.params.shareToken || '');
  const opening = await getExternalOpeningByShareToken(shareToken);
  if (!opening) return res.status(404).json({ error: 'Opening not found or not publicly accessible' });
  if (opening.status !== 'OPEN') return res.status(410).json({ error: 'This opening is not currently accepting applications' });
  return res.json(opening);
}

export async function applyPubliclyHandler(req: Request, res: Response) {
  const shareToken = String(req.params.shareToken || '');
  const opening = await getExternalOpeningByShareToken(shareToken);
  if (!opening) return res.status(404).json({ error: 'Opening not found' });
  if (opening.status !== 'OPEN') return res.status(410).json({ error: 'This opening is not currently accepting applications' });
  if (!['PUBLIC_APPLICATION', 'PUBLIC_METADATA'].includes(opening.publicVisibility ?? ''))
    return res.status(403).json({ error: 'This opening does not accept public applications' });

  const {
    applicantName, applicantEmail, applicantPhone, applicantLocation,
    applicantSummary, motivation, experienceSummary,
    portfolioUrl, externalProfileUrl, evidenceNote, skillTags,
    requestedFiat, requestedBerries, currency,
    availabilityNote, earliestStartDate,
    privacyConsent, termsAccepted,
  } = req.body;

  try {
    const app = await submitExternalApplication({
      openingId: opening.id,
      applicantName,
      applicantEmail,
      applicantPhone,
      applicantLocation,
      applicantSummary,
      motivation,
      experienceSummary,
      portfolioUrl,
      externalProfileUrl,
      evidenceNote,
      skillTags,
      requestedFiat,
      requestedBerries,
      currency,
      availabilityNote,
      earliestStartDate,
      privacyConsent: !!privacyConsent,
      termsAccepted: !!termsAccepted,
    });
    // Only return safe subset — never full application data
    return res.status(201).json({ id: app.id, status: app.status, message: 'Application received successfully' });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Corporate Referrals
// ─────────────────────────────────────────────────────────────────────────────

export async function listCorporateReferrals(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  const referrals = await getCorporateReferrals(insightId);
  return res.json(referrals);
}

export async function createReferral(req: Request, res: Response) {
  const insightId = String(req.params.insightId || '');
  const result = await getInsightAndCheckTree(insightId);
  if (!result) return res.status(404).json({ error: 'InsightSignal not found' });
  if (!await requireAdmin(req, res, result.treeId)) return;
  try {
    const referral = await createCorporateReferral({
      ...req.body,
      insightSignalId: insightId,
      treeId: result.treeId,
      actorId: req.user!.id,
    });
    return res.status(201).json(referral);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function patchReferral(req: Request, res: Response) {
  const referralId = String(req.params.referralId || '');
  const { prisma } = await import('../index');
  const ref = await (prisma as any).insightCorporateReferral.findUnique({
    where: { id: referralId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!ref) return res.status(404).json({ error: 'InsightCorporateReferral not found' });
  if (!await requireAdmin(req, res, ref.insightSignal.treeId)) return;
  try {
    const updated = await updateCorporateReferral(referralId, req.body, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

async function referralAction(req: Request, res: Response, handler: (id: string, treeId: string, actorId: string) => Promise<any>) {
  const referralId = String(req.params.referralId || '');
  const { prisma } = await import('../index');
  const ref = await (prisma as any).insightCorporateReferral.findUnique({
    where: { id: referralId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!ref) return res.status(404).json({ error: 'InsightCorporateReferral not found' });
  if (!await requireAdmin(req, res, ref.insightSignal.treeId)) return;
  try {
    const updated = await handler(referralId, ref.insightSignal.treeId, req.user!.id);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export const contactReferral = (req: Request, res: Response) => referralAction(req, res, contactCorporateReferral);
export const selectReferral = (req: Request, res: Response) => referralAction(req, res, selectCorporateReferral);
export const rejectReferral = (req: Request, res: Response) => referralAction(req, res, rejectCorporateReferral);
export const cancelReferral = (req: Request, res: Response) => referralAction(req, res, cancelCorporateReferral);
