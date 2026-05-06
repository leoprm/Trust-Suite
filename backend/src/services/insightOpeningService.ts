/**
 * insightOpeningService.ts
 * Manages InsightExternalOpening (convocatorias) and InsightExternalApplication (postulaciones).
 *
 * Rules:
 *  - Applications require privacyConsent = true.
 *  - No automatic XP, Berry, FiatTransaction, or user creation.
 *  - applicantEmail/applicantPhone are sensitive — never in EventLog metadata.
 *  - Admin-only endpoints return full applicant data.
 *  - Public/member endpoints return safe subsets.
 */

import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NON_EDITABLE_STATUSES = ['CLOSED', 'CANCELLED', 'ARCHIVED', 'CONVERTED_TO_VALIDATION'];
const ACCEPTS_APPLICATIONS  = ['OPEN'];
const APP_TERMINAL_STATUSES = ['REJECTED', 'WITHDRAWN', 'ARCHIVED', 'CONVERTED_TO_USER'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function assertOpeningEditable(status: string) {
  if (NON_EDITABLE_STATUSES.includes(status))
    throw new Error(`Opening in status "${status}" cannot be modified`);
}

function validateBudget(
  min?: number | null,
  expected?: number | null,
  max?: number | null,
  label = 'payment',
) {
  if (min != null && min < 0)      throw new Error(`${label}Min must be >= 0`);
  if (expected != null && expected < 0) throw new Error(`${label}Expected must be >= 0`);
  if (max != null && max < 0)      throw new Error(`${label}Max must be >= 0`);
  if (min != null && expected != null && min > expected)
    throw new Error(`${label}Min must be <= ${label}Expected`);
  if (expected != null && max != null && expected > max)
    throw new Error(`${label}Expected must be <= ${label}Max`);
}

// Staged external validation/evaluator committees were removed in favor of the
// newer expert-endorsement concept. Keep external applications as a flat intake
// funnel only: receive → basic review / more info → invite → accept/reject.

// External Openings — create
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateOpeningInput {
  insightSignalId: string;
  treeId: string;
  createdById: string;
  title: string;
  summary?: string;
  description: string;
  requiredSkillTags?: unknown;
  adjacentSkillTags?: unknown;
  desiredExperience?: string;
  desiredEvidence?: string;
  practicalTestNote?: string;
  workMode?: string;
  remoteAllowed?: boolean;
  locationText?: string;
  paymentMode?: string;
  paymentFiatMin?: number;
  paymentFiatExpected?: number;
  paymentFiatMax?: number;
  currency?: string;
  paymentBerries?: number;
  paymentBerriesMin?: number;
  paymentBerriesExpected?: number;
  paymentBerriesMax?: number;
  estimatedDurationDays?: number;
  estimatedHours?: number;
  urgencyLevel?: string;
  riskLevel?: string;
  applicationDeadline?: string;
  maxCandidates?: number;
  minCandidatesNeeded?: number;
  publicVisibility?: string;
}

export async function createExternalOpening(input: CreateOpeningInput) {
  if (!input.title?.trim())       throw new Error('title is required');
  if (!input.description?.trim()) throw new Error('description is required');
  if (!input.requiredSkillTags && !input.desiredEvidence)
    throw new Error('At least requiredSkillTags or desiredEvidence must be specified');

  validateBudget(input.paymentFiatMin, input.paymentFiatExpected, input.paymentFiatMax, 'paymentFiat');
  validateBudget(
    input.paymentBerriesMin ?? input.paymentBerries,
    input.paymentBerriesExpected,
    input.paymentBerriesMax,
    'paymentBerries',
  );
  if (input.estimatedDurationDays != null && input.estimatedDurationDays <= 0)
    throw new Error('estimatedDurationDays must be positive');
  if (input.estimatedHours != null && input.estimatedHours <= 0)
    throw new Error('estimatedHours must be positive');
  if (input.applicationDeadline) {
    const d = new Date(input.applicationDeadline);
    if (isNaN(d.getTime()) || d <= new Date()) throw new Error('applicationDeadline must be a future date');
  }
  if (input.maxCandidates != null && input.maxCandidates <= 0)
    throw new Error('maxCandidates must be positive');

  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: input.insightSignalId } });
  if (!signal) throw new Error('InsightSignal not found');
  if (['CANCELLED', 'RESOLVED', 'ARCHIVED'].includes(signal.status))
    throw new Error(`Cannot create opening for InsightSignal in status "${signal.status}"`);

  const opening = await (prisma as any).insightExternalOpening.create({
    data: {
      insightSignalId: input.insightSignalId,
      treeId:          input.treeId,
      createdById:     input.createdById,
      title:           input.title.trim(),
      summary:         input.summary?.trim() ?? null,
      description:     input.description.trim(),
      status:          'DRAFT',
      requiredSkillTags:    input.requiredSkillTags ?? null,
      adjacentSkillTags:    input.adjacentSkillTags ?? null,
      desiredExperience:    input.desiredExperience ?? null,
      desiredEvidence:      input.desiredEvidence ?? null,
      practicalTestNote:    input.practicalTestNote ?? null,
      workMode:        input.workMode ?? 'REMOTE_ALLOWED',
      remoteAllowed:   input.remoteAllowed ?? true,
      locationText:    input.locationText ?? null,
      paymentMode:     input.paymentMode ?? 'FIAT',
      paymentFiatMin:       input.paymentFiatMin ?? null,
      paymentFiatExpected:  input.paymentFiatExpected ?? null,
      paymentFiatMax:       input.paymentFiatMax ?? null,
      currency:        input.currency ?? 'CLP',
      paymentBerries:          input.paymentBerries ?? null,
      paymentBerriesMin:       input.paymentBerriesMin ?? null,
      paymentBerriesExpected:  input.paymentBerriesExpected ?? null,
      paymentBerriesMax:       input.paymentBerriesMax ?? null,
      estimatedDurationDays:   input.estimatedDurationDays ?? null,
      estimatedHours:          input.estimatedHours ?? null,
      urgencyLevel:    input.urgencyLevel ?? 'MEDIUM',
      riskLevel:       input.riskLevel ?? 'MEDIUM',
      applicationDeadline:  input.applicationDeadline ? new Date(input.applicationDeadline) : null,
      maxCandidates:        input.maxCandidates ?? null,
      minCandidatesNeeded:  input.minCandidatesNeeded ?? 1,
      publicVisibility: input.publicVisibility ?? 'TRUST_NETWORK',
    },
  });

  void logEvent({
    treeId: input.treeId,
    actorId: input.createdById,
    action: 'EXTERNAL_OPENING_CREATED',
    entityType: 'InsightExternalOpening',
    entityId: opening.id,
    metadataJson: { insightSignalId: input.insightSignalId, title: input.title, paymentMode: input.paymentMode ?? 'FIAT' },
    severity: 'INFO',
    source: 'USER',
  });

  return opening;
}

