import { prisma } from '../index';
import { ExternalCandidateStatus } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CandidateInput {
  name: string;
  email?: string;
  skills: string[];
  experience?: string;
  portfolioUrl?: string;
}

export interface EvaluatorMatch {
  userId: string;
  username: string;
  matchType: 'exact' | 'similar' | 'cross-tree' | 'fallback';
  skillTag: string;
  level: number;
  treeId: string;
  treeName: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle (in-place). Returns the same array. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Evaluator Matching ──────────────────────────────────────────────────────

/**
 * Find evaluators across ALL trees for a candidate's skills.
 * Pool: VERIFIED members from every tree.
 * Priority: exact match → similar (prefix 3) → cross-tree (any verified) → fallback (admins of candidate's tree)
 * Selection is RANDOM within each tier. Prefers evaluators from different trees.
 */
export async function matchEvaluators(
  candidateTreeId: string,
  candidateSkills: string[],
  excludeUserIds: string[] = [],
): Promise<{ evaluators: EvaluatorMatch[]; mode: string; treeDiversity: number }> {
  const normalizedSkills = candidateSkills.map(s => s.toLowerCase().trim());

  // Fetch ALL verified members across ALL trees (with tree name)
  const allMembers = await (prisma as any).treeMember.findMany({
    where: {
      status: 'VERIFIED',
      userId: { notIn: excludeUserIds },
    },
    select: {
      userId: true,
      level: true,
      skills: true,
      treeId: true,
      user: { select: { username: true } },
      tree: { select: { name: true } },
    },
  });

  // Build lookup: userId → member info
  const memberMap = new Map<string, typeof allMembers[0]>();
  for (const m of allMembers) memberMap.set(m.userId, m);

  const pickedIds = new Set<string>(excludeUserIds);
  const evaluators: EvaluatorMatch[] = [];

  function toMatch(member: typeof allMembers[0], matchType: EvaluatorMatch['matchType'], skillTag: string): EvaluatorMatch {
    return {
      userId: member.userId,
      username: member.user?.username || member.userId,
      matchType,
      skillTag,
      level: member.level,
      treeId: member.treeId,
      treeName: member.tree?.name || member.treeId,
    };
  }

  // ── Tier 1: Exact match ─────────────────────────────────────────────────
  const exactPool: { member: typeof allMembers[0]; skill: string }[] = [];
  for (const member of allMembers) {
    if (pickedIds.has(member.userId)) continue;
    const memberSkills: string[] = JSON.parse(member.skills || '[]').map((s: string) => s.toLowerCase().trim());
    for (const skill of normalizedSkills) {
      if (memberSkills.includes(skill)) {
        exactPool.push({ member, skill });
        break; // one match is enough per member
      }
    }
  }

  // Shuffle + pick, preferring different trees
  pickDiverse(exactPool, 'exact', 5, evaluators, pickedIds, toMatch);
  if (evaluators.length >= 5) {
    return { evaluators, mode: 'exact', treeDiversity: countUniqueTrees(evaluators) };
  }

  // ── Tier 2: Similar match (prefix 3) ────────────────────────────────────
  const similarPool: { member: typeof allMembers[0]; skill: string }[] = [];
  for (const member of allMembers) {
    if (pickedIds.has(member.userId)) continue;
    const memberSkills: string[] = JSON.parse(member.skills || '[]').map((s: string) => s.toLowerCase().trim());
    for (const skill of normalizedSkills) {
      const prefix = skill.substring(0, 3);
      const hasSimilar = memberSkills.some(ms => ms.startsWith(prefix) || skill.startsWith(ms.substring(0, 3)));
      if (hasSimilar) {
        similarPool.push({ member, skill });
        break;
      }
    }
  }

  pickDiverse(similarPool, 'similar', 5 - evaluators.length, evaluators, pickedIds, toMatch);
  const modeSoFar = evaluators.length >= 3 ? 'similar' : undefined;

  if (evaluators.length >= 5) {
    return { evaluators: evaluators.slice(0, 5), mode: modeSoFar || 'similar', treeDiversity: countUniqueTrees(evaluators) };
  }

  // ── Tier 3: Cross-tree (any verified member from any tree, random) ──────
  const crossTreePool = allMembers
    .filter(m => !pickedIds.has(m.userId))
    .map(m => ({ member: m, skill: candidateSkills[0] || 'general' }));

  pickDiverse(crossTreePool, 'cross-tree', 5 - evaluators.length, evaluators, pickedIds, toMatch);

  if (evaluators.length >= 3) {
    const finalMode = evaluators.some(e => e.matchType === 'exact' || e.matchType === 'similar')
      ? modeSoFar || 'cross-tree'
      : 'cross-tree';
    return { evaluators: evaluators.slice(0, 5), mode: finalMode, treeDiversity: countUniqueTrees(evaluators) };
  }

  // ── Tier 4: Fallback — admins of candidate's tree ───────────────────────
  const treeAdmins = await (prisma as any).treeMember.findMany({
    where: {
      treeId: candidateTreeId,
      role: { in: ['ADMIN', 'FOUNDER'] },
      userId: { notIn: [...pickedIds] },
    },
    select: {
      userId: true,
      level: true,
      skills: true,
      treeId: true,
      user: { select: { username: true } },
      tree: { select: { name: true } },
    },
  });

  for (const admin of treeAdmins) {
    evaluators.push(toMatch(admin, 'fallback', candidateSkills[0] || 'general'));
    if (evaluators.length >= 3) break;
  }

  return {
    evaluators: evaluators.slice(0, 5),
    mode: 'fallback',
    treeDiversity: countUniqueTrees(evaluators),
  };
}

// ── Diversity-aware picking ─────────────────────────────────────────────────

/**
 * Pick up to `max` evaluators from the shuffled pool.
 * Prefers selecting from trees that haven't been used yet, to maximize diversity.
 */
function pickDiverse(
  pool: { member: any; skill: string }[],
  matchType: EvaluatorMatch['matchType'],
  max: number,
  evaluators: EvaluatorMatch[],
  pickedIds: Set<string>,
  toMatch: (member: any, mt: EvaluatorMatch['matchType'], skill: string) => EvaluatorMatch,
) {
  if (max <= 0 || pool.length === 0) return;

  // Shuffle the pool first (randomness)
  shuffle(pool);

  // Separate by whether the tree is already represented
  const usedTrees = new Set(evaluators.map(e => e.treeId));
  const fromNewTrees = pool.filter(p => !usedTrees.has(p.member.treeId));
  const fromUsedTrees = pool.filter(p => usedTrees.has(p.member.treeId));

  // Pick from new trees first (diversity), then fill from used trees
  const ordered = [...fromNewTrees, ...fromUsedTrees];

  for (const entry of ordered) {
    if (evaluators.length >= 5) break;
    if (pickedIds.has(entry.member.userId)) continue;

    evaluators.push(toMatch(entry.member, matchType, entry.skill));
    pickedIds.add(entry.member.userId);
  }
}

function countUniqueTrees(evaluators: EvaluatorMatch[]): number {
  return new Set(evaluators.map(e => e.treeId)).size;
}

// ── Candidate CRUD ──────────────────────────────────────────────────────────

export async function createCandidate(treeId: string, input: CandidateInput, assignedById?: string) {
  return (prisma as any).externalCandidate.create({
    data: {
      treeId,
      name: input.name,
      email: input.email,
      skills: JSON.stringify(input.skills),
      experience: input.experience,
      portfolioUrl: input.portfolioUrl,
      status: 'APPLIED',
      assignedById: assignedById || null,
    },
  });
}

export async function getCandidate(candidateId: string) {
  return (prisma as any).externalCandidate.findUnique({
    where: { id: candidateId },
    include: {
      tree: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, username: true } },
    },
  });
}

