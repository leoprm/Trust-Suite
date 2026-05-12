import { prisma } from '../index';
import PDFDocument from 'pdfkit';

export type TrustExportType = 'PROFILE' | 'TREE';
export type TrustExport = {
  exportType: TrustExportType;
  schemaVersion: 'trust-export-v0.1';
  generatedAt: string;
  treeId?: string;
  generatedBy: {
    userId: string;
    role?: string;
  };
  data: unknown;
  warnings: string[];
  omitted: string[];
};

const SENSITIVE_KEY_PATTERN = /password|passwordHash|token|refreshToken|jwt|secret|apiKey|storagePath|absolutePath|privateKey|env|authorization|cookie/i;
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 500;
const MAX_STRING_LENGTH = 4000;

function parseJsonField(value: unknown, fallback: unknown = null) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

export function removeSensitiveFields(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return '[REDACTED_BINARY]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => removeSensitiveFields(item, depth + 1));
  }

  if (typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : removeSensitiveFields(nested, depth + 1);
    }
    return clean;
  }

  return String(value);
}

export function sanitizeUserForExport(user: any, options: { includeEmail: boolean }) {
  return removeSensitiveFields({
    id: user.id,
    username: user.username,
    email: options.includeEmail ? user.email : undefined,
    role: user.role,
    isGuest: user.is_guest,
    isOnboarded: user.is_onboarded,
    profilePic: user.profilePic,
    publicProfileEnabled: user.publicProfileEnabled,
    publicShowLevels: user.publicShowLevels,
    publicShowTreeSize: user.publicShowTreeSize,
    publicShowTaskHistory: user.publicShowTaskHistory,
    visibleForRecruitment: user.visibleForRecruitment,
    seekingWork: user.seekingWork,
    sharingCode: options.includeEmail ? user.sharingCode : undefined,
    createdAt: normalizeDate(user.createdAt),
    updatedAt: normalizeDate(user.updatedAt),
  });
}

export function sanitizeEvidenceForExport(file: any, options: { includeUploaderId?: boolean } = {}) {
  return removeSensitiveFields({
    evidenceId: file.id,
    taskId: file.taskId,
    auditId: file.auditId,
    treeId: file.treeId,
    uploaderId: options.includeUploaderId ? file.uploaderId : undefined,
    originalName: file.originalName,
    mimeType: file.mimeType,
    extension: file.extension,
    sizeBytes: file.sizeBytes,
    visibility: file.visibility,
    status: file.status,
    checksumSha256: file.checksumSha256,
    createdAt: normalizeDate(file.createdAt),
    updatedAt: normalizeDate(file.updatedAt),
  });
}

export function sanitizeEventLogForExport(event: any) {
  const metadata = event.metadataJson && typeof event.metadataJson === 'object'
    ? event.metadataJson as Record<string, unknown>
    : {};

  return removeSensitiveFields({
    id: event.id,
    treeId: event.treeId,
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    severity: event.severity,
    source: event.source,
    metadataSummary: {
      route: metadata.route,
      method: metadata.method,
      reason: metadata.reason,
      result: metadata.result,
      status: metadata.status,
      exportType: metadata.exportType,
      schemaVersion: metadata.schemaVersion,
      counts: metadata.counts,
      requestedEntityType: metadata.requestedEntityType,
    },
    createdAt: normalizeDate(event.createdAt),
  });
}

export function sanitizeFiatTransactionForExport(transaction: any) {
  return removeSensitiveFields({
    id: transaction.id,
    treeId: transaction.treeId,
    branchId: transaction.branchId,
    templateId: transaction.templateId,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    category: transaction.category,
    description: transaction.description,
    verificationStatus: transaction.verificationStatus,
    receiptEvidenceId: transaction.receiptEvidenceId,
    date: normalizeDate(transaction.date),
    isAutomatic: transaction.isAutomatic,
  });
}