// ─────────────────────────────────────────────────────────────────────────────
// External Openings — list & get
// ─────────────────────────────────────────────────────────────────────────────

export async function getExternalOpenings(insightSignalId: string) {
  return (prisma as any).insightExternalOpening.findMany({
    where: { insightSignalId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { applications: true } } },
  });
}

export async function getExternalOpeningById(openingId: string) {
  return (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: {
      _count: { select: { applications: true } },
      insightSignal: { select: { treeId: true, status: true } },
    },
  });
}

export async function getExternalOpeningByShareToken(shareToken: string) {
  return (prisma as any).insightExternalOpening.findUnique({
    where: { externalShareToken: shareToken },
    select: {
      id: true, title: true, summary: true, description: true,
      status: true, workMode: true, remoteAllowed: true, locationText: true,
      paymentMode: true, paymentFiatMin: true, paymentFiatExpected: true, paymentFiatMax: true,
      currency: true, paymentBerriesMin: true, paymentBerriesExpected: true, paymentBerriesMax: true,
      requiredSkillTags: true, adjacentSkillTags: true,
      desiredExperience: true, desiredEvidence: true,
      estimatedDurationDays: true, estimatedHours: true,
      urgencyLevel: true, applicationDeadline: true,
      publicVisibility: true, createdAt: true,
      _count: { select: { applications: true } },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// External Openings — update
// ─────────────────────────────────────────────────────────────────────────────

export async function updateExternalOpening(
  openingId: string,
  updates: Partial<Omit<CreateOpeningInput, 'insightSignalId' | 'treeId' | 'createdById'>>,
  actorId: string,
) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: openingId },
    include: { insightSignal: { select: { treeId: true } } },
  });
  if (!opening) throw new Error('InsightExternalOpening not found');
  assertOpeningEditable(opening.status);

  if (updates.paymentFiatMin !== undefined || updates.paymentFiatExpected !== undefined || updates.paymentFiatMax !== undefined) {
    validateBudget(
      updates.paymentFiatMin ?? opening.paymentFiatMin,
      updates.paymentFiatExpected ?? opening.paymentFiatExpected,
      updates.paymentFiatMax ?? opening.paymentFiatMax,
      'paymentFiat',
    );
  }
  if (updates.applicationDeadline) {
    const d = new Date(updates.applicationDeadline);
    if (isNaN(d.getTime())) throw new Error('Invalid applicationDeadline');
    if (d <= new Date() && opening.status === 'OPEN') throw new Error('applicationDeadline must be future while OPEN');
  }

  const updated = await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: {
      ...(updates.title           !== undefined && { title: updates.title.trim() }),
      ...(updates.summary         !== undefined && { summary: updates.summary?.trim() ?? null }),
      ...(updates.description     !== undefined && { description: updates.description.trim() }),
      ...(updates.requiredSkillTags  !== undefined && { requiredSkillTags: updates.requiredSkillTags }),
      ...(updates.adjacentSkillTags  !== undefined && { adjacentSkillTags: updates.adjacentSkillTags }),
      ...(updates.desiredExperience  !== undefined && { desiredExperience: updates.desiredExperience }),
      ...(updates.desiredEvidence    !== undefined && { desiredEvidence: updates.desiredEvidence }),
      ...(updates.practicalTestNote  !== undefined && { practicalTestNote: updates.practicalTestNote }),
      ...(updates.workMode           !== undefined && { workMode: updates.workMode }),
      ...(updates.remoteAllowed      !== undefined && { remoteAllowed: updates.remoteAllowed }),
      ...(updates.locationText       !== undefined && { locationText: updates.locationText }),
      ...(updates.paymentMode        !== undefined && { paymentMode: updates.paymentMode }),
      ...(updates.paymentFiatMin     !== undefined && { paymentFiatMin: updates.paymentFiatMin }),
      ...(updates.paymentFiatExpected !== undefined && { paymentFiatExpected: updates.paymentFiatExpected }),
      ...(updates.paymentFiatMax     !== undefined && { paymentFiatMax: updates.paymentFiatMax }),
      ...(updates.currency           !== undefined && { currency: updates.currency }),
      ...(updates.paymentBerries          !== undefined && { paymentBerries: updates.paymentBerries }),
      ...(updates.paymentBerriesMin       !== undefined && { paymentBerriesMin: updates.paymentBerriesMin }),
      ...(updates.paymentBerriesExpected  !== undefined && { paymentBerriesExpected: updates.paymentBerriesExpected }),
      ...(updates.paymentBerriesMax       !== undefined && { paymentBerriesMax: updates.paymentBerriesMax }),
      ...(updates.estimatedDurationDays   !== undefined && { estimatedDurationDays: updates.estimatedDurationDays }),
      ...(updates.estimatedHours          !== undefined && { estimatedHours: updates.estimatedHours }),
      ...(updates.urgencyLevel   !== undefined && { urgencyLevel: updates.urgencyLevel }),
      ...(updates.riskLevel      !== undefined && { riskLevel: updates.riskLevel }),
      ...(updates.applicationDeadline !== undefined && {
        applicationDeadline: updates.applicationDeadline ? new Date(updates.applicationDeadline) : null,
      }),
      ...(updates.maxCandidates       !== undefined && { maxCandidates: updates.maxCandidates }),
      ...(updates.minCandidatesNeeded !== undefined && { minCandidatesNeeded: updates.minCandidatesNeeded }),
      ...(updates.publicVisibility    !== undefined && { publicVisibility: updates.publicVisibility }),
    },
  });

  void logEvent({
    treeId: opening.insightSignal.treeId, actorId,
    action: 'EXTERNAL_OPENING_UPDATED',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// External Openings — state transitions
// ─────────────────────────────────────────────────────────────────────────────

export async function submitOpeningForReview(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (opening.status !== 'DRAFT') throw new Error(`Can only submit DRAFT openings (current: ${opening.status})`);

  const updated = await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: { status: 'INTERNAL_REVIEW' },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_SUBMITTED_FOR_REVIEW',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function openExternalOpening(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (!['DRAFT', 'INTERNAL_REVIEW', 'PAUSED'].includes(opening.status))
    throw new Error(`Cannot open from status "${opening.status}"`);
  if (!opening.description?.trim()) throw new Error('description is required');
  if (!opening.requiredSkillTags && !opening.desiredEvidence)
    throw new Error('At least requiredSkillTags or desiredEvidence must be set before opening');

  const now = new Date();
  if (opening.applicationDeadline && opening.applicationDeadline <= now)
    throw new Error('applicationDeadline is in the past; update it before opening');

  const shareToken =
    opening.externalShareToken ??
    (['PUBLIC_METADATA', 'PUBLIC_APPLICATION', 'TRUST_NETWORK'].includes(opening.publicVisibility)
      ? crypto.randomUUID()
      : null);

  const updated = await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: {
      status: 'OPEN',
      openedAt: opening.openedAt ?? now,
      ...(shareToken && { externalShareToken: shareToken }),
    },
  });

  await (prisma as any).insightSignal.updateMany({
    where: { id: opening.insightSignalId, status: { notIn: ['RESOLVED', 'CANCELLED', 'ARCHIVED'] } },
    data: { status: 'EXTERNAL_PEOPLE_OPEN' },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_OPENED',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function pauseExternalOpening(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (opening.status !== 'OPEN') throw new Error(`Can only pause OPEN openings (current: ${opening.status})`);

  const updated = await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: { status: 'PAUSED' },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_PAUSED',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function closeExternalOpening(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (['CLOSED', 'CANCELLED', 'ARCHIVED', 'CONVERTED_TO_VALIDATION'].includes(opening.status))
    throw new Error(`Opening already in terminal status "${opening.status}"`);

  const updated = await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_CLOSED',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'INFO', source: 'USER',
  });

  return updated;
}

