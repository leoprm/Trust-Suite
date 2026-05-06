import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import {
  assertBudgetRange,
  assertCanAddSolution,
  assertEmail,
  assertNoExternalNeedAuthorityEffects,
  assertStatusTransition,
  getTreeAccess,
  normalizeAgentRole,
  normalizeNeedStatus,
  normalizeSolutionStatus,
  normalizeVisibility,
  parseCurrency,
  safeAgent,
  safeExternalNeed,
} from '../services/externalNeedService';
import {
  getScopePreferences,
  getScopeSummary,
  normalizeScopeLabel,
  normalizeScopeScore,
  persistNormalizedWeights,
  safeScopePreference,
  validateScopePreferenceInput,
} from '../services/scopePreferenceService';
import {
  assertCanSubmitSolution,
  assertNoSolutionAuthorityEffects,
  getBudgetSummary,
  normalizeBudgetLineInput,
  normalizeInitialSolutionStatus,
  normalizeSolutionProposalInput,
  safeBudgetLine,
  safeSolutionProposal,
} from '../services/solutionProposalService';

async function requireTreeMember(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const access = await getTreeAccess(userId, treeId, req.user?.role);
  if (!access.isMember) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'ExternalNeed',
      metadataJson: getRequestMetadata(req, { reason: 'not_tree_member' }),
      severity: 'WARNING',
    });
    res.status(403).json({ error: 'Tree membership required' });
    return null;
  }
  return { userId, ...access };
}