export async function listCandidates(treeId: string, status?: ExternalCandidateStatus) {
  return (prisma as any).externalCandidate.findMany({
    where: {
      treeId,
      ...(status ? { status } : {}),
    },
    include: {
      assignedBy: { select: { id: true, username: true } },
    },
    orderBy: { appliedAt: 'desc' },
  });
}

// ── State transitions ───────────────────────────────────────────────────────

export async function startReview(candidateId: string) {
  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'UNDER_REVIEW',
      reviewedAt: new Date(),
    },
  });
}

export async function assignEvaluators(
  candidateId: string,
  evaluatorIds: string[],
  mode: string,
) {
  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'EVALUATORS_ASSIGNED',
      evaluatorIds: JSON.stringify(evaluatorIds),
      evaluatorMode: mode,
    },
  });
}

export async function promoteToProvisional(candidateId: string, notes?: string) {
  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'PROVISIONAL',
      provisionalAt: new Date(),
      reviewerNotes: notes || undefined,
    },
  });
}

export async function startPracticalTest(candidateId: string, testDesign: string) {
  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'IN_PRACTICAL_TEST',
      testDesign,
    },
  });
}

export async function completePracticalTest(
  candidateId: string,
  passed: boolean,
  testResult?: string,
) {
  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      testPassed: passed,
      testResult: testResult || null,
      ...(passed
        ? { status: 'VALIDATED', validatedAt: new Date() }
        : { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: testResult || 'Failed practical test' }),
    },
  });
}

