import { prisma } from '../index';

const TERMINAL_EXTERNAL_NEED_STATUSES = new Set(['CANCELLED', 'COMPLETED', 'CONVERTED_TO_TASKS', 'REJECTED']);

export type ScopePreferenceInput = {
  externalNeedId: string;
  label: unknown;
  score: unknown;
  description?: unknown;
  agentId?: unknown;
  createdById?: string | null;
};

export function normalizeScopeLabel(label: unknown) {
  const display = String(label || '').trim().replace(/\s+/g, ' ');
  if (!display) throw new Error('label is required');
  if (display.length > 80) throw new Error('label must be 80 characters or less');
  return {
    label: display,
    labelKey: display.toLowerCase(),
  };
}

export function normalizeScopeDescription(description: unknown) {
  if (description === undefined || description === null || description === '') return null;
  const value = String(description).trim();
  if (value.length > 500) throw new Error('description must be 500 characters or less');
  return value || null;
}

export function normalizeScopeScore(score: unknown) {
  const value = Number(score);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('score must be between 1 and 10');
  }
  return value;
}

export function safeScopePreference(scope: any) {
  return {
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
  };
}

export function normalizeScopeWeights(scopes: any[]) {
  const total = scopes.reduce((sum, scope) => sum + Number(scope.score || 0), 0);
  if (total <= 0) {
    return scopes.map((scope) => ({ ...scope, normalizedWeight: 0 }));
  }
  return scopes.map((scope) => ({
    ...scope,
    normalizedWeight: Number((Number(scope.score || 0) / total).toFixed(6)),
  }));
}

export function getScopeSummaryFromRows(scopes: any[]) {
  const grouped = new Map<string, { label: string; labelKey: string; scores: number[]; agentIds: Set<string> }>();
  for (const scope of scopes) {
    const labelKey = scope.labelKey || String(scope.label || '').trim().toLowerCase();
    const current = grouped.get(labelKey) || {
      label: scope.label,
      labelKey,
      scores: [] as number[],
      agentIds: new Set<string>(),
    };
    current.scores.push(Number(scope.score || 0));
    if (scope.agentId) current.agentIds.add(scope.agentId);
    grouped.set(labelKey, current);
  }

  const averaged = Array.from(grouped.values()).map((item) => {
    const averageScore = item.scores.length
      ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
      : 0;
    return {
      label: item.label,
      labelKey: item.labelKey,
      averageScore: Number(averageScore.toFixed(2)),
      agentCount: item.agentIds.size,
      entryCount: item.scores.length,
    };
  });
  const scoreSum = averaged.reduce((sum, item) => sum + item.averageScore, 0);
  const items = averaged
    .map((item) => ({
      ...item,
      normalizedWeight: scoreSum > 0 ? Number((item.averageScore / scoreSum).toFixed(6)) : 0,
    }))
    .sort((a, b) => b.normalizedWeight - a.normalizedWeight || b.averageScore - a.averageScore || a.label.localeCompare(b.label));

  return {
    totalCriteria: items.length,
    items,
  };
}

export async function getScopePreferences(externalNeedId: string) {
  const rows = await (prisma as any).scopePreference.findMany({
    where: { externalNeedId },
    include: { agent: true },
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
  });
  return normalizeScopeWeights(rows).map(safeScopePreference);
}

export async function getScopeSummary(externalNeedId: string) {
  const rows = await (prisma as any).scopePreference.findMany({
    where: { externalNeedId },
    select: { label: true, labelKey: true, score: true, agentId: true },
  });
  return {
    externalNeedId,
    ...getScopeSummaryFromRows(rows),
  };
}

export async function validateScopePreferenceInput(input: ScopePreferenceInput, currentId?: string | null, options: { allowTerminal?: boolean } = {}) {
  const externalNeed = await (prisma as any).externalNeed.findUnique({
    where: { id: input.externalNeedId },
    select: {
      id: true,
      treeId: true,
      status: true,
      agents: { select: { id: true } },
    },
  });
  if (!externalNeed) throw new Error('External Need not found');
  if (!options.allowTerminal && TERMINAL_EXTERNAL_NEED_STATUSES.has(externalNeed.status)) {
    throw new Error('Cannot modify Scope Preferences for this External Need status');
  }

  const { label, labelKey } = normalizeScopeLabel(input.label);
  const score = normalizeScopeScore(input.score);
  const description = normalizeScopeDescription(input.description);
  const agentId = input.agentId ? String(input.agentId) : null;
  if (agentId && !externalNeed.agents.some((agent: any) => agent.id === agentId)) {
    throw new Error('agentId must belong to this External Need');
  }

  const duplicate = await (prisma as any).scopePreference.findFirst({
    where: {
      externalNeedId: input.externalNeedId,
      labelKey,
      agentId,
      ...(currentId ? { id: { not: currentId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error('A Scope Preference with this label already exists for this agent/context');
  }

  return {
    externalNeed,
    data: {
      label,
      labelKey,
      score,
      description,
      agentId,
      createdById: input.createdById ?? null,
    },
  };
}

export async function persistNormalizedWeights(externalNeedId: string) {
  const rows = await (prisma as any).scopePreference.findMany({
    where: { externalNeedId },
    select: { id: true, score: true },
  });
  const weighted = normalizeScopeWeights(rows);
  await Promise.all(weighted.map((scope) => (
    (prisma as any).scopePreference.update({
      where: { id: scope.id },
      data: { normalizedWeight: scope.normalizedWeight },
    })
  )));
}
