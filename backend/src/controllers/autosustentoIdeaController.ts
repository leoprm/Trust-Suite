import { Request, Response } from 'express';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import {
  addSupport,
  approveIdea,
  archiveIdea,
  assertNoIdeaAuthorityEffects,
  canManageAutosustentoIdea,
  canProposeAutosustentoIdea,
  convertIdeaToBranch,
  createAutosustentoIdea,
  getAutosustentoIdea,
  getSupportSummary,
  listAutosustentoIdeas,
  rejectIdea,
  removeSupport,
  submitForReview,
  updateAutosustentoIdea,
} from '../services/autosustentoIdeaService';

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireMember(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (!(await canProposeAutosustentoIdea(userId, treeId, req.user?.role))) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'AutosustentoIdea',
      metadataJson: getRequestMetadata(req, { reason: 'tree_member_required' }),
      severity: 'WARNING',
    });
    res.status(403).json({ error: 'Tree membership required' });
    return null;
  }
  return { userId };
}

async function requireAdmin(req: Request, res: Response, treeId: string) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (!(await canManageAutosustentoIdea(userId, treeId, req.user?.role))) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'AutosustentoIdea',
      metadataJson: getRequestMetadata(req, { reason: 'tree_admin_required' }),
      severity: 'WARNING',
    });
    res.status(403).json({ error: 'Tree admin required' });
    return null;
  }
  return { userId };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trees/:treeId/autosustento-ideas
// ─────────────────────────────────────────────────────────────────────────────

