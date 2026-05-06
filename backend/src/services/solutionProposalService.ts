import { prisma } from '../index';
import { normalizeRiskLevel, normalizeSolutionStatus, parseCurrency } from './externalNeedService';

const BUDGET_LINE_TYPES = new Set([
  'LABOR',
  'MATERIALS',
  'INFRASTRUCTURE',
  'TAXES',
  'RESERVE',
  'TREE_FUND',
  'MAINTENANCE',
  'EXTERNAL_SERVICE',
  'OTHER',
]);

function optionalTrim(value: unknown, maxLength?: number) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (maxLength && text.length > maxLength) throw new Error(`Field must be at most ${maxLength} characters`);
  return text;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number`);
  return parsed;
}

function optionalPositiveInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
  return parsed;
}

function optionalNonNegativeInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative integer`);
  return parsed;
}

export function assertSolutionBudgetRange(min: unknown, expected: unknown, max: unknown) {
  const parsedMin = optionalNumber(min, 'estimatedFiatMin');
  const parsedExpected = optionalNumber(expected, 'estimatedFiatExpected');
  const parsedMax = optionalNumber(max, 'estimatedFiatMax');

  if (parsedMin !== null && parsedMax !== null && parsedMax < parsedMin) {
    throw new Error('estimatedFiatMax must be greater than or equal to estimatedFiatMin');
  }
  if (parsedMin !== null && parsedExpected !== null && parsedExpected < parsedMin) {
    throw new Error('estimatedFiatExpected must be greater than or equal to estimatedFiatMin');
  }
  if (parsedMax !== null && parsedExpected !== null && parsedExpected > parsedMax) {
    throw new Error('estimatedFiatExpected must be less than or equal to estimatedFiatMax');
  }

  return { parsedMin, parsedExpected, parsedMax };
}

export function normalizeScopeAlignment(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { general: text } : null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('scopeAlignmentJson must be an object or text');
  }
  return value;
}

export function normalizeSolutionProposalInput(body: any, existing?: any) {
  const source = { ...(existing || {}), ...(body || {}) };
  const { parsedMin, parsedExpected, parsedMax } = assertSolutionBudgetRange(
    source.estimatedFiatMin,
    source.estimatedFiatExpected,
    source.estimatedFiatMax,
  );
  const title = String(source.title || '').trim();
  const description = String(source.description || '').trim();
  if (title.length > 120) throw new Error('title must be at most 120 characters');

  return {
    title,
    description,
    estimatedFiatMin: parsedMin,
    estimatedFiatExpected: parsedExpected,
    estimatedFiatMax: parsedMax,
    currency: parseCurrency(source.currency),
    estimatedBerries: optionalNonNegativeInteger(source.estimatedBerries, 'estimatedBerries'),
    estimatedDurationDays: optionalPositiveInteger(source.estimatedDurationDays, 'estimatedDurationDays'),
    riskLevel: normalizeRiskLevel(source.riskLevel),
    assumptions: optionalTrim(source.assumptions),
    included: optionalTrim(source.included),
    excluded: optionalTrim(source.excluded),
    deliverables: optionalTrim(source.deliverables),
    acceptanceCriteria: optionalTrim(source.acceptanceCriteria),
    maintenanceNotes: optionalTrim(source.maintenanceNotes),
    scopeAlignmentJson: normalizeScopeAlignment(source.scopeAlignmentJson ?? source.scopeAlignment),
  };
}

export function normalizeBudgetLineType(type: unknown) {
  if (typeof type !== 'string' || !BUDGET_LINE_TYPES.has(type)) throw new Error('Invalid budget line type');
  return type;
}

