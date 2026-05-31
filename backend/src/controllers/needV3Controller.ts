import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { markIdeasGlobal } from './ideaController';

const prisma = new PrismaClient();

// Helper: random importance 1-10
function randomImportance(): number {
  return Math.floor(Math.random() * 10) + 1;
}

// Helper: simple text match score (0-1)
function computeMatchScore(needTitle: string, needDesc: string, ideaContent: string): number {
  const haystack = `${needTitle} ${needDesc}`.toLowerCase();
  const text = ideaContent.toLowerCase();
  const words = text.split(/\s+/).filter((w: string) => w.length > 2);
  if (words.length === 0) return 0;
  const matched = words.filter((w: string) => haystack.includes(w));
  return Math.min(matched.length / words.length, 1.0);
}

// ─── POST /api/needs ────────────────────────────────────────
export const createNeed = async (req: any, res: Response) => {
  try {
    const { treeId, title, description, importance } = req.body;

    if (!treeId || !title) {
      return res.status(400).json({ error: 'treeId y title son requeridos' });
    }

    if (importance !== undefined && (importance < 1 || importance > 10)) {
      return res.status(400).json({ error: 'importance debe ser 1-10' });
    }

    const assignedImportance = importance ?? randomImportance();

    const need = await prisma.need.create({
      data: {
        title,
        description: description || '',
        treeId,
        creatorId: req.user?.id || 'system',
        importance: assignedImportance,
        status: 'OPEN',
      },
      include: {
        _count: { select: { ideas: true } },
      },
    });

    // ─── Auto-match: global ideas across all trees ──────────
    try {
      const globalIdeas = await prisma.idea.findMany({
        where: { isGlobal: true },
        include: { need: { select: { treeId: true, status: true } } },
      });

      const matches: Array<{
        needId: string;
        ideaId: string;
        matchedBy: 'AI';
        matchScore: number;
      }> = [];

      for (const idea of globalIdeas) {
        if (idea.needId === need.id) continue;
        const baseScore = computeMatchScore(title, description || '', idea.content);
        if (baseScore < 0.1) continue;

        const isSatisfiedCrossTree =
          idea.need && idea.need.treeId !== treeId && idea.need.status === 'SATISFIED';
        const finalScore = isSatisfiedCrossTree ? Math.min(baseScore * 1.5, 1.0) : baseScore;

        matches.push({
          needId: need.id,
          ideaId: idea.id,
          matchedBy: 'AI',
          matchScore: finalScore,
        });
      }

      if (matches.length > 0) {
        await prisma.needIdea.createMany({ data: matches });
      }
    } catch (matchErr) {
      console.error('[createNeed] auto-match falló (non-fatal):', matchErr);
    }

    res.status(201).json(need);

    // ─── Send Telegram voting message (async, non-blocking) ──────
    if (req.user?.id === 'telegram-bot' || req.user?.role === 'SYSTEM') {
      const { telegramBot } = await import('../index');
      if (telegramBot) {
        try {
          const tree = await prisma.tree.findUnique({
            where: { id: treeId },
            select: { telegramChatId: true, name: true },
          });
          if (tree?.telegramChatId) {
            const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
            const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const text = `<b>📋 Nueva necesidad en ${escHtml(tree.name)}</b>\n\n<b>${escHtml(title)}</b>\n${escHtml(description || '')}\n\nImportancia: ${'⭐'.repeat(assignedImportance)} (${assignedImportance}/10)\n\n👍 si crees que es una necesidad válida dale un like a este mensaje`;
            const { exec } = require('child_process');
            const payload = JSON.stringify({ chat_id: tree.telegramChatId, text, parse_mode: 'HTML' });
            exec(
              `curl -s --max-time 10 -X POST https://api.telegram.org/bot${BOT_TOKEN}/sendMessage -H 'Content-Type: application/json' -d '${payload.replace(/'/g, "'\\''")}'`,
              { timeout: 12000 },
              async (err: any, stdout: string) => {
                if (err) { console.error('[createNeed] curl error:', err.message); return; }
                try {
                  const data = JSON.parse(stdout);
                  if (data.ok && data.result?.message_id) {
                    await prisma.need.update({
                      where: { id: need.id },
                      data: { telegramMessageId: data.result.message_id },
                    });
                  } else {
                    console.error('[createNeed] Telegram API error:', stdout.slice(0, 200));
                  }
                } catch (parseErr) {
                  console.error('[createNeed] JSON parse error:', stdout.slice(0, 200));
                }
              }
            );
          }
        } catch (sendErr) {
          console.error('[createNeed] Failed to send Telegram message:', sendErr);
        }
      }
    }
  } catch (error) {
    console.error('[createNeed] error:', error);
    res.status(500).json({ error: 'Failed to create Need' });
  }
};