export async function cancelExternalOpening(openingId: string, treeId: string, actorId: string, reason?: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (['ARCHIVED', 'CANCELLED', 'CONVERTED_TO_VALIDATION'].includes(opening.status))
    throw new Error(`Opening already in terminal status "${opening.status}"`);

  const updated = await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      ...(reason ? { metadataJson: { ...(opening.metadataJson as object ?? {}), cancelReason: reason } } : {}),
    },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_CANCELLED',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'WARNING', source: 'USER',
  });

  return updated;
}

export async function archiveOpening(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (!['CLOSED', 'CANCELLED', 'NOT_ENOUGH_CANDIDATES', 'ENOUGH_CANDIDATES', 'CONVERTED_TO_VALIDATION'].includes(opening.status))
    throw new Error(`Can only archive closed/cancelled openings (current: ${opening.status})`);

  return (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: { status: 'ARCHIVED' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// External Openings — markEnough / markNotEnough (kept from existing)
// ─────────────────────────────────────────────────────────────────────────────

export async function markEnoughCandidates(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (!['OPEN', 'CLOSED'].includes(opening.status))
    throw new Error(`Opening must be OPEN or CLOSED (current: ${opening.status})`);

  await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: { status: 'ENOUGH_CANDIDATES', closedAt: opening.closedAt ?? new Date() },
  });

  await (prisma as any).insightSignal.updateMany({
    where: { id: opening.insightSignalId },
    data: { status: 'EXTERNAL_PEOPLE_IN_REVIEW' },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_ENOUGH_CANDIDATES',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'INFO', source: 'USER',
  });

  return { message: 'Marked as enough candidates. Signal advanced to EXTERNAL_PEOPLE_IN_REVIEW.' };
}

export async function markNotEnoughCandidates(openingId: string, treeId: string, actorId: string) {
  const opening = await (prisma as any).insightExternalOpening.findUnique({ where: { id: openingId } });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (!['OPEN', 'CLOSED', 'PAUSED'].includes(opening.status))
    throw new Error(`Opening must be OPEN, CLOSED, or PAUSED (current: ${opening.status})`);

  await (prisma as any).insightExternalOpening.update({
    where: { id: openingId },
    data: { status: 'NOT_ENOUGH_CANDIDATES', closedAt: opening.closedAt ?? new Date() },
  });

  await (prisma as any).insightSignal.updateMany({
    where: { id: opening.insightSignalId },
    data: { status: 'EXTERNAL_PEOPLE_FAILED' },
  });

  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_OPENING_NOT_ENOUGH_CANDIDATES',
    entityType: 'InsightExternalOpening', entityId: openingId,
    metadataJson: { insightSignalId: opening.insightSignalId },
    severity: 'WARNING', source: 'USER',
  });

  return { message: 'Marked as not enough candidates. Signal advanced to EXTERNAL_PEOPLE_FAILED.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// External Applications — submit
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitApplicationInput {
  openingId: string;
  applicantName: string;
  applicantEmail?: string;
  applicantPhone?: string;
  applicantLocation?: string;
  applicantSummary?: string;
  motivation?: string;
  experienceSummary?: string;
  portfolioUrl?: string;
  externalProfileUrl?: string;
  evidenceNote?: string;
  skillTags?: unknown;
  requestedFiat?: number;
  requestedBerries?: number;
  currency?: string;
  availabilityNote?: string;
  earliestStartDate?: string;
  privacyConsent: boolean;
  termsAccepted?: boolean;
  linkedUserId?: string;
  evidenceFileId?: string;
}

export async function submitExternalApplication(input: SubmitApplicationInput) {
  if (!input.applicantName?.trim()) throw new Error('applicantName is required');
  if (!input.privacyConsent) throw new Error('privacyConsent must be true');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!input.applicantEmail?.trim()) {
    if (!input.linkedUserId) throw new Error('applicantEmail is required for external applicants without a linked account');
  } else {
    if (!emailRegex.test(input.applicantEmail)) throw new Error('applicantEmail is not valid');
  }

  if (input.portfolioUrl) {
    try { new URL(input.portfolioUrl); } catch { throw new Error('portfolioUrl is not a valid URL'); }
  }
  if (input.externalProfileUrl) {
    try { new URL(input.externalProfileUrl); } catch { throw new Error('externalProfileUrl is not a valid URL'); }
  }
  if (input.requestedFiat != null && input.requestedFiat < 0) throw new Error('requestedFiat must be >= 0');
  if (input.requestedBerries != null && input.requestedBerries < 0) throw new Error('requestedBerries must be >= 0');

  const opening = await (prisma as any).insightExternalOpening.findUnique({
    where: { id: input.openingId },
    include: { insightSignal: { select: { treeId: true, id: true } } },
  });
  if (!opening) throw new Error('InsightExternalOpening not found');
  if (!ACCEPTS_APPLICATIONS.includes(opening.status))
    throw new Error(`This opening is not accepting applications (status: "${opening.status}")`);
  if (opening.applicationDeadline && new Date() > new Date(opening.applicationDeadline))
    throw new Error('Application deadline has passed');
  if (opening.maxCandidates) {
    const count = await (prisma as any).insightExternalApplication.count({ where: { openingId: input.openingId } });
    if (count >= opening.maxCandidates) throw new Error('Maximum candidates already reached for this opening');
  }
  if (input.applicantEmail) {
    const dup = await (prisma as any).insightExternalApplication.findFirst({
      where: { openingId: input.openingId, applicantEmail: input.applicantEmail },
    });
    if (dup) throw new Error('An application with this email already exists for this opening');
  }

  const application = await (prisma as any).insightExternalApplication.create({
    data: {
      openingId:          input.openingId,
      insightSignalId:    opening.insightSignal.id,
      treeId:             opening.insightSignal.treeId,
      applicantName:      input.applicantName.trim(),
      applicantEmail:     input.applicantEmail ?? null,
      applicantPhone:     input.applicantPhone ?? null,
      applicantLocation:  input.applicantLocation ?? null,
      applicantSummary:   input.applicantSummary ?? null,
      motivation:         input.motivation ?? null,
      experienceSummary:  input.experienceSummary ?? null,
      portfolioUrl:       input.portfolioUrl ?? null,
      externalProfileUrl: input.externalProfileUrl ?? null,
      evidenceNote:       input.evidenceNote ?? null,
      skillTags:          input.skillTags ?? null,
      requestedFiat:      input.requestedFiat ?? null,
      requestedBerries:   input.requestedBerries ?? null,
      currency:           input.currency ?? 'CLP',
      availabilityNote:   input.availabilityNote ?? null,
      earliestStartDate:  input.earliestStartDate ? new Date(input.earliestStartDate) : null,
      privacyConsent:     true,
      termsAccepted:      input.termsAccepted ?? false,
      linkedUserId:       input.linkedUserId ?? null,
      evidenceFileId:     input.evidenceFileId ?? null,
      status:             'RECEIVED',
    },
  });

  void logEvent({
    treeId: opening.insightSignal.treeId,
    actorId: input.linkedUserId ?? null,
    action: 'EXTERNAL_APPLICATION_RECEIVED',
    entityType: 'InsightExternalApplication',
    entityId: application.id,
    metadataJson: { openingId: input.openingId, insightSignalId: opening.insightSignal.id },
    severity: 'INFO', source: 'USER',
  });

  return application;
}

