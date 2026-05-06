import { EventLog } from '@prisma/client';

const prisma = () => import('../index').then(m => (m as any).prisma);

// ── helpers ──────────────────────────────────────────────────────────────────

function parseSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

function setSkills(arr: string[]): string {
  return JSON.stringify([...new Set(arr)]);
}

function normalizeExpertiseTag(tag: string): string {
  let t = tag.trim();
  if (!t.startsWith('@')) t = '@' + t;
  return t;
}

async function logEvent(d: {
  treeId: string; actorId: string; action: string;
  entityType: string; entityId: string; metadataJson?: any;
  severity?: string;
}) {
  const p = await prisma();
  await (p as any).eventLog.create({
    data: {
      treeId: d.treeId, actorId: d.actorId, action: d.action,
      entityType: d.entityType, entityId: d.entityId,
      metadataJson: d.metadataJson ?? {},
      severity: d.severity ?? 'INFO', source: 'USER',
    },
  });
}

// ── public API ───────────────────────────────────────────────────────────────

export interface CreateEndorsementInput {
  treeId: string;
  endorsedMemberId: string;   // TreeMember.id
  expertise: string;
  requiredTasks?: number;
  satisfactionThreshold?: number;
}

export async function createEndorsement(actorUserId: string, input: CreateEndorsementInput) {
  const p = await prisma();
  const expertise = normalizeExpertiseTag(input.expertise);

  // resolve endorser
  const endorser = await (p as any).treeMember.findFirst({
    where: { userId: actorUserId, treeId: input.treeId },
  });
  if (!endorser) throw new Error('Endorser is not a member of this tree');

  // validate ban
  if (endorser.avalBanHasta && new Date(endorser.avalBanHasta) > new Date()) {
    throw new Error(`Endorser is banned from endorsing until ${endorser.avalBanHasta}`);
  }

  // validate endorsed
  const endorsed = await (p as any).treeMember.findUnique({
    where: { id: input.endorsedMemberId },
  });
  if (!endorsed || endorsed.treeId !== input.treeId) {
    throw new Error('Endorsed member not found in this tree');
  }
  if (endorsed.id === endorser.id) throw new Error('Cannot endorse yourself');

  // validate expertise on both
  const endorserSkills = parseSkills(endorser.skills);
  const ciSkills = (arr: string[]) => arr.map(s => s.toLowerCase());
  if (!ciSkills(endorserSkills).includes(expertise.toLowerCase())) {
    throw new Error(`Endorser does not have expertise ${expertise}`);
  }
  const endorsedSkills = parseSkills(endorsed.skills);
  if (!ciSkills(endorsedSkills).includes(expertise.toLowerCase())) {
    throw new Error(`Endorsed member does not have expertise ${expertise}`);
  }

  // duplicate check
  const existing = await (p as any).expertEndorsement.findFirst({
    where: {
      endorserId: endorser.id, endorsedId: endorsed.id,
      treeId: input.treeId, expertise,
      status: { in: ['ACTIVE', 'SUCCESS'] },
    },
  });
  if (existing) throw new Error('An active or successful endorsement already exists for this pair and expertise');

  const endorsement = await (p as any).expertEndorsement.create({
    data: {
      treeId: input.treeId,
      endorserId: endorser.id,
      endorsedId: endorsed.id,
      expertise,
      requiredTasks: input.requiredTasks ?? 3,
      satisfactionThreshold: input.satisfactionThreshold ?? 80,
    },
  });

  await logEvent({
    treeId: input.treeId, actorId: actorUserId,
    action: 'EXPERT_ENDORSEMENT_CREATED',
    entityType: 'ExpertEndorsement', entityId: endorsement.id,
    metadataJson: { expertise, endorserId: endorser.id, endorsedId: endorsed.id },
  });

  return endorsement;
}

export interface ResolveEndorsementInput {
  endorsementId: string;
  status: 'SUCCESS' | 'FAILED_PERFORMANCE' | 'FAILED_FRAUD';
  evidenceTaskIds?: string[];
  avgSatisfaction?: number;
  completedTasks?: number;
  resolutionNote?: string;
}