export const listAutosustentoIdeasController = async (req: Request, res: Response) => {
  try {
    const treeId = String(req.params.treeId || '');
    const access = await requireMember(req, res, treeId);
    if (!access) return;
    const ideas = await listAutosustentoIdeas(treeId, access.userId);
    res.json(ideas);
  } catch (err: any) {
    console.error('[AutosustentoIdea] list:', err);
    res.status(500).json({ error: 'Failed to list Autosustento Ideas' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trees/:treeId/autosustento-ideas
// ─────────────────────────────────────────────────────────────────────────────

export const createAutosustentoIdeaController = async (req: Request, res: Response) => {
  const treeId = String(req.params.treeId || '');
  try {
    const access = await requireMember(req, res, treeId);
    if (!access) return;

    assertNoIdeaAuthorityEffects(req.body);
    const idea = await createAutosustentoIdea(treeId, access.userId, req.body);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AUTOSUSTENTO_IDEA_CREATED',
      entityType: 'AutosustentoIdea',
      entityId: idea.id,
      afterJson: { ideaId: idea.id, title: idea.title, status: idea.status, treeId },
      metadataJson: getRequestMetadata(req, { treeId, ideaId: idea.id }),
    });

    res.status(201).json(idea);
  } catch (err: any) {
    console.error('[AutosustentoIdea] create:', err);
    res.status(400).json({ error: err.message || 'Failed to create Autosustento Idea' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/autosustento-ideas/:ideaId
// ─────────────────────────────────────────────────────────────────────────────

export const getAutosustentoIdeaController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const ideaId = String(req.params.ideaId || '');
    const idea = await getAutosustentoIdea(ideaId, userId);
    if (!idea) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireMember(req, res, idea.treeId);
    if (!access) return;

    res.json(idea);
  } catch (err: any) {
    console.error('[AutosustentoIdea] get:', err);
    res.status(500).json({ error: 'Failed to get Autosustento Idea' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/autosustento-ideas/:ideaId
// ─────────────────────────────────────────────────────────────────────────────

export const updateAutosustentoIdeaController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId, req.user?.id);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    // Creators can edit while PROPOSED/GATHERING_SUPPORT; admins can edit in more states
    const userId = req.user?.id;
    if (!userId) return void res.status(401).json({ error: 'Authentication required' });

    const isAdmin = await canManageAutosustentoIdea(userId, existing.treeId, req.user?.role);
    const isCreator = existing.createdById === userId;
    const editableStatuses = ['PROPOSED', 'GATHERING_SUPPORT', 'UNDER_REVIEW'];

    if (!isAdmin && !isCreator) {
      return void res.status(403).json({ error: 'Only the creator or an admin can edit this idea' });
    }
    if (!isAdmin && !editableStatuses.includes(existing.status)) {
      return void res.status(403).json({ error: `Ideas in status ${existing.status} can only be edited by an admin` });
    }

    assertNoIdeaAuthorityEffects(req.body);
    const updated = await updateAutosustentoIdea(ideaId, req.body);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_UPDATED',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, status: updated.status },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId }),
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AutosustentoIdea] update:', err);
    res.status(400).json({ error: err.message || 'Failed to update Autosustento Idea' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/autosustento-ideas/:ideaId/submit-review
// ─────────────────────────────────────────────────────────────────────────────

export const submitForReviewController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireAdmin(req, res, existing.treeId);
    if (!access) return;

    const updated = await submitForReview(ideaId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_SUBMITTED_FOR_REVIEW',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, status: 'UNDER_REVIEW', treeId: existing.treeId },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId }),
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AutosustentoIdea] submit-review:', err);
    res.status(400).json({ error: err.message || 'Failed to submit idea for review' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/autosustento-ideas/:ideaId/approve
// ─────────────────────────────────────────────────────────────────────────────

export const approveIdeaController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireAdmin(req, res, existing.treeId);
    if (!access) return;

    const updated = await approveIdea(ideaId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_APPROVED',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, status: 'APPROVED', treeId: existing.treeId },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId }),
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AutosustentoIdea] approve:', err);
    res.status(400).json({ error: err.message || 'Failed to approve idea' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/autosustento-ideas/:ideaId/reject
// ─────────────────────────────────────────────────────────────────────────────

export const rejectIdeaController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireAdmin(req, res, existing.treeId);
    if (!access) return;

    const updated = await rejectIdea(ideaId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_REJECTED',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, status: 'REJECTED', treeId: existing.treeId },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId }),
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AutosustentoIdea] reject:', err);
    res.status(400).json({ error: err.message || 'Failed to reject idea' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/autosustento-ideas/:ideaId/archive
// ─────────────────────────────────────────────────────────────────────────────

export const archiveIdeaController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireAdmin(req, res, existing.treeId);
    if (!access) return;

    const updated = await archiveIdea(ideaId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_ARCHIVED',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, status: 'ARCHIVED', treeId: existing.treeId },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId }),
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AutosustentoIdea] archive:', err);
    res.status(400).json({ error: err.message || 'Failed to archive idea' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/autosustento-ideas/:ideaId/convert-to-branch
// ─────────────────────────────────────────────────────────────────────────────

export const convertToBranchController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireAdmin(req, res, existing.treeId);
    if (!access) return;

    const result = await convertIdeaToBranch(ideaId, access.userId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_CONVERTED_TO_BRANCH',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: {
        ideaId,
        status: 'CONVERTED_TO_BRANCH',
        convertedBranchId: result.idea.convertedBranchId,
        treeId: existing.treeId,
      },
      metadataJson: getRequestMetadata(req, {
        treeId: existing.treeId,
        ideaId,
        convertedBranchId: result.idea.convertedBranchId,
      }),
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('[AutosustentoIdea] convert-to-branch:', err);
    res.status(400).json({ error: err.message || 'Failed to convert idea to Branch' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/autosustento-ideas/:ideaId/support
// ─────────────────────────────────────────────────────────────────────────────

export const addSupportController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireMember(req, res, existing.treeId);
    if (!access) return;

    const { supportType } = req.body;
    await addSupport(ideaId, access.userId, supportType);
    const summary = await getSupportSummary(ideaId, access.userId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_SUPPORTED',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, supportType, treeId: existing.treeId },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId, supportType }),
    });

    res.json(summary);
  } catch (err: any) {
    console.error('[AutosustentoIdea] add-support:', err);
    res.status(400).json({ error: err.message || 'Failed to add support' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/autosustento-ideas/:ideaId/support/:supportType
// ─────────────────────────────────────────────────────────────────────────────

export const removeSupportController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const supportType = req.params.supportType;
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const access = await requireMember(req, res, existing.treeId);
    if (!access) return;

    await removeSupport(ideaId, access.userId, supportType);
    const summary = await getSupportSummary(ideaId, access.userId);

    void logEvent({
      ...getRequestContext(req),
      treeId: existing.treeId,
      action: 'AUTOSUSTENTO_IDEA_SUPPORT_REMOVED',
      entityType: 'AutosustentoIdea',
      entityId: ideaId,
      afterJson: { ideaId, supportType, treeId: existing.treeId },
      metadataJson: getRequestMetadata(req, { treeId: existing.treeId, ideaId, supportType }),
    });

    res.json(summary);
  } catch (err: any) {
    console.error('[AutosustentoIdea] remove-support:', err);
    res.status(400).json({ error: err.message || 'Failed to remove support' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/autosustento-ideas/:ideaId/support-summary
// ─────────────────────────────────────────────────────────────────────────────

export const getSupportSummaryController = async (req: Request, res: Response) => {
  try {
    const ideaId = String(req.params.ideaId || '');
    const existing = await getAutosustentoIdea(ideaId);
    if (!existing) return void res.status(404).json({ error: 'Idea not found' });

    const userId = req.user?.id;
    const access = await requireMember(req, res, existing.treeId);
    if (!access) return;

    const summary = await getSupportSummary(ideaId, userId);
    res.json(summary);
  } catch (err: any) {
    console.error('[AutosustentoIdea] support-summary:', err);
    res.status(500).json({ error: 'Failed to get support summary' });
  }
};
