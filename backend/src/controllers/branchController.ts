import { Request, Response } from 'express';
import { prisma } from '../index';
import { calculateConsensusValue } from '../utils/consensusEngine';
import { redistributeTreeBudget } from '../utils/economicEngine';
import { syncBerriesBalance } from '../utils/berriesEngine';
import { canViewUserPrivacyLevel, redactTaskEvidenceFields, withDefaultPrivacySettings } from '../utils/privacy';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { updateQuorumTimeoutDays } from '../services/branchService';

const PHASE_ORDER = ['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'DISTRIBUTION', 'MAINTENANCE', 'RECYCLING'];

async function redactBranchTaskEvidence(task: any, viewerId?: string, viewerRole?: string) {
  if (!task.assignedTo || task.assignedTo === viewerId) return task;

  const owner = await (prisma as any).user.findUnique({
    where: { id: task.assignedTo },
    select: { privacySettings: true },
  });
  const privacy = withDefaultPrivacySettings(task.assignedTo, owner?.privacySettings);
  const canViewEvidence = await canViewUserPrivacyLevel({
    level: privacy.evidenceVisibility,
    ownerId: task.assignedTo,
    viewerId,
    viewerRole,
  });

  return canViewEvidence ? task : redactTaskEvidenceFields(task);
}

// GET /api/branches — all branches visible to the logged-in user
export const getBranches = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;
    const userId = req.user?.id;
    let targetTreeIds: string[] = [];

    if (treeId) {
      const tId = treeId as string;
      const tree = await prisma.tree.findUnique({ where: { id: tId } });
      if (!tree) return res.status(404).json({ error: 'Tree not found' });
      
      if (tree.visibility === 'PRIVATE') {
        if (!userId) return res.status(401).json({ error: 'Auth required for private trees' });
        const membership = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId, treeId: tId } }
        });
        if (!membership) return res.status(403).json({ error: 'Access denied' });
      }
      targetTreeIds = [tId];
    } else {
      if (!userId) return res.status(401).json({ error: 'Auth required to view all branches' });
      const memberships = await prisma.treeMember.findMany({
        where: { userId },
        select: { treeId: true }
      });
      targetTreeIds = memberships.map((m: any) => m.treeId);
    }

    const branches = await (prisma as any).branch.findMany({
      where: {
        OR: [
          {
            idea: {
              need: {
                treeLinks: { 
                  some: { 
                    treeId: { in: targetTreeIds } 
                  } 
                }
              }
            }
          },
          {
            treeId: { in: targetTreeIds }
          }
        ]
      },
      include: {
        idea: {
          select: {
            id: true,
            title: true,
            likesCount: true,
            need: {
              select: { id: true, title: true, totalPointsAssigned: true, status: true }
            }
          }
        },
        members: { select: { userId: true, joinedPhases: true } },
        autosustentoConfig: { include: { split: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(branches);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
};

// PATCH /api/branches/:id/phase — advance or set phase (branch members or admin only)
export const updateBranchPhase = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { phase } = req.body;

    if (!PHASE_ORDER.includes(phase)) {
      return res.status(400).json({ error: `Invalid phase. Must be one of: ${PHASE_ORDER.join(', ')}` });
    }

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } }
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Allow branch members or the idea creator — for now anyone authenticated in the tree
    const updated = await prisma.branch.update({
      where: { id },
      data: { phase: phase as any }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: (branch as any).treeId ?? null,
      action: 'BRANCH_UPDATED',
      entityType: 'Branch',
      entityId: id,
      beforeJson: { phase: branch.phase },
      afterJson: { phase: updated.phase },
      metadataJson: getRequestMetadata(req, { changedField: 'phase', result: 'success' }),
      source: 'USER',
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update branch phase' });
  }
};


// POST /api/branches/:id/phases/:phase/join
export const joinBranchPhase = async (req: any, res: Response) => {
  try {
    const { id, phase } = req.params;
    if (!PHASE_ORDER.includes(phase)) {
      return res.status(400).json({ error: 'Invalid phase' });
    }

    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    let member = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: req.user.id, branchId: id } }
    });

    if (!member) {
       member = await prisma.branchMember.create({
         data: { userId: req.user.id, branchId: id, joinedPhases: JSON.stringify([phase]) }
       });
    } else {
       let joined = [];
       try { joined = JSON.parse(member.joinedPhases || '[]'); } catch {}
       if (!joined.includes(phase)) {
         joined.push(phase);
         member = await prisma.branchMember.update({
           where: { id: member.id },
           data: { joinedPhases: JSON.stringify(joined) }
         });
       }
    }

    // If the branch had an expiration timer, clear it because it's now "taken"
    if (branch.expiresAt) {
      await prisma.branch.update({
        where: { id },
        data: { expiresAt: null }
      });
    }

    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to join branch phase' });
  }
};

