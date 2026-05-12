import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { searchNeeds as searchNeedsService } from '../services/needSearchService';

export const createNeed = async (req: any, res: Response) => {
  try {
    const { title, description, treeId, proposesHashtag } = req.body;
    
    if (!treeId) {
      return res.status(400).json({ error: 'treeId es requerido — en v2 una necesidad pertenece a un solo árbol' });
    }

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } },
      include: { tree: true }
    });

    if (!membership || membership.status !== 'VERIFIED') {
      return res.status(403).json({ error: 'Debes ser un miembro Verificado en el árbol para crear necesidades' });
    }

    // Protocolo Asimov: AI no crea Needs, EXCEPTO en árboles AI_COUNCIL
    if ((membership as any).isAI) {
      const tree = membership.tree as any;
      if (tree.treeType !== 'AI_COUNCIL') {
        return res.status(403).json({ error: 'Protocolo Asimov: Un AI no puede crear Needs en árboles NORMAL. Solo en AI_COUNCIL.' });
      }
    }

    const tree = membership.tree as any;

    if (!tree.creacionRamaComunitaria) {
      return res.status(403).json({ error: `La creación comunitaria está deshabilitada en el árbol '${tree.name}'. Los administradores dirigen las propuestas directamente.` });
    }

    if (proposesHashtag && !tree.allowHashtags) {
      return res.status(403).json({ error: `El árbol '${tree.name}' no permite proponer Hashtags.` });
    }
    if (!proposesHashtag && !tree.allowTraditionalBranches) {
      return res.status(403).json({ error: `El árbol '${tree.name}' solo permite Hashtags (#). No puedes proponer ramas tradicionales.` });
    }

    // Create the Need — v2: single tree, no pipeline fields
    const needData: any = {
      title,
      description,
      creatorId: req.user.id,
      treeId,
      proposesHashtag: proposesHashtag || false,
    };

    const need = await (prisma as any).need.create({ data: needData });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'NEED_CREATED',
      entityType: 'Need',
      entityId: need.id,
      afterJson: { id: need.id, title: need.title, proposesHashtag: need.proposesHashtag, treeId },
      metadataJson: getRequestMetadata(req, { treeId, result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(need);
  } catch (error) {
    console.error('[createNeed] error:', error);
    res.status(500).json({ error: 'Failed to create Need' });
  }
};

export const getNeeds = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;
    const userId = req.user?.id;

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

      // v2: single treeId, direct lookup
      const needs = await prisma.need.findMany({
        where: { treeId: tId },
        include: {
          creator: { select: { username: true } },
          _count: { select: { fundings: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(needs);
    }

    // No treeId: needs from all user's trees
    if (!userId) return res.status(401).json({ error: 'Auth required to list all needs' });
    
    const memberships = await prisma.treeMember.findMany({
      where: { userId },
      select: { treeId: true }
    });
    const userTreeIds = memberships.map((m: any) => m.treeId);

    const needs = await prisma.need.findMany({
      where: { treeId: { in: userTreeIds } },
      include: {
        creator: { select: { username: true } },
        _count: { select: { fundings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(needs);
  } catch (error) {
    console.error('[getNeeds] error:', error);
    res.status(500).json({ error: 'Failed to fetch Needs' });
  }
};

export const assignPointsToNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { points } = req.body;

    if (!points || points <= 0) return res.status(400).json({ error: 'Points must be positive' });

    const need = await prisma.need.findUnique({ where: { id } });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const treeId = (need as any).treeId;
    if (!treeId) return res.status(400).json({ error: 'Need has no associated tree' });

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } }
    });

    if (!membership) return res.status(403).json({ error: 'Not a member of this tree' });
    if (membership.status !== 'VERIFIED') return res.status(403).json({ error: 'Debes ser un ciudadano Verificado para asignar puntos' });
    if (membership.availableNeedPoints < points) return res.status(400).json({ error: 'Not enough points available this month' });

    // Deduct points
    await prisma.treeMember.update({
      where: { id: membership.id },
      data: { availableNeedPoints: membership.availableNeedPoints - points }
    });

    // Record funding
    await prisma.needFunding.create({
      data: { userId: req.user.id, needId: id, treeId, points }
    });

    // Add points to Need
    const updatedNeed = await (prisma as any).need.update({
      where: { id },
      data: { pointsAllocated: { increment: points } }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'NEED_VOTED',
      entityType: 'Need',
      entityId: id,
      afterJson: { pointsAllocated: updatedNeed.pointsAllocated },
      metadataJson: getRequestMetadata(req, { points, result: 'success' }),
      source: 'USER',
    });

    // Hashtag Promotion Logic (kept: auto-promote at 100 points)
    if (updatedNeed.proposesHashtag && updatedNeed.pointsAllocated >= 100 && updatedNeed.status === 'OPEN') {
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
    console.error('[assignPointsToNeed] error:', error);
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
    if (need.status !== 'OPEN') return res.status(400).json({ error: 'Solo se pueden modificar necesidades activas' });

    const updated = await prisma.need.update({
      where: { id },
      data: { 
        title: title || undefined, 
        description: description || undefined 
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: (need as any).treeId ?? null,
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
    console.error('[updateNeed] error:', error);
    res.status(500).json({ error: 'Failed to update Need' });
  }
};

export const deleteNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const need = await prisma.need.findUnique({ 
      where: { id },
      include: { fundings: true }
    });

    if (!need) return res.status(404).json({ error: 'Need not found' });
    if (need.creatorId !== req.user.id) return res.status(403).json({ error: 'Solo el creador puede eliminar esta necesidad' });
    if (need.status !== 'OPEN') return res.status(400).json({ error: 'Solo se pueden eliminar necesidades activas' });

    const treeId = (need as any).treeId;

    // Refund points to members
    for (const funding of need.fundings) {
      const targetTreeId = funding.treeId || treeId;
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
        status: 'OPEN',
        treeId: treeId as string,
      },
      include: {
        creator: { select: { username: true } },
        _count: { select: { fundings: true } }
      },
      orderBy: { pointsAllocated: 'desc' }
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
        _count: { select: { fundings: true } },
      },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    res.json(need);
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
