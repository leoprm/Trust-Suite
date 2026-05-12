import { Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ── Phase 3: Vote Importance ─────────────────────────────────────────

export const voteImportance = async (req: any, res: Response) => {
  try {
    const needId = req.params.id;
    const { score } = req.body;
    const voterUserId = req.user.id;

    // Validate score
    const parsedScore = parseInt(score, 10);
    if (isNaN(parsedScore) || parsedScore < 1 || parsedScore > 10) {
      return res.status(400).json({ error: 'Score must be an integer between 1 and 10' });
    }

    // Find the Need and its tree links
    const need = await prisma.need.findUnique({
      where: { id: needId },
      include: { treeLinks: { include: { tree: true } } },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Find an AI_COUNCIL tree that this need belongs to
    const aiCouncilLink = need.treeLinks.find((tl: any) => tl.tree.treeType === 'AI_COUNCIL');
    if (!aiCouncilLink) {
      return res.status(403).json({ error: 'This Need does not belong to an AI_COUNCIL tree' });
    }

    // Verify the voter is an AI member of that AI_COUNCIL tree
    const voterMembership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: voterUserId, treeId: aiCouncilLink.treeId } },
    });
    if (!voterMembership || !voterMembership.isAI) {
      return res.status(403).json({ error: 'Only AI members of the AI_COUNCIL tree can vote on importance' });
    }

    // Upsert the vote
    const vote = await prisma.needImportanceVote.upsert({
      where: { needId_voterId: { needId, voterId: voterMembership.id } },
      create: { needId, voterId: voterMembership.id, score: parsedScore },
      update: { score: parsedScore },
    });

    // Recalculate importanceScore: sum of all votes for this Need
    const allVotes = await prisma.needImportanceVote.findMany({
      where: { needId },
      select: { score: true },
    });
    const newScore = allVotes.reduce((sum: number, v: any) => sum + v.score, 0);

    await prisma.need.update({
      where: { id: needId },
      data: { importanceScore: newScore },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: aiCouncilLink.treeId,
      action: 'NEED_IMPORTANCE_VOTED',
      entityType: 'NeedImportanceVote',
      entityId: vote.id,
      afterJson: { needId, voterId: voterMembership.id, score: parsedScore, newTotalScore: newScore },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.status(200).json({ vote, importanceScore: newScore, voteCount: allVotes.length });
  } catch (error: any) {
    console.error('[voteImportance] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to vote on Need importance', detail: error?.message || String(error) });
  }
};

// ── Get Need Importance ──────────────────────────────────────────────

