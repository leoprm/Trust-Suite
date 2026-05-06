import { prisma } from '../index';
import { getTreeAccess, parseCurrency } from './externalNeedService';
import { createAutosustentoBranch } from './autosustentoBranchService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AutosustentoIdeaStatus =
  | 'PROPOSED'
  | 'GATHERING_SUPPORT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_BRANCH'
  | 'ARCHIVED';

export type AutosustentoSupportType =
  | 'LIKE'
  | 'WOULD_PARTICIPATE'
  | 'KNOWS_CLIENTS_OR_WOULD_BUY';

const IDEA_STATUSES = new Set<AutosustentoIdeaStatus>([
  'PROPOSED',
  'GATHERING_SUPPORT',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CONVERTED_TO_BRANCH',
  'ARCHIVED',
]);

const SUPPORT_TYPES = new Set<AutosustentoSupportType>([
  'LIKE',
  'WOULD_PARTICIPATE',
  'KNOWS_CLIENTS_OR_WOULD_BUY',
]);

// Statuses where the idea is no longer actionable
const TERMINAL_STATUSES = new Set<AutosustentoIdeaStatus>([
  'REJECTED',
  'CONVERTED_TO_BRANCH',
  'ARCHIVED',
]);

// Valid state transitions
const ALLOWED_TRANSITIONS: Record<AutosustentoIdeaStatus, AutosustentoIdeaStatus[]> = {
  PROPOSED: ['GATHERING_SUPPORT', 'UNDER_REVIEW', 'REJECTED', 'ARCHIVED'],
  GATHERING_SUPPORT: ['UNDER_REVIEW', 'REJECTED', 'ARCHIVED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['CONVERTED_TO_BRANCH', 'REJECTED', 'ARCHIVED'],
  REJECTED: [],
  CONVERTED_TO_BRANCH: [],
  ARCHIVED: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function optionalTrim(value: unknown, maxLength?: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (maxLength && text.length > maxLength) throw new Error(`Field must be at most ${maxLength} characters`);
  return text;
}

function optionalMoney(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number`);
  return parsed;
}

function optionalPositiveInt(value: unknown, field: string, fallback?: number | null): number | null {
  if (value === undefined || value === null || value === '') return fallback ?? null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function canProposeAutosustentoIdea(
  userId: string,
  treeId: string,
  role?: string | null,
): Promise<boolean> {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isMember;
}

export async function canManageAutosustentoIdea(
  userId: string,
  treeId: string,
  role?: string | null,
): Promise<boolean> {
  const access = await getTreeAccess(userId, treeId, role);
  return access.isAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constitutional guard — no internal authority effects
// ─────────────────────────────────────────────────────────────────────────────

export function assertNoIdeaAuthorityEffects(payload?: unknown): void {
  const keys: string[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) return void value.forEach((item) => walk(item, depth + 1));
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      walk(nested, depth + 1);
    }
  };
  walk(payload);
  const blocked = keys.find((key) => {
    const n = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
      'xp', 'level', 'reputation', 'authority', 'vote', 'votes',
      'voteweight', 'governance', 'weeklyneedpoints', 'needpoints',
      'totalpointsassigned', 'bayasbalance', 'berriesbalance', 'permission',
    ].includes(n);
  });
  if (blocked) {
    throw new Error(
      'Autosustento Ideas cannot modify XP, Need Points, votes, levels, authority, Berries or reputation. Blocked field: ' +
        blocked,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input normalisation
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeIdeaInput(body: any) {
  const title = String(body?.title ?? '').trim();
  if (!title) throw new Error('title is required');
  if (title.length > 200) throw new Error('title must be at most 200 characters');

  const description = String(body?.description ?? '').trim();
  if (!description) throw new Error('description is required');

  return {
    title,
    description,
    productOrService: optionalTrim(body?.productOrService, 160),
    targetClient: optionalTrim(body?.targetClient),
    valueProposition: optionalTrim(body?.valueProposition),
    requiredResources: optionalTrim(body?.requiredResources),
    estimatedStartupCostFiat: optionalMoney(body?.estimatedStartupCostFiat, 'estimatedStartupCostFiat'),
    expectedMonthlyIncomeFiat: optionalMoney(body?.expectedMonthlyIncomeFiat, 'expectedMonthlyIncomeFiat'),
    expectedMonthlyCostFiat: optionalMoney(body?.expectedMonthlyCostFiat, 'expectedMonthlyCostFiat'),
    currency: parseCurrency(body?.currency),
    legalRisks: optionalTrim(body?.legalRisks),
    operationalRisks: optionalTrim(body?.operationalRisks),
    socialRisks: optionalTrim(body?.socialRisks),
    viabilitySummary: optionalTrim(body?.viabilitySummary),
    closureCriteria: optionalTrim(body?.closureCriteria),
    reviewPeriodDays: optionalPositiveInt(body?.reviewPeriodDays, 'reviewPeriodDays', 90),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe output serialiser
// ─────────────────────────────────────────────────────────────────────────────

export function safeIdea(idea: any, userSupport?: Record<string, boolean>) {
  const supports: any[] = idea.supports ?? [];
  return {
    id: idea.id,
    treeId: idea.treeId,
    createdById: idea.createdById,
    createdBy: idea.createdBy
      ? { id: idea.createdBy.id, username: idea.createdBy.username }
      : null,
    title: idea.title,
    description: idea.description,
    status: idea.status,
    productOrService: idea.productOrService,
    targetClient: idea.targetClient,
    valueProposition: idea.valueProposition,
    requiredResources: idea.requiredResources,
    estimatedStartupCostFiat: idea.estimatedStartupCostFiat,
    expectedMonthlyIncomeFiat: idea.expectedMonthlyIncomeFiat,
    expectedMonthlyCostFiat: idea.expectedMonthlyCostFiat,
    currency: idea.currency ?? 'CLP',
    legalRisks: idea.legalRisks,
    operationalRisks: idea.operationalRisks,
    socialRisks: idea.socialRisks,
    viabilitySummary: idea.viabilitySummary,
    closureCriteria: idea.closureCriteria,
    reviewPeriodDays: idea.reviewPeriodDays,
    convertedBranchId: idea.convertedBranchId ?? null,
    convertedAt: idea.convertedAt ?? null,
    likes: supports.filter((s: any) => s.supportType === 'LIKE').length,
    wouldParticipate: supports.filter((s: any) => s.supportType === 'WOULD_PARTICIPATE').length,
    knowsClientsOrWouldBuy: supports.filter((s: any) => s.supportType === 'KNOWS_CLIENTS_OR_WOULD_BUY').length,
    totalSupports: supports.length,
    userSupport: userSupport ?? null,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD operations
// ─────────────────────────────────────────────────────────────────────────────

export async function listAutosustentoIdeas(treeId: string, currentUserId?: string) {
  const ideas = await (prisma as any).autosustentoIdea.findMany({
    where: { treeId },
    include: {
      createdBy: { select: { id: true, username: true } },
      supports: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return ideas.map((idea: any) => {
    const userSupport = currentUserId
      ? {
          LIKE: idea.supports.some(
            (s: any) => s.userId === currentUserId && s.supportType === 'LIKE',
          ),
          WOULD_PARTICIPATE: idea.supports.some(
            (s: any) => s.userId === currentUserId && s.supportType === 'WOULD_PARTICIPATE',
          ),
          KNOWS_CLIENTS_OR_WOULD_BUY: idea.supports.some(
            (s: any) => s.userId === currentUserId && s.supportType === 'KNOWS_CLIENTS_OR_WOULD_BUY',
          ),
        }
      : undefined;
    return safeIdea(idea, userSupport);
  });
}

export async function getAutosustentoIdea(ideaId: string, currentUserId?: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({
    where: { id: ideaId },
    include: {
      createdBy: { select: { id: true, username: true } },
      supports: true,
    },
  });
  if (!idea) return null;

  const userSupport = currentUserId
    ? {
        LIKE: idea.supports.some(
          (s: any) => s.userId === currentUserId && s.supportType === 'LIKE',
        ),
        WOULD_PARTICIPATE: idea.supports.some(
          (s: any) => s.userId === currentUserId && s.supportType === 'WOULD_PARTICIPATE',
        ),
        KNOWS_CLIENTS_OR_WOULD_BUY: idea.supports.some(
          (s: any) => s.userId === currentUserId && s.supportType === 'KNOWS_CLIENTS_OR_WOULD_BUY',
        ),
      }
    : undefined;

  return safeIdea(idea, userSupport);
}

export async function createAutosustentoIdea(treeId: string, createdById: string, body: any) {
  const data = normalizeIdeaInput(body);
  const idea = await (prisma as any).autosustentoIdea.create({
    data: {
      treeId,
      createdById,
      ...data,
      status: 'PROPOSED',
    },
    include: {
      createdBy: { select: { id: true, username: true } },
      supports: true,
    },
  });
  return safeIdea(idea);
}

export async function updateAutosustentoIdea(ideaId: string, body: any) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  if (idea.status === 'CONVERTED_TO_BRANCH') {
    throw new Error('Cannot edit an idea that has already been converted to a Branch');
  }
  if (TERMINAL_STATUSES.has(idea.status) && idea.status !== 'ARCHIVED') {
    throw new Error(`Cannot edit an idea in status ${idea.status}`);
  }

  const data = normalizeIdeaInput({ ...idea, ...body });
  const updated = await (prisma as any).autosustentoIdea.update({
    where: { id: ideaId },
    data,
    include: {
      createdBy: { select: { id: true, username: true } },
      supports: true,
    },
  });
  return safeIdea(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────────────────────

function assertTransition(idea: any, target: AutosustentoIdeaStatus) {
  const allowed = ALLOWED_TRANSITIONS[idea.status as AutosustentoIdeaStatus] ?? [];
  if (!allowed.includes(target)) {
    throw new Error(
      `Cannot transition from ${idea.status} to ${target}`,
    );
  }
}

export async function submitForReview(ideaId: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  assertTransition(idea, 'UNDER_REVIEW');
  const updated = await (prisma as any).autosustentoIdea.update({
    where: { id: ideaId },
    data: { status: 'UNDER_REVIEW' },
    include: { createdBy: { select: { id: true, username: true } }, supports: true },
  });
  return safeIdea(updated);
}

export async function approveIdea(ideaId: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  assertTransition(idea, 'APPROVED');
  const updated = await (prisma as any).autosustentoIdea.update({
    where: { id: ideaId },
    data: { status: 'APPROVED' },
    include: { createdBy: { select: { id: true, username: true } }, supports: true },
  });
  return safeIdea(updated);
}

export async function rejectIdea(ideaId: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  assertTransition(idea, 'REJECTED');
  const updated = await (prisma as any).autosustentoIdea.update({
    where: { id: ideaId },
    data: { status: 'REJECTED' },
    include: { createdBy: { select: { id: true, username: true } }, supports: true },
  });
  return safeIdea(updated);
}

export async function archiveIdea(ideaId: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  assertTransition(idea, 'ARCHIVED');
  const updated = await (prisma as any).autosustentoIdea.update({
    where: { id: ideaId },
    data: { status: 'ARCHIVED' },
    include: { createdBy: { select: { id: true, username: true } }, supports: true },
  });
  return safeIdea(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert to Branch
// ─────────────────────────────────────────────────────────────────────────────

export async function convertIdeaToBranch(ideaId: string, convertedById: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  if (idea.status !== 'APPROVED') throw new Error('Only APPROVED ideas can be converted to a Branch');
  if (idea.convertedBranchId) throw new Error('This idea has already been converted to a Branch');

  if (!idea.productOrService) {
    throw new Error('productOrService is required before converting to a Branch');
  }

  // Create the Autosustento Branch using the existing service
  // This creates Branch (type=AUTOSUSTENTO) + AutosustentoBranchConfig
  const branchConfig = await createAutosustentoBranch(idea.treeId, convertedById, {
    name: idea.title,
    productOrService: idea.productOrService,
    description: idea.description,
    targetClient: idea.targetClient,
    valueProposition: idea.valueProposition,
    viabilitySummary: idea.viabilitySummary,
    requiredResources: idea.requiredResources,
    legalRisks: idea.legalRisks,
    operationalRisks: idea.operationalRisks,
    startupCostFiat: idea.estimatedStartupCostFiat,
    expectedMonthlyIncomeFiat: idea.expectedMonthlyIncomeFiat,
    expectedMonthlyCostFiat: idea.expectedMonthlyCostFiat,
    currency: idea.currency,
    closureCriteria: idea.closureCriteria,
    reviewPeriodDays: idea.reviewPeriodDays,
  });

  const branchId = (branchConfig as any).branchId;

  // Mark the idea as converted — no XP, no fiat transaction
  const updated = await (prisma as any).autosustentoIdea.update({
    where: { id: ideaId },
    data: {
      status: 'CONVERTED_TO_BRANCH',
      convertedBranchId: branchId,
      convertedAt: new Date(),
      convertedById,
    },
    include: { createdBy: { select: { id: true, username: true } }, supports: true },
  });

  return { idea: safeIdea(updated), branchConfig };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supports
// ─────────────────────────────────────────────────────────────────────────────

function assertSupportType(type: unknown): asserts type is AutosustentoSupportType {
  if (!SUPPORT_TYPES.has(type as AutosustentoSupportType)) {
    throw new Error(`Invalid supportType. Must be one of: ${[...SUPPORT_TYPES].join(', ')}`);
  }
}

function assertIdeaSupportsAllowed(idea: any) {
  if (TERMINAL_STATUSES.has(idea.status as AutosustentoIdeaStatus)) {
    throw new Error(`Cannot support an idea in status ${idea.status}`);
  }
}

export async function addSupport(ideaId: string, userId: string, supportType: unknown) {
  assertSupportType(supportType);
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  assertIdeaSupportsAllowed(idea);

  // Upsert — no duplicate per user+type (@@unique enforced at DB level too)
  await (prisma as any).autosustentoIdeaSupport.upsert({
    where: { ideaId_userId_supportType: { ideaId, userId, supportType } },
    create: { ideaId, userId, supportType },
    update: { updatedAt: new Date() },
  });

  // Auto-promote to GATHERING_SUPPORT when first support arrives
  if (idea.status === 'PROPOSED') {
    await (prisma as any).autosustentoIdea.update({
      where: { id: ideaId },
      data: { status: 'GATHERING_SUPPORT' },
    });
  }
}

export async function removeSupport(ideaId: string, userId: string, supportType: unknown) {
  assertSupportType(supportType);
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');
  assertIdeaSupportsAllowed(idea);

  await (prisma as any).autosustentoIdeaSupport.deleteMany({
    where: { ideaId, userId, supportType },
  });
}

export async function getSupportSummary(ideaId: string, currentUserId?: string) {
  const idea = await (prisma as any).autosustentoIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error('Idea not found');

  const supports = await (prisma as any).autosustentoIdeaSupport.findMany({
    where: { ideaId },
  });

  const likes = supports.filter((s: any) => s.supportType === 'LIKE').length;
  const wouldParticipate = supports.filter((s: any) => s.supportType === 'WOULD_PARTICIPATE').length;
  const knowsClientsOrWouldBuy = supports.filter(
    (s: any) => s.supportType === 'KNOWS_CLIENTS_OR_WOULD_BUY',
  ).length;

  const userSupport = currentUserId
    ? {
        LIKE: supports.some((s: any) => s.userId === currentUserId && s.supportType === 'LIKE'),
        WOULD_PARTICIPATE: supports.some(
          (s: any) => s.userId === currentUserId && s.supportType === 'WOULD_PARTICIPATE',
        ),
        KNOWS_CLIENTS_OR_WOULD_BUY: supports.some(
          (s: any) =>
            s.userId === currentUserId && s.supportType === 'KNOWS_CLIENTS_OR_WOULD_BUY',
        ),
      }
    : null;

  return { ideaId, likes, wouldParticipate, knowsClientsOrWouldBuy, userSupport };
}
