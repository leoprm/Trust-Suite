import { Request, Response } from 'express';
import { prisma, telegramBot } from '../index';
import { randomBytes } from 'crypto';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { onTreeCreated } from '../services/genesisService';
import { TreeSandbox } from '../services/treeSandbox';
import { suggestTreeStructure, generateRecommendationForNewTree } from '../services/treeRecommenderService';
import { createNotebook } from '../services/notebooklmSingleton';
import { classifyTree } from '../services/treeClassificationService';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Genera un código corto único de 6 caracteres (ej: ABC123). */
function generateTreeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1 para evitar confusión
  let code = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// ── Tree CRUD ────────────────────────────────────────────────────────────────

export const createTree = async (req: any, res: Response) => {
  try {
    const { name, icono, description, inviteUserIds, admissionPolicy, totalBudget, parentTreeId } = req.body;
    const creatorId = req.user.id;

    // ── B7: Validate parent tree membership before creating a sub-tree ──
    if (parentTreeId) {
      const parentTree = await prisma.tree.findUnique({ where: { id: parentTreeId } });
      if (!parentTree) return res.status(404).json({ error: 'Parent tree not found' });

      const isMember = await prisma.treeMember.findFirst({
        where: { treeId: parentTreeId, userId: creatorId, status: 'ACTIVE' },
      });
      if (!isMember) {
        return res.status(403).json({ error: 'Debes ser miembro del árbol padre para crear un sub-árbol' });
      }
    }

    // ── BigInt protection: validate inviteUserIds against numeric overflow ──
    // JSON.parse() loses precision for integers beyond Number.MAX_SAFE_INTEGER
    // (9,007,199,254,740,991). If the frontend sends telegram user IDs as raw
    // numbers, they corrupt before reaching the database. Reject values that
    // look like BigInt candidates (telegram IDs, large ints) but arrived as
    // imprecise Number types. Strings pass through — Prisma/DM validates UUID format.
    if (inviteUserIds && Array.isArray(inviteUserIds)) {
      for (const uid of inviteUserIds) {
        if (typeof uid === 'number' && !Number.isSafeInteger(uid)) {
          return res.status(400).json({
            error: 'Valor numérico inseguro en inviteUserIds',
            detail: `El valor ${uid} excede Number.MAX_SAFE_INTEGER. Envíalo como string.`,
          });
        }
      }
    }

    // ── BigInt protection: validate totalBudget against unsafe values ──
    // Prisma maps Float to MySQL DOUBLE, which can handle large values, but
    // JSON.parse() may lose precision on integers beyond MAX_SAFE_INTEGER.
    if (totalBudget !== undefined && typeof totalBudget === 'number') {
      if (!Number.isFinite(totalBudget)) {
        return res.status(400).json({
          error: 'totalBudget debe ser un número finito',
        });
      }
    }

    // Generate unique tree code (retry on collision)
    let code = generateTreeCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.tree.findUnique({ where: { code } });
      if (!existing) break;
      code = generateTreeCode();
      attempts++;
    }

    const tree = await prisma.tree.create({
      data: {
        name,
        icono: icono || '🌳',
        description: description || null,
        creatorId,
        admissionPolicy: admissionPolicy || 'INVITE_ONLY',
        code,
        ...(totalBudget !== undefined && { totalBudget }),
        ...(parentTreeId && { parentTreeId }),
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

    // N3: auto-create NotebookLM sandbox — non-blocking, fire-and-forget
    try {
      createNotebook(tree.id).catch(err => {
        console.error('[notebooklm] auto-create failed:', err?.message || err);
      });
    } catch {
      // Non-blocking: import or top-level sync error
    }

    // C1: Ari tree classification — non-blocking, fire-and-forget
    try {
      classifyTree(tree.id, tree.name, tree.description || '').catch(err => {
        console.error('[classifyTree] classification failed:', err?.message || err);
      });
    } catch {
      // Non-blocking: import or top-level sync error
    }

    // T23: Generate structure recommendation based on similar successful trees
    let suggestion = null;
    try {
      suggestion = await generateRecommendationForNewTree(tree.description || '');
    } catch (err: any) {
      console.warn('[createTree] Recommendation generation failed (non-blocking):', err?.message || err);
    }

    if (suggestion) {
      res.status(201).json({
        tree,
        suggestion,
        message: '🌳 Árbol creado. Basado en árboles exitosos similares, te recomendamos esta estructura.',
      });
    } else {
      res.status(201).json(tree);
    }
  } catch (error: any) {
    console.error('[createTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create tree', detail: error?.message || String(error) });
  }
};

// ── T23: Tree Structure Recommender ───────────────────────────────────────────

export const suggestStructure = async (req: any, res: Response) => {
  try {
    const { description, objectives } = req.body;

    const result = await suggestTreeStructure(description || '', objectives || '');

    if (result.fallback || !result.recommendation) {
      return res.json({
        message: 'No hay suficientes árboles exitosos similares para hacer una recomendación. Crea tu estructura manualmente.',
        fallback: true,
      });
    }

    res.json({
      recommendation: result.recommendation,
      similarTrees: result.similarTrees,
    });
  } catch (error: any) {
    console.error('[suggestStructure] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to suggest tree structure', detail: error?.message || String(error) });
  }
};

