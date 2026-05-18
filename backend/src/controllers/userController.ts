import { Request, Response } from 'express';
import { prisma } from '../index';
import { TreeSandbox } from '../services/treeSandbox';

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

// ── GET /api/users/me/skills ──────────────────────────────────────────────────
// Returns the authenticated user's skills + level + top 3.
// Response: { skills: { design: 45, frontend: 72 }, totalXp: 117, level: 3, topSkills: [...] }
export const getMySkills = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { skills: true, totalXp: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let skills: Record<string, number> = {};
    try {
      skills = user.skills ? JSON.parse(user.skills as string) : {};
    } catch {
      skills = {};
    }

    // Nivel basado en XP total (escala sqrt)
    const level = Math.floor(Math.sqrt(user.totalXp || 0) / 10) + 1;

    // Top 3 habilidades
    const topSkills = Object.entries(skills)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, xp]) => ({ name, xp }));

    res.json({
      skills,
      totalXp: user.totalXp,
      level,
      topSkills,
    });
  } catch (error: any) {
    console.error('[getMySkills] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch skills' });
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

// ── GET /api/workers/:userId/levels ───────────────────────────────────────────
// Returns WorkerSkill entries + recent level history for a worker dashboard.
// Response: { userId, skills: [{ skill, xp, level, xpToNext }], recentHistory: [...] }
export const getWorkerLevels = async (req: Request, res: Response) => {
  try {
    const userId = paramStr(req.params.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure obsidian vault exists for this worker (lazy, fire-and-forget)
    try { TreeSandbox.ensureWorkerObsidian(userId); } catch { /* best-effort */ }

    const workerSkills = await prisma.workerSkill.findMany({
      where: { userId },
      select: { skill: true, xp: true, level: true },
      orderBy: { xp: 'desc' },
    });

    // Enrich with xpToNext for progress bar (matches levelingService XP_PER_LEVEL)
    const XP_PER_LEVEL = 50;
    const enriched = workerSkills.map(ws => ({
      skill: ws.skill,
      xp: ws.xp,
      level: ws.level,
      xpToNext: (ws.level * XP_PER_LEVEL) - ws.xp,
    }));

    // Recent level history (last 20 entries)
    const recentHistory = await prisma.workerLevelHistory.findMany({
      where: { userId },
      select: { skill: true, xpDelta: true, reason: true, taskId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      userId,
      skills: enriched,
      recentHistory,
    });
  } catch (error: any) {
    console.error('[getWorkerLevels] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch worker levels' });
  }
};
