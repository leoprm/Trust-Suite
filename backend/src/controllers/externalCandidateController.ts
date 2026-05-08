import { Request, Response } from 'express';
import {
  createCandidate,
  getCandidate,
  listCandidates,
  startReview,
  matchEvaluators,
  assignEvaluators,
  promoteToProvisional,
  startPracticalTest,
  submitPracticalTest,
  completePracticalTest,
  rejectCandidate,
  getMyEvaluations,
  submitEvaluation,
  getEvaluationStats,
  resolveConsensusIfAllVoted,
} from '../services/externalCandidateService';
import { getRequestContext, logEvent } from '../services/eventLogService';

// ── POST /api/external-candidates ────────────────────────────────────────
export const apply = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { treeId, name, email, skills, experience, portfolioUrl } = req.body;

    if (!treeId || !name || !skills?.length) {
      return res.status(400).json({ error: 'treeId, name, and skills are required' });
    }

    // Verify user is member or admin of this tree
    const membership = await (req as any).prisma?.treeMember.findFirst?.({
      where: { treeId, userId: req.user!.id },
    });
    const isTreeMember = !!membership;

    if (!isTreeMember && req.user!.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'You must be a member or admin of this tree' });
    }

    const candidate = await createCandidate(treeId, {
      name,
      email,
      skills,
      experience,
      portfolioUrl,
    }, req.user!.id);

    void logEvent({
      ...ctx,
      treeId,
      action: 'EXTERNAL_CANDIDATE_APPLIED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      metadataJson: { name, skills: skills.join(','), treeId },
      source: 'USER',
    });

    res.status(201).json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.apply]', error);
    res.status(500).json({ error: 'Failed to create candidate' });
  }
};

// ── GET /api/external-candidates/:id ─────────────────────────────────────
export const get = async (req: Request, res: Response) => {
  try {
    const candidate = await getCandidate(req.params.id as string);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.get]', error);
    res.status(500).json({ error: 'Failed to get candidate' });
  }
};

// ── GET /api/external-candidates?treeId=&status= ─────────────────────────
export const list = async (req: Request, res: Response) => {
  try {
    const { treeId, status } = req.query;
    if (!treeId) return res.status(400).json({ error: 'treeId is required' });

    const candidates = await listCandidates(treeId as string, status as any);
    res.json(candidates);
  } catch (error: any) {
    console.error('[externalCandidate.list]', error);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
};

// ── POST /api/external-candidates/:id/review ─────────────────────────────
export const review = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const candidate = await startReview(req.params.id as string);

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: 'EXTERNAL_CANDIDATE_REVIEW_STARTED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      source: 'ADMIN',
    });

    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.review]', error);
    res.status(500).json({ error: 'Failed to start review' });
  }
};

// ── POST /api/external-candidates/:id/assign-evaluators ───────────────────
export const assignEvals = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const candidate = await getCandidate(req.params.id as string);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const skills = JSON.parse(candidate.skills || '[]');
    const result = await matchEvaluators(candidate.treeId, skills);

    const updated = await assignEvaluators(
      candidate.id,
      result.evaluators.map(e => e.userId),
      result.mode,
    );

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: 'EXTERNAL_CANDIDATE_EVALUATORS_ASSIGNED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      metadataJson: {
        evaluatorCount: result.evaluators.length,
        mode: result.mode,
        treeDiversity: result.treeDiversity,
        evaluatorTrees: result.evaluators.map(e => `${e.userId}@${e.treeName}`),
      },
      source: 'ADMIN',
    });

    res.json({ ...updated, evaluators: result.evaluators });
  } catch (error: any) {
    console.error('[externalCandidate.assignEvals]', error);
    res.status(500).json({ error: 'Failed to assign evaluators' });
  }
};

// ── POST /api/external-candidates/:id/promote ────────────────────────────
export const promote = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { notes } = req.body;
    const candidate = await promoteToProvisional(req.params.id as string, notes);

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: 'EXTERNAL_CANDIDATE_PROMOTED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      metadataJson: { notes },
      source: 'ADMIN',
    });

    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.promote]', error);
    res.status(500).json({ error: 'Failed to promote candidate' });
  }
};

// ── POST /api/external-candidates/:id/start-test ─────────────────────────
export const beginTest = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { testDesign } = req.body;
    if (!testDesign) return res.status(400).json({ error: 'testDesign is required' });

    const candidate = await startPracticalTest(req.params.id as string, testDesign);

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: 'EXTERNAL_CANDIDATE_TEST_STARTED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      source: 'ADMIN',
    });

    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.beginTest]', error);
    res.status(500).json({ error: 'Failed to start test' });
  }
};