async function loadNeedWithAccess(req: Request, res: Response, id: string) {
  const need = await (prisma as any).externalNeed.findUnique({
    where: { id },
    include: {
      agents: { orderBy: { createdAt: 'asc' } },
      scopePoints: { include: { agent: true }, orderBy: [{ score: 'desc' }, { createdAt: 'asc' }] },
      solutions: { include: { budgetLines: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
      _count: { select: { agents: true, scopePoints: true, solutions: true } },
    },
  });
  if (!need) {
    res.status(404).json({ error: 'External Need not found' });
    return null;
  }
  const access = await requireTreeMember(req, res, need.treeId);
  if (!access) return null;
  return { need, access };
}

function externalNeedDataFromBody(body: any) {
  const { parsedMin, parsedMax } = assertBudgetRange(body.budgetMinFiat, body.budgetMaxFiat);
  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    clientSummary: body.clientSummary ? String(body.clientSummary).trim() : null,
    desiredOutcome: body.desiredOutcome ? String(body.desiredOutcome).trim() : null,
    constraints: body.constraints ? String(body.constraints).trim() : null,
    deadline: body.deadline ? new Date(body.deadline) : null,
    budgetMinFiat: parsedMin,
    budgetMaxFiat: parsedMax,
    currency: parseCurrency(body.currency),
    visibility: normalizeVisibility(body.visibility),
  };
}

function solutionDataFromBody(body: any) {
  return normalizeSolutionProposalInput(body);
}

export const listExternalNeedsForTree = async (req: Request, res: Response) => {
  try {
    const treeId = String(req.params.treeId || '');
    const access = await requireTreeMember(req, res, treeId);
    if (!access) return;

    const needs = await (prisma as any).externalNeed.findMany({
      where: { treeId },
      include: {
        _count: { select: { agents: true, scopePoints: true, solutions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(needs.map((need: any) => safeExternalNeed(need)));
  } catch (error: any) {
    console.error('[ExternalNeed] list:', error);
    res.status(500).json({ error: 'Failed to list External Needs' });
  }
};

export const createExternalNeed = async (req: Request, res: Response) => {
  const treeId = String(req.params.treeId || '');
  try {
    assertNoExternalNeedAuthorityEffects(req.body);
    const access = await requireTreeMember(req, res, treeId);
    if (!access) return;

    const data = externalNeedDataFromBody(req.body);
    if (!data.title) return res.status(400).json({ error: 'title is required' });
    if (!data.description) return res.status(400).json({ error: 'description is required' });

    const status = req.body.status ? normalizeNeedStatus(req.body.status) : 'DRAFT';
    if (status === 'COMPLETED' || status === 'CONVERTED_TO_TASKS') {
      return res.status(400).json({ error: 'Invalid initial External Need status' });
    }

    const agents = Array.isArray(req.body.agents) ? req.body.agents : [];
    const scopePreferences = Array.isArray(req.body.scopePreferences) ? req.body.scopePreferences : [];
    for (const agent of agents) {
      if (!String(agent.name || '').trim()) throw new Error('External agent name is required');
      assertEmail(agent.email);
      normalizeAgentRole(agent.role);
    }
    for (const scope of scopePreferences) {
      normalizeScopeLabel(scope.label);
      normalizeScopeScore(scope.score);
    }

    const need = await (prisma as any).externalNeed.create({
      data: {
        treeId,
        createdById: access.userId,
        ...data,
        status,
        metadataJson: {
          source: 'trust_suite_internal',
          noInternalNeedPoints: true,
          noAuthorityEffect: true,
        },
        agents: agents.length ? {
          create: agents.map((agent: any) => ({
            name: String(agent.name).trim(),
            email: agent.email ? String(agent.email).trim().toLowerCase() : null,
            organization: agent.organization ? String(agent.organization).trim() : null,
            role: normalizeAgentRole(agent.role),
            notes: agent.notes ? String(agent.notes).trim() : null,
            consentAccepted: Boolean(agent.consentAccepted),
          })),
        } : undefined,
        scopePoints: scopePreferences.length ? {
          create: scopePreferences.map((scope: any) => ({
            ...normalizeScopeLabel(scope.label),
            score: Number(scope.score),
            description: scope.description ? String(scope.description).trim() : null,
            createdById: access.userId,
          })),
        } : undefined,
      },
      include: {
        agents: true,
        scopePoints: { include: { agent: true } },
        solutions: { include: { budgetLines: { orderBy: { createdAt: 'asc' } } } },
        _count: { select: { agents: true, scopePoints: true, solutions: true } },
      },
    });
    if (need.scopePoints.length) {
      await persistNormalizedWeights(need.id);
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'EXTERNAL_NEED_CREATED',
      entityType: 'ExternalNeed',
      entityId: need.id,
      afterJson: safeExternalNeed(need),
      metadataJson: getRequestMetadata(req, {
        status: need.status,
        scopePreferenceCount: need.scopePoints.length,
        agentCount: need.agents.length,
        noInternalNeedPoints: true,
      }),
    });

    res.status(201).json(safeExternalNeed(need, { includePrivateAgents: access.isAdmin }));
  } catch (error: any) {
    console.error('[ExternalNeed] create:', error);
    res.status(400).json({ error: error.message || 'Failed to create External Need' });
  }
};

export const getExternalNeed = async (req: Request, res: Response) => {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    res.json(safeExternalNeed(loaded.need, { includePrivateAgents: loaded.access.isAdmin }));
  } catch (error: any) {
    console.error('[ExternalNeed] get:', error);
    res.status(500).json({ error: 'Failed to fetch External Need' });
  }
};

export const updateExternalNeed = async (req: Request, res: Response) => {
  try {
    assertNoExternalNeedAuthorityEffects(req.body);
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    const { need, access } = loaded;
    const canCreatorEditDraft = need.createdById === access.userId && need.status === 'DRAFT';
    if (!access.isAdmin && !canCreatorEditDraft) return res.status(403).json({ error: 'Admin privileges required for this External Need' });

    const data = externalNeedDataFromBody({ ...need, ...req.body });
    if (!data.title) return res.status(400).json({ error: 'title is required' });
    if (!data.description) return res.status(400).json({ error: 'description is required' });

    const nextStatus = req.body.status ? normalizeNeedStatus(req.body.status) : need.status;
    assertStatusTransition(need.status, nextStatus);

    const updated = await (prisma as any).externalNeed.update({
      where: { id: need.id },
      data: { ...data, status: nextStatus },
      include: {
        agents: true,
        scopePoints: { include: { agent: true } },
        solutions: { include: { budgetLines: { orderBy: { createdAt: 'asc' } } } },
        _count: { select: { agents: true, scopePoints: true, solutions: true } },
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: need.treeId,
      action: 'EXTERNAL_NEED_UPDATED',
      entityType: 'ExternalNeed',
      entityId: need.id,
      beforeJson: safeExternalNeed(need),
      afterJson: safeExternalNeed(updated),
      metadataJson: getRequestMetadata(req, { noInternalNeedPoints: true }),
      source: access.isAdmin ? 'ADMIN' : 'USER',
    });

    res.json(safeExternalNeed(updated, { includePrivateAgents: access.isAdmin }));
  } catch (error: any) {
    console.error('[ExternalNeed] update:', error);
    res.status(400).json({ error: error.message || 'Failed to update External Need' });
  }
};

export const cancelExternalNeed = async (req: Request, res: Response) => changeExternalNeedStatus(req, res, 'CANCELLED', 'EXTERNAL_NEED_CANCELLED');
export const openExternalNeed = async (req: Request, res: Response) => changeExternalNeedStatus(req, res, 'OPEN', 'EXTERNAL_NEED_OPENED');
export const approveExternalNeed = async (req: Request, res: Response) => changeExternalNeedStatus(req, res, 'APPROVED', 'EXTERNAL_NEED_APPROVED');
export const rejectExternalNeed = async (req: Request, res: Response) => changeExternalNeedStatus(req, res, 'REJECTED', 'EXTERNAL_NEED_REJECTED');

async function changeExternalNeedStatus(req: Request, res: Response, status: any, action: string) {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    const { need, access } = loaded;
    if (!access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });
    assertStatusTransition(need.status, status);

    const updated = await (prisma as any).externalNeed.update({
      where: { id: need.id },
      data: { status },
      include: {
        agents: true,
        scopePoints: { include: { agent: true } },
        solutions: { include: { budgetLines: { orderBy: { createdAt: 'asc' } } } },
        _count: { select: { agents: true, scopePoints: true, solutions: true } },
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: need.treeId,
      action,
      entityType: 'ExternalNeed',
      entityId: need.id,
      beforeJson: { status: need.status },
      afterJson: { status },
      metadataJson: getRequestMetadata(req, { noAuthorityEffect: true }),
      source: 'ADMIN',
    });

    res.json(safeExternalNeed(updated, { includePrivateAgents: true }));
  } catch (error: any) {
    console.error('[ExternalNeed] status:', error);
    res.status(400).json({ error: error.message || 'Failed to update External Need status' });
  }
}

export const deleteExternalNeed = cancelExternalNeed;

export const addExternalAgent = async (req: Request, res: Response) => {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    if (!loaded.access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });

    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    assertEmail(req.body.email);

    const agent = await (prisma as any).externalAgent.create({
      data: {
        externalNeedId: loaded.need.id,
        name,
        email: req.body.email ? String(req.body.email).trim().toLowerCase() : null,
        organization: req.body.organization ? String(req.body.organization).trim() : null,
        role: normalizeAgentRole(req.body.role),
        notes: req.body.notes ? String(req.body.notes).trim() : null,
        consentAccepted: Boolean(req.body.consentAccepted),
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.need.treeId,
      action: 'EXTERNAL_AGENT_ADDED',
      entityType: 'ExternalAgent',
      entityId: agent.id,
      metadataJson: getRequestMetadata(req, { externalNeedId: loaded.need.id, role: agent.role }),
      source: 'ADMIN',
    });

    res.status(201).json(safeAgent(agent, true));
  } catch (error: any) {
    console.error('[ExternalAgent] add:', error);
    res.status(400).json({ error: error.message || 'Failed to add external agent' });
  }
};

export const updateExternalAgent = async (req: Request, res: Response) => {
  try {
    const agent = await (prisma as any).externalAgent.findUnique({
      where: { id: String(req.params.agentId || '') },
      include: { externalNeed: true },
    });
    if (!agent) return res.status(404).json({ error: 'External agent not found' });
    const access = await requireTreeMember(req, res, agent.externalNeed.treeId);
    if (!access) return;
    if (!access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });

    assertEmail(req.body.email);
    const updated = await (prisma as any).externalAgent.update({
      where: { id: agent.id },
      data: {
        name: req.body.name === undefined ? undefined : String(req.body.name || '').trim(),
        email: req.body.email === undefined ? undefined : (req.body.email ? String(req.body.email).trim().toLowerCase() : null),
        organization: req.body.organization === undefined ? undefined : (req.body.organization ? String(req.body.organization).trim() : null),
        role: req.body.role === undefined ? undefined : normalizeAgentRole(req.body.role),
        notes: req.body.notes === undefined ? undefined : (req.body.notes ? String(req.body.notes).trim() : null),
        consentAccepted: req.body.consentAccepted === undefined ? undefined : Boolean(req.body.consentAccepted),
      },
    });

    res.json(safeAgent(updated, true));
  } catch (error: any) {
    console.error('[ExternalAgent] update:', error);
    res.status(400).json({ error: error.message || 'Failed to update external agent' });
  }
};

export const deleteExternalAgent = async (req: Request, res: Response) => {
  try {
    const agent = await (prisma as any).externalAgent.findUnique({
      where: { id: String(req.params.agentId || '') },
      include: { externalNeed: true },
    });
    if (!agent) return res.status(404).json({ error: 'External agent not found' });
    const access = await requireTreeMember(req, res, agent.externalNeed.treeId);
    if (!access) return;
    if (!access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });
    await (prisma as any).externalAgent.delete({ where: { id: agent.id } });
    res.status(204).send();
  } catch (error: any) {
    console.error('[ExternalAgent] delete:', error);
    res.status(400).json({ error: 'Failed to delete external agent' });
  }
};

export const addScopePreference = async (req: Request, res: Response) => {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    const validation = await validateScopePreferenceInput({
      externalNeedId: loaded.need.id,
      label: req.body.label,
      score: req.body.score,
      description: req.body.description,
      agentId: req.body.agentId,
      createdById: loaded.access.userId,
    }, null, { allowTerminal: loaded.access.isAdmin });

    const scope = await (prisma as any).scopePreference.create({
      data: {
        externalNeedId: loaded.need.id,
        ...validation.data,
      },
      include: { agent: true },
    });
    await persistNormalizedWeights(loaded.need.id);
    const refreshed = await (prisma as any).scopePreference.findUnique({ where: { id: scope.id }, include: { agent: true } });

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.need.treeId,
      action: 'SCOPE_PREFERENCE_CREATED',
      entityType: 'ScopePreference',
      entityId: scope.id,
      metadataJson: getRequestMetadata(req, {
        externalNeedId: loaded.need.id,
        label: scope.label,
        score: scope.score,
        agentId: scope.agentId,
        noInternalNeedPoints: true,
      }),
    });

    res.status(201).json(safeScopePreference(refreshed || scope));
  } catch (error: any) {
    console.error('[ScopePreference] add:', error);
    res.status(400).json({ error: error.message || 'Failed to add scope preference' });
  }
};

