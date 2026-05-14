import { Request, Response } from 'express';
import { prisma } from '../index';

// Express params can be string | string[] — normalize to single string
const paramStr = (v: string | string[]): string => (Array.isArray(v) ? v[0] : v);

// ── GET /api/users/:id/skills ────────────────────────────────────────────────
// Returns parsed skills JSON + totalXp.
// Response: { skills: { design: 45, frontend: 72 }, totalXp: 117 }
export const getUserSkills = async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { skills: true, totalXp: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let parsedSkills: Record<string, number> = {};
    if (user.skills) {
      try {
        parsedSkills = JSON.parse(user.skills);
      } catch {
        parsedSkills = {};
      }
    }

    res.json({
      skills: parsedSkills,
      totalXp: user.totalXp,
    });
  } catch (error: any) {
    console.error('[getUserSkills] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch user skills' });
  }
};

// ── GET /api/users/:id/xp ────────────────────────────────────────────────────
// Returns XP history — tasks completed by the user, derived from
// tasks where the user is assignee and status is VERIFIED or PAID.
// Response: { xpHistory: [{ taskId, title, skills, status, completedAt }] }
export const getUserXpHistory = async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, totalXp: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // XP history = tasks completed/verified by this user
    const completedTasks = await prisma.task.findMany({
      where: {
        assigneeId: id,
        status: { in: ['VERIFIED', 'PAID'] },
      },
      select: {
        id: true,
        title: true,
        skills: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const xpHistory = completedTasks.map((task) => {
      let parsedSkills: string[] | Record<string, number> = [];
      if (task.skills) {
        try {
          parsedSkills = JSON.parse(task.skills);
        } catch {
          parsedSkills = [];
        }
      }

      return {
        taskId: task.id,
        title: task.title,
        skills: parsedSkills,
        status: task.status,
        completedAt: task.updatedAt.toISOString(),
      };
    });

    res.json({
      userId: id,
      totalXp: user.totalXp,
      xpHistory,
    });
  } catch (error: any) {
    console.error('[getUserXpHistory] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch XP history' });
  }
};