// ─────────────────────────────────────────────────────────────────────────────
// External Applications — list & get (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function getApplications(openingId: string) {
  return (prisma as any).insightExternalApplication.findMany({
    where: { openingId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, status: true,
      applicantName: true, applicantEmail: true, applicantLocation: true,
      applicantSummary: true, motivation: true, experienceSummary: true,
      portfolioUrl: true, externalProfileUrl: true, evidenceNote: true,
      skillTags: true, requestedFiat: true, requestedBerries: true, currency: true,
      availabilityNote: true, earliestStartDate: true,
      privacyConsent: true, termsAccepted: true,
      linkedUserId: true, evidenceFileId: true,
      reviewedById: true, reviewedAt: true, reviewNotes: true,
      invitedToValidationAt: true, rejectedAt: true, rejectionReason: true,
      metadataJson: true,
      createdAt: true, updatedAt: true,

    },
  });
}

export async function getApplicationById(applicationId: string) {
  return (prisma as any).insightExternalApplication.findUnique({
    where: { id: applicationId },
    include: {
      opening: {
        select: { id: true, title: true, insightSignalId: true, insightSignal: { select: { treeId: true } } },
      },
      linkedUser: { select: { id: true, username: true } },
      evidenceFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true } },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// External Applications — status transitions
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAppOrThrow(applicationId: string) {
  const app = await (prisma as any).insightExternalApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error('InsightExternalApplication not found');
  if (APP_TERMINAL_STATUSES.includes(app.status))
    throw new Error(`Application is in terminal status "${app.status}"`);
  return app;
}

export async function startBasicReview(applicationId: string, actorId: string, treeId: string) {
  const app = await fetchAppOrThrow(applicationId);
  const updated = await (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: { status: 'BASIC_REVIEW', reviewedById: actorId, reviewedAt: new Date() },
  });
  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_APPLICATION_BASIC_REVIEW_STARTED',
    entityType: 'InsightExternalApplication', entityId: applicationId,
    metadataJson: { openingId: app.openingId },
    severity: 'INFO', source: 'USER',
  });
  return updated;
}