// GET /api/branches/:id/tasks
export const getBranchTasks = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { phase } = req.query;
    const userId = req.user?.id;

    const branch = await (prisma as any).branch.findUnique({
      where: { id },
      include: { idea: { include: { need: { include: { treeLinks: true } } } } }
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Tree-owned branches (hashtags, direct branches, autosustento) use Tree access instead of Need/Idea access.
    if (branch.treeId) {
      const tree = await prisma.tree.findUnique({ where: { id: branch.treeId } });
      if (!tree) return res.status(404).json({ error: 'Tree not found' });
      if (tree.visibility === 'PRIVATE') {
        if (!userId) return res.status(401).json({ error: 'Auth required for private trees' });
        const membership = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId: branch.treeId } } });
        if (!membership) return res.status(403).json({ error: 'Access denied' });
      }
      const tasks = await prisma.task.findMany({
        where: { branchId: id, ...(phase ? { phase: phase as any } : {}) },
        include: { tags: true },
        orderBy: { createdAt: 'desc' }
      });
      const redactedTasks = await Promise.all(tasks.map((task: any) => redactBranchTaskEvidence(task, userId, req.user?.role)));
      return res.json(redactedTasks);
    }

    const treeIds = branch.idea.need.treeLinks.map((tl: any) => tl.treeId);
    const trees = await prisma.tree.findMany({ where: { id: { in: treeIds } } });
    
    let canView = false;
    for (const tree of trees) {
      if (tree.visibility === 'PUBLIC') { canView = true; break; }
      if (tree.visibility === 'PRIVATE' && userId) {
        const mem = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId: tree.id } } });
        if (mem) { canView = true; break; }
      }
    }

    if (!canView) return res.status(403).json({ error: 'Access denied' });

    const tasks = await prisma.task.findMany({
      where: { branchId: id, ...(phase ? { phase: phase as any } : {}) },
      include: { 
        tags: true,
        difficultyVotes: {
          include: {
            _count: { select: { likes: true } },
            likes: { where: { userId: userId || '' }, select: { userId: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const tasksWithLikes = await Promise.all(tasks.map(async (t: any) => redactBranchTaskEvidence({
      ...t,
      difficultyVotes: t.difficultyVotes.map((v: any) => ({
        ...v,
        likesCount: v._count.likes,
        isLikedByMe: v.likes.length > 0
      }))
    }, userId, req.user?.role)));

    res.json(tasksWithLikes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branch tasks' });
  }
};

// POST /api/branches/hashtag — Admin creates a hashtag branch directly (no Need->Idea flow)
export const createHashtagBranch = async (req: any, res: Response) => {
  try {
    const { treeId, name, sourceNeedId } = req.body;

    // Only tree creator or admin can create hashtag branches directly
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const policy = (tree as any).hashtagCreationPolicy;
    if (policy === 'USERS_ONLY') {
      return res.status(403).json({ error: 'La política del árbol no permite que los administradores creen hashtags directamente. Deben nacer de una votación.' });
    }

    if (tree.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Solo el creador del árbol puede crear hashtags directamente.' });
    }

    let branchName = `#${name}`;
    let branchDescription: string | undefined;
    let linkedNeedId: string | undefined;

    // If sourceNeedId is provided, validate and auto-populate from approved Need
    if (sourceNeedId) {
      const need = await prisma.need.findUnique({
        where: { id: sourceNeedId },
        include: { treeLinks: true },
      });

      if (!need) return res.status(404).json({ error: 'Source Need not found' });
      if (need.auditStatus !== 'APPROVED') return res.status(400).json({ error: 'Source Need must be APPROVED before creating a hashtag branch from it' });

      // Verify need belongs to this tree
      const linked = need.treeLinks.some((tl: any) => tl.treeId === treeId);
      if (!linked) return res.status(400).json({ error: 'Source Need is not linked to this tree' });

      // Auto-generate name from Need title if no name provided
      if (!name) {
        const slug = need.title
          .toLowerCase()
          .replace(/[^a-z0-9áéíóúñü\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 80);
        branchName = `#${slug}`;
      }

      // Build description from Need
      const refsText = need.externalReferences && Array.isArray(need.externalReferences)
        ? '\n\nReferencias:\n' + (need.externalReferences as any[]).map((r: any) => `- ${r.title}: ${r.url}`).join('\n')
        : '';
      branchDescription = `${need.description}${refsText}`;

      linkedNeedId = sourceNeedId;
    }

    // Hashtag branches are now created directly without an associated Need/Idea
    const branch = await (prisma as any).branch.create({
      data: {
        treeId,
        name: branchName,
        description: branchDescription,
        isHashtag: true,
        type: 'HASHTAG',
        phase: 'DEVELOPMENT',
        activePhasesJson: '["DEVELOPMENT"]',
        sourceNeedId: linkedNeedId,
      }
    });

    // TRIGGER: Redistribuir presupuesto al crear una nueva rama
    await redistributeTreeBudget(treeId);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'FIAT_REPUTATION_EFFECT_BLOCKED',
      entityType: 'Branch',
      entityId: branch.id,
      metadataJson: getRequestMetadata(req, {
        reason: 'branch_xp_pool_is_not_fiat_investment',
        rule: 'fiat_does_not_generate_xp_or_authority',
      }),
      severity: 'INFO',
      source: 'SYSTEM',
    });

    res.status(201).json(branch);
  } catch (error) {
    console.error('createHashtagBranch error:', error);
    res.status(500).json({ error: 'Failed to create hashtag branch' });
  }
};

// GET /api/branches/hashtags?treeId=&q= — Search hashtag branches for autocomplete
export const searchHashtagBranches = async (req: any, res: Response) => {
  try {
    const { treeId, q } = req.query as { treeId: string; q?: string };

    const branches = await (prisma as any).branch.findMany({
      where: {
        isHashtag: true,
        treeId,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {})
      },
      take: 10
    });

    res.json(branches.map((b: any) => ({
      id: b.id,
      name: b.name?.replace(/^#/, '') || '',
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to search hashtags' });
  }
};

export const deleteBranch = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const branch = await (prisma as any).branch.findUnique({
      where: { id },
      include: { idea: { include: { need: { include: { treeLinks: true } } } } }
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // For now, specifically targeting hashtag branches as requested
    if (!branch.isHashtag) {
      return res.status(400).json({ error: 'Solo se pueden eliminar ramas de tipo Hashtag por este medio.' });
    }

    const treeId = branch.treeId || branch.idea?.need?.treeLinks[0]?.treeId;
    if (!treeId) return res.status(400).json({ error: 'Rama huérfana (sin árbol)' });

    const tree = branch.tree || await prisma.tree.findUnique({ where: { id: treeId } });
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } }
    });

    const isCreator = tree?.creatorId === req.user.id;
    const isAdmin = (membership as any)?.role === 'ADMIN';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar esta rama.' });
    }

    await (prisma as any).branch.delete({ where: { id } });

    // TRIGGER: Redistribuir presupuesto tras eliminar una rama
    await redistributeTreeBudget(treeId);

    res.json({ message: 'Rama hashtag eliminada correctamente' });
  } catch (error) {
    console.error('deleteBranch error:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
};

export const voteBranchNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { score } = req.body;
    const userId = req.user.id;

    if (score < 1 || score > 10) {
      return res.status(400).json({ error: 'El voto debe estar entre 1 y 10' });
    }

    const vote = await prisma.branchNeedVote.upsert({
      where: { branchId_userId: { branchId: id, userId } },
      update: { score },
      create: { branchId: id, userId, score }
    });

    // --- INTEGRACIÓN: Motor de Consenso ---
    // Recuperamos la rama y la cantidad total de miembros en el árbol para calcular el Quorum
    const branch = await (prisma as any).branch.findUnique({
      where: { id },
      include: { tree: { include: { _count: { select: { members: true } } } } }
    });

    if (branch && branch.tree) {
      // Obtenemos todos los puntajes emitidos
      const allVotes = await prisma.branchNeedVote.findMany({
        where: { branchId: id },
        select: { score: true }
      });
      
      const voteValues = allVotes.map(v => v.score);
      const totalTreeUsers = branch.tree._count.members;

      // Invocamos el Motor
      const consensusResult = calculateConsensusValue(totalTreeUsers, voteValues);

      if (consensusResult.quorumReached && consensusResult.newValue !== null) {
        const modoGobierno = branch.tree.modoGobierno || 'DEMOCRATICO';
        let updateData: any = {};

        // Aplicamos reglas divisionales según el esquema jerárquico/democrático
        if (modoGobierno === 'DEMOCRATICO') {
          updateData.valorOficial = consensusResult.newValue;
          
        } else if (modoGobierno === 'ADMIN') {
          updateData.valorSugerido = consensusResult.newValue;
          
        } else if (modoGobierno === 'HIBRIDO') {
          if (branch.esVotable) {
            updateData.valorOficial = consensusResult.newValue;
          } else {
            updateData.valorSugerido = consensusResult.newValue;
          }
        }

        // Si procede alguna actualización del consenso, la volcamos a la tabla de ramificaciones
        if (Object.keys(updateData).length > 0) {
          await (prisma as any).branch.update({
            where: { id },
            data: updateData
          });

          // TRIGGER: El valorOficial cambió → redistribuir presupuesto del árbol
          if (updateData.valorOficial !== undefined) {
            await redistributeTreeBudget(branch.treeId || branch.tree?.id);
          }
        }
      }
    }

    res.json(vote);
  } catch (error) {
    console.error('voteBranchNeed error:', error);
    res.status(500).json({ error: 'Error al registrar el voto de necesidad' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/branches/:id/inject-berries — Inject berries into an existing branch
// Body: { amount }
// Syncs oxidation before deducting. Adds to branch bayasFund.
// ═══════════════════════════════════════════════════════════════════════════════
export const injectBerries = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const branch = await (prisma as any).branch.findUnique({
      where: { id },
      include: { idea: { include: { need: { include: { treeLinks: true } } } } },
    });
    if (!branch) return res.status(404).json({ error: 'Rama no encontrada' });

    const treeId = branch.treeId || branch.idea?.need?.treeLinks?.[0]?.treeId;
    if (!treeId) return res.status(400).json({ error: 'Rama sin árbol asociado' });

    const membership = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!membership) return res.status(403).json({ error: 'No eres miembro de este árbol' });

    // Sync oxidation to get real balance
    const realBalance = await syncBerriesBalance(membership.id);
    if (realBalance < amount) {
      return res.status(400).json({
        error: 'Saldo de Berries insuficiente',
        code: 'INSUFFICIENT_BERRIES',
        available: parseFloat(realBalance.toFixed(2)),
      });
    }

    // Deduct from member and add to branch
    await (prisma as any).treeMember.update({
      where: { id: membership.id },
      data: {
        bayasBalance: { decrement: amount },
        lastBerriesUpdate: new Date(),
      },
    });

    const updatedBranch = await (prisma as any).branch.update({
      where: { id },
      data: { bayasFund: { increment: amount } },
    });

    console.log(`[injectBerries] User ${userId} injected ${amount} berries into branch ${id}`);
    res.json({ message: 'Berries inyectadas', bayasFund: updatedBranch.bayasFund, newBalance: realBalance - amount });
  } catch (error) {
    console.error('injectBerries error:', error);
    res.status(500).json({ error: 'Error al inyectar Berries' });
  }
};

// PATCH /api/branches/:id/quorum-timeout — configurar quorumTimeoutDays (solo en DEVELOPMENT)
export const updateBranchQuorumTimeout = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    const userId = req.user!.id;

    if (days === undefined || days === null) {
      return res.status(400).json({ error: 'days field is required' });
    }

    const updated = await updateQuorumTimeoutDays(id, Number(days), userId);
    res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('only be configured in DEVELOPMENT') ||
        error.message?.includes('must be an integer between')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Branch not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('updateBranchQuorumTimeout error:', error);
    res.status(500).json({ error: 'Failed to update quorum timeout' });
  }
};