export async function rejectCandidate(candidateId: string, reason: string) {
  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });
}

// ── Anonymized evaluation access ─────────────────────────────────────────────

/** Generate anonymous reference: C-XXXX (first 4 chars of UUID) */
export function anonymizeCandidate(candidate: any) {
  const anonRef = `C-${candidate.id.substring(0, 4).toUpperCase()}`;
  return {
    id: candidate.id,
    anonRef,
    skills: JSON.parse(candidate.skills || '[]'),
    experience: candidate.experience || null,
    status: candidate.status,
    evaluatorMode: candidate.evaluatorMode || null,
    auditLevel: candidate.auditLevel,
    testDesign: candidate.testDesign || null,
    testPassed: candidate.testPassed,
    appliedAt: candidate.appliedAt,
    treeName: candidate.tree?.name || 'Unknown Tree',
    // No PII: name, email, portfolioUrl, assignedBy all stripped
  };
}

/** List candidates where the current user is an assigned evaluator */
export async function getMyEvaluations(userId: string) {
  const all = await (prisma as any).externalCandidate.findMany({
    where: {
      status: { in: ['EVALUATORS_ASSIGNED', 'PROVISIONAL', 'IN_PRACTICAL_TEST'] },
    },
    include: {
      tree: { select: { name: true } },
    },
    orderBy: { appliedAt: 'desc' },
  });

  // Filter: only those where userId is in evaluatorIds
  return all
    .filter((c: any) => {
      const ids: string[] = JSON.parse(c.evaluatorIds || '[]');
      return ids.includes(userId);
    })
    .map(anonymizeCandidate);
}

/** Evaluator submits their vote */
export async function submitEvaluation(
  candidateId: string,
  evaluatorId: string,
  passed: boolean,
  notes?: string,
) {
  // Verify evaluator is assigned
  const candidate = await (prisma as any).externalCandidate.findUnique({
    where: { id: candidateId },
  });
  if (!candidate) throw new Error('Candidate not found');

  const evaluatorIds: string[] = JSON.parse(candidate.evaluatorIds || '[]');
  if (!evaluatorIds.includes(evaluatorId)) {
    throw new Error('You are not assigned as an evaluator for this candidate');
  }

  // Check if already voted
  const votes: any[] = JSON.parse(candidate.evaluatorVotes || '[]');
  if (votes.find((v: any) => v.evaluatorId === evaluatorId)) {
    throw new Error('You have already submitted your evaluation');
  }

  votes.push({
    evaluatorId,
    passed,
    notes: notes || null,
    submittedAt: new Date().toISOString(),
  });

  return (prisma as any).externalCandidate.update({
    where: { id: candidateId },
    data: {
      evaluatorVotes: JSON.stringify(votes),
    },
  });
}

/** Get evaluation stats for a candidate */
export function getEvaluationStats(candidate: any) {
  const votes: any[] = JSON.parse(candidate.evaluatorVotes || '[]');
  const evaluatorIds: string[] = JSON.parse(candidate.evaluatorIds || '[]');
  const total = evaluatorIds.length;
  const submitted = votes.length;
  const passed = votes.filter((v: any) => v.passed).length;
  const failed = votes.filter((v: any) => !v.passed).length;
  const pending = total - submitted;
  return { total, submitted, passed, failed, pending, votes };
}