export async function requestMoreInfo(applicationId: string, actorId: string, treeId: string, note?: string) {
  const app = await fetchAppOrThrow(applicationId);
  const updated = await (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: {
      status: 'MORE_INFO_REQUESTED',
      reviewNotes: note ?? app.reviewNotes,
      reviewedById: actorId, reviewedAt: new Date(),
    },
  });
  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_APPLICATION_MORE_INFO_REQUESTED',
    entityType: 'InsightExternalApplication', entityId: applicationId,
    metadataJson: { openingId: app.openingId },
    severity: 'INFO', source: 'USER',
  });
  return updated;
}

export async function inviteApplicationToEndorsement(applicationId: string, actorId: string, treeId: string) {
  const app = await fetchAppOrThrow(applicationId);
  const updated = await (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: {
      status: 'INVITED_TO_VALIDATION',
      invitedToValidationAt: new Date(),
      reviewedById: actorId, reviewedAt: new Date(),
    },
  });
  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_APPLICATION_INVITED_TO_ENDORSEMENT',
    entityType: 'InsightExternalApplication', entityId: applicationId,
    metadataJson: { openingId: app.openingId },
    severity: 'INFO', source: 'USER',
  });
  return updated;
}

export async function acceptApplicationNextStep(applicationId: string, actorId: string, treeId: string, reviewNotes?: string) {
  const app = await fetchAppOrThrow(applicationId);
  const updated = await (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: {
      status: 'ACCEPTED_FOR_NEXT_STEP',
      reviewNotes: reviewNotes ?? app.reviewNotes,
      reviewedById: actorId,
      reviewedAt: new Date(),
    },
  });
  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_APPLICATION_ACCEPTED_FOR_ENDORSEMENT_STEP',
    entityType: 'InsightExternalApplication', entityId: applicationId,
    metadataJson: { openingId: app.openingId },
    severity: 'INFO', source: 'USER',
  });
  return updated;
}

