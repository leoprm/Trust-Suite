import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { prisma } from '../index';

type TokenPayload = JwtPayload & {
  id?: string;
  userId?: string;
  role?: string;
  isGuest?: boolean;
};

function normalizeAuthUser(payload?: string | JwtPayload): Express.Request['user'] | null {
  if (!payload || typeof payload === 'string') {
    return null;
  }

  const tokenPayload = payload as TokenPayload;
  const id = tokenPayload.id ?? tokenPayload.userId;
  if (!id) {
    return null;
  }

  return {
    id,
    role: tokenPayload.role,
    isGuest: tokenPayload.isGuest,
  };
}

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET as string, (err, payload) => {
      if (err) {
        return res.status(403).json({ error: 'invalid token' });
      }

      const user = normalizeAuthUser(payload);
      if (!user) {
        return res.status(403).json({ error: 'invalid token payload' });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: 'auth header missing' });
  }
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET as string, (err, payload) => {
      if (!err && payload) {
        const user = normalizeAuthUser(payload);
        if (user) {
          req.user = user;
        }
      }
      next();
    });
  } else {
    next();
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'ADMINISTRATOR') {
    next();
  } else {
    res.status(403).json({ error: 'admin privileges required' });
  }
};

/**
 * Middleware that blocks non-paying members from premium features.
 * Premium features: paid tasks, berry rewards, tree fund participation.
 * 
 * RED LINE (Trust DNA): Non-payers KEEP FULL governance power.
 * They can still vote, be elected, and participate in the pipeline.
 * 
 * Requires authenticateJWT to run first (sets req.user).
 * Requires req.params to contain a tree identifier (:id, :treeId, or :tree_id).
 */
/**
 * Middleware that checks if the authenticated user is a server admin.
 * Server admins are defined in GlobalFeeConfig.serverAdminIds (JSON array of user IDs).
 */
export const requireServerAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const config = await prisma.globalFeeConfig.findUnique({
      where: { id: 'default' },
      select: { serverAdminIds: true },
    });

    if (!config) {
      return res.status(500).json({ error: 'GlobalFeeConfig not initialized' });
    }

    const adminIds: string[] = (config.serverAdminIds as string[]) || [];
    if (!adminIds.includes(userId)) {
      return res.status(403).json({ error: 'Server admin privileges required' });
    }

    next();
  } catch (err) {
    console.error('[requireServerAdmin] Error:', err);
    res.status(500).json({ error: 'Failed to verify server admin status' });
  }
};

/**
 * Middleware that checks if the authenticated user is a member of the tree
 * referenced in the request params (:id, :treeId, or :tree_id).
 */
export const requireTreeMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const treeId = req.params.id || req.params.treeId || req.params.tree_id;
    if (!treeId) {
      return res.status(400).json({ error: 'Tree context required' });
    }

    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: treeId as string } },
      select: { status: true },
    });

    if (!member) {
      return res.status(403).json({ error: 'Tree membership required' });
    }

    next();
  } catch (err) {
    console.error('[requireTreeMember] Error:', err);
    res.status(500).json({ error: 'Failed to verify tree membership' });
  }
};

export const isPayingMemberRequired = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const treeId = req.params.id || req.params.treeId || req.params.tree_id;
    if (!treeId) {
      return res.status(400).json({ error: 'Tree context required for membership check' });
    }

    const member = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { isPayingMember: true, subscriptionStatus: true },
    });

    if (!member) {
      return res.status(403).json({ error: 'No eres miembro de este Tree' });
    }

    if (!member.isPayingMember) {
      return res.status(403).json({
        error: 'Acceso exclusivo para miembros activos. Tu suscripción está en estado ' + member.subscriptionStatus + '.',
        subscriptionStatus: member.subscriptionStatus,
      });
    }

    next();
  } catch (err) {
    console.error('[isPayingMemberRequired] Error:', err);
    res.status(500).json({ error: 'Failed to verify membership status' });
  }
};
