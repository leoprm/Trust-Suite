import { Request, Response } from 'express';
import { prisma } from '../index';
import { randomBytes } from 'crypto';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { onTreeCreated } from '../services/genesisService';
import { TreeSandbox } from '../services/treeSandbox';

// ── Tree CRUD ────────────────────────────────────────────────────────────────

export const createTree = async (req: any, res: Response) => {
  try {
    const { name, icono, description, inviteUserIds, admissionPolicy } = req.body;
    const creatorId = req.user.id;

    const tree = await prisma.tree.create({
      data: {
        name,
        icono: icono || '🌳',
        description: description || null,
        creatorId,
        admissionPolicy: admissionPolicy || 'INVITE_ONLY',
      }
    });

    // Creator membership
    await prisma.treeMember.create({
      data: {
        userId: creatorId,
        treeId: tree.id,
        invitedById: null,
        status: 'ACTIVE',
        role: 'ADMIN',
      }
    });

    // Invited memberships
    if (inviteUserIds && inviteUserIds.length > 0) {
      const userIds = new Set(inviteUserIds);
      userIds.delete(creatorId);

      await prisma.treeMember.createMany({
        data: Array.from(userIds).map((userId: any) => ({
          userId,
          treeId: tree.id,
          invitedById: creatorId,
          status: 'ACTIVE',
        }))
      });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: tree.id,
      action: 'TREE_CREATED',
      entityType: 'Tree',
      entityId: tree.id,
      afterJson: { id: tree.id, name: tree.name, admissionPolicy: tree.admissionPolicy },
      metadataJson: getRequestMetadata(req, { invitedCount: inviteUserIds?.length || 0, result: 'success' }),
      source: 'USER',
    });

    // SPEC-1: auto-provisioning — non-blocking, fire-and-forget
    try {
      onTreeCreated(tree).catch(err => {
        console.error('[genesisService] onTreeCreated failed:', err?.message || err);
      });
    } catch {
      // Non-blocking: import or top-level sync error
    }

    // SPEC-4: auto-create sandbox — non-blocking, fire-and-forget
    // Only if admission is not fully closed (future-proofing: CLOSED may be added to enum)
    const policy = tree.admissionPolicy as string;
    if (policy !== 'CLOSED') {
      try {
        TreeSandbox.create(tree.id).catch(err => {
          console.error('[TreeSandbox] auto-create failed:', err?.message || err);
        });
      } catch {
        // Non-blocking
      }
    }

    res.status(201).json(tree);
  } catch (error: any) {
    console.error('[createTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create tree', detail: error?.message || String(error) });
  }
};

export const updateTree = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { name, icono, description, admissionPolicy } = req.body;

    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Only creator can update
    if (tree.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the tree creator can update it' });
    }

    const updated = await prisma.tree.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(icono !== undefined && { icono }),
        ...(description !== undefined && { description }),
        ...(admissionPolicy !== undefined && { admissionPolicy }),
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[updateTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to update tree' });
  }
};

export const deleteTree = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Only creator can delete
    if (tree.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the tree creator can delete it' });
    }

    // T5: Auto-destruir sandbox — non-blocking, fire-and-forget
    try {
      await TreeSandbox.destroy(id);
    } catch (err: any) {
      console.warn(`[deleteTree] Sandbox destroy failed for tree ${id.slice(0, 8)}…:`, err?.message || err);
    }

    // Prisma cascade cleans up: members, needs, ideas, votes, tokens,
    // chatMessages, eventLogs, ratings, ledgerEntries, TreeSandbox, etc.
    await prisma.tree.delete({ where: { id } });

    res.json({ message: 'Tree deleted successfully' });
  } catch (error: any) {
    console.error('[deleteTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to delete tree' });
  }
};

export const getTree = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const tree = await prisma.tree.findUnique({
      where: { id },
      include: { members: { select: { userId: true, role: true, status: true, level: true, xp: true, joinedAt: true } } }
    });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tree' });
  }
};

export const getMyTrees = async (req: any, res: Response) => {
  try {
    const memberships = await prisma.treeMember.findMany({
      where: { userId: req.user.id },
      include: { tree: true }
    });
    const trees = memberships.map((m: any) => ({ ...m.tree, myRole: m.role }));
    res.json(trees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get my trees' });
  }
};

export const getGlobalTrees = async (req: any, res: Response) => {
  try {
    const trees = await prisma.tree.findMany({
      where: {
        admissionPolicy: 'OPEN',
        members: { none: { userId: req.user.id } }
      },
      include: { _count: { select: { members: true } } }
    });
    res.json(trees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get global trees' });
  }
};

export const getTreeMembers = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const members = await prisma.treeMember.findMany({
      where: { treeId: id },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } }
      },
      orderBy: { xp: 'desc' }
    });
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get members' });
  }
};

