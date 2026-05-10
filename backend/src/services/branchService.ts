import { prisma } from '../index';
import { logEvent } from './eventLogService';

const VALID_PHASES_FOR_CONFIG = ['DEVELOPMENT'] as const;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

/**
 * Set the quorumTimeoutDays for a branch.
 * Only allowed when the branch is in DEVELOPMENT phase.
 * Falls back to default (30) if days is not provided.
 */
export async function updateQuorumTimeoutDays(
  branchId: string,
  days: number,
  userId: string,
) {
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    throw new Error(
      `quorumTimeoutDays must be an integer between ${MIN_DAYS} and ${MAX_DAYS}`,
    );
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, phase: true, treeId: true, quorumTimeoutDays: true },
  });

  if (!branch) throw new Error('Branch not found');

  if (!VALID_PHASES_FOR_CONFIG.includes(branch.phase as any)) {
    throw new Error(
      `quorumTimeoutDays can only be configured in DEVELOPMENT phase. Current phase: ${branch.phase}`,
    );
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: { quorumTimeoutDays: days },
  });

  void logEvent({
    treeId: branch.treeId ?? undefined,
    actorId: userId,
    action: 'BRANCH_QUORUM_TIMEOUT_UPDATED',
    entityType: 'Branch',
    entityId: branchId,
    beforeJson: { quorumTimeoutDays: branch.quorumTimeoutDays },
    afterJson: { quorumTimeoutDays: days },
    metadataJson: { days },
    severity: 'INFO',
    source: 'USER',
  });

  return updated;
}
