import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// Helper to build the investigation task description from idea resource estimates
function buildInvestigationDescription(idea: any): string {
  const lines = [
    `🔍 Investigation Task for: "${idea.title}"`,
    ``,
    `This task was automatically created when the idea was promoted to a Branch.`,
    `Verify and refine the following initial estimates:`,
    ``,
  ];
  if (idea.requiredPeople) lines.push(`👥 People needed: ~${idea.requiredPeople}`);

  let skills: string[] = [];
  try { skills = JSON.parse(idea.requiredSkills || '[]'); } catch {}
  if (skills.length > 0) lines.push(`🛠️ Skills: ${skills.join(', ')}`);

  if (idea.estimatedMaterials) lines.push(`📦 Materials: ${idea.estimatedMaterials}`);
  if (idea.estimatedFiatCost != null) lines.push(`💵 Estimated cost: $${idea.estimatedFiatCost}`);

  lines.push(``, `Assess feasibility, confirm or adjust these numbers, and report findings to the Branch.`);
  return lines.join('\n');
}

// Auto-create an Investigation task for a newly promoted Branch
async function createInvestigationTask(branchId: string, idea: any, treeId?: string) {
  let skills: string[] = [];
  try { skills = JSON.parse(idea.requiredSkills || '[]'); } catch {}

  const task = await prisma.task.create({
    data: {
      branchId,
      description: buildInvestigationDescription(idea),
      tags: skills.length > 0
        ? { create: skills.map((s: string) => ({ skillName: s })) }
        : undefined
    }
  });

  // Assign to 3 random skill-matched members of this tree
  const treeMembers = treeId
    ? await prisma.treeMember.findMany({
        where: { treeId },
        select: { userId: true, skills: true }
      })
    : [];



  let eligible = skills.length > 0
    ? treeMembers.filter((m: any) => {
        try {
          const ms: string[] = JSON.parse(m.skills || '[]');
          return skills.some((s: string) => ms.includes(s));
        } catch { return false; }
      })
    : treeMembers;

  if (eligible.length < 3) eligible = treeMembers;
  const selected = eligible.sort(() => 0.5 - Math.random()).slice(0, 3);

  if (selected.length > 0) {
    await prisma.taskVote.createMany({
      data: selected.map((m: any) => ({ taskId: task.id, userId: m.userId, effortValue: -1 }))
    });
  }

  return task;
}

// Check if >60% tree members liked any idea → promote need to Branch
async function checkAndPromoteNeed(needId: string) {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: {
      treeLinks: true,
      ideas: {
        include: { likes: true },
        orderBy: { likesCount: 'desc' }
      }
    }
  });

  if (!need || need.status !== 'ACTIVE') return;

  const treeIds = need.treeLinks.map((tl: any) => tl.treeId);
  const allMembers = await prisma.treeMember.findMany({
    where: { treeId: { in: treeIds } },
    select: { userId: true }
  });
  const uniqueMemberIds = new Set(allMembers.map((m: any) => m.userId));
  const totalMembers = uniqueMemberIds.size;
  if (totalMembers === 0) return;

  const allLikes = need.ideas.flatMap((idea: any) => idea.likes.map((l: any) => l.userId));
  const uniqueLikers = new Set(allLikes);
  if (uniqueLikers.size / totalMembers <= 0.6) return;

  // --- PROMOTION ---
  const top3 = need.ideas.slice(0, 3);
  const top1 = top3[0];
  if (!top1) return;

  const xpReward = need.totalPointsAssigned * Math.max(need.failedAttempts, 1);
  const treeId = need.treeLinks?.[0]?.treeId;

  for (const idea of top3) {
    if (treeId) {
      await prisma.treeMember.updateMany({
        where: { userId: idea.creatorId, treeId },
        data: { xp: { increment: xpReward } }
      });
    }
  }

  let branch = await prisma.branch.findUnique({ where: { ideaId: top1.id } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: { 
        ideaId: top1.id, 
        xpPool: xpReward, 
        isDesire: false, 
        bayasFund: 0,
        activePhasesJson: top1.proposedPhasesJson 
      }
      });
      // Auto-create Investigation task
      await createInvestigationTask(branch.id, top1);
      void logEvent({
        treeId: treeId ?? null,
        actorId: top1.creatorId,
        action: 'BRANCH_CREATED',
        entityType: 'Branch',
        entityId: branch.id,
        afterJson: { id: branch.id, ideaId: top1.id, xpPool: branch.xpPool },
        metadataJson: { via: 'need_promotion', needId },
        source: 'SYSTEM',
      });
    }

  await prisma.need.update({
    where: { id: needId },
    data: { status: 'IN_PROGRESS' }
  });
}