export const listScopePreferences = async (req: Request, res: Response) => {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    res.json(await getScopePreferences(loaded.need.id));
  } catch (error: any) {
    console.error('[ScopePreference] list:', error);
    res.status(500).json({ error: 'Failed to list scope preferences' });
  }
};

export const getScopeSummaryController = async (req: Request, res: Response) => {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    res.json(await getScopeSummary(loaded.need.id));
  } catch (error: any) {
    console.error('[ScopePreference] summary:', error);
    res.status(500).json({ error: 'Failed to calculate scope summary' });
  }
};

export const updateScopePreference = async (req: Request, res: Response) => {
  try {
    const scope = await (prisma as any).scopePreference.findUnique({ where: { id: String(req.params.scopeId || '') }, include: { externalNeed: true } });
    if (!scope) return res.status(404).json({ error: 'Scope preference not found' });
    const access = await requireTreeMember(req, res, scope.externalNeed.treeId);
    if (!access) return;
    if (!access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });
    const validation = await validateScopePreferenceInput({
      externalNeedId: scope.externalNeedId,
      label: req.body.label === undefined ? scope.label : req.body.label,
      score: req.body.score === undefined ? scope.score : req.body.score,
      description: req.body.description === undefined ? scope.description : req.body.description,
      agentId: req.body.agentId === undefined ? scope.agentId : req.body.agentId,
      createdById: scope.createdById,
    }, scope.id, { allowTerminal: access.isAdmin });
    const updated = await (prisma as any).scopePreference.update({
      where: { id: scope.id },
      data: validation.data,
      include: { agent: true },
    });
    await persistNormalizedWeights(scope.externalNeedId);
    const refreshed = await (prisma as any).scopePreference.findUnique({ where: { id: scope.id }, include: { agent: true } });
    void logEvent({
      ...getRequestContext(req),
      treeId: scope.externalNeed.treeId,
      action: 'SCOPE_PREFERENCE_UPDATED',
      entityType: 'ScopePreference',
      entityId: scope.id,
      beforeJson: safeScopePreference(scope),
      afterJson: safeScopePreference(refreshed || updated),
      metadataJson: getRequestMetadata(req, {
        externalNeedId: scope.externalNeedId,
        label: updated.label,
        score: updated.score,
        agentId: updated.agentId,
        noInternalNeedPoints: true,
      }),
      source: 'ADMIN',
    });
    res.json(safeScopePreference(refreshed || updated));
  } catch (error: any) {
    console.error('[ScopePreference] update:', error);
    res.status(400).json({ error: error.message || 'Failed to update scope preference' });
  }
};

