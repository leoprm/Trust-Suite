/**
 * insightInternalSearchService.ts
 * Manages InsightInternalMatch records — the first escalation level:
 * finding capacity within Trust (users, branches, trees, past tasks, solutions).
 */

import { prisma } from '../index';
import { logEvent } from './eventLogService';

export interface AddInternalMatchInput {
  insightSignalId: string;
  treeId: string;
  matchType: string;
  userId?: string;
  branchId?: string;
  matchTreeId?: string;
  matchScore?: number;
  skillTags?: unknown;
  evidenceSummary?: string;
  availabilityNote?: string;
  actorId: string;
}

export async function addInternalMatch(input: AddInternalMatchInput) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: input.insightSignalId } });
  if (!signal) throw new Error('InsightSignal not found');

  const match = await (prisma as any).insightInternalMatch.create({
    data: {
      insightSignalId: input.insightSignalId,
      matchType: input.matchType,
      userId: input.userId ?? null,
      branchId: input.branchId ?? null,
      treeId: input.matchTreeId ?? null,
      matchScore: input.matchScore ?? null,
      skillTags: input.skillTags ?? null,
      evidenceSummary: input.evidenceSummary ?? null,
      availabilityNote: input.availabilityNote ?? null,
      status: 'SUGGESTED',
    },
  });

  void logEvent({
    treeId: signal.treeId,
    actorId: input.actorId,
    action: 'INSIGHT_INTERNAL_MATCH_ADDED',
    entityType: 'InsightInternalMatch',
    entityId: match.id,
    metadataJson: { matchType: input.matchType, userId: input.userId, branchId: input.branchId },
    severity: 'INFO',
    source: 'USER',
  });

  return match;
}

export async function getInternalMatches(insightSignalId: string) {
  return (prisma as any).insightInternalMatch.findMany({
    where: { insightSignalId },
    orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
    include: { user: { select: { id: true, username: true, visibleForRecruitment: true } } },
  });
}

export async function updateInternalMatch(matchId: string, updates: {
  status?: string;
  evidenceSummary?: string;
  availabilityNote?: string;
  matchScore?: number;
}, actorId: string) {
  const match = await (prisma as any).insightInternalMatch.findUnique({
    where: { id: matchId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!match) throw new Error('InsightInternalMatch not found');

  const updated = await (prisma as any).insightInternalMatch.update({
    where: { id: matchId },
    data: updates,
  });

  if (updates.status === 'SELECTED') {
    void logEvent({
      treeId: match.insightSignal.treeId,
      actorId,
      action: 'INSIGHT_INTERNAL_MATCH_SELECTED',
      entityType: 'InsightInternalMatch',
      entityId: matchId,
      metadataJson: { userId: match.userId, branchId: match.branchId, matchType: match.matchType },
      severity: 'INFO',
      source: 'USER',
    });
  }

  return updated;
}

export async function deleteInternalMatch(matchId: string, actorId: string) {
  const match = await (prisma as any).insightInternalMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error('InsightInternalMatch not found');
  await (prisma as any).insightInternalMatch.delete({ where: { id: matchId } });
}

/**
 * Simple internal search: find users in the Tree who have
 * visibleForRecruitment=true or seekingWork=true, as candidate suggestions.
 * Admin can also manually add any user.
 * This is intentionally simple — no AI/ML in this version.
 */
export async function suggestInternalCandidates(treeId: string) {
  const members = await (prisma as any).treeMember.findMany({
    where: { treeId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          visibleForRecruitment: true,
          seekingWork: true,
          publicProfileEnabled: true,
        },
      },
    },
  });

  // Return members where user explicitly allows visibility
  return members
    .filter((m: any) => m.user?.visibleForRecruitment || m.user?.seekingWork)
    .map((m: any) => ({
      userId: m.userId,
      username: m.user.username,
      level: m.level,
      xp: m.xp,
      visibleForRecruitment: m.user.visibleForRecruitment,
      seekingWork: m.user.seekingWork,
    }));
}
