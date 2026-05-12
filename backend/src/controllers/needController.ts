import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { searchNeeds as searchNeedsService } from '../services/needSearchService';

export const createNeed = async (req: any, res: Response) => {
  try {
    const { title, description, treeIds, proposesHashtag, externalReferences } = req.body;
    
    if (treeIds && treeIds.length > 0) {
      const memberships = await prisma.treeMember.findMany({
        where: { userId: req.user.id, treeId: { in: treeIds } },
        include: { tree: true }
      });
      
      if (memberships.length !== treeIds.length || memberships.some((m: any) => m.status !== 'VERIFIED')) {
        return res.status(403).json({ error: 'Debes ser un miembro Verificado en todos los árboles seleccionados para poder crear necesidades' });
      }

      // Protocolo Asimov: AI no crea Needs, EXCEPTO en árboles AI_COUNCIL
      const aiMemberships = memberships.filter((m: any) => m.isAI);
      if (aiMemberships.length > 0) {
        const nonAICouncilTrees = aiMemberships.filter((m: any) => m.tree.treeType !== 'AI_COUNCIL');
        if (nonAICouncilTrees.length > 0) {
          return res.status(403).json({ error: 'Protocolo Asimov: Un AI no puede crear Needs en árboles NORMAL. Solo en AI_COUNCIL.' });
        }
      }

      for (const m of memberships) {
        const tree = m.tree as any;
        
        if (!tree.creacionRamaComunitaria) {
          return res.status(403).json({ error: `La creación comunitaria está deshabilitada en el árbol '${tree.name}'. Los administradores dirigen las propuestas directamente.` });
        }

        if (proposesHashtag && !tree.allowHashtags) {
          return res.status(403).json({ error: `El árbol '${tree.name}' no permite proponer Hashtags.` });
        }
        if (!proposesHashtag && !tree.allowTraditionalBranches) {
          return res.status(403).json({ error: `El árbol '${tree.name}' solo permite Hashtags (#). No puedes proponer ramas tradicionales.` });
        }
      }
    }

    // Create the Need
    const needData: any = {
      title,
      description,
      creatorId: req.user.id,
      proposesHashtag: proposesHashtag || false,
    };

    // Validate and include externalReferences if provided
    if (externalReferences) {
      if (!Array.isArray(externalReferences)) {
        return res.status(400).json({ error: 'externalReferences must be a JSON array' });
      }
      needData.externalReferences = externalReferences;
    }

    const need = await (prisma as any).need.create({ data: needData });

    // Link the Need to multiple Trees
    if (treeIds && treeIds.length > 0) {
      await prisma.needTree.createMany({
        data: treeIds.map((treeId: string) => ({
          needId: need.id,
          treeId
        }))
      });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: treeIds?.[0] ?? null,
      action: 'NEED_CREATED',
      entityType: 'Need',
      entityId: need.id,
      afterJson: { id: need.id, title: need.title, proposesHashtag: need.proposesHashtag },
      metadataJson: getRequestMetadata(req, { treeIds: treeIds || [], result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(need);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create Need' });
  }
};

export const getNeeds = async (req: any, res: Response) => {
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
      if (!userId) return res.status(401).json({ error: 'Auth required to list all needs' });
      const memberships = await prisma.treeMember.findMany({
        where: { userId },
        select: { treeId: true }
      });
      targetTreeIds = memberships.map((m: any) => m.treeId);
    }

    // Filter needs
    const needs = await prisma.need.findMany({
      where: {
        treeLinks: {
          some: { 
            treeId: { in: targetTreeIds } 
          }
        }
      },
      include: {
        creator: { select: { username: true } },
        treeLinks: { include: { tree: { select: { id: true, name: true } } } },
        _count: { select: { ideas: true, fundings: true } },
        ideas: {
          select: { id: true, branch: { select: { id: true } } },
          orderBy: { likesCount: 'desc' },
          take: 1
        }
      }
    });

    // Attach branchId to the need directly for easy frontend access
    const formatted = needs.map((n: any) => ({
      ...n,
      branchId: n.ideas[0]?.branch?.id ?? null
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Needs' });
  }
};

export const assignPointsToNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params; // Need ID
    const { points, treeId } = req.body; // Points to assign, and which Tree the user is spending points from

    if (points <= 0) return res.status(400).json({ error: 'Points must be positive' });

    // Validate membership and points available
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this tree' });
    }

    if (membership.status !== 'VERIFIED') {
      return res.status(403).json({ error: 'Debes ser un ciudadano Verificado para asignar puntos' });
    }

    if (membership.availableNeedPoints < points) {
      return res.status(400).json({ error: 'Not enough points available this month' });
    }

    // Deduct points from user's tree membership
    await prisma.treeMember.update({
      where: { id: membership.id },
      data: { availableNeedPoints: membership.availableNeedPoints - points }
    });

    // Record the funding
    await prisma.needFunding.create({
      data: {
        userId: req.user.id,
        needId: id,
        treeId,
        points
      }
    });

    // Add points to Need
    const updatedNeed = await (prisma as any).need.update({
      where: { id },
      data: { 
        totalPointsAssigned: { increment: points },
        pointsAllocated: { increment: points }
      }
    });

    // ── Pipeline thresholds ──────────────────────────────────────────────
    // Detect concentration: user put >85% of their weekly points in this need → ×2
    const allUserFundings = await prisma.needFunding.findMany({
      where: { userId: req.user.id, treeId },
      include: { need: { select: { id: true, status: true } } },
    });

    let totalUserPointsInTree = 0;
    let pointsInThisNeed = 0;
    for (const f of allUserFundings) {
      totalUserPointsInTree += f.points;
      if (f.needId === id && ['ACTIVE', 'IN_PROGRESS', 'SEDIMENTED'].includes(f.need.status)) {
        pointsInThisNeed += f.points;
      }
    }
    // Include the just-assigned points
    pointsInThisNeed += points;
    totalUserPointsInTree += points;

    const concentrationRatio = totalUserPointsInTree > 0
      ? pointsInThisNeed / totalUserPointsInTree
      : 0;
    const isConcentrated = concentrationRatio >= 0.85;

    // People equivalent (×2 if concentrated)
    const peopleEquivalent = isConcentrated ? 2 : 1;

    const finalNeed = await (prisma as any).need.update({
      where: { id },
      data: {
        totalPeopleEquivalent: { increment: peopleEquivalent },
      },
    });

    // Check relevance threshold: 10% of tree points OR 200 people equivalent
    if (!finalNeed.relevanceThresholdMet) {
      // Get total available points across all members in this tree
      const treeMembers = await prisma.treeMember.findMany({
        where: { treeId, status: 'VERIFIED' },
        select: { availableNeedPoints: true },
      });
      const totalTreeAvailablePoints = treeMembers.reduce((sum, m) => sum + m.availableNeedPoints, 0);
      const tenPercentOfTree = Math.ceil(totalTreeAvailablePoints * 0.1);

      if (finalNeed.totalPeopleEquivalent >= 200 || finalNeed.totalPointsAssigned >= tenPercentOfTree) {
        await (prisma as any).need.update({
          where: { id },
          data: { 
            relevanceThresholdMet: true,
            relevanceMetAt: new Date(),
          },
        });

        void logEvent({
          ...getRequestContext(req),
          treeId,
          action: 'NEED_RELEVANCE_MET',
          entityType: 'Need',
          entityId: id,
          metadataJson: {
            totalPeopleEquivalent: finalNeed.totalPeopleEquivalent + peopleEquivalent,
            totalPoints: finalNeed.totalPointsAssigned,
            tenPercentTree: tenPercentOfTree,
            triggeredBy: finalNeed.totalPeopleEquivalent >= 200 ? 'people' : 'points',
          },
          source: 'SYSTEM',
        });
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'NEED_VOTED',
      entityType: 'Need',
      entityId: id,
      afterJson: { totalPointsAssigned: updatedNeed.totalPointsAssigned },
      metadataJson: getRequestMetadata(req, { points, result: 'success' }),
      source: 'USER',
    });

    // Hashtag Promotion Logic
    if (updatedNeed.proposesHashtag && updatedNeed.totalPointsAssigned >= 100 && updatedNeed.status === 'ACTIVE') {
      // Auto-promote to hashtag branch
      await prisma.need.update({
        where: { id },
        data: { status: 'IN_PROGRESS' }
      });

      const idea = await prisma.idea.create({
        data: {
          needId: updatedNeed.id,
          creatorId: updatedNeed.creatorId,
          title: updatedNeed.title,
          description: updatedNeed.description
        }
      });

      await (prisma as any).branch.create({
        data: {
          ideaId: idea.id,
          isHashtag: true,
          activePhasesJson: '["INVESTIGATION"]',
          phase: 'INVESTIGATION'
        }
      });
    }

    res.json({ message: `Successfully assigned ${points} points to Need`, updatedNeed });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign points' });
  }
};

export const updateNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    const need = await prisma.need.findUnique({ where: { id } });
    if (!need) return res.status(404).json({ error: 'Need not found' });
    if (need.creatorId !== req.user.id) return res.status(403).json({ error: 'Solo el creador puede modificar esta necesidad' });
    if (need.status !== 'ACTIVE') return res.status(400).json({ error: 'Solo se pueden modificar necesidades activas' });

    const updated = await prisma.need.update({
      where: { id },
      data: { 
        title: title || undefined, 
        description: description || undefined 
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: null,
      action: 'NEED_UPDATED',
      entityType: 'Need',
      entityId: id,
      beforeJson: { title: need.title, description: need.description },
      afterJson: { title: updated.title, description: updated.description },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update Need' });
  }
};

export const deleteNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const need = await prisma.need.findUnique({ 
      where: { id },
      include: { fundings: true, treeLinks: true }
    });

    if (!need) return res.status(404).json({ error: 'Need not found' });
    if (need.creatorId !== req.user.id) return res.status(403).json({ error: 'Solo el creador puede eliminar esta necesidad' });
    if (need.status !== 'ACTIVE') return res.status(400).json({ error: 'Solo se pueden eliminar necesidades activas' });

    // Refund points to members
    for (const funding of need.fundings) {
      const targetTreeId = funding.treeId || need.treeLinks[0]?.treeId; // Fallback to first linked tree for legacy data
      if (targetTreeId) {
        await prisma.treeMember.update({
          where: { userId_treeId: { userId: funding.userId, treeId: targetTreeId } },
          data: { availableNeedPoints: { increment: funding.points } }
        }).catch(err => console.error(`Failed to refund points to user ${funding.userId} in tree ${targetTreeId}:`, err));
      }
    }

    // Delete the Need
    await prisma.need.delete({ where: { id } });

    res.json({ message: 'Need deleted and points refunded successfully' });
  } catch (error) {
    console.error('deleteNeed Error:', error);
    res.status(500).json({ error: 'Failed to delete Need' });
  }
};