export const deleteScopePreference = async (req: Request, res: Response) => {
  try {
    const scope = await (prisma as any).scopePreference.findUnique({ where: { id: String(req.params.scopeId || '') }, include: { externalNeed: true } });
    if (!scope) return res.status(404).json({ error: 'Scope preference not found' });
    const access = await requireTreeMember(req, res, scope.externalNeed.treeId);
    if (!access) return;
    if (!access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });
    await (prisma as any).scopePreference.delete({ where: { id: scope.id } });
    await persistNormalizedWeights(scope.externalNeedId);
    void logEvent({
      ...getRequestContext(req),
      treeId: scope.externalNeed.treeId,
      action: 'SCOPE_PREFERENCE_DELETED',
      entityType: 'ScopePreference',
      entityId: scope.id,
      beforeJson: safeScopePreference(scope),
      metadataJson: getRequestMetadata(req, {
        externalNeedId: scope.externalNeedId,
        label: scope.label,
        score: scope.score,
        agentId: scope.agentId,
        noInternalNeedPoints: true,
      }),
      source: 'ADMIN',
    });
    res.status(204).send();
  } catch (error: any) {
    console.error('[ScopePreference] delete:', error);
    res.status(400).json({ error: 'Failed to delete scope preference' });
  }
};

export const listSolutions = async (req: Request, res: Response) => {
  try {
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    res.json((loaded.need.solutions || []).map(safeSolutionProposal));
  } catch (error: any) {
    console.error('[SolutionProposal] list:', error);
    res.status(500).json({ error: 'Failed to list solution proposals' });
  }
};