// ── T26: Tree Tech Stack ──────────────────────────────────────────────────────

export const getTechStack = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    if (!treeId) {
      return res.status(400).json({ error: 'treeId is required' });
    }

    const { getTreeTechStack } = await import('../services/techStackService');
    const result = await getTreeTechStack(treeId);
    res.json(result);
  } catch (error: any) {
    console.error('[getTechStack] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get tech stack', detail: error?.message || String(error) });
  }
};

export const updateTree = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { name, icono, description, admissionPolicy, totalBudget, parentTreeId } = req.body;

    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Only creator can update
    if (tree.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the tree creator can update it' });
    }

    // ── B7: Validate parent tree membership before linking as sub-tree ──
    if (parentTreeId) {
      const parentTree = await prisma.tree.findUnique({ where: { id: parentTreeId } });
      if (!parentTree) return res.status(404).json({ error: 'Parent tree not found' });

      const isMember = await prisma.treeMember.findFirst({
        where: { treeId: parentTreeId, userId: req.user.id, status: 'ACTIVE' },
      });
      if (!isMember) {
        return res.status(403).json({ error: 'Debes ser miembro del árbol padre para crear un sub-árbol' });
      }
    }

    const updated = await prisma.tree.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(icono !== undefined && { icono }),
        ...(description !== undefined && { description }),
        ...(admissionPolicy !== undefined && { admissionPolicy }),
        ...(totalBudget !== undefined && { totalBudget }),
        ...(parentTreeId !== undefined && { parentTreeId }),
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

    // N3: clean up NotebookLM notebook — non-blocking, fire-and-forget
    import('../services/notebooklmSingleton').then(({ deleteNotebook }) => {
      deleteNotebook(id).catch(err => {
        console.error(`[deleteTree] NotebookLM delete failed for tree ${id.slice(0, 8)}…:`, err?.message || err);
      });
    });

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

// ── Tree Hierarchy ─────────────────────────────────────────────────────────────

export const createSubTree = async (req: any, res: Response) => {
  try {
    const parentTreeId = req.params.treeId;
    const { name, description, icono } = req.body;
    const userId = req.user!.id;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Tree name is required' });
    }

    const parentTree = await prisma.tree.findUnique({ where: { id: parentTreeId } });
    if (!parentTree) return res.status(404).json({ error: 'Parent tree not found' });

    const isAdmin = await prisma.treeMember.findFirst({
      where: { treeId: parentTreeId, userId, role: 'ADMIN' },
    });
    if (!isAdmin) return res.status(403).json({ error: 'Must be admin of parent tree' });

    const subTree = await prisma.tree.create({
      data: {
        name: name.trim(),
        description: description || null,
        icono: icono || '🌿',
        parentTreeId,
        creatorId: userId,
        admissionPolicy: 'OPEN',
      },
    });

    // Creator becomes admin of the subtree
    await prisma.treeMember.create({
      data: { userId, treeId: subTree.id, status: 'ACTIVE', role: 'ADMIN' },
    });

    // ── B5: Inherit objectives from ancestor chain ────────────────────────
    const ancestorObjectives: string[] = [];
    let ancestor: { id: string; parentTreeId: string | null; objectives: string | null } | null = parentTree;
    while (ancestor) {
      if (ancestor.objectives) {
        ancestorObjectives.push(ancestor.objectives);
      }
      if (!ancestor.parentTreeId) break;
      ancestor = await prisma.tree.findUnique({
        where: { id: ancestor.parentTreeId },
        select: { id: true, parentTreeId: true, objectives: true },
      });
    }
    if (ancestorObjectives.length > 0) {
      await prisma.tree.update({
        where: { id: subTree.id },
        data: { objectives: ancestorObjectives.join('\n') },
      });
    }

    // ── B5: Notify parent tree via Telegram ───────────────────────────────
    if (parentTree.telegramChatId && telegramBot) {
      try {
        await telegramBot.api.sendMessage(
          parentTree.telegramChatId,
          `🌿 Nuevo sub-árbol vinculado: *${subTree.name}*`,
          { parse_mode: 'Markdown' },
        );
      } catch (tgErr: any) {
        console.error(`[createSubTree] Telegram notify failed for parent ${parentTreeId}:`, tgErr.message);
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: subTree.id,
      action: 'SUBTREE_CREATED',
      entityType: 'Tree',
      entityId: subTree.id,
      afterJson: { id: subTree.id, name: subTree.name, parentTreeId },
      metadataJson: getRequestMetadata(req, { parentTreeId, result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(subTree);
  } catch (error: any) {
    console.error('[createSubTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create subtree', detail: error?.message || String(error) });
  }
};

export const getTreeHierarchy = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;

    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      include: {
        childTrees: {
          include: {
            _count: { select: { members: true } },
            childTrees: {
              include: {
                _count: { select: { members: true } },
              },
            },
          },
        },
        parentTree: { select: { id: true, name: true, icono: true } },
      },
    });

    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    res.json(tree);
  } catch (error: any) {
    console.error('[getTreeHierarchy] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get tree hierarchy', detail: error?.message || String(error) });
  }
};

