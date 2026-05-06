/**
 * insightCorporateReferralService.ts
 * Manages InsightCorporateReferral — the third and final escalation level.
 *
 * Rules:
 *  - Only used when Trust & external individuals cannot resolve the need.
 *  - reasonForEscalation required.
 *  - Selecting a corporate referral does not grant political power to the company.
 *  - No data is sold. No automatic contracts.
 */

import { prisma } from '../index';
import { logEvent } from './eventLogService';

export interface CreateCorporateReferralInput {
  insightSignalId: string;
  treeId: string;
  providerName: string;
  providerContact?: string;
  providerWebsite?: string;
  reasonForEscalation?: string;
  expectedScope?: string;
  estimatedFiatMin?: number;
  estimatedFiatMax?: number;
  currency?: string;
  notes?: string;
  actorId: string;
}

export async function createCorporateReferral(input: CreateCorporateReferralInput) {
  if (!input.providerName?.trim()) throw new Error('providerName is required');

  const signal = await (prisma as any).insightSignal.findUnique({ where: { id: input.insightSignalId } });
  if (!signal) throw new Error('InsightSignal not found');

  // Enforce: can only create corporate referral if signal is at corporate level or admin provides reason
  const corporateStatuses = ['CORPORATE_REFERRAL_OPEN', 'EXTERNAL_PEOPLE_FAILED', 'ACTIVE', 'INTERNAL_SEARCH'];
  if (!corporateStatuses.includes(signal.status) && !input.reasonForEscalation) {
    throw new Error('reasonForEscalation required to create corporate referral from current status');
  }

  const referral = await (prisma as any).insightCorporateReferral.create({
    data: {
      insightSignalId: input.insightSignalId,
      providerName: input.providerName.trim(),
      providerContact: input.providerContact ?? null,
      providerWebsite: input.providerWebsite ?? null,
      status: 'DRAFT',
      reasonForEscalation: input.reasonForEscalation ?? null,
      expectedScope: input.expectedScope ?? null,
      estimatedFiatMin: input.estimatedFiatMin ?? null,
      estimatedFiatMax: input.estimatedFiatMax ?? null,
      currency: input.currency ?? 'CLP',
      notes: input.notes ?? null,
    },
  });

  void logEvent({
    treeId: input.treeId,
    actorId: input.actorId,
    action: 'INSIGHT_CORPORATE_REFERRAL_CREATED',
    entityType: 'InsightCorporateReferral',
    entityId: referral.id,
    metadataJson: {
      providerName: input.providerName.trim(),
      insightSignalId: input.insightSignalId,
      reasonForEscalation: input.reasonForEscalation,
    },
    severity: 'INFO',
    source: 'USER',
  });

  return referral;
}

export async function getCorporateReferrals(insightSignalId: string) {
  return (prisma as any).insightCorporateReferral.findMany({
    where: { insightSignalId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateCorporateReferral(referralId: string, updates: Partial<{
  providerName: string;
  providerContact: string;
  providerWebsite: string;
  reasonForEscalation: string;
  expectedScope: string;
  estimatedFiatMin: number;
  estimatedFiatMax: number;
  currency: string;
  notes: string;
}>, actorId: string) {
  const referral = await (prisma as any).insightCorporateReferral.findUnique({ where: { id: referralId } });
  if (!referral) throw new Error('InsightCorporateReferral not found');
  if (['SELECTED', 'CANCELLED', 'REJECTED'].includes(referral.status)) {
    throw new Error(`Cannot update referral in status ${referral.status}`);
  }

  return (prisma as any).insightCorporateReferral.update({ where: { id: referralId }, data: updates });
}

export async function contactCorporateReferral(referralId: string, treeId: string, actorId: string) {
  const referral = await (prisma as any).insightCorporateReferral.findUnique({ where: { id: referralId } });
  if (!referral) throw new Error('InsightCorporateReferral not found');
  if (!['DRAFT', 'OPEN'].includes(referral.status)) throw new Error(`Cannot contact from status ${referral.status}`);

  return (prisma as any).insightCorporateReferral.update({
    where: { id: referralId },
    data: { status: 'CONTACTED' },
  });
}

export async function selectCorporateReferral(referralId: string, treeId: string, actorId: string) {
  const referral = await (prisma as any).insightCorporateReferral.findUnique({ where: { id: referralId } });
  if (!referral) throw new Error('InsightCorporateReferral not found');
  if (!['DRAFT', 'OPEN', 'CONTACTED', 'PROPOSAL_RECEIVED'].includes(referral.status)) {
    throw new Error(`Cannot select from status ${referral.status}`);
  }

  const updated = await (prisma as any).insightCorporateReferral.update({
    where: { id: referralId },
    data: { status: 'SELECTED', selectedAt: new Date() },
  });

  // Update parent signal
  await (prisma as any).insightSignal.updateMany({
    where: { id: referral.insightSignalId },
    data: { status: 'CORPORATE_REFERRAL_SELECTED', corporateClosedAt: new Date() },
  });

  void logEvent({
    treeId, actorId,
    action: 'INSIGHT_CORPORATE_REFERRAL_SELECTED',
    entityType: 'InsightCorporateReferral',
    entityId: referralId,
    metadataJson: { providerName: referral.providerName },
    severity: 'INFO',
    source: 'USER',
  });

  return updated;
}

export async function rejectCorporateReferral(referralId: string, treeId: string, actorId: string) {
  const referral = await (prisma as any).insightCorporateReferral.findUnique({ where: { id: referralId } });
  if (!referral) throw new Error('InsightCorporateReferral not found');
  if (['SELECTED', 'CANCELLED', 'REJECTED'].includes(referral.status)) {
    throw new Error(`Already in terminal status ${referral.status}`);
  }
  return (prisma as any).insightCorporateReferral.update({
    where: { id: referralId },
    data: { status: 'REJECTED' },
  });
}

export async function cancelCorporateReferral(referralId: string, treeId: string, actorId: string) {
  const referral = await (prisma as any).insightCorporateReferral.findUnique({ where: { id: referralId } });
  if (!referral) throw new Error('InsightCorporateReferral not found');
  if (['SELECTED', 'CANCELLED', 'REJECTED'].includes(referral.status)) {
    throw new Error(`Already in terminal status ${referral.status}`);
  }
  return (prisma as any).insightCorporateReferral.update({
    where: { id: referralId },
    data: { status: 'CANCELLED' },
  });
}