export const getSolutionProposal = async (req: Request, res: Response) => {
  try {
    const solution = await (prisma as any).solutionProposal.findUnique({
      where: { id: String(req.params.solutionId || '') },
      include: { externalNeed: true, budgetLines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!solution) return res.status(404).json({ error: 'Solution proposal not found' });
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    res.json(safeSolutionProposal(solution));
  } catch (error: any) {
    console.error('[SolutionProposal] get:', error);
    res.status(500).json({ error: 'Failed to fetch solution proposal' });
  }
};

export const createSolutionProposal = async (req: Request, res: Response) => {
  try {
    assertNoExternalNeedAuthorityEffects(req.body);
    assertNoSolutionAuthorityEffects(req.body);
    const loaded = await loadNeedWithAccess(req, res, String(req.params.id || ''));
    if (!loaded) return;
    assertCanAddSolution(loaded.need);
    const data = solutionDataFromBody(req.body);
    if (!data.title) return res.status(400).json({ error: 'title is required' });
    if (!data.description) return res.status(400).json({ error: 'description is required' });
    const budgetLines = Array.isArray(req.body.budgetLines) ? req.body.budgetLines.map((line: any) => normalizeBudgetLineInput(line)) : [];

    const solution = await (prisma as any).solutionProposal.create({
      data: {
        externalNeedId: loaded.need.id,
        createdById: loaded.access.userId,
        ...data,
        status: normalizeInitialSolutionStatus(req.body.status),
        metadataJson: {
          noXpEffect: true,
          noAuthorityEffect: true,
          noPaymentExecuted: true,
          noFiatTransactionCreated: true,
        },
        budgetLines: budgetLines.length ? { create: budgetLines } : undefined,
      },
      include: { budgetLines: { orderBy: { createdAt: 'asc' } } },
    });

    await (prisma as any).externalNeed.update({
      where: { id: loaded.need.id },
      data: { status: loaded.need.status === 'DRAFT' ? 'SOLUTIONS_PROPOSED' : loaded.need.status },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: loaded.need.treeId,
      action: 'SOLUTION_PROPOSAL_CREATED',
      entityType: 'SolutionProposal',
      entityId: solution.id,
      afterJson: safeSolutionProposal(solution),
      metadataJson: getRequestMetadata(req, {
        externalNeedId: loaded.need.id,
        estimatedFiatExpected: solution.estimatedFiatExpected,
        currency: solution.currency,
        riskLevel: solution.riskLevel,
        budgetLineCount: budgetLines.length,
        noXpEffect: true,
        noPaymentExecuted: true,
      }),
    });

    res.status(201).json(safeSolutionProposal(solution));
  } catch (error: any) {
    console.error('[SolutionProposal] create:', error);
    res.status(400).json({ error: error.message || 'Failed to create solution proposal' });
  }
};

export const updateSolutionProposal = async (req: Request, res: Response) => {
  try {
    assertNoExternalNeedAuthorityEffects(req.body);
    assertNoSolutionAuthorityEffects(req.body);
    const solution = await (prisma as any).solutionProposal.findUnique({
      where: { id: String(req.params.solutionId || '') },
      include: { externalNeed: true, budgetLines: true },
    });
    if (!solution) return res.status(404).json({ error: 'Solution proposal not found' });
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    assertCanAddSolution(solution.externalNeed);
    const canEditDraft = solution.createdById === access.userId && solution.status === 'DRAFT';
    const canEdit = access.isAdmin || canEditDraft;
    if (!canEdit) return res.status(403).json({ error: 'Cannot edit this solution proposal' });

    const data = solutionDataFromBody({ ...solution, ...req.body });
    if (!data.title) return res.status(400).json({ error: 'title is required' });
    if (!data.description) return res.status(400).json({ error: 'description is required' });

    const updated = await (prisma as any).solutionProposal.update({
      where: { id: solution.id },
      data: {
        ...data,
        status: req.body.status === undefined
          ? undefined
          : (() => {
            const next = normalizeSolutionStatus(req.body.status);
            if (next === 'CONVERTED_TO_TASKS') throw new Error('Conversion to tasks is reserved for a future phase');
            return next;
          })(),
      },
      include: { budgetLines: { orderBy: { createdAt: 'asc' } } },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: solution.externalNeed.treeId,
      action: 'SOLUTION_PROPOSAL_UPDATED',
      entityType: 'SolutionProposal',
      entityId: solution.id,
      beforeJson: safeSolutionProposal(solution),
      afterJson: safeSolutionProposal(updated),
      metadataJson: getRequestMetadata(req, { externalNeedId: solution.externalNeedId, noXpEffect: true, noPaymentExecuted: true }),
      source: access.isAdmin ? 'ADMIN' : 'USER',
    });

    res.json(safeSolutionProposal(updated));
  } catch (error: any) {
    console.error('[SolutionProposal] update:', error);
    res.status(400).json({ error: error.message || 'Failed to update solution proposal' });
  }
};

export const submitSolutionProposal = async (req: Request, res: Response) => changeSolutionStatus(req, res, 'SUBMITTED', 'SOLUTION_PROPOSAL_SUBMITTED', false);
export const reviewSolutionProposal = async (req: Request, res: Response) => changeSolutionStatus(req, res, 'UNDER_REVIEW', 'SOLUTION_PROPOSAL_UNDER_REVIEW', true);
export const approveTreeSolutionProposal = async (req: Request, res: Response) => changeSolutionStatus(req, res, 'APPROVED_BY_TREE', 'SOLUTION_PROPOSAL_APPROVED_BY_TREE', true);
export const approveClientSolutionProposal = async (req: Request, res: Response) => changeSolutionStatus(req, res, 'APPROVED_BY_CLIENT', 'SOLUTION_PROPOSAL_APPROVED_BY_CLIENT', true);
export const rejectSolutionProposal = async (req: Request, res: Response) => changeSolutionStatus(req, res, 'REJECTED', 'SOLUTION_PROPOSAL_REJECTED', true);
export const archiveSolutionProposal = async (req: Request, res: Response) => changeSolutionStatus(req, res, 'ARCHIVED', 'SOLUTION_PROPOSAL_ARCHIVED', true);
export const deleteSolutionProposal = archiveSolutionProposal;

export const selectSolutionProposal = async (req: Request, res: Response) => {
  try {
    const solution = await (prisma as any).solutionProposal.findUnique({
      where: { id: String(req.params.solutionId || '') },
      include: { externalNeed: true, budgetLines: true },
    });
    if (!solution) return res.status(404).json({ error: 'Solution proposal not found' });
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    if (!access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });
    assertCanAddSolution(solution.externalNeed);
    if (solution.status === 'DRAFT') return res.status(400).json({ error: 'Cannot select a draft solution proposal' });

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      await tx.solutionProposal.updateMany({
        where: {
          externalNeedId: solution.externalNeedId,
          id: { not: solution.id },
          status: { notIn: ['REJECTED', 'ARCHIVED'] },
        },
        data: { status: 'ARCHIVED' },
      });
      const selected = await tx.solutionProposal.update({
        where: { id: solution.id },
        data: { status: 'SELECTED', selectedAt: new Date(), selectedById: access.userId },
        include: { budgetLines: { orderBy: { createdAt: 'asc' } } },
      });
      await tx.externalNeed.update({ where: { id: solution.externalNeedId }, data: { status: 'APPROVED' } });
      return selected;
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: solution.externalNeed.treeId,
      action: 'SOLUTION_PROPOSAL_SELECTED',
      entityType: 'SolutionProposal',
      entityId: solution.id,
      beforeJson: { status: solution.status },
      afterJson: { status: 'SELECTED', externalNeedStatus: 'APPROVED', selectedAt: updated.selectedAt },
      metadataJson: getRequestMetadata(req, {
        externalNeedId: solution.externalNeedId,
        estimatedFiatExpected: solution.estimatedFiatExpected,
        currency: solution.currency,
        noXpEffect: true,
        noPaymentExecuted: true,
        noFiatTransactionCreated: true,
      }),
      source: 'ADMIN',
    });

    res.json(safeSolutionProposal(updated));
  } catch (error: any) {
    console.error('[SolutionProposal] select:', error);
    res.status(400).json({ error: error.message || 'Failed to select solution proposal' });
  }
};

