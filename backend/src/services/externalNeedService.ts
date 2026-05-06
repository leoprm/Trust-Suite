import { prisma } from '../index';

export type ExternalNeedStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'SOLUTIONS_PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_TASKS'
  | 'CANCELLED'
  | 'COMPLETED';

export type SolutionProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED_BY_TREE'
  | 'APPROVED_BY_CLIENT'
  | 'REJECTED'
  | 'SELECTED'
  | 'ARCHIVED'
  | 'CONVERTED_TO_TASKS';

const NEED_STATUSES = new Set([
  'DRAFT',
  'OPEN',
  'UNDER_REVIEW',
  'SOLUTIONS_PROPOSED',
  'APPROVED',
  'REJECTED',
  'CONVERTED_TO_TASKS',
  'CANCELLED',
  'COMPLETED',
]);

const TERMINAL_NEED_STATUSES = new Set(['REJECTED', 'CANCELLED', 'COMPLETED', 'CONVERTED_TO_TASKS']);
const AGENT_ROLES = new Set(['CLIENT', 'SPONSOR', 'CONTACT', 'APPROVER', 'OBSERVER']);
const VISIBILITIES = new Set(['PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC_METADATA', 'PUBLIC']);
const SOLUTION_STATUSES = new Set(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED_BY_TREE', 'APPROVED_BY_CLIENT', 'REJECTED', 'SELECTED', 'ARCHIVED', 'CONVERTED_TO_TASKS']);
const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export function assertNoExternalNeedAuthorityEffects(payload?: unknown) {
  const keys: string[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      walk(nested, depth + 1);
    }
  };
  walk(payload);
  if (keys.some((key) => {
    const normalized = key.toLowerCase();
    return [
      'weeklyneedpoints',
      'needpoints',
      'totalpointsassigned',
      'votes',
      'xp',
      'level',
      'reputation',
      'authority',
      'governance',
      'bayasbalance',
      'berriesbalance',
      'permission',
    ].includes(normalized)
      || /grant.*xp|xp.*grant|set.*level|level.*update|vote.*weight|governance.*permission|convert.*berries|berries.*transfer|bayas.*transfer/i.test(key);
  })) {
    throw new Error('External Needs cannot modify internal Need Points, votes, XP, levels, authority, Berries or reputation.');
  }
}

export async function getTreeAccess(userId: string, treeId: string, role?: string | null) {
  if (role === 'ADMINISTRATOR') return { isMember: true, isAdmin: true };
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      creatorId: true,
      members: { where: { userId }, select: { role: true }, take: 1 },
    },
  });
  if (!tree) return { isMember: false, isAdmin: false };
  const membership = tree.members[0];
  const isCreator = tree.creatorId === userId;
  return {
    isMember: Boolean(membership) || isCreator,
    isAdmin: isCreator || membership?.role === 'ADMIN',
  };
}

export function assertBudgetRange(min?: unknown, max?: unknown) {
  const parsedMin = min === undefined || min === null || min === '' ? null : Number(min);
  const parsedMax = max === undefined || max === null || max === '' ? null : Number(max);
  if (parsedMin !== null && (!Number.isFinite(parsedMin) || parsedMin < 0)) throw new Error('budgetMinFiat must be a non-negative number');
  if (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax < 0)) throw new Error('budgetMaxFiat must be a non-negative number');
  if (parsedMin !== null && parsedMax !== null && parsedMax < parsedMin) throw new Error('budgetMaxFiat must be greater than or equal to budgetMinFiat');
  return { parsedMin, parsedMax };
}

export function assertEmail(email?: unknown) {
  if (email === undefined || email === null || email === '') return;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid external agent email');
  }
}

export function parseCurrency(currency?: unknown) {
  const value = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'CLP';
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('currency must be an ISO-like 3-letter code');
  return value;
}

export function safeAgent(agent: any, includePrivate = false) {
  return {
    id: agent.id,
    externalNeedId: agent.externalNeedId,
    name: agent.name,
    organization: agent.organization,
    role: agent.role,
    consentAccepted: agent.consentAccepted,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    ...(includePrivate ? { email: agent.email, notes: agent.notes } : {}),
  };
}