export async function resolveEndorsement(actorUserId: string, input: ResolveEndorsementInput) {
  const p = await prisma();
  const endorsement = await (p as any).expertEndorsement.findUnique({
    where: { id: input.endorsementId },
    include: { endorser: true, endorsed: true },
  });
  if (!endorsement) throw new Error('Endorsement not found');
  if (endorsement.status !== 'ACTIVE') throw new Error('Endorsement is not active');

  // Only tree admins can resolve (route-level guard + service-level check)
  const resolverMember = await (p as any).treeMember.findFirst({
    where: { userId: actorUserId, treeId: endorsement.treeId, role: 'ADMIN' },
  });
  if (!resolverMember) throw new Error('Only tree admins can resolve endorsements');

  const evidenceTaskIds = JSON.stringify(input.evidenceTaskIds ?? []);
  const completedTasks = input.completedTasks ?? (input.evidenceTaskIds?.length ?? 0);
  const avgSatisfaction = input.avgSatisfaction ?? null;

  const updateData: any = {
    status: input.status,
    evidenceTaskIds,
    completedTasks,
    avgSatisfaction,
    resolvedAt: new Date(),
    resolvedById: actorUserId,
    resolutionNote: input.resolutionNote ?? null,
  };

  if (input.status === 'SUCCESS') {
    if (completedTasks < endorsement.requiredTasks) {
      throw new Error(`Insufficient completed tasks: ${completedTasks}/${endorsement.requiredTasks}`);
    }
    if (avgSatisfaction !== null && avgSatisfaction < endorsement.satisfactionThreshold) {
      throw new Error(`Satisfaction ${avgSatisfaction}% below threshold ${endorsement.satisfactionThreshold}%`);
    }
    updateData.boostApplied = true;
  }

  // FAIL cases
  if (input.status === 'FAILED_PERFORMANCE' || input.status === 'FAILED_FRAUD') {
    updateData.boostApplied = false;

    // Remove expertise from endorsed
    const endorsedSkills = parseSkills(endorsement.endorsed.skills);
    const expertise = endorsement.expertise;
    const newSkills = endorsedSkills.filter(s => s.toLowerCase() !== expertise.toLowerCase());
    await (p as any).treeMember.update({
      where: { id: endorsement.endorsedId },
      data: { skills: setSkills(newSkills) },
    });

    // Ban endorser for 3 months
    const banUntil = new Date();
    banUntil.setMonth(banUntil.getMonth() + 3);
    await (p as any).treeMember.update({
      where: { id: endorsement.endorserId },
      data: { avalBanHasta: banUntil },
    });

    await logEvent({
      treeId: endorsement.treeId, actorId: actorUserId,
      action: input.status === 'FAILED_FRAUD' ? 'EXPERT_ENDORSEMENT_FAILED_FRAUD' : 'EXPERT_ENDORSEMENT_FAILED_PERFORMANCE',
      entityType: 'ExpertEndorsement', entityId: endorsement.id,
      metadataJson: {
        expertise,
        endorserBannedUntil: banUntil.toISOString(),
        endorsedSkillRemoved: expertise,
      },
      severity: 'WARNING',
    });
  } else {
    await logEvent({
      treeId: endorsement.treeId, actorId: actorUserId,
      action: 'EXPERT_ENDORSEMENT_RESOLVED_SUCCESS',
      entityType: 'ExpertEndorsement', entityId: endorsement.id,
      metadataJson: { expertise: endorsement.expertise, boostApplied: true },
    });
  }

  return (p as any).expertEndorsement.update({
    where: { id: input.endorsementId },
    data: updateData,
  });
}

export interface EndorsementBoostStatus {
  activeCount: number;
  boostPct: number;
  isBanned: boolean;
  banUntil: string | null;
}

export async function getEndorsementBoostStatus(userId: string, treeId: string): Promise<EndorsementBoostStatus> {
  const p = await prisma();
  const member = await (p as any).treeMember.findFirst({
    where: { userId, treeId },
  });
  if (!member) throw new Error('User is not a member of this tree');

  const activeCount = await (p as any).expertEndorsement.count({
    where: {
      endorserId: member.id,
      treeId,
      status: { in: ['ACTIVE', 'SUCCESS'] },
      boostApplied: true,
    },
  });

  const isBanned = member.avalBanHasta ? new Date(member.avalBanHasta) > new Date() : false;

  return {
    activeCount,
    boostPct: Math.min(activeCount * 5, 15),
    isBanned,
    banUntil: member.avalBanHasta?.toISOString?.() ?? null,
  };
}

export async function getEndorsementsForTree(treeId: string, memberId?: string, requestingUserId?: string) {
  const p = await prisma();
  // Requester must be a member of this tree
  if (requestingUserId) {
    const reqMember = await (p as any).treeMember.findFirst({ where: { userId: requestingUserId, treeId } });
    if (!reqMember) throw new Error('You are not a member of this tree');
  }
  const where: any = { treeId };
  if (memberId) {
    where.OR = [{ endorserId: memberId }, { endorsedId: memberId }];
  }
  return (p as any).expertEndorsement.findMany({
    where,
    include: {
      endorser: { include: { user: { select: { id: true, username: true } } } },
      endorsed: { include: { user: { select: { id: true, username: true } } } },
      resolvedBy: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