export function normalizeBudgetLineInput(body: any, existing?: any) {
  const source = { ...(existing || {}), ...(body || {}) };
  const label = String(source.label || '').trim();
  if (!label) throw new Error('Budget line label is required');
  if (label.length > 120) throw new Error('Budget line label must be at most 120 characters');

  return {
    label,
    description: optionalTrim(source.description),
    type: normalizeBudgetLineType(source.type),
    estimatedFiat: optionalNumber(source.estimatedFiat, 'estimatedFiat'),
    estimatedBerries: optionalNonNegativeInteger(source.estimatedBerries, 'estimatedBerries'),
    currency: parseCurrency(source.currency),
    quantity: optionalNumber(source.quantity, 'quantity'),
    unit: optionalTrim(source.unit, 40),
    unitCostFiat: optionalNumber(source.unitCostFiat, 'unitCostFiat'),
  };
}

export function safeBudgetLine(line: any) {
  return {
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
  };
}

export function safeSolutionProposal(solution: any) {
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
    budgetLines: solution.budgetLines?.map(safeBudgetLine) ?? undefined,
  };
}

export function assertNoSolutionAuthorityEffects(payload?: unknown) {
  const keys: string[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      walk(nested, depth + 1);
    }
  };
  walk(payload);
  const blockedExactKeys = new Set([
    'xp',
    'level',
    'reputation',
    'authority',
    'votes',
    'voteweight',
    'governance',
    'bayasbalance',
    'berriesbalance',
    'berriestransfer',
    'fiattransaction',
    'payment',
    'grantxp',
  ]);
  if (keys.some((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return blockedExactKeys.has(normalized)
      || /^grant.*xp$|^set.*level$|^level.*update$|^vote.*weight$|^governance.*permission$|^convert.*berries$|^berries.*transfer$/i.test(key);
  })) {
    throw new Error('Solution proposals cannot grant XP, level, reputation, votes, authority, payments or Berries.');
  }
}

export function assertCanSubmitSolution(solution: any) {
  if (!solution.title || !solution.description) throw new Error('Solution requires title and description');
  const hasBudget = solution.estimatedFiatMin !== null
    || solution.estimatedFiatExpected !== null
    || solution.estimatedFiatMax !== null
    || (solution.budgetLines || []).some((line: any) => line.estimatedFiat !== null || line.estimatedBerries !== null);
  if (!hasBudget) throw new Error('Solution requires a budget estimate or at least one budget line');
  if (!solution.estimatedDurationDays && !solution.assumptions) {
    throw new Error('Solution requires estimated duration or assumptions explaining the schedule');
  }
  if (!solution.assumptions) throw new Error('Solution requires basic assumptions before submission');
}

export async function getBudgetSummary(solutionProposalId: string) {
  const solution = await (prisma as any).solutionProposal.findUnique({
    where: { id: solutionProposalId },
    include: { budgetLines: true },
  });
  if (!solution) return null;

  const byType = new Map<string, number>();
  let totalFiat = 0;
  for (const line of solution.budgetLines || []) {
    const value = Number(line.estimatedFiat || 0);
    totalFiat += value;
    byType.set(line.type, (byType.get(line.type) || 0) + value);
  }

  return {
    solutionProposalId: solution.id,
    currency: solution.currency || 'CLP',
    estimatedFiatMin: solution.estimatedFiatMin,
    estimatedFiatExpected: solution.estimatedFiatExpected,
    estimatedFiatMax: solution.estimatedFiatMax,
    budgetLineTotalFiat: totalFiat,
    estimatedBerries: solution.estimatedBerries,
    durationDays: solution.estimatedDurationDays,
    riskLevel: solution.riskLevel,
    linesByType: Array.from(byType.entries()).map(([type, totalFiatForType]) => ({
      type,
      totalFiat: totalFiatForType,
    })),
  };
}

export function normalizeInitialSolutionStatus(status: unknown) {
  const normalized = normalizeSolutionStatus(status);
  if (['SELECTED', 'CONVERTED_TO_TASKS'].includes(normalized)) {
    throw new Error('Invalid initial solution proposal status');
  }
  return normalized;
}
