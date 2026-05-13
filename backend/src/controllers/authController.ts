import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Authentication will fail.');
  throw new Error('JWT_SECRET is required');
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;

// ── Refresh Token Helpers ────────────────────────────────────────────────────

function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function storeRefreshToken(userId: string): Promise<string> {
  const { raw, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { tokenHash: hash, userId, expiresAt },
  });
  return raw;
}

async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function getUserWithPoints(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        memberships: {
          select: { id: true, treeId: true, xp: true, level: true, status: true, role: true }
        }
      }
    });

    if (!user) return null;

    return user;
  } catch (error) {
    console.error('getUserWithPoints error:', error);
    throw error;
  }
}

// ── Auth Endpoints ───────────────────────────────────────────────────────────

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existingUser) return res.status(400).json({ error: 'Username or email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    const role = adminCount === 0 ? 'ADMIN' : 'USER';

    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword, role }
    });

    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = await storeRefreshToken(user.id);
    const fullUser = await getUserWithPoints(user.id);
    void logEvent({
      ...getRequestContext(req),
      actorId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      afterJson: { id: user.id, username: user.username, email: user.email, role: user.role },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.status(201).json({ accessToken, refreshToken, user: fullUser });
  } catch (error: any) {
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: email }, { username: email }] }
    });

    if (!user) {
      void logEvent({
        ...getRequestContext(req),
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        metadataJson: getRequestMetadata(req, { reason: 'user_not_found' }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.password) return res.status(401).json({ error: 'Este usuario no tiene contraseña (cuenta de invitado).' });

    // ── Account lockout: 5+ failed attempts in last 15 min = temporary block ──
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentAttempts = await prisma.loginAttempt.count({
      where: {
        userId: user.id,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentAttempts >= 5) {
      void logEvent({
        ...getRequestContext(req),
        actorId: user.id,
        action: 'USER_LOGIN_LOCKED',
        entityType: 'User',
        entityId: user.id,
        metadataJson: getRequestMetadata(req, { reason: 'account_locked', recentAttempts }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await prisma.loginAttempt.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket.remoteAddress || null,
        },
      });
      void logEvent({
        ...getRequestContext(req),
        actorId: user.id,
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        metadataJson: getRequestMetadata(req, { reason: 'invalid_password' }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Successful login — clear all previous failed attempts
    await prisma.loginAttempt.deleteMany({
      where: { userId: user.id },
    });

    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = await storeRefreshToken(user.id);
    const fullUser = await getUserWithPoints(user.id);
    void logEvent({
      ...getRequestContext(req),
      actorId: user.id,
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.json({ accessToken, refreshToken, user: fullUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const getMe = async (req: any, res: Response) => {
  try {
    const fullUser = await getUserWithPoints(req.user.id);
    if (!fullUser) return res.status(404).json({ error: 'User not found' });
    res.json(fullUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const guestJoin = async (req: Request, res: Response) => {
  try {
    const { token, username } = req.body;

    if (!token || !username) {
      return res.status(400).json({ error: 'Faltan datos requeridos (token o nombre de usuario)' });
    }

    // 1. Buscar y validar el token
    const tokenRecord = await prisma.tokenInvitacion.findUnique({
      where: { id: token }
    });

    if (!tokenRecord) {
      return res.status(404).json({ error: 'Enlace inválido o no encontrado' });
    }

    if (tokenRecord.usado) {
      return res.status(403).json({ error: 'Este enlace ya ha sido utilizado.' });
    }

    if (tokenRecord.expiresAt && new Date() > new Date(tokenRecord.expiresAt)) {
      return res.status(403).json({ error: 'Este enlace ha expirado.' });
    }

    // Comprobar si el nombre de usuario ya existe
    const existingUser = await prisma.user.findFirst({
      where: { username }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Ese nombre ya está en uso. Por favor, elige otro apodo.' });
    }

    // 2. Marcar token como usado y crear usuario
    const [_, user] = await prisma.$transaction([
      prisma.tokenInvitacion.update({
        where: { id: token },
        data: { usado: true }
      }),
      prisma.user.create({
        data: {
          username,
          role: 'USER'
        }
      })
    ]);

    // 3. Agregar el usuario al árbol
    await prisma.treeMember.create({
      data: {
        userId: user.id,
        treeId: tokenRecord.arbolId,
        invitedById: tokenRecord.creadorId,
        status: 'ACTIVE',
      }
    });

    // 4. Iniciar sesión automágica
    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = await storeRefreshToken(user.id);
    const fullUser = await getUserWithPoints(user.id);

    res.status(201).json({ accessToken, refreshToken, user: fullUser });
  } catch (error: any) {
    console.error('Guest join error:', error);
    res.status(500).json({ error: 'No se pudo procesar tu invitación. Intenta de nuevo más tarde.' });
  }
};

// ── Refresh Token Rotation ───────────────────────────────────────────────────

export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    // Hash the incoming token to look it up
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (stored.revokedAt) {
      // Token reuse detected — revoke ALL refresh tokens for this user (breach mitigation)
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      void logEvent({
        ...getRequestContext(req),
        actorId: stored.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'User',
        entityId: stored.userId,
        metadataJson: getRequestMetadata(req, { tokenHash }),
        severity: 'CRITICAL',
        source: 'SYSTEM',
      });
      return res.status(401).json({ error: 'Refresh token already used — all sessions revoked' });
    }

    if (new Date() > new Date(stored.expiresAt)) {
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Revoke the old refresh token
    await revokeRefreshToken(tokenHash);

    // Fetch the user
    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Issue new pair (rotation)
    const newAccessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const newRefreshToken = await storeRefreshToken(user.id);

    void logEvent({
      ...getRequestContext(req),
      actorId: user.id,
      action: 'TOKEN_REFRESHED',
      entityType: 'User',
      entityId: user.id,
      metadataJson: getRequestMetadata(req),
      source: 'USER',
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error: any) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

export const getSessionToken = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const user = await getUserWithPoints(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const crossToken = jwt.sign(
      { id: user.id, role: user.role, type: 'cross-app' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'SESSION_TOKEN_GENERATED',
      entityType: 'User',
      entityId: userId,
      metadataJson: getRequestMetadata(req),
      source: 'USER',
    });

    res.json({ crossToken, expiresIn: 900 });
  } catch (error: any) {
    console.error('getSessionToken error:', error);
    res.status(500).json({ error: 'Failed to generate session token' });
  }
};

export const crossLogin = async (req: Request, res: Response) => {
  try {
    const { crossToken } = req.body;
    if (!crossToken) return res.status(400).json({ error: 'crossToken is required' });

    let payload: any;
    try {
      payload = jwt.verify(crossToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired cross-token' });
    }

    if (payload.type !== 'cross-app') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await getUserWithPoints(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = await storeRefreshToken(user.id);

    void logEvent({
      ...getRequestContext(req),
      actorId: user.id,
      action: 'CROSS_LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      metadataJson: getRequestMetadata(req),
      source: 'USER',
    });

    res.json({ accessToken, refreshToken, user });
  } catch (error: any) {
    console.error('crossLogin error:', error);
    res.status(500).json({ error: 'Cross-login failed' });
  }
};
