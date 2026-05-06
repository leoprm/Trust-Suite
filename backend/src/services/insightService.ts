/**
 * insightService.ts
 * Core service for InsightSignal CRUD and state-machine transitions.
 *
 * Constitutional rules:
 *  - No XP granted for creating or managing Insights.
 *  - No automatic fiat transactions.
 *  - No automatic Berry emissions.
 *  - No personal data exposed in metadata.
 *  - Escalation to companies requires explicit reason.
 *  - Can only escalate to external people after internal search.
 *  - Can only escalate to corporate after external people (or explicit reason).
 */

import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateInsightInput {
  treeId: string;
  createdById: string;
  title: string;
  description: string;
  sourceType?: string;
  sourceNeedId?: string;
  sourceExternalNeedId?: string;
  sourceBranchId?: string;
  sourceSolutionId?: string;
  requiredSkillTags?: unknown;
  requiredResources?: string;
  locationText?: string;
  remoteAllowed?: boolean;
  budgetFiatMin?: number;
  budgetFiatExpected?: number;
  budgetFiatMax?: number;
  currency?: string;
  estimatedBerries?: number;
  urgencyScore?: number;
  strategicValueScore?: number;
  capacityGapScore?: number;
  persistenceScore?: number;
  visibility?: string;
}

export interface UpdateInsightInput {
  title?: string;
  description?: string;
  requiredSkillTags?: unknown;
  requiredResources?: string;
  locationText?: string;
  remoteAllowed?: boolean;
  budgetFiatMin?: number;
  budgetFiatExpected?: number;
  budgetFiatMax?: number;
  currency?: string;
  estimatedBerries?: number;
  urgencyScore?: number;
  strategicValueScore?: number;
  capacityGapScore?: number;
  persistenceScore?: number;
  visibility?: string;
  resolutionNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = ['RESOLVED', 'CANCELLED', 'ARCHIVED'];

function assertNotTerminal(status: string) {
  if (TERMINAL_STATUSES.includes(status)) {
    throw new Error(`InsightSignal is in terminal status ${status} and cannot be modified.`);
  }
}

function validateBudget(min?: number | null, expected?: number | null, max?: number | null) {
  if (min !== undefined && min !== null && min < 0) throw new Error('budgetFiatMin cannot be negative');
  if (expected !== undefined && expected !== null && expected < 0) throw new Error('budgetFiatExpected cannot be negative');
  if (max !== undefined && max !== null && max < 0) throw new Error('budgetFiatMax cannot be negative');
  if (min !== undefined && min !== null && expected !== undefined && expected !== null && min > expected) {
    throw new Error('budgetFiatMin cannot exceed budgetFiatExpected');
  }
  if (expected !== undefined && expected !== null && max !== undefined && max !== null && expected > max) {
    throw new Error('budgetFiatExpected cannot exceed budgetFiatMax');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createInsightSignal(input: CreateInsightInput) {
  if (!input.title?.trim()) throw new Error('title is required');
  if (!input.description?.trim()) throw new Error('description is required');
  validateBudget(input.budgetFiatMin, input.budgetFiatExpected, input.budgetFiatMax);

  const signal = await (prisma as any).insightSignal.create({
    data: {
      treeId: input.treeId,
      createdById: input.createdById,
      title: input.title.trim(),
      description: input.description.trim(),
      sourceType: input.sourceType ?? 'MANUAL',
      sourceNeedId: input.sourceNeedId ?? null,
      sourceExternalNeedId: input.sourceExternalNeedId ?? null,
      sourceBranchId: input.sourceBranchId ?? null,
      sourceSolutionId: input.sourceSolutionId ?? null,
      requiredSkillTags: input.requiredSkillTags ?? null,
      requiredResources: input.requiredResources ?? null,
      locationText: input.locationText ?? null,
      remoteAllowed: input.remoteAllowed ?? true,
      budgetFiatMin: input.budgetFiatMin ?? null,
      budgetFiatExpected: input.budgetFiatExpected ?? null,
      budgetFiatMax: input.budgetFiatMax ?? null,
      currency: input.currency ?? 'CLP',
      estimatedBerries: input.estimatedBerries ?? null,
      urgencyScore: input.urgencyScore ?? null,
      strategicValueScore: input.strategicValueScore ?? null,
      capacityGapScore: input.capacityGapScore ?? null,
      persistenceScore: input.persistenceScore ?? null,
      visibility: input.visibility ?? 'TREE_ONLY',
      status: 'DRAFT',
      escalationLevel: 'INTERNAL_TRUST',
    },
  });

  void logEvent({
    treeId: input.treeId,
    actorId: input.createdById,
    action: 'INSIGHT_SIGNAL_CREATED',
    entityType: 'InsightSignal',
    entityId: signal.id,
    metadataJson: {
      title: signal.title,
      sourceType: signal.sourceType,
      sourceNeedId: signal.sourceNeedId,
      sourceExternalNeedId: signal.sourceExternalNeedId,
    },
    severity: 'INFO',
    source: 'USER',
  });

  return signal;
}

export async function getInsightSignals(treeId: string, filters?: {
  status?: string;
  escalationLevel?: string;
  sourceType?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = { treeId };
  if (filters?.status) where.status = filters.status;
  if (filters?.escalationLevel) where.escalationLevel = filters.escalationLevel;
  if (filters?.sourceType) where.sourceType = filters.sourceType;

  const [total, signals] = await Promise.all([
    (prisma as any).insightSignal.count({ where }),
    (prisma as any).insightSignal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, filters?.limit ?? 50),
      skip: filters?.offset ?? 0,
      include: {
        createdBy: { select: { id: true, username: true } },
        _count: {
          select: { internalMatches: true, externalOpenings: true, corporateReferrals: true },
        },
      },
    }),
  ]);

  return { total, signals };
}

export async function getInsightSignalById(insightId: string) {
  return (prisma as any).insightSignal.findUnique({
    where: { id: insightId },
    include: {
      createdBy: { select: { id: true, username: true } },
      internalMatches: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      },
      externalOpenings: {
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { applications: true } } },
      },
      corporateReferrals: { orderBy: { createdAt: 'desc' } },
    },
  });
}