export const getNeedImportance = async (req: any, res: Response) => {
  try {
    const needId = req.params.id;

    const need = await prisma.need.findUnique({
      where: { id: needId },
      select: { id: true, title: true, importanceScore: true },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const votes = await prisma.needImportanceVote.findMany({
      where: { needId },
      include: { voter: { select: { id: true, aiProfile: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      needId: need.id,
      importanceScore: need.importanceScore,
      voteCount: votes.length,
      votes: votes.map((v: any) => ({
        voterId: v.voterId,
        voterProfile: v.voter?.aiProfile,
        score: v.score,
        createdAt: v.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('[getNeedImportance] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get Need importance', detail: error?.message || String(error) });
  }
};

// ── Get Ranked Needs ─────────────────────────────────────────────────

export const getRankedNeeds = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const { status, limit } = req.query;

    // Verify tree exists (and optionally that it's AI_COUNCIL)
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // For AI_COUNCIL trees (PUBLIC), no auth required
    const isPublicAICouncil = tree.treeType === 'AI_COUNCIL';
    if (!isPublicAICouncil && !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const needFilter: any = {
      treeLinks: { some: { treeId } },
    };
    if (status) {
      needFilter.status = status;
    }

    const needs = await prisma.need.findMany({
      where: needFilter,
      orderBy: { importanceScore: 'desc' },
      take: limit ? parseInt(limit as string, 10) : 20,
      include: {
        importanceVotes: { select: { score: true } },
        creator: { select: { username: true } },
      },
    });

    res.json(
      needs.map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        importanceScore: n.importanceScore,
        voteCount: n.importanceVotes.length,
        auditStatus: n.auditStatus,
        status: n.status,
        externalReferences: n.externalReferences,
        creator: n.creator?.username,
        createdAt: n.createdAt,
      }))
    );
  } catch (error: any) {
    console.error('[getRankedNeeds] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get ranked needs', detail: error?.message || String(error) });
  }
};

// ── Phase 4: Generate Audit Report ───────────────────────────────────

export const generateAuditReport = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.treeType !== 'AI_COUNCIL') return res.status(400).json({ error: 'Only AI_COUNCIL trees support audit reports' });
    if (tree.creatorId !== req.user.id) return res.status(403).json({ error: 'Only tree creator can generate audit reports' });

    const needs = await prisma.need.findMany({
      where: {
        treeLinks: { some: { treeId } },
        status: { not: 'RESOLVED' },
      },
      orderBy: { importanceScore: 'desc' },
      include: {
        importanceVotes: true,
        creator: { select: { username: true } },
      },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      treeId: tree.id,
      treeName: tree.name,
      needs: needs.map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        importanceScore: n.importanceScore,
        voteCount: n.importanceVotes.length,
        externalReferences: n.externalReferences,
        auditStatus: n.auditStatus,
        status: n.status,
      })),
    };

    // Store cached report on tree
    await prisma.tree.update({
      where: { id: treeId },
      data: {
        auditReportJson: report as any,
        lastAuditGeneratedAt: new Date(),
      },
    });

    // Notify tree creator
    const topNeedTitle = report.needs[0]?.title || 'none';
    const topScore = report.needs[0]?.importanceScore || 0;
    await prisma.notification.create({
      data: {
        userId: tree.creatorId!,
        type: 'GENERAL',
        category: 'FLUJO',
        title: `Monthly AI Council Audit: ${tree.name}`,
        body: `${report.needs.length} needs ranked. Top: ${topNeedTitle} (score: ${topScore})`,
        entityType: 'arbol',
        entityId: treeId,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AUDIT_REPORT_GENERATED',
      entityType: 'Tree',
      entityId: treeId,
      afterJson: { needsCount: report.needs.length },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.json(report);
  } catch (error: any) {
    console.error('[generateAuditReport] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to generate audit report', detail: error?.message || String(error) });
  }
};

// ── Phase 4: Approve/Reject Needs ────────────────────────────────────

export const approveNeeds = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const { approved = [], rejected = [] } = req.body;

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.treeType !== 'AI_COUNCIL') return res.status(400).json({ error: 'Only AI_COUNCIL trees support need approval' });
    if (tree.creatorId !== req.user.id) return res.status(403).json({ error: 'Only tree creator can approve/reject needs' });

    // Validate all need IDs belong to this tree
    const allNeedIds = [...approved, ...rejected];
    if (allNeedIds.length === 0) {
      return res.status(400).json({ error: 'No needs specified for approval/rejection' });
    }

    const needLinks = await prisma.needTree.findMany({
      where: { treeId, needId: { in: allNeedIds } },
      include: { need: true },
    });

    const linkedNeedIds = new Set(needLinks.map((nl: any) => nl.needId));
    const invalidIds = allNeedIds.filter((id: string) => !linkedNeedIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `These needs are not linked to this tree: ${invalidIds.join(', ')}` });
    }

    // Apply approvals and rejections
    if (approved.length > 0) {
      await prisma.need.updateMany({
        where: { id: { in: approved } },
        data: { auditStatus: 'APPROVED' },
      });
    }

    if (rejected.length > 0) {
      await prisma.need.updateMany({
        where: { id: { in: rejected } },
        data: { auditStatus: 'REJECTED_BY_CREATOR' },
      });
    }

    // Notify AI members about decisions
    const aiMembers = await prisma.treeMember.findMany({
      where: { treeId, isAI: true },
      select: { userId: true },
    });

    for (const member of aiMembers) {
      await prisma.notification.create({
        data: {
          userId: member.userId,
          type: 'GENERAL',
          category: 'FLUJO',
          title: `Need decisions: ${tree.name}`,
          body: `Creator approved ${approved.length} needs and rejected ${rejected.length} needs.`,
          entityType: 'arbol',
          entityId: treeId,
        },
      });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'NEEDS_APPROVED',
      entityType: 'Tree',
      entityId: treeId,
      afterJson: { approvedCount: approved.length, rejectedCount: rejected.length },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.json({ approved: approved.length, rejected: rejected.length });
  } catch (error: any) {
    console.error('[approveNeeds] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to approve/reject needs', detail: error?.message || String(error) });
  }
};

// ── Phase 6: Public Transparency ─────────────────────────────────────

export const getPublicReport = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;

    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: {
        id: true, name: true, description: true, icono: true,
        treeType: true, lastAuditGeneratedAt: true, auditReportJson: true,
        creator: { select: { username: true } },
      },
    });

    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.treeType !== 'AI_COUNCIL') return res.status(404).json({ error: 'Public reports are only available for AI_COUNCIL trees' });

    // Get all needs with votes
    const needs = await prisma.need.findMany({
      where: {
        treeLinks: { some: { treeId } },
        status: { not: 'RESOLVED' },
      },
      orderBy: { importanceScore: 'desc' },
      include: {
        importanceVotes: {
          include: { voter: { select: { id: true, aiProfile: true } } },
        },
        creator: { select: { username: true } },
        sourcedBranches: { select: { id: true, name: true, isHashtag: true } },
      },
    });

    const approved = needs.filter(n => n.auditStatus === 'APPROVED').length;
    const rejected = needs.filter(n => n.auditStatus === 'REJECTED_BY_CREATOR').length;
    const pending = needs.filter(n => n.auditStatus === 'PENDING').length;

    res.json({
      tree: {
        id: tree.id,
        name: tree.name,
        description: tree.description,
        icono: tree.icono,
        creator: tree.creator?.username,
        lastAuditGeneratedAt: tree.lastAuditGeneratedAt,
      },
      summary: {
        totalNeeds: needs.length,
        approved,
        rejected,
        pending,
      },
      needs: needs.map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        importanceScore: n.importanceScore,
        auditStatus: n.auditStatus,
        status: n.status,
        externalReferences: n.externalReferences,
        creator: n.creator?.username,
        votes: n.importanceVotes.map((v: any) => ({
          voterProfile: v.voter?.aiProfile,
          score: v.score,
          createdAt: v.createdAt,
        })),
        branches: n.sourcedBranches?.map((b: any) => ({
          id: b.id,
          name: b.name,
          isHashtag: b.isHashtag,
        })) || [],
      })),
    });
  } catch (error: any) {
    console.error('[getPublicReport] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get public report', detail: error?.message || String(error) });
  }
};