async function changeSolutionStatus(req: Request, res: Response, status: any, action: string, adminOnly: boolean) {
  try {
    const solution = await (prisma as any).solutionProposal.findUnique({
      where: { id: String(req.params.solutionId || '') },
      include: { externalNeed: true, budgetLines: true },
    });
    if (!solution) return res.status(404).json({ error: 'Solution proposal not found' });
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    if (adminOnly && !access.isAdmin) return res.status(403).json({ error: 'Tree admin required' });
    if (!adminOnly && !access.isAdmin && solution.createdById !== access.userId) return res.status(403).json({ error: 'Cannot submit this solution proposal' });
    assertCanAddSolution(solution.externalNeed);
    if (status === 'SUBMITTED') assertCanSubmitSolution(solution);
    if (status === 'CONVERTED_TO_TASKS') return res.status(400).json({ error: 'Conversion to tasks is reserved for a future phase' });

    const updateData: any = { status };
    if (status === 'APPROVED_BY_TREE') updateData.approvedByTreeAt = new Date();
    if (status === 'APPROVED_BY_CLIENT') updateData.approvedByClientAt = new Date();

    const updated = await (prisma as any).solutionProposal.update({
      where: { id: solution.id },
      data: updateData,
      include: { budgetLines: { orderBy: { createdAt: 'asc' } } },
    });
    if (status === 'SUBMITTED' && ['DRAFT', 'OPEN', 'UNDER_REVIEW'].includes(solution.externalNeed.status)) {
      await (prisma as any).externalNeed.update({ where: { id: solution.externalNeedId }, data: { status: 'SOLUTIONS_PROPOSED' } });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: solution.externalNeed.treeId,
      action,
      entityType: 'SolutionProposal',
      entityId: solution.id,
      beforeJson: { status: solution.status },
      afterJson: { status, approvedByTreeAt: updated.approvedByTreeAt, approvedByClientAt: updated.approvedByClientAt },
      metadataJson: getRequestMetadata(req, { externalNeedId: solution.externalNeedId, noXpEffect: true, noPaymentExecuted: true }),
      source: adminOnly ? 'ADMIN' : 'USER',
    });

    res.json(safeSolutionProposal(updated));
  } catch (error: any) {
    console.error('[SolutionProposal] status:', error);
    res.status(400).json({ error: error.message || 'Failed to update solution proposal status' });
  }
}