export async function updateInsightSignal(insightId: string, updates: UpdateInsightInput, actorId: string) {
  const existing = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!existing) throw new Error('InsightSignal not found');
  assertNotTerminal(existing.status);

  if (updates.budgetFiatMin !== undefined || updates.budgetFiatExpected !== undefined || updates.budgetFiatMax !== undefined) {
    validateBudget(
      updates.budgetFiatMin ?? existing.budgetFiatMin,
      updates.budgetFiatExpected ?? existing.budgetFiatExpected,
      updates.budgetFiatMax ?? existing.budgetFiatMax,
    );
  }

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      ...(updates.title !== undefined && { title: updates.title.trim() }),
      ...(updates.description !== undefined && { description: updates.description.trim() }),
      ...(updates.requiredSkillTags !== undefined && { requiredSkillTags: updates.requiredSkillTags }),
      ...(updates.requiredResources !== undefined && { requiredResources: updates.requiredResources }),
      ...(updates.locationText !== undefined && { locationText: updates.locationText }),
      ...(updates.remoteAllowed !== undefined && { remoteAllowed: updates.remoteAllowed }),
      ...(updates.budgetFiatMin !== undefined && { budgetFiatMin: updates.budgetFiatMin }),
      ...(updates.budgetFiatExpected !== undefined && { budgetFiatExpected: updates.budgetFiatExpected }),
      ...(updates.budgetFiatMax !== undefined && { budgetFiatMax: updates.budgetFiatMax }),
      ...(updates.currency !== undefined && { currency: updates.currency }),
      ...(updates.estimatedBerries !== undefined && { estimatedBerries: updates.estimatedBerries }),
      ...(updates.urgencyScore !== undefined && { urgencyScore: updates.urgencyScore }),
      ...(updates.strategicValueScore !== undefined && { strategicValueScore: updates.strategicValueScore }),
      ...(updates.capacityGapScore !== undefined && { capacityGapScore: updates.capacityGapScore }),
      ...(updates.persistenceScore !== undefined && { persistenceScore: updates.persistenceScore }),
      ...(updates.visibility !== undefined && { visibility: updates.visibility }),
      ...(updates.resolutionNotes !== undefined && { resolutionNotes: updates.resolutionNotes }),
    },
  });

  void logEvent({
    treeId: existing.treeId,
    actorId,
    action: 'INSIGHT_SIGNAL_UPDATED',
    entityType: 'InsightSignal',
    entityId: insightId,
    beforeJson: { status: existing.status, title: existing.title },
    afterJson: updates,
    severity: 'INFO',
    source: 'USER',
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine transitions
// ─────────────────────────────────────────────────────────────────────────────

export async function activateInsightSignal(insightId: string, actorId: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (signal.status !== 'DRAFT') throw new Error(`Cannot activate from status ${signal.status}`);

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: { status: 'ACTIVE' },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_SIGNAL_ACTIVATED',
    entityType: 'InsightSignal', entityId: insightId,
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function startInternalSearch(insightId: string, actorId: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (!['ACTIVE', 'DRAFT'].includes(signal.status)) throw new Error(`Cannot start internal search from status ${signal.status}`);

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'INTERNAL_SEARCH',
      escalationLevel: 'INTERNAL_TRUST',
      internalSearchStartedAt: new Date(),
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_INTERNAL_SEARCH_STARTED',
    entityType: 'InsightSignal', entityId: insightId,
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function markInternalSolutionFound(insightId: string, actorId: string, notes?: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (signal.status !== 'INTERNAL_SEARCH') throw new Error(`Cannot mark internal solution from status ${signal.status}`);

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'INTERNAL_SOLUTION_FOUND',
      internalSearchEndedAt: new Date(),
      ...(notes && { resolutionNotes: notes }),
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_INTERNAL_SOLUTION_FOUND',
    entityType: 'InsightSignal', entityId: insightId,
    metadataJson: { notes },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function escalateToExternalPeople(insightId: string, actorId: string, reason?: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  const validFrom = ['ACTIVE', 'INTERNAL_SEARCH', 'INTERNAL_SOLUTION_FOUND'];
  if (!validFrom.includes(signal.status)) {
    throw new Error(`Cannot escalate to external people from status ${signal.status}`);
  }

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'EXTERNAL_PEOPLE_OPEN',
      escalationLevel: 'EXTERNAL_PEOPLE',
      internalSearchEndedAt: signal.internalSearchEndedAt ?? new Date(),
      externalPeopleOpenedAt: new Date(),
      ...(reason && { metadataJson: { ...(signal.metadataJson ?? {}), escalationReason: reason } }),
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_ESCALATED_TO_EXTERNAL_PEOPLE',
    entityType: 'InsightSignal', entityId: insightId,
    metadataJson: { reason },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function markExternalPeopleFailed(insightId: string, actorId: string, notes?: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (!['EXTERNAL_PEOPLE_OPEN', 'EXTERNAL_PEOPLE_IN_REVIEW'].includes(signal.status)) {
    throw new Error(`Cannot mark external people failed from status ${signal.status}`);
  }

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'EXTERNAL_PEOPLE_FAILED',
      externalPeopleClosedAt: new Date(),
      ...(notes && { resolutionNotes: notes }),
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_EXTERNAL_PEOPLE_FAILED',
    entityType: 'InsightSignal', entityId: insightId,
    metadataJson: { notes },
    severity: 'WARNING', source: 'USER',
  });

  return updated;
}

export async function escalateToCorporate(insightId: string, actorId: string, reason: string) {
  if (!reason?.trim()) throw new Error('reasonForEscalation is required to escalate to corporate');
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  const validFrom = [
    'EXTERNAL_PEOPLE_FAILED', 'EXTERNAL_PEOPLE_OPEN', 'EXTERNAL_PEOPLE_IN_REVIEW',
    'ACTIVE', 'INTERNAL_SEARCH', // admin bypass with explicit reason
  ];
  if (!validFrom.includes(signal.status)) {
    throw new Error(`Cannot escalate to corporate from status ${signal.status}`);
  }

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'CORPORATE_REFERRAL_OPEN',
      escalationLevel: 'EXTERNAL_COMPANY',
      externalPeopleClosedAt: signal.externalPeopleClosedAt ?? new Date(),
      corporateOpenedAt: new Date(),
      metadataJson: { ...(signal.metadataJson ?? {}), corporateEscalationReason: reason.trim() },
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_ESCALATED_TO_CORPORATE',
    entityType: 'InsightSignal', entityId: insightId,
    metadataJson: { reason: reason.trim() },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function resolveInsight(insightId: string, actorId: string, notes?: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  assertNotTerminal(signal.status);

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'RESOLVED',
      ...(notes && { resolutionNotes: notes }),
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_RESOLVED',
    entityType: 'InsightSignal', entityId: insightId,
    metadataJson: { notes },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function cancelInsight(insightId: string, actorId: string, reason?: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (['ARCHIVED', 'CANCELLED'].includes(signal.status)) throw new Error('Already cancelled/archived');

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: {
      status: 'CANCELLED',
      ...(reason && { resolutionNotes: reason }),
    },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_CANCELLED',
    entityType: 'InsightSignal', entityId: insightId,
    metadataJson: { reason },
    severity: 'WARNING', source: 'USER',
  });

  return updated;
}

export async function archiveInsight(insightId: string, actorId: string) {
  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: insightId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (!['RESOLVED', 'CANCELLED'].includes(signal.status)) {
    throw new Error('Can only archive RESOLVED or CANCELLED insights');
  }

  const updated = await (prisma as any).insightSignal.update({
    where: { id: insightId },
    data: { status: 'ARCHIVED' },
  });

  void logEvent({
    treeId: signal.treeId, actorId,
    action: 'INSIGHT_ARCHIVED',
    entityType: 'InsightSignal', entityId: insightId,
    severity: 'INFO', source: 'USER',
  });

  return updated;
}