export const createIdea = async (req: any, res: Response) => {
  try {
    const { needId, title, description, requiredPeople, requiredSkills, estimatedMaterials, estimatedFiatCost, proposedPhases } = req.body;

    const need = await prisma.need.findUnique({ 
      where: { id: needId },
      include: { treeLinks: { include: { tree: true } } }
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Check VERIFIED status and Governance rules
    const treeIds = need.treeLinks.map((tl: any) => tl.treeId);
    if (treeIds.length > 0) {
      const memberships = await prisma.treeMember.findMany({
        where: { userId: req.user.id, treeId: { in: treeIds } }
      });
      if (memberships.length === 0 || memberships.some((m: any) => m.status !== 'VERIFIED')) {
        return res.status(403).json({ error: 'Debes ser un miembro Verificado para proponer ideas' });
      }

      const trees = need.treeLinks.map((tl: any) => tl.tree);
      for (const tree of trees) {
        if (!tree.creacionRamaComunitaria) {
          return res.status(403).json({ error: `La creación comunitaria está deshabilitada en el árbol '${tree.name}'.` });
        }
      }
    }

    const idea = await prisma.idea.create({
      data: {
        needId,
        title,
        description,
        creatorId: req.user.id,
        requiredPeople: requiredPeople ? Number(requiredPeople) : null,
        requiredSkills: requiredSkills ? JSON.stringify(requiredSkills) : null,
        estimatedMaterials: estimatedMaterials || null,
        estimatedFiatCost: estimatedFiatCost ? Number(estimatedFiatCost) : null,
        proposedPhasesJson: proposedPhases ? JSON.stringify(proposedPhases) : JSON.stringify(['INVESTIGATION']),
      }
    });

    // --- DIRECT ACTION FLOW ---
    // If any linked tree has DIRECT_ACTION enabled, promote immediately
    const isDirectAction = need.treeLinks.some((link: any) => {
      try {
        const settings = JSON.parse(link.tree.settings || '{}');
        return settings.governance?.needVoting === 'DIRECT_ACTION';
      } catch { return false; }
    });

    if (isDirectAction) {
      const xpReward = need.totalPointsAssigned || 0;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const branch = await prisma.branch.create({
        data: {
          ideaId: idea.id,
          xpPool: xpReward,
          isDesire: false,
          activePhasesJson: idea.proposedPhasesJson,
          expiresAt
        }
      });
      await createInvestigationTask(branch.id, idea);
      void logEvent({
        ...getRequestContext(req),
        treeId: treeIds[0] ?? null,
        action: 'BRANCH_CREATED',
        entityType: 'Branch',
        entityId: branch.id,
        afterJson: { id: branch.id, ideaId: idea.id, expiresAt: branch.expiresAt },
        metadataJson: getRequestMetadata(req, { via: 'direct_action', needId, result: 'success' }),
        source: 'USER',
      });
      
      // Update need status
      await prisma.need.update({
        where: { id: needId },
        data: { status: 'IN_PROGRESS' }
      });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: treeIds[0] ?? null,
      action: 'IDEA_CREATED',
      entityType: 'Idea',
      entityId: idea.id,
      afterJson: { id: idea.id, needId, title: idea.title },
      metadataJson: getRequestMetadata(req, { treeIds, result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(idea);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create Idea' });
  }
};

export const getIdeasForNeed = async (req: any, res: Response) => {
  try {
    const { needId } = req.params;

    const ideas = await prisma.idea.findMany({
      where: { needId },
      orderBy: { likesCount: 'desc' },
      include: {
        creator: { select: { username: true } },
        likes: { where: { userId: req.user.id }, select: { id: true } },
        branch: { select: { id: true } }
      }
    });

    const formatted = ideas.map((idea: any) => ({
      ...idea,
      hasLiked: idea.likes.length > 0,
      requiredSkills: (() => { try { return JSON.parse(idea.requiredSkills || '[]'); } catch { return []; } })()
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
};

export const toggleLikeIdea = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const idea = await prisma.idea.findUnique({ 
      where: { id },
      include: { need: { include: { treeLinks: true } } }
    });
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    // Check VERIFIED status
    const treeIds = idea.need.treeLinks.map((tl: any) => tl.treeId);
    if (treeIds.length > 0) {
      const memberships = await prisma.treeMember.findMany({
        where: { userId, treeId: { in: treeIds } }
      });
      if (memberships.length === 0 || memberships.some((m: any) => m.status !== 'VERIFIED')) {
        return res.status(403).json({ error: 'Debes ser un miembro Verificado para poder votar' });
      }
    }

    const existing = await prisma.ideaLike.findUnique({
      where: { ideaId_userId: { ideaId: id, userId } }
    });

    if (existing) {
      await prisma.ideaLike.delete({ where: { id: existing.id } });
      await prisma.idea.update({ where: { id }, data: { likesCount: { decrement: 1 } } });
      void logEvent({
        ...getRequestContext(req),
        treeId: treeIds[0] ?? null,
        action: 'IDEA_VOTED',
        entityType: 'Idea',
        entityId: id,
        metadataJson: getRequestMetadata(req, { vote: 'removed', result: 'success' }),
        source: 'USER',
      });
      return res.json({ message: 'Idea unliked', promoted: false });
    } else {
      await prisma.ideaLike.create({ data: { ideaId: id, userId } });
      await prisma.idea.update({ where: { id }, data: { likesCount: { increment: 1 } } });
      await checkAndPromoteNeed(idea.needId);
      const updatedNeed = await prisma.need.findUnique({ where: { id: idea.needId }, select: { status: true } });
      void logEvent({
        ...getRequestContext(req),
        treeId: treeIds[0] ?? null,
        action: 'IDEA_VOTED',
        entityType: 'Idea',
        entityId: id,
        metadataJson: getRequestMetadata(req, { vote: 'added', promoted: updatedNeed?.status === 'IN_PROGRESS', result: 'success' }),
        source: 'USER',
      });
      return res.json({ message: 'Idea liked', promoted: updatedNeed?.status === 'IN_PROGRESS' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle like on idea' });
  }
};

export const fundIdeaWithBayas = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { bayasAmount, treeId } = req.body;

    if (bayasAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const existingBranch = await prisma.branch.findUnique({ where: { ideaId: id } });
    if (existingBranch) return res.status(400).json({ error: 'Idea is already a branch' });

    const idea = await prisma.idea.findUnique({ where: { id }, include: { need: true } });
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } }
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of tree' });

    // Sync oxidation before checking balance
    const { syncBerriesBalance } = await import('../utils/berriesEngine');
    const realBalance = await syncBerriesBalance(membership.id);
    if (realBalance < bayasAmount) {
      return res.status(400).json({ error: 'Saldo de Berries insuficiente (tras oxidación)', available: parseFloat(realBalance.toFixed(2)) });
    }

    await prisma.treeMember.update({
      where: { id: membership.id },
      data: { bayasBalance: { decrement: bayasAmount }, lastBerriesUpdate: new Date() }
    });

    const branch = await prisma.branch.create({
      data: { 
        ideaId: id, 
        xpPool: 0, 
        isDesire: true, 
        bayasFund: bayasAmount,
        activePhasesJson: idea.proposedPhasesJson 
      }
    });

    await prisma.branchMember.create({
      data: { userId: req.user.id, branchId: branch.id }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'BRANCH_CREATED',
      entityType: 'Branch',
      entityId: branch.id,
      afterJson: { id: branch.id, ideaId: id, isDesire: branch.isDesire, bayasFund: branch.bayasFund },
      metadataJson: getRequestMetadata(req, { via: 'bayas_funding', bayasAmount, result: 'success' }),
      source: 'USER',
    });

    res.json({ message: 'Funded! Idea turned into a Desire Branch', branch });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fund idea' });
  }
};