// ─── GET /api/needs?treeId=X ────────────────────────────────
export const getNeeds = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;

    if (!treeId) {
      return res.status(400).json({ error: 'treeId query param es requerido' });
    }

    const needs = await prisma.need.findMany({
      where: { treeId: treeId as string },
      include: {
        _count: { select: { ideas: true, needIdeas: true } },
        creator: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(needs);
  } catch (error) {
    console.error('[getNeeds] error:', error);
    res.status(500).json({ error: 'Failed to fetch Needs' });
  }
};

// ─── GET /api/needs/:id ─────────────────────────────────────
export const getNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const need = await prisma.need.findUnique({
      where: { id },
      include: {
        creator: { select: { username: true } },
        ideas: {
          orderBy: { totalLikes: 'desc' },
          include: { creator: { select: { username: true } } },
        },
        needIdeas: {
          include: {
            idea: {
              include: { creator: { select: { username: true } } },
            },
          },
        },
        _count: { select: { ideas: true, needIdeas: true } },
      },
    });

    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Format cross-tree ideas
    const crossTreeIdeas = need.needIdeas.map((ni: any) => ({
      id: ni.idea.id,
      content: ni.idea.content,
      totalLikes: ni.idea.totalLikes,
      isGlobal: true,
      sourceTreeId: ni.idea.sourceTreeId,
      sourceNeedId: ni.idea.needId,
      matchedBy: ni.matchedBy,
      matchScore: ni.matchScore,
      creator: ni.idea.creator,
      createdAt: ni.idea.createdAt,
    }));

    res.json({ ...need, crossTreeIdeas });
  } catch (error) {
    console.error('[getNeed] error:', error);
    res.status(500).json({ error: 'Failed to fetch Need' });
  }
};

// ─── PATCH /api/needs/:id/importance ────────────────────────
export const updateImportance = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { importance } = req.body;

    if (importance === undefined || importance < 1 || importance > 10) {
      return res.status(400).json({ error: 'importance debe ser 1-10' });
    }

    const need = await prisma.need.findUnique({ where: { id } });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const updated = await prisma.need.update({
      where: { id },
      data: { importance },
    });

    res.json(updated);
  } catch (error) {
    console.error('[updateImportance] error:', error);
    res.status(500).json({ error: 'Failed to update importance' });
  }
};

// ─── PATCH /api/needs/:id/status ────────────────────────────
const validTransitions: Record<string, string[]> = {
  OPEN: ['APPROVED', 'SATISFIED'],
  SATISFIED: ['CLOSED'],
};

export const updateStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['OPEN', 'APPROVED', 'SATISFIED', 'CLOSED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status inválido. Permitidos: ${allowed.join(', ')}` });
    }

    const need = await prisma.need.findUnique({ where: { id } });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const current = need.status as string;
    const allowedNext = validTransitions[current];
    if (!allowedNext || !allowedNext.includes(status)) {
      return res.status(400).json({
        error: `Transición inválida: ${current} → ${status}. Permitidas: ${current} → ${(allowedNext || []).join(', ')}`,
      });
    }

    const updated = await prisma.need.update({
      where: { id },
      data: { status: status as any },
    });

    // ── Fire-and-forget hook: notify when need is APPROVED ────────
    if (status === 'APPROVED') {
      const port = process.env.PORT || 3100;
      const internalApiKey = process.env.INTERNAL_API_KEY || '';
      const hookUrl = `http://127.0.0.1:${port}/api/hooks/need-approved`;
      fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': internalApiKey,
        },
        body: JSON.stringify({
          needId: id,
          treeId: need.treeId,
          title: need.title,
          description: need.description,
        }),
      }).then(() => {
        console.log(`[updateStatus] Hook need-approved OK: needId=${id}`);
      }).catch((err: any) => {
        console.error(`[updateStatus] Hook need-approved failed for need ${id}:`, err.message || err);
      });
    }

    // Mark ideas as global when need is sealed (SATISFIED or CLOSED)
    if (status === 'SATISFIED' || status === 'CLOSED') {
      markIdeasGlobal(id).catch(err =>
        console.error(`[updateStatus] markIdeasGlobal failed for need ${id}:`, err)
      );
    }

    res.json(updated);
  } catch (error) {
    console.error('[updateStatus] error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};
