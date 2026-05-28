import { prisma } from '../index';

export type VisibilityLevel = 'TREE_ONLY' | 'PUBLIC';

export interface PrivacySettingsShape {
  id?: string;
  userId: string;
  traceProfileVisibility: VisibilityLevel;
  taskHistoryVisibility: VisibilityLevel;
  evidenceVisibility: VisibilityLevel;
  showInTalentSearch: boolean;
  allowAggregatedMetrics: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const VISIBILITY_LEVELS: VisibilityLevel[] = ['TREE_ONLY', 'PUBLIC'];

export const DEFAULT_PRIVACY_SETTINGS = {
  traceProfileVisibility: 'TREE_ONLY' as VisibilityLevel,
  taskHistoryVisibility: 'TREE_ONLY' as VisibilityLevel,
  evidenceVisibility: 'TREE_ONLY' as VisibilityLevel,
  showInTalentSearch: false,
  allowAggregatedMetrics: true,
};

export function isVisibilityLevel(value: unknown): value is VisibilityLevel {
  return typeof value === 'string' && VISIBILITY_LEVELS.includes(value as VisibilityLevel);
}

export async function getOrCreatePrivacySettings(userId: string): Promise<PrivacySettingsShape> {
  const existing = await prisma.privacySettings.findUnique({
    where: { userId },
  });

  if (existing) return existing as unknown as PrivacySettingsShape;

  return prisma.privacySettings.create({
    data: {
      userId,
      ...DEFAULT_PRIVACY_SETTINGS,
    } as any,
  }) as unknown as PrivacySettingsShape;
}

export function withDefaultPrivacySettings(userId: string, settings?: Partial<PrivacySettingsShape> | null): PrivacySettingsShape {
  return {
    userId,
    ...DEFAULT_PRIVACY_SETTINGS,
    ...(settings || {}),
  };
}

export async function hasSharedTree(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;

  const viewerMemberships = await prisma.treeMember.findMany({
    where: { userId: viewerId },
    select: { treeId: true },
  });
  const viewerTreeIds = viewerMemberships.map((m: any) => m.treeId);
  if (viewerTreeIds.length === 0) return false;

  const shared = await prisma.treeMember.findFirst({
    where: {
      userId: ownerId,
      treeId: { in: viewerTreeIds },
    },
    select: { id: true },
  });

  return !!shared;
}

export async function canViewUserPrivacyLevel(options: {
  level: VisibilityLevel;
  ownerId: string;
  viewerId?: string | null;
  viewerRole?: string | null;
}): Promise<boolean> {
  const { level, ownerId, viewerId, viewerRole } = options;

  if (viewerId === ownerId) return true;
  if (viewerRole === 'ADMINISTRATOR') return true;

  switch (level) {
    case 'PUBLIC':
      return true;
    case 'TREE_ONLY':
    default:
      return !!viewerId && hasSharedTree(viewerId, ownerId);
  }
}

export function redactTaskEvidenceFields<T extends Record<string, any>>(task: T): T {
  return {
    ...task,
    evidenceUrl: null,
    startPhotoUrl: null,
    completionPhotoUrl: null,
    evidence: null,
    isEvidenceRedacted: true,
  };
}