export const addBudgetLine = async (req: Request, res: Response) => {
  try {
    assertNoSolutionAuthorityEffects(req.body);
    const solution = await (prisma as any).solutionProposal.findUnique({
      where: { id: String(req.params.solutionId || '') },
      include: { externalNeed: true },
    });
    if (!solution) return res.status(404).json({ error: 'Solution proposal not found' });
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    const canEdit = access.isAdmin || (solution.createdById === access.userId && solution.status === 'DRAFT');
    if (!canEdit) return res.status(403).json({ error: 'Cannot edit budget lines for this solution proposal' });
    assertCanAddSolution(solution.externalNeed);

    const data = normalizeBudgetLineInput(req.body);
    const line = await (prisma as any).budgetLine.create({
      data: { solutionProposalId: solution.id, ...data },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: solution.externalNeed.treeId,
      action: 'BUDGET_LINE_CREATED',
      entityType: 'BudgetLine',
      entityId: line.id,
      afterJson: safeBudgetLine(line),
      metadataJson: getRequestMetadata(req, {
        solutionProposalId: solution.id,
        externalNeedId: solution.externalNeedId,
        type: line.type,
        estimatedFiat: line.estimatedFiat,
        noXpEffect: true,
        noPaymentExecuted: true,
      }),
      source: access.isAdmin ? 'ADMIN' : 'USER',
    });

    res.status(201).json(safeBudgetLine(line));
  } catch (error: any) {
    console.error('[BudgetLine] create:', error);
    res.status(400).json({ error: error.message || 'Failed to create budget line' });
  }
};