export const getHashtagProposals = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;
    if (!treeId) return res.status(400).json({ error: 'treeId is required' });

    const proposals = await prisma.need.findMany({
      where: {
        proposesHashtag: true,
        status: 'ACTIVE',
        treeLinks: { some: { treeId } }
      },
      include: {
        creator: { select: { username: true } },
        _count: { select: { fundings: true } }
      },
      orderBy: { totalPointsAssigned: 'desc' }
    });

    res.json(proposals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hashtag proposals' });
  }
};

export const getNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const need = await prisma.need.findUnique({
      where: { id },
      include: {
        creator: { select: { username: true } },
        treeLinks: { include: { tree: { select: { id: true, name: true } } } },
        _count: { select: { ideas: true, fundings: true } },
        ideas: {
          select: { id: true, branch: { select: { id: true } } },
          orderBy: { likesCount: 'desc' },
          take: 1,
        },
      },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const formatted = {
      ...need,
      branchId: (need as any).ideas[0]?.branch?.id ?? null,
    };
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Need' });
  }
};

export const searchNeeds = async (req: any, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await searchNeedsService(q.trim());
    res.json(results);
  } catch (error) {
    console.error('searchNeeds error:', error);
    res.status(500).json({ error: 'Failed to search Needs' });
  }
};