export async function rejectApplicationFull(
  applicationId: string,
  actorId: string,
  treeId: string,
  reason?: string,
) {
  const app = await fetchAppOrThrow(applicationId);
  const updated = await (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
      rejectionReason: reason ?? null,
      reviewedById: actorId, reviewedAt: new Date(),
    },
  });
  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_APPLICATION_REJECTED',
    entityType: 'InsightExternalApplication', entityId: applicationId,
    metadataJson: { openingId: app.openingId },
    severity: 'INFO', source: 'USER',
  });
  return updated;
}

export async function archiveApplication(applicationId: string, actorId: string, treeId: string) {
  const app = await (prisma as any).insightExternalApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error('InsightExternalApplication not found');
  if (!['REJECTED', 'WITHDRAWN', 'ACCEPTED_FOR_NEXT_STEP', 'INVITED_TO_VALIDATION'].includes(app.status))
    throw new Error(`Can only archive completed applications (current: ${app.status})`);

  const updated = await (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: { status: 'ARCHIVED' },
  });
  void logEvent({
    treeId, actorId,
    action: 'EXTERNAL_APPLICATION_ARCHIVED',
    entityType: 'InsightExternalApplication', entityId: applicationId,
    metadataJson: { openingId: app.openingId },
    severity: 'INFO', source: 'USER',
  });
  return updated;
}

// Legacy compat — used by existing controller
export async function updateApplicationStatus(
  applicationId: string,
  newStatus: string,
  actorId: string,
  treeId: string,
) {
  const app = await (prisma as any).insightExternalApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error('InsightExternalApplication not found');
  return (prisma as any).insightExternalApplication.update({
    where: { id: applicationId },
    data: { status: newStatus },
  });
}
