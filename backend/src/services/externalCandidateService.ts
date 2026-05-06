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
  matchType: 'exact' | 'similar' | 'adjacent' | 'fallback';
  skillTag: string;
  level: number;
}

// ── Evaluator Matching ──────────────────────────────────────────────────────

/**
 * Find evaluators for a candidate's skills.
 * Priority: exact match → similar (partial) → adjacent (same branch) → fallback (tree admins)
 */
export async function matchEvaluators(
  treeId: string,
  candidateSkills: string[],
  excludeUserIds: string[] = [],
): Promise<{ evaluators: EvaluatorMatch[]; mode: string }> {
  const normalizedSkills = candidateSkills.map(s => s.toLowerCase().trim());

  // 1. Exact match: TreeMembers with matching skills in this tree
  const exactMatches = await (prisma as any).treeMember.findMany({
    where: {
      treeId,
      status: 'VERIFIED',
      userId: { notIn: excludeUserIds },
    },
    select: { userId: true, level: true, skills: true, user: { select: { username: true } } },
    orderBy: { level: 'desc' },
  });

  const evaluators: EvaluatorMatch[] = [];

  // Filter to those with matching skills
  for (const member of exactMatches) {
    const memberSkills: string[] = JSON.parse(member.skills || '[]').map((s: string) => s.toLowerCase().trim());
    for (const skill of normalizedSkills) {
      if (memberSkills.includes(skill) && !evaluators.find(e => e.userId === member.userId)) {
        evaluators.push({
          userId: member.userId,
          username: member.user?.username || member.userId,
          matchType: 'exact',
          skillTag: skill,
          level: member.level,
        });
        if (evaluators.length >= 5) break;
      }
    }
    if (evaluators.length >= 5) break;
  }

  if (evaluators.length >= 3) {
    return { evaluators: evaluators.slice(0, 5), mode: 'exact' };
  }

  // 2. Similar match: partial skill overlap
  const usedIds = new Set([...excludeUserIds, ...evaluators.map(e => e.userId)]);
  for (const member of exactMatches) {
    if (usedIds.has(member.userId)) continue;
    const memberSkills: string[] = JSON.parse(member.skills || '[]').map((s: string) => s.toLowerCase().trim());
    for (const skill of normalizedSkills) {
      const hasSimilar = memberSkills.some(ms => ms.includes(skill.substring(0, 3)) || skill.includes(ms.substring(0, 3)));
      if (hasSimilar) {
        evaluators.push({
          userId: member.userId,
          username: member.user?.username || member.userId,
          matchType: 'similar',
          skillTag: skill,
          level: member.level,
        });
        usedIds.add(member.userId);
        break;
      }
    }
    if (evaluators.length >= 5) break;
  }

  if (evaluators.length >= 3) {
    return { evaluators: evaluators.slice(0, 5), mode: 'similar' };
  }

  // 3. Adjacent: any verified member in this tree (same community context)
  const adjacentMembers = await (prisma as any).treeMember.findMany({
    where: {
      treeId,
      status: 'VERIFIED',
      userId: { notIn: [...usedIds] },
    },
    select: { userId: true, level: true, user: { select: { username: true } } },
    orderBy: { level: 'desc' },
    take: 5,
  });

  for (const member of adjacentMembers) {
    evaluators.push({
      userId: member.userId,
      username: member.user?.username || member.userId,
      matchType: 'adjacent',
      skillTag: candidateSkills[0] || 'general',
      level: member.level,
    });
  }

  if (evaluators.length >= 2) {
    return { evaluators: evaluators.slice(0, 5), mode: 'adjacent' };
  }

  // 4. Fallback: tree admins (always in the pool)
  return {
    evaluators: evaluators.slice(0, 5),
    mode: 'fallback',
  };
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