// ── Membership ────────────────────────────────────────────────────────────────

export const joinTree = async (req: any, res: Response) => {
  try {
    const { treeId } = req.body;

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    if (tree.admissionPolicy !== 'OPEN') {
      return res.status(403).json({ error: 'This tree requires an invitation' });
    }

    const existing = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } }
    });
    if (existing) return res.status(400).json({ error: 'Already a member' });

    await prisma.treeMember.create({
      data: { userId: req.user.id, treeId, invitedById: null, status: 'ACTIVE' }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TREE_MEMBER_JOINED',
      entityType: 'TreeMember',
      entityId: req.user.id,
      metadataJson: getRequestMetadata(req, { via: 'open_tree', result: 'success' }),
      source: 'USER',
    });

    res.json({ message: 'Joined tree successfully', tree });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join tree' });
  }
};

export const leaveTree = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.treeMember.delete({
      where: { userId_treeId: { userId: req.user.id, treeId: id } }
    });
    res.json({ message: 'Left tree successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave tree' });
  }
};

export const inviteMember = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const requester = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId: id } }
    });
    if (!requester) return res.status(403).json({ error: 'Not a member of this tree' });
    if (requester.status !== 'ACTIVE') return res.status(403).json({ error: 'Must be an active member to invite' });

    const existing = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: id } }
    });
    if (existing) return res.status(400).json({ error: 'User is already a member' });

    await prisma.treeMember.create({
      data: { userId, treeId: id, invitedById: req.user.id, status: 'ACTIVE' }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'TREE_MEMBER_INVITED',
      entityType: 'TreeMember',
      entityId: userId,
      metadataJson: getRequestMetadata(req, { invitedUserId: userId, result: 'success' }),
      source: 'USER',
    });

    res.json({ message: 'User invited successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to invite member' });
  }
};

export const removeMember = async (req: any, res: Response) => {
  try {
    const { treeId, userId } = req.params;
    const requesterId = req.user.id;

    if (requesterId === userId) {
      return res.status(400).json({ error: 'Use leaveTree to remove yourself' });
    }

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const target = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } }
    });
    if (!target) return res.status(404).json({ error: 'Member not found' });

    // Authority check: creator or invitation chain
    let hasAuthority = false;
    if (tree.creatorId === requesterId) {
      hasAuthority = true;
    } else {
      let currentInviterId = target.invitedById;
      while (currentInviterId) {
        if (currentInviterId === requesterId) {
          hasAuthority = true;
          break;
        }
        const inviterMember = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: currentInviterId, treeId } }
        });
        currentInviterId = inviterMember?.invitedById || null;
      }
    }

    if (!hasAuthority) {
      return res.status(403).json({ error: 'No tienes autoridad para eliminar a este miembro' });
    }

    // Collect all members in the invitation tree
    const membersToDelete = [userId];
    const getInvitees = async (pId: string) => {
      const invitees = await prisma.treeMember.findMany({
        where: { treeId, invitedById: pId }
      });
      for (const inv of invitees) {
        membersToDelete.push(inv.userId);
        await getInvitees(inv.userId);
      }
    };
    await getInvitees(userId);

    await prisma.treeMember.deleteMany({
      where: { treeId, userId: { in: membersToDelete } }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TREE_MEMBER_REMOVED',
      entityType: 'TreeMember',
      entityId: userId,
      beforeJson: { userId, removedUserIds: membersToDelete },
      metadataJson: getRequestMetadata(req, { removedCount: membersToDelete.length, result: 'success' }),
      source: 'USER',
    });

    res.json({ message: `Member(s) removed successfully (${membersToDelete.length})` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

// ── Guest Tokens ──────────────────────────────────────────────────────────────

export const generateGuestToken = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const creadorId = req.user.id;

    const requester = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: creadorId, treeId: id } }
    });
    if (!requester) return res.status(403).json({ error: 'Not a member of this tree' });
    if (requester.status !== 'ACTIVE') return res.status(403).json({ error: 'Must be an active member to invite' });

    // Clean up expired tokens
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.tokenInvitacion.deleteMany({
      where: { createdAt: { lt: yesterday } }
    });

    const token = await prisma.tokenInvitacion.create({
      data: {
        arbolId: id,
        creadorId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.json({ token: token.id });
  } catch (error) {
    console.error('generateGuestToken error:', error);
    res.status(500).json({ error: 'Failed to generate guest token' });
  }
};

export const consumeGuestToken = async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) return res.status(400).json({ error: 'Token es requerido' });

    const tokenRecord = await prisma.tokenInvitacion.findUnique({
      where: { id: token }
    });

    if (!tokenRecord) return res.status(404).json({ error: 'Enlace inválido o no encontrado' });
    if (tokenRecord.usado) return res.status(403).json({ error: 'Este enlace ya ha sido utilizado.' });
    if (tokenRecord.expiresAt && new Date() > new Date(tokenRecord.expiresAt)) {
      return res.status(403).json({ error: 'Este enlace ha expirado.' });
    }

    const existingMember = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: tokenRecord.arbolId } }
    });
    if (existingMember) {
      return res.json({ message: 'Ya eres miembro del árbol', treeId: tokenRecord.arbolId });
    }

    await prisma.$transaction([
      prisma.tokenInvitacion.update({
        where: { id: token },
        data: { usado: true }
      }),
      prisma.treeMember.create({
        data: {
          userId,
          treeId: tokenRecord.arbolId,
          invitedById: tokenRecord.creadorId,
          status: 'ACTIVE'
        }
      })
    ]);

    void logEvent({
      ...getRequestContext(req),
      treeId: tokenRecord.arbolId,
      action: 'TREE_MEMBER_JOINED',
      entityType: 'TreeMember',
      entityId: userId,
      metadataJson: getRequestMetadata(req, { via: 'guest_token', result: 'success' }),
      source: 'USER',
    });

    res.json({ message: 'Unido exitosamente', treeId: tokenRecord.arbolId });
  } catch (error) {
    console.error('consumeGuestToken error:', error);
    res.status(500).json({ error: 'No se pudo procesar tu invitación.' });
  }
};

