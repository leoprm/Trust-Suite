import { Response } from 'express';
import { prisma } from '../index';
import { createNotification } from './notificationController';
import { computeSkillTier } from '../utils/eliteCalculator';

// ── Helper: enrich a contact user with level + strongest skill + tier ─────────
async function enrichContact(contact: any) {
  const maxLevel = contact.memberships?.length > 0
    ? Math.max(...contact.memberships.map((m: any) => m.level || 1))
    : 1;

  // Find strongest skill across all memberships (most completed tasks)
  let strongestSkill: string | null = null;
  let strongestSkillTier: string = 'INTERNO';
  let strongestSkillTreeId: string | null = null;
  let maxCount = 0;
  for (const m of contact.memberships || []) {
    const skills: string[] = JSON.parse(m.skills || '[]');
    for (const skill of skills) {
      const count = await (prisma as any).task.count({
        where: { assignedTo: contact.id, status: 'COMPLETED', branch: { treeId: m.treeId }, tags: { some: { skillName: skill } } },
      });
      if (count > maxCount) { maxCount = count; strongestSkill = skill; strongestSkillTreeId = m.treeId; }
    }
  }

  // Compute tier for the strongest skill
  if (strongestSkill && strongestSkillTreeId) {
    const { tier } = await computeSkillTier(contact.id, strongestSkill, strongestSkillTreeId);
    strongestSkillTier = tier;
  }

  return {
    id: contact.id,
    username: contact.username,
    globalLevel: maxLevel,
    strongestSkill,
    strongestSkillTier,
    memberships: contact.memberships.map((m: any) => ({
      treeId: m.treeId,
      treeName: m.tree?.name || 'Árbol',
      treeIcon: m.tree?.icono || '🌳',
      role: m.role,
    })),
  };
}

const CONTACT_INCLUDE = {
  select: {
    id: true, username: true,
    memberships: {
      select: { treeId: true, level: true, skills: true, role: true, tree: { select: { id: true, name: true, icono: true } } },
    },
  },
};

// GET /api/contacts — enriched contacts list
export const getContacts = async (req: any, res: Response) => {
  try {
    const contacts = await (prisma as any).userContact.findMany({
      where: { userId: req.user.id },
      include: { contact: CONTACT_INCLUDE },
    });
    const enriched = await Promise.all(contacts.map((c: any) => enrichContact(c.contact)));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

// POST /api/contacts/add — legacy: add via sharingCode
export const addContact = async (req: any, res: Response) => {
  try {
    const { sharingCode } = req.body;
    const contactUser = await (prisma as any).user.findUnique({ where: { sharingCode } });
    if (!contactUser) return res.status(404).json({ error: 'User not found with this code' });
    if (contactUser.id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });

    const existing = await (prisma as any).userContact.findUnique({
      where: { userId_contactId: { userId: req.user.id, contactId: contactUser.id } },
    });
    if (existing) return res.status(400).json({ error: 'Already connected' });

    // Bidirectional: create both directions
    await (prisma as any).$transaction([
      (prisma as any).userContact.create({ data: { userId: req.user.id, contactId: contactUser.id } }),
      (prisma as any).userContact.upsert({
        where: { userId_contactId: { userId: contactUser.id, contactId: req.user.id } },
        update: {},
        create: { userId: contactUser.id, contactId: req.user.id },
      }),
    ]);

    res.status(201).json({ message: 'Connected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add contact' });
  }
};

// DELETE /api/contacts/:id
export const removeContact = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    // Remove both directions
    await (prisma as any).$transaction([
      (prisma as any).userContact.deleteMany({ where: { userId: req.user.id, contactId: id } }),
      (prisma as any).userContact.deleteMany({ where: { userId: id, contactId: req.user.id } }),
    ]);
    res.json({ message: 'Contact removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove contact' });
  }
};

// ── Connection Token endpoints ────────────────────────────────────────────────

// POST /api/contacts/token — generate a 24h connection token
export const generateToken = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    // Expire old unused tokens for this user
    await (prisma as any).connectionToken.deleteMany({
      where: { userId, usedById: null, expiresAt: { lt: new Date() } },
    });

    const token = await (prisma as any).connectionToken.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });
    res.json({ token: token.token, expiresAt: token.expiresAt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
};

// POST /api/contacts/connect — consume a connection token
export const connectViaToken = async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    const currentUserId = req.user.id;

    const record = await (prisma as any).connectionToken.findUnique({ where: { token } });
    if (!record) return res.status(404).json({ error: 'Token inválido o expirado' });
    if (record.expiresAt < new Date()) {
      await (prisma as any).connectionToken.delete({ where: { id: record.id } });
      return res.status(410).json({ error: 'Este enlace ha expirado' });
    }
    if (record.usedById) return res.status(400).json({ error: 'Este token ya fue utilizado' });
    if (record.userId === currentUserId) return res.status(400).json({ error: 'No puedes conectarte contigo mismo' });

    // Check if already connected
    const existing = await (prisma as any).userContact.findUnique({
      where: { userId_contactId: { userId: currentUserId, contactId: record.userId } },
    });
    if (existing) return res.status(400).json({ error: 'Ya estás conectado con esta persona' });

    // Mark token as used
    await (prisma as any).connectionToken.update({
      where: { id: record.id },
      data: { usedById: currentUserId, usedAt: new Date() },
    });

    // Create bidirectional contact
    await (prisma as any).$transaction([
      (prisma as any).userContact.create({ data: { userId: currentUserId, contactId: record.userId } }),
      (prisma as any).userContact.upsert({
        where: { userId_contactId: { userId: record.userId, contactId: currentUserId } },
        update: {},
        create: { userId: record.userId, contactId: currentUserId },
      }),
    ]);

    // Get names for notifications
    const [creator, connector] = await Promise.all([
      (prisma as any).user.findUnique({ where: { id: record.userId }, select: { username: true } }),
      (prisma as any).user.findUnique({ where: { id: currentUserId }, select: { username: true } }),
    ]);

    // Notify both users (Green/Árbol category)
    await Promise.all([
      createNotification({
        userId: record.userId,
        type: 'CONNECTION',
        category: 'ARBOL',
        title: 'Nueva conexión establecida',
        body: `Nueva conexión establecida con ${connector?.username || 'alguien'}`,
      }),
      createNotification({
        userId: currentUserId,
        type: 'CONNECTION',
        category: 'ARBOL',
        title: 'Nueva conexión establecida',
        body: `Nueva conexión establecida con ${creator?.username || 'alguien'}`,
      }),
    ]);

    res.json({ message: 'Conexión establecida', connectedWith: creator?.username });
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect' });
  }
};