export const updateBudgetLine = async (req: Request, res: Response) => {
  try {
    assertNoSolutionAuthorityEffects(req.body);
    const line = await (prisma as any).budgetLine.findUnique({
      where: { id: String(req.params.budgetLineId || '') },
      include: { solutionProposal: { include: { externalNeed: true } } },
    });
    if (!line) return res.status(404).json({ error: 'Budget line not found' });
    const solution = line.solutionProposal;
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    const canEdit = access.isAdmin || (solution.createdById === access.userId && solution.status === 'DRAFT');
    if (!canEdit) return res.status(403).json({ error: 'Cannot edit this budget line' });
    assertCanAddSolution(solution.externalNeed);

    const data = normalizeBudgetLineInput(req.body, line);
    const updated = await (prisma as any).budgetLine.update({ where: { id: line.id }, data });

    void logEvent({
      ...getRequestContext(req),
      treeId: solution.externalNeed.treeId,
      action: 'BUDGET_LINE_UPDATED',
      entityType: 'BudgetLine',
      entityId: line.id,
      beforeJson: safeBudgetLine(line),
      afterJson: safeBudgetLine(updated),
      metadataJson: getRequestMetadata(req, { solutionProposalId: solution.id, externalNeedId: solution.externalNeedId, noXpEffect: true }),
      source: access.isAdmin ? 'ADMIN' : 'USER',
    });

    res.json(safeBudgetLine(updated));
  } catch (error: any) {
    console.error('[BudgetLine] update:', error);
    res.status(400).json({ error: error.message || 'Failed to update budget line' });
  }
};

export const deleteBudgetLine = async (req: Request, res: Response) => {
  try {
    const line = await (prisma as any).budgetLine.findUnique({
      where: { id: String(req.params.budgetLineId || '') },
      include: { solutionProposal: { include: { externalNeed: true } } },
    });
    if (!line) return res.status(404).json({ error: 'Budget line not found' });
    const solution = line.solutionProposal;
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    const canEdit = access.isAdmin || (solution.createdById === access.userId && solution.status === 'DRAFT');
    if (!canEdit) return res.status(403).json({ error: 'Cannot delete this budget line' });
    assertCanAddSolution(solution.externalNeed);
    await (prisma as any).budgetLine.delete({ where: { id: line.id } });

    void logEvent({
      ...getRequestContext(req),
      treeId: solution.externalNeed.treeId,
      action: 'BUDGET_LINE_DELETED',
      entityType: 'BudgetLine',
      entityId: line.id,
      beforeJson: safeBudgetLine(line),
      metadataJson: getRequestMetadata(req, { solutionProposalId: solution.id, externalNeedId: solution.externalNeedId, noXpEffect: true }),
      source: access.isAdmin ? 'ADMIN' : 'USER',
    });

    res.status(204).send();
  } catch (error: any) {
    console.error('[BudgetLine] delete:', error);
    res.status(400).json({ error: error.message || 'Failed to delete budget line' });
  }
};

export const getBudgetSummaryController = async (req: Request, res: Response) => {
  try {
    const solution = await (prisma as any).solutionProposal.findUnique({
      where: { id: String(req.params.solutionId || '') },
      include: { externalNeed: true },
    });
    if (!solution) return res.status(404).json({ error: 'Solution proposal not found' });
    const access = await requireTreeMember(req, res, solution.externalNeed.treeId);
    if (!access) return;
    const summary = await getBudgetSummary(solution.id);
    res.json(summary);
  } catch (error: any) {
    console.error('[BudgetLine] summary:', error);
    res.status(500).json({ error: 'Failed to calculate budget summary' });
  }
};