export function safeSolution(solution: any) {
  return {
    id: solution.id,
    externalNeedId: solution.externalNeedId,
    createdById: solution.createdById,
    title: solution.title,
    description: solution.description,
    status: solution.status,
    estimatedFiatMin: solution.estimatedFiatMin,
    estimatedFiatExpected: solution.estimatedFiatExpected,
    estimatedFiatMax: solution.estimatedFiatMax,
    currency: solution.currency || 'CLP',
    estimatedBerries: solution.estimatedBerries,
    estimatedDurationDays: solution.estimatedDurationDays,
    riskLevel: solution.riskLevel,
    assumptions: solution.assumptions,
    included: solution.included,
    excluded: solution.excluded,
    deliverables: solution.deliverables,
    acceptanceCriteria: solution.acceptanceCriteria,
    maintenanceNotes: solution.maintenanceNotes,
    scopeAlignmentJson: solution.scopeAlignmentJson,
    selectedAt: solution.selectedAt,
    selectedById: solution.selectedById,
    approvedByClientAt: solution.approvedByClientAt,
    approvedByTreeAt: solution.approvedByTreeAt,
    createdAt: solution.createdAt,
    updatedAt: solution.updatedAt,
    budgetLines: solution.budgetLines?.map((line: any) => ({
      id: line.id,
      solutionProposalId: line.solutionProposalId,
      label: line.label,
      description: line.description,
      type: line.type,
      estimatedFiat: line.estimatedFiat,
      estimatedBerries: line.estimatedBerries,
      currency: line.currency || 'CLP',
      quantity: line.quantity,
      unit: line.unit,
      unitCostFiat: line.unitCostFiat,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    })) ?? undefined,
  };
}

export function safeExternalNeed(need: any, options: { includePrivateAgents?: boolean } = {}) {
  return {
    id: need.id,
    treeId: need.treeId,
    createdById: need.createdById,
    title: need.title,
    description: need.description,
    status: need.status,
    clientSummary: need.clientSummary,
    desiredOutcome: need.desiredOutcome,
    constraints: need.constraints,
    deadline: need.deadline,
    budgetMinFiat: need.budgetMinFiat,
    budgetMaxFiat: need.budgetMaxFiat,
    currency: need.currency || 'CLP',
    visibility: need.visibility,
    createdAt: need.createdAt,
    updatedAt: need.updatedAt,
    agents: need.agents?.map((agent: any) => safeAgent(agent, options.includePrivateAgents)) ?? undefined,
    scopePoints: need.scopePoints?.map((scope: any) => ({
      id: scope.id,
      externalNeedId: scope.externalNeedId,
      agentId: scope.agentId,
      agent: scope.agent ? {
        id: scope.agent.id,
        name: scope.agent.name,
        organization: scope.agent.organization,
        role: scope.agent.role,
      } : undefined,
      label: scope.label,
      score: scope.score,
      description: scope.description,
      normalizedWeight: scope.normalizedWeight,
      createdById: scope.createdById,
      createdAt: scope.createdAt,
      updatedAt: scope.updatedAt,
    })) ?? undefined,
    solutions: need.solutions?.map(safeSolution) ?? undefined,
    counts: need._count ? {
      agents: need._count.agents,
      scopePoints: need._count.scopePoints,
      solutions: need._count.solutions,
    } : undefined,
  };
}

export function normalizeNeedStatus(status: unknown): ExternalNeedStatus {
  if (typeof status !== 'string' || !NEED_STATUSES.has(status)) throw new Error('Invalid external need status');
  return status as ExternalNeedStatus;
}

export function assertCanAddSolution(need: any) {
  if (!need) throw new Error('External Need not found');
  if (['CANCELLED', 'REJECTED', 'COMPLETED', 'CONVERTED_TO_TASKS'].includes(need.status)) {
    throw new Error('Cannot add or modify solutions for this External Need status');
  }
}

export function assertStatusTransition(current: ExternalNeedStatus, next: ExternalNeedStatus) {
  if (current === next) return;
  if (TERMINAL_NEED_STATUSES.has(current)) throw new Error(`Cannot transition External Need from ${current}`);
  if (current === 'DRAFT' && next === 'COMPLETED') throw new Error('Cannot transition directly from DRAFT to COMPLETED');
  if (next === 'CONVERTED_TO_TASKS') throw new Error('Conversion to tasks is reserved for a future phase');
}

export function normalizeAgentRole(role: unknown) {
  if (role === undefined || role === null || role === '') return 'CLIENT';
  if (typeof role !== 'string' || !AGENT_ROLES.has(role)) throw new Error('Invalid external agent role');
  return role;
}

export function normalizeVisibility(visibility: unknown) {
  if (visibility === undefined || visibility === null || visibility === '') return 'TREE_ONLY';
  if (typeof visibility !== 'string' || !VISIBILITIES.has(visibility)) throw new Error('Invalid external need visibility');
  return visibility;
}

export function normalizeSolutionStatus(status: unknown) {
  if (status === undefined || status === null || status === '') return 'DRAFT';
  if (typeof status !== 'string' || !SOLUTION_STATUSES.has(status)) throw new Error('Invalid solution proposal status');
  return status;
}

export function normalizeRiskLevel(riskLevel: unknown) {
  if (riskLevel === undefined || riskLevel === null || riskLevel === '') return 'MEDIUM';
  if (typeof riskLevel !== 'string' || !RISK_LEVELS.has(riskLevel)) throw new Error('Invalid risk level');
  return riskLevel;
}
