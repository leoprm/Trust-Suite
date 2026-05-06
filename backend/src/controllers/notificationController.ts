import { Request, Response } from 'express';
import { prisma } from '../index';

// ── GET /notifications ────────────────────────────────────────────────────────
// Query: ?category=URGENTE|FLUJO|MERITO  &limit=50  &before=<isoDate>
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { category, limit, before } = req.query;

    const where: any = { userId };
    if (category && ['URGENTE', 'FLUJO', 'MERITO'].includes(category as string)) {
      where.category = category;
    }
    if (before) {
      where.createdAt = { lt: new Date(before as string) };
    }

    const notifications = await (prisma as any).notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
    });

    res.json(notifications);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /notifications/unread-count ───────────────────────────────────────────
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await (prisma as any).notification.count({
      where: { userId, isRead: false },
    });
    res.json({ count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── PATCH /notifications/:id/read ─────────────────────────────────────────────
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await (prisma as any).notification.updateMany({
      where: { id: req.params.id, userId },
      data: { isRead: true },
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── PATCH /notifications/read-all ─────────────────────────────────────────────
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await (prisma as any).notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── Helper: create notification (used by other controllers) ───────────────────
export const createNotification = async (data: {
  userId: string;
  type: string;
  category: string;
  title: string;
  body: string;
  entityType?: string;
  entityAction?: string;
  entityId?: string;
}) => {
  try {
    await (prisma as any).notification.create({ data });
  } catch (e) {
    console.error('Failed to create notification:', e);
  }
};