// ── POST /api/external-candidates/:id/submit-test ────────────────────────
export const submitTest = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { submission } = req.body;
    if (!submission || typeof submission !== 'string' || submission.trim().length === 0) {
      return res.status(400).json({ error: 'submission (non-empty string) is required' });
    }

    const candidate = await submitPracticalTest(req.params.id as string, submission.trim());

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: 'EXTERNAL_CANDIDATE_TEST_SUBMITTED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      source: 'USER',
    });

    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.submitTest]', error);
    const status = error.message?.includes('already submitted') ? 409
      : error.message?.includes('not in practical test') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to submit test' });
  }
};

// ── POST /api/external-candidates/:id/complete-test ──────────────────────
export const finishTest = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { passed, testResult } = req.body;
    if (typeof passed !== 'boolean') return res.status(400).json({ error: 'passed (boolean) is required' });

    const candidate = await completePracticalTest(req.params.id as string, passed, testResult);

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: passed ? 'EXTERNAL_CANDIDATE_VALIDATED' : 'EXTERNAL_CANDIDATE_TEST_FAILED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      metadataJson: { passed, testResult, auditLevel: candidate.auditLevel },
      severity: passed ? 'INFO' : 'WARNING',
      source: 'ADMIN',
    });

    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.finishTest]', error);
    res.status(500).json({ error: 'Failed to complete test' });
  }
};

// ── POST /api/external-candidates/:id/reject ─────────────────────────────
export const reject = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { reason } = req.body;
    const candidate = await rejectCandidate(req.params.id as string, reason || 'No reason provided');

    void logEvent({
      ...ctx,
      treeId: candidate.treeId,
      action: 'EXTERNAL_CANDIDATE_REJECTED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      metadataJson: { reason },
      severity: 'WARNING',
      source: 'ADMIN',
    });

    res.json(candidate);
  } catch (error: any) {
    console.error('[externalCandidate.reject]', error);
    res.status(500).json({ error: 'Failed to reject candidate' });
  }
};

// ── Evaluator-facing endpoints ──────────────────────────────────────────────

// GET /api/external-candidates/:id/evaluation — anonymized view for evaluators
export const getEvaluation = async (req: Request, res: Response) => {
  try {
    const candidate = await getCandidate(req.params.id as string);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    // Verify user is an assigned evaluator
    const evaluatorIds: string[] = JSON.parse((candidate as any).evaluatorIds || '[]');
    if (!evaluatorIds.includes(req.user!.id)) {
      return res.status(403).json({ error: 'You are not assigned as an evaluator' });
    }

    // Return anonymized + stats
    const { anonymizeCandidate } = await import('../services/externalCandidateService');
    const anon = anonymizeCandidate(candidate);
    const stats = getEvaluationStats(candidate);

    res.json({ ...anon, ...stats });
  } catch (error: any) {
    console.error('[externalCandidate.getEvaluation]', error);
    res.status(500).json({ error: 'Failed to get evaluation' });
  }
};

// GET /api/evaluations/mine — list my assigned evaluations (anonymized)
export const listMyEvaluations = async (req: Request, res: Response) => {
  try {
    const candidates = await getMyEvaluations(req.user!.id);
    res.json(candidates);
  } catch (error: any) {
    console.error('[externalCandidate.listMyEvaluations]', error);
    res.status(500).json({ error: 'Failed to list evaluations' });
  }
};

// POST /api/external-candidates/:id/evaluate — submit evaluation vote
export const evaluate = async (req: Request, res: Response) => {
  const ctx = getRequestContext(req);
  try {
    const { passed, notes } = req.body;
    if (typeof passed !== 'boolean') return res.status(400).json({ error: 'passed (boolean) is required' });

    const candidate = await submitEvaluation(req.params.id as string, req.user!.id, passed, notes);

    void logEvent({
      ...ctx,
      treeId: (candidate as any).treeId,
      action: 'EXTERNAL_CANDIDATE_EVALUATED',
      entityType: 'ExternalCandidate',
      entityId: candidate.id,
      metadataJson: { evaluatorId: req.user!.id, passed, notes },
      source: 'USER',
    });

    // Auto-resolve consensus if all evaluators have now voted
    const resolved = await resolveConsensusIfAllVoted(req.params.id as string);
    const stats = resolved ? getEvaluationStats(resolved) : getEvaluationStats(candidate);

    if (resolved) {
      void logEvent({
        ...ctx,
        treeId: (resolved as any).treeId,
        action: 'EXTERNAL_CANDIDATE_CONSENSUS_RESOLVED',
        entityType: 'ExternalCandidate',
        entityId: resolved.id,
        metadataJson: {
          consensus: resolved.testConsensus,
          passedVotes: stats.passed,
          totalVotes: stats.total,
          threshold: '60%',
        },
        severity: resolved.testConsensus === 'passed' ? 'INFO' : 'WARNING',
        source: 'AUTOMATION',
      });
    }

    res.json({ ...(resolved || candidate), ...stats });
  } catch (error: any) {
    console.error('[externalCandidate.evaluate]', error);
    const status = error.message?.includes('already submitted') ? 409
      : error.message?.includes('not assigned') ? 403 : 500;
    res.status(status).json({ error: error.message || 'Failed to submit evaluation' });
  }
};
