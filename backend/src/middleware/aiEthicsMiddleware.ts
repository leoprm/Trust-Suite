import { Request, Response, NextFunction } from 'express';
import { requireHumanForAction } from '../services/aiEthics';

/**
 * Middleware factory: creates a gate that blocks AI members from performing
 * specific human-only actions.
 *
 * Usage in routes:
 *   router.post('/:id/rate', authenticateJWT, aiGate('RATE'), rateDeliverable);
 *
 * The middleware extracts treeId from:
 *   1. req.params.id (tree ID in path like /trees/:id/...)
 *   2. req.params.treeId
 *   3. req.body.treeId
 */
export function aiGate(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Extract treeId from multiple possible sources
      const treeId =
        req.params.treeId ||
        req.params.id ||
        req.body.treeId ||
        null;

      if (!treeId) {
        // If no tree context is available, pass through and let the controller handle it
        return next();
      }

      const result = await requireHumanForAction(userId, treeId, action);
      if (!result.allowed) {
        return res.status(403).json({ error: result.error });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware for actions where tree ID comes from the body or a specific param.
 * Use when the tree ID isn't in req.params.id but in another named param.
 */
export function aiGateWithTreeParam(action: string, paramName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const treeId = req.params[paramName] || req.body[paramName] || null;

      if (!treeId) {
        return next();
      }

      const result = await requireHumanForAction(userId, treeId, action);
      if (!result.allowed) {
        return res.status(403).json({ error: result.error });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