// ── Budget Allocation ────────────────────────────────────────────────────────

export const setBudgetAllocation = async (req: any, res: Response) => {
  try {
    const parentTreeId = req.params.treeId;
    const { childTreeId, percentage } = req.body;
    const userId = req.user!.id;

    if (percentage === undefined || typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      return res.status(400).json({ error: 'Percentage must be a number between 0 and 100' });
    }

    // Verify parent tree exists and user is admin
    const parentTree = await prisma.tree.findUnique({ where: { id: parentTreeId } });
    if (!parentTree) return res.status(404).json({ error: 'Parent tree not found' });

    const isAdmin = await prisma.treeMember.findFirst({
      where: { treeId: parentTreeId, userId, role: 'ADMIN' },
    });
    if (!isAdmin) return res.status(403).json({ error: 'Must be admin of parent tree' });

    // Validate childTree is actually a child of parentTree
    const childTree = await prisma.tree.findFirst({
      where: { id: childTreeId, parentTreeId },
    });
    if (!childTree) return res.status(400).json({ error: 'Not a child of this tree' });

    // Validate percentages don't exceed 100%
    const existingAllocations = await prisma.budgetAllocation.findMany({
      where: { parentTreeId },
    });
    const otherTotal = existingAllocations
      .filter(a => a.childTreeId !== childTreeId)
      .reduce((sum, a) => sum + a.percentage, 0);

    if (otherTotal + percentage > 100) {
      return res.status(400).json({
        error: `Total would be ${otherTotal + percentage}%. Max 100%. Currently allocated: ${otherTotal}%`,
      });
    }

    // Upsert allocation
    const allocation = await prisma.budgetAllocation.upsert({
      where: { childTreeId },
      create: { parentTreeId, childTreeId, percentage },
      update: { percentage, updatedAt: new Date() },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: parentTreeId,
      action: 'BUDGET_ALLOCATION_SET',
      entityType: 'BudgetAllocation',
      entityId: allocation.id,
      afterJson: { childTreeId, percentage, parentTreeId },
      metadataJson: getRequestMetadata(req, { childTreeId, percentage, result: 'success' }),
      source: 'USER',
    });

    res.json(allocation);
  } catch (error: any) {
    console.error('[setBudgetAllocation] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to set budget allocation', detail: error?.message || String(error) });
  }
};

export const getBudgetOverview = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;

    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      include: {
        childTrees: {
          include: {
            _count: { select: { members: true } },
            budgetAllocationsChild: {
              where: { parentTreeId: treeId },
            },
          },
        },
      },
    });

    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const totalBudget = tree.totalBudget || 0;
    const children = tree.childTrees.map((child: any) => {
      const allocation = child.budgetAllocationsChild?.[0];
      const percentage = allocation?.percentage || 0;
      const amount = totalBudget * (percentage / 100);
      return {
        id: child.id,
        name: child.name,
        icono: child.icono,
        percentage,
        amount,
        members: child._count?.members || 0,
      };
    });

    const totalAllocated = children.reduce((sum: number, c: any) => sum + c.percentage, 0);

    res.json({
      treeId: tree.id,
      treeName: tree.name,
      totalBudget,
      unallocated: Math.max(0, 100 - totalAllocated),
      children,
    });
  } catch (error: any) {
    console.error('[getBudgetOverview] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get budget overview', detail: error?.message || String(error) });
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

// ── Talent Migration (T22) ───────────────────────────────────────────────────

