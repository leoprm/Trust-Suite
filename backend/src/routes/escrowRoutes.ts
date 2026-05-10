import { Router, Request, Response } from 'express';
import { checkQuorum } from '../services/escrowService';
import { authenticateJWT } from '../middleware/authMiddleware';
import { prisma } from '../index';

const router = Router({ mergeParams: true });

// ── GET /api/escrow/branch/:branchId/quorum ────────────────────────────
// Returns quorum status for a branch.
// Members must be authenticated and belong to the branch's tree.

router.get(
  '/branch/:branchId/quorum',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const branchId = String(req.params.branchId);

      // Verify branch exists and user has access via tree membership
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, treeId: true, quorumTimeoutDays: true },
      });

      if (!branch) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      // Verify user is member of the tree
      const membership = await prisma.treeMember.findUnique({
        where: {
          userId_treeId: { userId: req.user!.id, treeId: branch.treeId! },
        },
        select: { id: true },
      });

      if (!membership) {
        return res
          .status(403)
          .json({ error: 'You must be a member of this tree' });
      }

      const quorum = await checkQuorum(branchId);

      return res.json({
        branchId,
        quorumTimeoutDays: branch.quorumTimeoutDays ?? 30,
        ...quorum,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

export default router;