export async function canExportTree(treeId: string, actorId: string, actorRole?: string | null) {
  if (actorRole === 'ADMINISTRATOR') return true;

  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      creatorId: true,
      members: {
        where: { userId: actorId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!tree) return false;
  return tree.creatorId === actorId || tree.members.some((member: any) => member.role === 'ADMIN');
}

function buildBaseExport(input: {
  exportType: TrustExportType;
  generatedBy: { userId: string; role?: string };
  data: unknown;
  warnings?: string[];
  omitted?: string[];
  treeId?: string;
}): TrustExport {
  return {
    exportType: input.exportType,
    schemaVersion: 'trust-export-v0.1',
    generatedAt: new Date().toISOString(),
    ...(input.treeId ? { treeId: input.treeId } : {}),
    generatedBy: input.generatedBy,
    data: removeSensitiveFields(input.data),
    warnings: input.warnings ?? [],
    omitted: input.omitted ?? [],
  };
}

export async function exportUserProfile(userId: string, role?: string): Promise<TrustExport> {
  const [
    user,
    memberships,
    privacySettings,
    skillXp,
    completedTasks,
    auditsMade,
    auditsReceived,
    evidenceFiles,
    eventLogs,
  ] = await Promise.all([
    (prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        is_guest: true,
        is_onboarded: true,
        sharingCode: true,
        profilePic: true,
        publicProfileEnabled: true,
        publicShowLevels: true,
        publicShowTreeSize: true,
        publicShowTaskHistory: true,
        visibleForRecruitment: true,
        seekingWork: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    (prisma as any).treeMember.findMany({
      where: { userId },
      select: {
        treeId: true,
        role: true,
        status: true,
        xp: true,
        level: true,
        skills: true,
        bayasBalance: true,
        availableNeedPoints: true,
        goldenTickets: true,
        joinedAt: true,
        tree: { select: { id: true, name: true, icono: true, visibility: true, createdAt: true } },
      },
      orderBy: { joinedAt: 'desc' },
    }),
    (prisma as any).privacySettings.findUnique({
      where: { userId },
      select: {
        traceProfileVisibility: true,
        taskHistoryVisibility: true,
        evidenceVisibility: true,
        showInTalentSearch: true,
        allowAggregatedMetrics: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    (prisma as any).userSkillXP.findMany({
      where: { userId },
      select: {
        skillTag: true,
        treeId: true,
        accumulatedPoints: true,
        completedTasks: true,
        cachedPercentile: true,
        updatedAt: true,
      },
      orderBy: { accumulatedPoints: 'desc' },
    }),
    (prisma as any).task.findMany({
      where: { assignedTo: userId, status: 'COMPLETED' },
      select: {
        id: true,
        name: true,
        description: true,
        branchId: true,
        status: true,
        assignedTo: true,
        creatorId: true,
        phase: true,
        evidenceStatus: true,
        completionComment: true,
        completedAt: true,
        requiredHours: true,
        difficulty: true,
        auditada: true,
        createdAt: true,
        branch: { select: { id: true, name: true, treeId: true, tree: { select: { id: true, name: true } } } },
        evidenceFiles: {
          select: {
            id: true,
            uploaderId: true,
            treeId: true,
            taskId: true,
            auditId: true,
            originalName: true,
            mimeType: true,
            extension: true,
            sizeBytes: true,
            visibility: true,
            status: true,
            checksumSha256: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        difficultyVotes: { select: { id: true, userId: true, value: true, status: true, createdAt: true, updatedAt: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 500,
    }),
    (prisma as any).auditoria.findMany({
      where: { usuarioId: userId },
      select: { id: true, usuarioId: true, taskId: true, notaSugerida: true, fechaCreacion: true },
      orderBy: { fechaCreacion: 'desc' },
      take: 500,
    }),
    (prisma as any).auditoria.findMany({
      where: { task: { assignedTo: userId } },
      select: { id: true, usuarioId: true, taskId: true, notaSugerida: true, fechaCreacion: true },
      orderBy: { fechaCreacion: 'desc' },
      take: 500,
    }),
    (prisma as any).evidenceFile.findMany({
      where: { uploaderId: userId },
      select: {
        id: true,
        uploaderId: true,
        treeId: true,
        taskId: true,
        auditId: true,
        originalName: true,
        mimeType: true,
        extension: true,
        sizeBytes: true,
        visibility: true,
        status: true,
        checksumSha256: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    (prisma as any).eventLog.findMany({
      where: { actorId: userId },
      select: {
        id: true,
        treeId: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadataJson: true,
        severity: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  const data = {
    user: sanitizeUserForExport(user, { includeEmail: true }),
    trace: {
      publicProfileEnabled: user.publicProfileEnabled,
      publicShowLevels: user.publicShowLevels,
      publicShowTreeSize: user.publicShowTreeSize,
      publicShowTaskHistory: user.publicShowTaskHistory,
      visibleForRecruitment: user.visibleForRecruitment,
      seekingWork: user.seekingWork,
      profilePic: user.profilePic,
    },
    privacySettings,
    memberships: memberships.map((membership: any) => ({
      treeId: membership.treeId,
      treeName: membership.tree?.name,
      treeIcon: membership.tree?.icono,
      treeVisibility: membership.tree?.visibility,
      role: membership.role,
      status: membership.status,
      xp: membership.xp,
      level: membership.level,
      skills: parseJsonField(membership.skills, []),
      bayasBalance: membership.bayasBalance,
      availableNeedPoints: membership.availableNeedPoints,
      goldenTickets: parseJsonField(membership.goldenTickets, {}),
      joinedAt: normalizeDate(membership.joinedAt),
    })),
    skillXp: skillXp.map((skill: any) => ({ ...skill, updatedAt: normalizeDate(skill.updatedAt) })),
    completedTasks: completedTasks.map((task: any) => ({
      id: task.id,
      title: task.name,
      description: task.description,
      branchId: task.branchId,
      branchName: task.branch?.name,
      treeId: task.branch?.treeId,
      treeName: task.branch?.tree?.name,
      status: task.status,
      assignedTo: task.assignedTo,
      creatorId: task.creatorId,
      phase: task.phase,
      evidenceStatus: task.evidenceStatus,
      completionComment: task.completionComment,
      completedAt: normalizeDate(task.completedAt),
      requiredHours: task.requiredHours,
      difficultyDeclared: task.difficulty,
      difficultyValidated: task.difficultyVotes,
      auditada: task.auditada,
      createdAt: normalizeDate(task.createdAt),
      evidenceMetadata: task.evidenceFiles.map((file: any) => sanitizeEvidenceForExport(file, { includeUploaderId: true })),
    })),
    audits: {
      performed: auditsMade.map((audit: any) => ({ ...audit, role: 'auditor', fechaCreacion: normalizeDate(audit.fechaCreacion) })),
      received: auditsReceived.map((audit: any) => ({ ...audit, role: 'audited', fechaCreacion: normalizeDate(audit.fechaCreacion) })),
    },
    uploadedEvidenceMetadata: evidenceFiles.map((file: any) => sanitizeEvidenceForExport(file, { includeUploaderId: true })),
    recentEventLogs: eventLogs.map(sanitizeEventLogForExport),
  };

  return buildBaseExport({
    exportType: 'PROFILE',
    generatedBy: { userId, role },
    data,
    warnings: eventLogs.length >= 200 ? ['recentEventLogs limited to latest 200 records'] : [],
    omitted: ['rawEvidenceFiles', 'password', 'passwordHash', 'tokens', 'refreshTokens', 'jwt', 'storagePath', 'absolutePaths', 'environmentSecrets'],
  });
}

export async function exportTree(treeId: string, actorId: string, role?: string): Promise<TrustExport> {
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      id: true,
      name: true,
      icono: true,
      description: true,
      inviteCode: true,
      creatorId: true,
      createdAt: true,
      capacidades: true,
      country: true,
      city: true,
      sector: true,
      locationPrivacy: true,
      isLocationVerified: true,
      settings: true,
      visibility: true,
      admissionPolicy: true,
      allowHashtags: true,
      allowTraditionalBranches: true,
      hashtagCreationPolicy: true,
      modoCrisis: true,
      crisisSubjects: true,
      crisisExpiresAt: true,
      economyMode: true,
      presupuestoTotal: true,
      limiteSemanasEstabilidad: true,
      factorDesgaste: true,
      modoGobierno: true,
      creacionRamaDirecta: true,
      creacionRamaComunitaria: true,
    },
  });

  if (!tree) {
    throw new Error('Tree not found');
  }

  const [
    members,
    needs,
    ideas,
    branches,
    tasks,
    audits,
    evidenceFiles,
    fiatTransactions,
    bonusPools,
    eventLogs,
  ] = await Promise.all([
    (prisma as any).treeMember.findMany({
      where: { treeId },
      select: {
        userId: true,
        role: true,
        status: true,
        xp: true,
        level: true,
        skills: true,
        bayasBalance: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            profilePic: true,
            publicProfileEnabled: true,
            publicShowLevels: true,
            publicShowTreeSize: true,
            publicShowTaskHistory: true,
            visibleForRecruitment: true,
            seekingWork: true,
            privacySettings: {
              select: {
                traceProfileVisibility: true,
                taskHistoryVisibility: true,
                evidenceVisibility: true,
                showInTalentSearch: true,
                allowAggregatedMetrics: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    }),
    (prisma as any).need.findMany({
      where: { treeLinks: { some: { treeId } } },
      select: {
        id: true,
        creatorId: true,
        title: true,
        description: true,
        totalPointsAssigned: true,
        failedAttempts: true,
        createdAt: true,
        status: true,
        taskId: true,
        proposesHashtag: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    (prisma as any).idea.findMany({
      where: { need: { treeLinks: { some: { treeId } } } },
      select: {
        id: true,
        needId: true,
        creatorId: true,
        title: true,
        description: true,
        likesCount: true,
        createdAt: true,
        proposedPhasesJson: true,
        requiredPeople: true,
        requiredSkills: true,
        estimatedMaterials: true,
        estimatedFiatCost: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    (prisma as any).branch.findMany({
      where: { treeId },
      select: {
        id: true,
        ideaId: true,
        treeId: true,
        name: true,
        xpPool: true,
        isDesire: true,
        isHashtag: true,
        bayasFund: true,
        esVotable: true,
        valorSugerido: true,
        valorOficial: true,
        phase: true,
        activePhasesJson: true,
        currentPhaseIndex: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    (prisma as any).task.findMany({
      where: { branch: { treeId } },
      select: {
        id: true,
        branchId: true,
        name: true,
        description: true,
        status: true,
        assignedTo: true,
        creatorId: true,
        phase: true,
        evidenceStatus: true,
        completionComment: true,
        completedAt: true,
        requiredHours: true,
        difficulty: true,
        isAnonymous: true,
        requiresVoting: true,
        auditada: true,
        deadlineAt: true,
        createdAt: true,
        difficultyVotes: { select: { id: true, userId: true, value: true, status: true, createdAt: true, updatedAt: true } },
        evidenceFiles: {
          select: {
            id: true,
            uploaderId: true,
            treeId: true,
            taskId: true,
            auditId: true,
            originalName: true,
            mimeType: true,
            extension: true,
            sizeBytes: true,
            visibility: true,
            status: true,
            checksumSha256: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 1500,
    }),
    (prisma as any).auditoria.findMany({
      where: { task: { branch: { treeId } } },
      select: { id: true, usuarioId: true, taskId: true, notaSugerida: true, fechaCreacion: true },
      orderBy: { fechaCreacion: 'asc' },
      take: 1000,
    }),
    (prisma as any).evidenceFile.findMany({
      where: { treeId },
      select: {
        id: true,
        uploaderId: true,
        treeId: true,
        taskId: true,
        auditId: true,
        originalName: true,
        mimeType: true,
        extension: true,
        sizeBytes: true,
        visibility: true,
        status: true,
        checksumSha256: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
    (prisma as any).fiatTransaction.findMany({
      where: { treeId },
      select: {
        id: true,
        treeId: true,
        branchId: true,
        taskId: true,
        externalNeedId: true,
        createdById: true,
        templateId: true,
        amount: true,
        currency: true,
        type: true,
        category: true,
        description: true,
        verificationStatus: true,
        receiptEvidenceId: true,
        date: true,
        isAutomatic: true,
      },
      orderBy: { date: 'asc' },
      take: 1000,
    }),
    (prisma as any).bonusPool.findMany({
      where: { treeId },
      select: {
        id: true,
        treeId: true,
        hashtag: true,
        puntosImportanciaTotal: true,
        porcentajeActual: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { hashtag: 'asc' },
      take: 500,
    }),
    (prisma as any).eventLog.findMany({
      where: { treeId },
      select: {
        id: true,
        treeId: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadataJson: true,
        severity: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  ]);

  const data = {
    tree: {
      id: tree.id,
      name: tree.name,
      icono: tree.icono,
      description: tree.description,
      creatorId: tree.creatorId,
      createdAt: normalizeDate(tree.createdAt),
      capacidades: parseJsonField(tree.capacidades, []),
      country: tree.country,
      city: tree.city,
      sector: tree.sector,
      locationPrivacy: tree.locationPrivacy,
      isLocationVerified: tree.isLocationVerified,
      settings: parseJsonField(tree.settings, null),
      modules: parseJsonField(tree.settings, {}) && (parseJsonField(tree.settings, {}) as any)?.modules,
      economyMode: tree.economyMode,
      visibility: tree.visibility,
      admissionPolicy: tree.admissionPolicy,
      allowHashtags: tree.allowHashtags,
      allowTraditionalBranches: tree.allowTraditionalBranches,
      hashtagCreationPolicy: tree.hashtagCreationPolicy,
      modoCrisis: tree.modoCrisis,
      crisisSubjects: parseJsonField(tree.crisisSubjects, []),
      crisisExpiresAt: normalizeDate(tree.crisisExpiresAt),
      economicSettings: {
        presupuestoTotal: tree.presupuestoTotal,
        limiteSemanasEstabilidad: tree.limiteSemanasEstabilidad,
        factorDesgaste: tree.factorDesgaste,
      },
      governance: {
        modoGobierno: tree.modoGobierno,
        creacionRamaDirecta: tree.creacionRamaDirecta,
        creacionRamaComunitaria: tree.creacionRamaComunitaria,
      },
    },
    members: members.map((member: any) => ({
      userId: member.userId,
      displayName: member.user?.username,
      role: member.role,
      status: member.status,
      joinedAt: normalizeDate(member.joinedAt),
      xp: member.xp,
      level: member.level,
      skills: parseJsonField(member.skills, []),
      bayasBalance: member.bayasBalance,
      publicTraceSummary: {
        publicProfileEnabled: member.user?.publicProfileEnabled,
        publicShowLevels: member.user?.publicShowLevels,
        publicShowTreeSize: member.user?.publicShowTreeSize,
        publicShowTaskHistory: member.user?.publicShowTaskHistory,
        visibleForRecruitment: member.user?.visibleForRecruitment,
        seekingWork: member.user?.seekingWork,
        traceProfileVisibility: member.user?.privacySettings?.traceProfileVisibility,
      },
    })),
    privacySummary: {
      allowAggregatedMetricsUsers: members.filter((member: any) => member.user?.privacySettings?.allowAggregatedMetrics !== false).length,
      hiddenFromTalentSearchUsers: members.filter((member: any) => member.user?.privacySettings?.showInTalentSearch === false).length,
    },
    needs: needs.map((need: any) => ({ ...need, createdAt: normalizeDate(need.createdAt) })),
    ideas: ideas.map((idea: any) => ({
      ...idea,
      proposedPhases: parseJsonField(idea.proposedPhasesJson, []),
      requiredSkills: parseJsonField(idea.requiredSkills, []),
      createdAt: normalizeDate(idea.createdAt),
      proposedPhasesJson: undefined,
    })),
    branches: branches.map((branch: any) => ({
      ...branch,
      activePhases: parseJsonField(branch.activePhasesJson, []),
      activePhasesJson: undefined,
      expiresAt: normalizeDate(branch.expiresAt),
      createdAt: normalizeDate(branch.createdAt),
    })),
    tasks: tasks.map((task: any) => ({
      id: task.id,
      title: task.name,
      description: task.description,
      branchId: task.branchId,
      assignedToId: task.isAnonymous ? undefined : task.assignedTo,
      creatorId: task.creatorId,
      status: task.status,
      phase: task.phase,
      evidenceStatus: task.evidenceStatus,
      completionComment: task.completionComment,
      completedAt: normalizeDate(task.completedAt),
      requiredHours: task.requiredHours,
      difficultyDeclared: task.difficulty,
      difficultyValidated: task.difficultyVotes,
      requiresVoting: task.requiresVoting,
      auditada: task.auditada,
      deadlineAt: normalizeDate(task.deadlineAt),
      createdAt: normalizeDate(task.createdAt),
      evidenceMetadata: task.evidenceFiles.map((file: any) => sanitizeEvidenceForExport(file, { includeUploaderId: true })),
    })),
    audits: audits.map((audit: any) => ({ ...audit, fechaCreacion: normalizeDate(audit.fechaCreacion) })),
    evidenceMetadata: evidenceFiles.map((file: any) => sanitizeEvidenceForExport(file, { includeUploaderId: true })),
    fiatTransactions: fiatTransactions.map(sanitizeFiatTransactionForExport),
    berries: {
      totalBayasBalance: members.reduce((sum: number, member: any) => sum + Number(member.bayasBalance || 0), 0),
      membersWithPositiveBalance: members.filter((member: any) => Number(member.bayasBalance || 0) > 0).length,
    },
    bonusPools: bonusPools.map((bonus: any) => ({
      ...bonus,
      createdAt: normalizeDate(bonus.createdAt),
      updatedAt: normalizeDate(bonus.updatedAt),
    })),
    recentEventLogs: eventLogs.map(sanitizeEventLogForExport),
  };

  const warnings = [];
  if (tasks.length >= 1500) warnings.push('tasks limited to first 1500 records');
  if (eventLogs.length >= 300) warnings.push('recentEventLogs limited to latest 300 records');

  return buildBaseExport({
    exportType: 'TREE',
    treeId,
    generatedBy: { userId: actorId, role: role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : 'ADMIN' },
    data,
    warnings,
    omitted: ['rawEvidenceFiles', 'password', 'passwordHash', 'tokens', 'refreshTokens', 'jwt', 'storagePath', 'absolutePaths', 'privateUserEmails', 'environmentSecrets', 'rawFiatReceipts'],
  });
}

// ─── PDF Report Generator ─────────────────────────────────────

const TRUST_DARK = '#0a0a0f';
const TRUST_BLUE = '#3b82f6';
const TRUST_LIGHT = '#e2e8f0';
const TRUST_MUTED = '#64748b';

function formatCurrency(amount: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

function fmtDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function generateTreePDF(treeId: string): Promise<Buffer> {
  // 1. Gather data
  const tree = await (prisma as any).tree.findUnique({ where: { id: treeId } });
  if (!tree) throw new Error('Tree not found');

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [members, tasks, fiatTransactions, branchVotes] = await Promise.all([
    (prisma as any).treeMember.findMany({
      where: { treeId, status: 'VERIFIED' },
      select: {
        userId: true, role: true, xp: true, level: true, skills: true, joinedAt: true,
        user: { select: { username: true } },
      },
      orderBy: { xp: 'desc' },
    }),
    (prisma as any).task.findMany({
      where: { branch: { treeId } },
      select: {
        id: true, name: true, status: true, phase: true, difficulty: true,
        taskTags: { select: { skillName: true } },
        completedAt: true, createdAt: true,
      },
    }),
    (prisma as any).fiatTransaction.findMany({
      where: { treeId, date: { gte: sixMonthsAgo } },
      select: { id: true, amount: true, type: true, category: true, description: true, date: true, currency: true },
      orderBy: { date: 'desc' },
    }),
    (prisma as any).branchNeedVote.findMany({
      where: { branch: { treeId } },
      select: { score: true },
    }),
  ]);

  // 2. Compute metrics
  const totalMembers = members.length;
  const incomeTotal = fiatTransactions
    .filter((t: any) => t.type === 'INCOME')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const expenseTotal = fiatTransactions
    .filter((t: any) => t.type === 'EXPENSE')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const investmentTotal = fiatTransactions
    .filter((t: any) => t.type === 'INVESTMENT')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const monthlyProfit = incomeTotal - expenseTotal;
  const investmentPct = incomeTotal > 0 ? ((investmentTotal / incomeTotal) * 100).toFixed(1) : '0';
  const satisfactionAvg = branchVotes.length > 0
    ? (branchVotes.reduce((s: number, v: any) => s + v.score, 0) / branchVotes.length).toFixed(1)
    : '—';

  const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED').length;
  const pendingTasks = tasks.filter((t: any) => t.status !== 'COMPLETED').length;

  // Skill distribution
  const skillCount: Record<string, number> = {};
  for (const t of tasks) {
    if (t.taskTags) {
      for (const tag of t.taskTags as any[]) {
        skillCount[tag.skillName] = (skillCount[tag.skillName] || 0) + 1;
      }
    }
  }

  // 3. Generate PDF
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    bufferPages: true,
  });
  const buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => buffers.push(chunk));

  // ── Footer on every page ──
  const pageCount = { current: 0, total: 0 };
  doc.on('pageAdded', () => {
    const bottom = doc.page.height - 50;
    doc.fontSize(8).fillColor(TRUST_MUTED);
    doc.text('Generado por Trust Suite — trust-lite.com', 50, bottom, {
      width: doc.page.width - 100,
      align: 'center',
    });
  });

  // ── Portada ──
  const coverCenter = doc.page.height / 2 - 60;
  doc.fontSize(36).fillColor(TRUST_BLUE).text('TRUST', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(20).fillColor(TRUST_LIGHT).text('Suite', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(24).fillColor(TRUST_LIGHT).text(tree.name, { align: 'center', width: doc.page.width - 100 });
  doc.moveDown(1);
  doc.fontSize(14).fillColor(TRUST_MUTED).text(`Reporte generado el ${fmtDate(new Date())}`, { align: 'center' });
  doc.moveDown(3);
  // Decorative line
  doc.moveTo(150, doc.y).lineTo(doc.page.width - 150, doc.y).strokeColor(TRUST_BLUE).lineWidth(2).stroke();
  doc.addPage();

  // ── Resumen Ejecutivo ──
  doc.fontSize(20).fillColor(TRUST_BLUE).text('Resumen Ejecutivo', { underline: true });
  doc.moveDown(1.5);

  const summaryData = [
    ['Total Miembros', String(totalMembers)],
    ['Profit Mensual (últimos 6m)', formatCurrency(monthlyProfit)],
    ['Inversión (% de ingresos)', `${investmentPct}%`],
    ['Satisfacción (prom. votos rama)', `${satisfactionAvg}/10`],
    ['Presupuesto Total', formatCurrency(tree.presupuestoTotal || 0)],
    ['Modo Economía', tree.economyMode || 'NO_ECONOMY'],
  ];
  drawTable(doc, summaryData, [200, 300]);
  doc.moveDown(2);

  // ── Transacciones FIAT (últimos 6 meses) ──
  doc.fontSize(16).fillColor(TRUST_BLUE).text('Transacciones FIAT — Últimos 6 Meses');
  doc.moveDown(1);

  if (fiatTransactions.length === 0) {
    doc.fontSize(11).fillColor(TRUST_MUTED).text('Sin datos disponibles');
  } else {
    const txHeaders = ['Fecha', 'Tipo', 'Categoría', 'Monto', 'Descripción'];
    const txColWidths = [90, 70, 90, 70, 180];
    drawTableHeader(doc, txHeaders, txColWidths);
    for (const tx of fiatTransactions.slice(0, 30)) {
      drawTableRow(doc, [
        fmtDate(tx.date),
        tx.type,
        tx.category || '—',
        formatCurrency(tx.amount, tx.currency),
        (tx.description || '—').slice(0, 40),
      ], txColWidths);
    }
    if (fiatTransactions.length > 30) {
      doc.fontSize(9).fillColor(TRUST_MUTED).text(`... y ${fiatTransactions.length - 30} transacciones más (limitado a 30 en PDF)`);
    }
  }
  doc.addPage();

  // ── Métricas de Tasks ──
  doc.fontSize(16).fillColor(TRUST_BLUE).text('Métricas de Tareas');
  doc.moveDown(1);

  const taskSummary = [
    ['Completadas', String(completedTasks)],
    ['Pendientes', String(pendingTasks)],
    ['Total', String(tasks.length)],
  ];
  drawTable(doc, taskSummary, [200, 300]);
  doc.moveDown(1.5);

  doc.fontSize(14).fillColor(TRUST_BLUE).text('Distribución por Skill');
  doc.moveDown(0.5);

  if (Object.keys(skillCount).length === 0) {
    doc.fontSize(11).fillColor(TRUST_MUTED).text('Sin datos disponibles');
  } else {
    const sortedSkills = Object.entries(skillCount).sort((a, b) => b[1] - a[1]);
    const skillHeaders = ['Skill', 'Tareas'];
    const skillColWidths = [350, 150];
    drawTableHeader(doc, skillHeaders, skillColWidths);
    for (const [skill, count] of sortedSkills) {
      drawTableRow(doc, [skill, String(count)], skillColWidths);
    }
  }
  doc.addPage();

  // ── Sección de Miembros ──
  doc.fontSize(16).fillColor(TRUST_BLUE).text('Miembros del Árbol');
  doc.moveDown(1);

  if (members.length === 0) {
    doc.fontSize(11).fillColor(TRUST_MUTED).text('Sin datos disponibles');
  } else {
    const memberHeaders = ['Nombre', 'Rol', 'XP', 'Nivel', 'Skills'];
    const memberColWidths = [130, 80, 60, 50, 180];
    drawTableHeader(doc, memberHeaders, memberColWidths);
    for (const m of members) {
      const skills = parseJsonField(m.skills, []) as string[];
      drawTableRow(doc, [
        m.user?.username || '—',
        m.role,
        String(Math.round(m.xp)),
        String(m.level),
        (Array.isArray(skills) ? skills.join(', ') : '—').slice(0, 45),
      ], memberColWidths);
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

// ── PDF Table Helpers ──

function drawTableHeader(doc: PDFKit.PDFDocument, headers: string[], colWidths: number[]) {
  const startX = doc.x;
  const startY = doc.y;
  const rowHeight = 20;

  doc.fontSize(9).fillColor('#ffffff');
  let xPos = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(xPos, startY, colWidths[i], rowHeight).fill(TRUST_DARK);
    doc.fillColor('#ffffff').text(headers[i], xPos + 4, startY + 4, { width: colWidths[i] - 8 });
    xPos += colWidths[i];
  }
  doc.y = startY + rowHeight;
}

function drawTableRow(doc: PDFKit.PDFDocument, cells: string[], colWidths: number[]) {
  const startX = doc.x;
  const startY = doc.y;
  const rowHeight = 18;
  const isEven = (doc as any)._rowIndex ? ((doc as any)._rowIndex % 2 === 0) : true;
  (doc as any)._rowIndex = ((doc as any)._rowIndex || 0) + 1;

  doc.fontSize(9);
  let xPos = startX;
  for (let i = 0; i < cells.length; i++) {
    doc.rect(xPos, startY, colWidths[i], rowHeight).fill(isEven ? '#1a1a2e' : '#0d0d1a');
    doc.fillColor(TRUST_LIGHT).text(cells[i] || '—', xPos + 4, startY + 4, { width: colWidths[i] - 8 });
    xPos += colWidths[i];
  }
  doc.y = startY + rowHeight;
  doc.fillColor(TRUST_LIGHT);
}

function drawTable(doc: PDFKit.PDFDocument, rows: string[][], colWidths: number[]) {
  const headers = rows[0];
  const data = rows.slice(1);
  if (headers) drawTableHeader(doc, headers, colWidths);
  for (const row of data) drawTableRow(doc, row, colWidths);
}
