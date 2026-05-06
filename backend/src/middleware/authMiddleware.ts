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