export const getMigrationSuggestions = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;

    const suggestions = await (prisma as any).talentMigrationSuggestion.findMany({
      where: { fromTreeId: treeId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const formatted = await Promise.all(
      suggestions.map(async (s: any) => {
        const [member, fromTree, toTree] = await Promise.all([
          (prisma as any).treeMember.findUnique({
            where: { id: s.memberId },
            select: { userId: true, user: { select: { username: true } } },
          }),
          (prisma as any).tree.findUnique({
            where: { id: s.fromTreeId },
            select: { id: true, name: true },
          }),
          (prisma as any).tree.findUnique({
            where: { id: s.toTreeId },
            select: { id: true, name: true },
          }),
        ]);

        const improvement =
          s.currentRate > 0
            ? `+${Math.round(((s.betterRate - s.currentRate) / s.currentRate) * 100)}%`
            : "N/A";

        return {
          id: s.id,
          member: member?.user?.username || member?.userId || "unknown",
          skill: s.skillTag,
          currentTree: fromTree?.name || s.fromTreeId,
          currentRate: s.currentRate,
          suggestedTree: toTree?.name || s.toTreeId,
          suggestedRate: s.betterRate,
          improvement,
          createdAt: s.createdAt,
        };
      })
    );

    res.json({ suggestions: formatted });
  } catch (error: any) {
    console.error("[getMigrationSuggestions] ERROR:", error?.message || error);
    res.status(500).json({
      error: "Failed to get migration suggestions",
      detail: error?.message || String(error),
    });
  }
};

// ── Skill Pricing (T21) ─────────────────────────────────────────────────────

export const getSkillPricing = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;

    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, name: true },
    });

    if (!tree) {
      return res.status(404).json({ error: "Tree not found" });
    }

    const pricing = await prisma.skillPricing.findMany({
      where: { treeId },
      orderBy: { ratePerHour: "desc" },
    });

    const skills = pricing.map((p) => ({
      skill: p.skillTag,
      rate: p.ratePerHour,
      demand: p.demandLevel,
      supply: p.supplyCount,
      level: p.demandLevel,
    }));

    res.json({
      treeName: tree.name,
      skills,
    });
  } catch (error: any) {
    console.error("[getSkillPricing]", error);
    res.status(500).json({
      error: "Failed to get skill pricing",
      detail: error?.message || String(error),
    });
  }
};

// ── Managed Servers (SSH) ─────────────────────────────────────────────────

export const getTreeServers = async (req: any, res: Response) => {
  try {
    const { id: treeId } = req.params;

    const servers = await prisma.managedServer.findMany({
      where: { treeId },
      select: {
        id: true,
        name: true,
        ip: true,
        port: true,
        status: true,
        lastCheck: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(servers);
  } catch (error: any) {
    console.error("[getTreeServers]", error);
    res.status(500).json({ error: "Failed to get tree servers" });
  }
};

// ── User-scoped tree queries ─────────────────────────────────────────────

/** GET /api/users/:telegramUserId/trees — trees where a user is an active member */
// ── Interaction Mode ───────────────────────────────────────────────────────

export const changeInteractionMode = async (req: any, res: Response) => {
  try {
    const { treeId } = req.params;
    const { mode } = req.body;

    const validModes = ["MAXIMUM", "MEDIUM", "MINIMUM"];
    if (!mode || !validModes.includes(mode)) {
      return res.status(400).json({
        error: `Invalid mode. Must be one of: ${validModes.join(", ")}`,
      });
    }

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: "Tree not found" });

    // Only tree creator or admin can change interaction mode
    if (tree.creatorId !== req.user.id) {
      const member = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: req.user.id, treeId } },
      });
      if (!member || member.role !== "ADMIN") {
        return res.status(403).json({
          error: "Only the tree creator or an admin can change interaction mode",
        });
      }
    }

    const updated = await prisma.tree.update({
      where: { id: treeId },
      data: { interactionMode: mode },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: "TREE_INTERACTION_MODE_CHANGED",
      entityType: "Tree",
      entityId: treeId,
      beforeJson: { interactionMode: tree.interactionMode },
      afterJson: { interactionMode: mode },
      source: "USER",
    });

    res.json({
      treeId: updated.id,
      interactionMode: updated.interactionMode,
    });
  } catch (error: any) {
    console.error("[changeInteractionMode] ERROR:", error?.message || error);
    res.status(500).json({
      error: "Failed to change interaction mode",
      detail: error?.message || String(error),
    });
  }
};

// ── User-scoped tree queries ─────────────────────────────────────────────

export const getUserTrees = async (req: Request, res: Response) => {
  try {
    const { telegramUserId } = req.params;

    const numericId = Number(telegramUserId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return res.status(400).json({ error: "Invalid telegramUserId" });
    }

    const user = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(numericId) },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const memberships = await prisma.treeMember.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      include: {
        tree: {
          select: { id: true, name: true, icono: true },
        },
      },
    });

    const trees = memberships.map((m) => m.tree);
    res.json(trees);
  } catch (error: any) {
    console.error("[getUserTrees] ERROR:", error?.message || error);
    res.status(500).json({ error: "Failed to get user trees", detail: error?.message || String(error) });
  }
};