// ── Stubbed / Removed Endpoints ───────────────────────────────────────────────

// GET /api/trees/:id/my-level — nivel y xp del usuario autenticado en ese arbol
export const getMyLevel = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const treeId = req.params.id;

    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { level: true, xp: true, joinedAt: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'Not a member of this tree' });
    }

    res.json({
      treeId,
      level: member.level,
      xp: member.xp,
      joinedAt: member.joinedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get my level' });
  }
};

export const getNetworkGraph = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Network graph not available in V3 schema' });
};

export const getPendingEvidence = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Evidence system removed in V3' });
};

export const toggleCrisisMode = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Crisis mode removed in V3' });
};

export const broadcastCrisisSignal = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Crisis broadcast removed in V3' });
};

export const updateMemberPower = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'Power system removed in V3' });
};

export const inviteAI = async (_req: any, res: Response) => {
  res.status(501).json({ error: 'AI members removed in V3' });
};

// ── GET /api/tree/:id/ledger ────────────────────────────────────────────────
// Returns the transaction history for a tree (admin only).
// Includes all TransactionLedger entries: split credits, withdrawals, etc.
// Optional query params: memberId, type, limit (default 50), offset (default 0).

export const getTreeLedger = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const userId = req.user!.id;
    const { memberId, type, limit = '50', offset = '0' } = req.query;

    // ── Verify tree exists ───────────────────────────────────────────────
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    // ── Verify admin role ────────────────────────────────────────────────
    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { role: true, status: true },
    });

    if (!member || member.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Active tree membership required' });
    }

    if (member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin role required to view ledger' });
    }

    // ── Build query filters ──────────────────────────────────────────────
    const where: any = { treeId };
    if (memberId && typeof memberId === 'string') {
      where.memberId = memberId;
    }
    if (type && typeof type === 'string') {
      where.type = type;
    }

    const take = Math.min(parseInt(limit as string, 10) || 50, 200);
    const skip = Math.max(parseInt(offset as string, 10) || 0, 0);

    // ── Query ledger with member info ────────────────────────────────────
    const [entries, total] = await Promise.all([
      prisma.transactionLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          member: {
            select: {
              id: true,
              userId: true,
              user: { select: { username: true } },
            },
          },
        },
      }),
      prisma.transactionLedger.count({ where }),
    ]);

    // Flatten member info for cleaner response
    const formattedEntries = entries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: e.amount,
      description: e.description,
      stripeReference: e.stripeReference,
      metadataJson: e.metadataJson,
      createdAt: e.createdAt,
      member: {
        id: e.member.id,
        userId: e.member.userId,
        username: e.member.user?.username || 'unknown',
      },
    }));

    res.json({
      entries: formattedEntries,
      total,
      limit: take,
      offset: skip,
    });
  } catch (error: any) {
    console.error('[getTreeLedger]', error);
    res.status(500).json({ error: error.message || 'Failed to fetch ledger' });
  }
};
