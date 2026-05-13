import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

async function getUserWithPoints(userId: string) {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        username: true, 
        email: true, 
        role: true,
        sharingCode: true,
        is_guest: true,
        memberships: {
          select: { id: true, treeId: true, availableNeedPoints: true, status: true, xp: true, level: true, role: true }
        }
      }
    });

    if (!user) return null;

    const totalWeeklyPoints = (user as any).memberships.reduce((sum: number, membership: any) => sum + membership.availableNeedPoints, 0);
    return { ...user, totalWeeklyPoints };
  } catch (error) {
    console.error('getUserWithPoints error:', error);
    throw error;
  }
}

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existingUser) return res.status(400).json({ error: 'Username or email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const adminCount = await prisma.user.count({ where: { role: 'ADMINISTRATOR' } });
    const role = adminCount === 0 ? 'ADMINISTRATOR' : 'PERSON';

    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword, role }
    });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
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
    
    res.status(201).json({ token, user: fullUser });
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
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
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

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
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
    
    res.json({ token, user: fullUser });
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
    const tokenRecord = await (prisma as any).tokenInvitacion.findUnique({
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

    // 2. Marcar token como usado (En transacción para evitar race conditions)
    const [_, user] = await prisma.$transaction([
      (prisma as any).tokenInvitacion.update({
        where: { id: token },
        data: { usado: true }
      }),
      // 3. Crear el usuario fantasma
      prisma.user.create({
        data: {
          username,
          is_guest: true,
          role: 'PERSON'
          // email y password son nullables gracias a la migración
        }
      })
    ]);

    // 4. Agregar el usuario al árbol
    await prisma.treeMember.create({
      data: {
        userId: user.id,
        treeId: tokenRecord.arbolId,
        invitedById: tokenRecord.creadorId,
        status: 'VERIFIED', // Los invitados entran directamente verificados
        strikesEconomicos: '[]',
        skills: '[]',
        goldenTickets: '{}',
      }
    });

    // 5. Iniciar sesión automágica
    const jwtToken = jwt.sign({ id: user.id, role: user.role, isGuest: true }, JWT_SECRET, { expiresIn: '7d' });
    const fullUser = await getUserWithPoints(user.id);

    res.status(201).json({ token: jwtToken, user: fullUser });
  } catch (error: any) {
    console.error('Guest join error:', error);
    res.status(500).json({ error: 'No se pudo procesar tu invitación. Intenta de nuevo más tarde.' });
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

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    void logEvent({
      ...getRequestContext(req),
      actorId: user.id,
      action: 'CROSS_LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      metadataJson: getRequestMetadata(req),
      source: 'USER',
    });

    res.json({ token, user });
  } catch (error: any) {
    console.error('crossLogin error:', error);
    res.status(500).json({ error: 'Cross-login failed' });
  }
};
