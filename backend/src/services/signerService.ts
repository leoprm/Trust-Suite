import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ── 1. getSigners ──────────────────────────────────────────────────────

export async function getSigners(treeId: string) {
  return prisma.treeSigner.findMany({
    where: { treeId, status: 'ACTIVE' },
    include: {
      user: { select: { id: true, username: true, email: true } },
    },
    orderBy: { addedAt: 'asc' },
  });
}

// ── 2. addSigner ───────────────────────────────────────────────────────

export async function addSigner(
  treeId: string,
  targetUserId: string,
  actorId: string,
) {
  // Verify tree exists
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: { creatorId: true, minSigners: true },
  });
  if (!tree) throw new Error('Tree not found');

  // Verify actor is admin or creator
  const actorMember = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: actorId, treeId } },
    select: { role: true },
  });
  if (!actorMember) throw new Error('You are not a member of this tree');
  if (actorMember.role !== 'ADMIN' && tree.creatorId !== actorId) {
    throw new Error('Only admins or the tree creator can manage signers');
  }

  // Verify target user is a member of the tree
  const targetMember = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: targetUserId, treeId } },
    select: { id: true },
  });
  if (!targetMember) {
    throw new Error('User must be a member of the tree to become a signer');
  }

  // Check max 5 signers
  const activeCount = await prisma.treeSigner.count({
    where: { treeId, status: 'ACTIVE' },
  });
  if (activeCount >= 5) {
    throw new Error('Maximum 5 signers allowed');
  }

  // Create or reactivate
  const existing = await prisma.treeSigner.findUnique({
    where: { treeId_userId: { treeId, userId: targetUserId } },
  });

  let signer: { id: string; userId: string; status: string };
  if (existing) {
    if (existing.status === 'ACTIVE') {
      throw new Error('User is already a signer');
    }
    signer = await prisma.treeSigner.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', addedAt: new Date(), removedAt: null },
    });
  } else {
    signer = await prisma.treeSigner.create({
      data: { treeId, userId: targetUserId, status: 'ACTIVE' },
    });
  }

  // Check if 3rd signer → multi-sig active
  const newCount = await prisma.treeSigner.count({
    where: { treeId, status: 'ACTIVE' },
  });
  const multiSigActive = newCount >= (tree.minSigners ?? 3);

  void logEvent({
    treeId,
    actorId,
    action: 'TREE_SIGNER_ADDED',
    entityType: 'TreeSigner',
    entityId: signer.id,
    metadataJson: { targetUserId, activeSignerCount: newCount, multiSigActive },
    severity: 'INFO',
    source: 'USER',
  });

  return { signer, multiSigActive };
}

// ── 3. removeSigner ────────────────────────────────────────────────────

export async function removeSigner(
  treeId: string,
  targetUserId: string,
  actorId: string,
) {
  // Verify tree exists
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: { creatorId: true, minSigners: true, financingMode: true },
  });
  if (!tree) throw new Error('Tree not found');

  // Verify actor is admin or creator
  const actorMember = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: actorId, treeId } },
    select: { role: true },
  });
  if (!actorMember) throw new Error('You are not a member of this tree');
  if (actorMember.role !== 'ADMIN' && tree.creatorId !== actorId) {
    throw new Error('Only admins or the tree creator can manage signers');
  }

  // Find the signer record
  const signer = await prisma.treeSigner.findUnique({
    where: { treeId_userId: { treeId, userId: targetUserId } },
  });
  if (!signer || signer.status !== 'ACTIVE') {
    throw new Error('Signer not found');
  }

  // Check if removal would go below minSigners when there are PLEDGED funds
  const activeCount = await prisma.treeSigner.count({
    where: { treeId, status: 'ACTIVE' },
  });
  const minSigners = tree.minSigners ?? 3;

  if (activeCount <= minSigners) {
    const pledgedPayment = await prisma.memberPayment.findFirst({
      where: { treeId, status: 'PLEDGED' },
      select: { id: true },
    });
    if (pledgedPayment) {
      throw new Error(
        `Cannot remove signer: there are PLEDGED funds and active signers (${activeCount}) would drop below minimum (${minSigners})`,
      );
    }
  }

  // Remove signer (soft-delete: set to REMOVED)
  const updated = await prisma.treeSigner.update({
    where: { id: signer.id },
    data: { status: 'REMOVED', removedAt: new Date() },
  });

  const newCount = activeCount - 1;
  const warnings: string[] = [];

  // Warning if multi-sig deactivated
  if (newCount < (tree.minSigners ?? 3)) {
    warnings.push(
      'Warning: Multi-sig is now deactivated (fewer than minimum active signers)',
    );
  }

  // If in SUBSCRIPCION mode and below minSigners
  if (tree.financingMode === 'SUBSCRIPCION' && newCount < minSigners) {
    warnings.push(
      'Warning: Tree is in SUBSCRIPCION mode but below minSigners. Funds remain frozen in PLEDGED until signers are restored.',
    );
  }

  void logEvent({
    treeId,
    actorId,
    action: 'TREE_SIGNER_REMOVED',
    entityType: 'TreeSigner',
    entityId: signer.id,
    metadataJson: {
      targetUserId,
      previousCount: activeCount,
      newCount,
      warnings,
    },
    severity: 'WARNING',
    source: 'USER',
  });

  return { signer: updated, warnings };
}

// ── 4. canExecuteMultiSig ──────────────────────────────────────────────

export async function canExecuteMultiSig(treeId: string): Promise<boolean> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      multiSigThreshold: true,
      signers: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
    },
  });
  if (!tree) return false;
  return tree.signers.length >= (tree.multiSigThreshold ?? 2);
}

// ── 5. requireMultiSig ─────────────────────────────────────────────────

export async function requireMultiSig(treeId: string): Promise<void> {
  const can = await canExecuteMultiSig(treeId);
  if (!can) {
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: {
        multiSigThreshold: true,
        signers: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });
    const active = tree?.signers.length ?? 0;
    const threshold = tree?.multiSigThreshold ?? 2;
    throw new Error(
      `Multi-sig not available: ${active}/${threshold} active signers`,
    );
  }
}

// ── 6. notifySigners ───────────────────────────────────────────────────

export async function notifySigners(
  treeId: string,
  action: string,
  paymentId: string,
) {
  const signers = await prisma.treeSigner.findMany({
    where: { treeId, status: 'ACTIVE' },
    select: { userId: true },
  });

  if (signers.length === 0) return [];

  const notifications = await Promise.all(
    signers.map((s) =>
      prisma.notification.create({
        data: {
          userId: s.userId,
          type: 'GENERAL',
          category: 'FLUJO',
          title: `Multi-sig: ${action}`,
          body: `Action "${action}" requires your signature. Payment ID: ${paymentId}`,
          entityType: 'MemberPayment',
          entityAction: action,
          entityId: paymentId,
        },
      }),
    ),
  );

  return notifications;
}
