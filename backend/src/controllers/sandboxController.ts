import { Request, Response } from 'express';
import { TreeSandbox, PortPoolExhaustedError } from '../services/treeSandbox';
import { logEvent, getRequestContext } from '../services/eventLogService';
import { prisma } from '../index';

/**
 * POST /api/trees/:id/sandbox
 * Creates a sandbox for the given tree: directories + port + DB record.
 * JWT required.
 */
export const createTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Verify tree exists (TreeSandbox.create does this too, but we want a friendly 404)
    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const sb = await TreeSandbox.create(id);

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_CREATED',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'USER',
    });

    res.status(201).json(sb);
  } catch (error: any) {
    if (error instanceof PortPoolExhaustedError) {
      return res.status(507).json({ error: error.message });
    }
    console.error('[createTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create sandbox' });
  }
};

/**
 * GET /api/trees/:id/sandbox/health
 * Returns whether the sandbox's app is responding at localhost:{port}/health.
 * Public (no JWT required).
 */
export const healthCheckTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const healthy = await TreeSandbox.health(id);
    res.json({ treeId: id, healthy });
  } catch (error: any) {
    console.error('[healthCheckTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Health check failed' });
  }
};

/**
 * GET /api/trees/:id/sandbox
 * Returns sandbox info: port, status, workspacePath.
 */
export const getTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const sb = await TreeSandbox.get(id);

    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    res.json(sb);
  } catch (error: any) {
    console.error('[getTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get sandbox' });
  }
};

/**
 * DELETE /api/trees/:id/sandbox
 * Removes sandbox workspace directory and DB record.
 * Only tree creator can delete.
 */
export const removeTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Authority check: only tree creator
    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the tree creator can delete the sandbox' });
    }

    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found' });
    }

    await TreeSandbox.destroy(id);

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_DELETED',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'USER',
    });

    res.json({ message: 'Sandbox deleted', workspacePath: sb.workspacePath });
  } catch (error: any) {
    console.error('[removeTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to delete sandbox' });
  }
};
