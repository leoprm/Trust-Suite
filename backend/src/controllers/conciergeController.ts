import { Request, Response } from 'express';
import { prisma } from '../index';

// ── POST /api/concierge ────────────────────────────────────────────────────────
// Proxies a concierge query to the local Hermes Agent API.
// Body: { message, treeId, needId?, agentId }
//   - treeId is required — session key and system prompt are tree-scoped.
//   - needId and agentId are optional extra context.
//
// Rate-limited at 30 req/min via conciergeLimiter (applied in index.ts).
// Imports prisma from index.ts (singleton) — same pattern as all other controllers.

const HERMES_API = 'http://127.0.0.1:8642/v1/chat/completions';
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';

export const conciergeHandler = async (req: Request, res: Response) => {
  try {
    const { message, treeId, needId, agentId } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message (string) is required' });
    }
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({
        error: 'treeId (string) is required',
        hint: 'Debes unirte a un árbol para usar el concierge. Crea uno o únete a uno existente.',
      });
    }

    // ── Fetch tree context from DB ─────────────────────────────────────────
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      include: {
        _count: { select: { members: true, needs: true, ratings: true } },
      },
    });

    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    // ── Build system prompt with real tree context ─────────────────────────
    const contextLines: string[] = [
      `You are the Tree Agent for "${tree.name}" (${tree.icono}) — a Trust Maker community.`,
      'You are the Hermes Agent integrated into Trust Maker, responding in Spanish.',
      '',
      `Tree metadata:`,
      `  Name: ${tree.name}`,
      `  Description: ${tree.description || 'No description set'}`,
      `  Admission: ${tree.admissionPolicy}`,
      `  Created: ${tree.createdAt.toISOString()}`,
    ];

    const memberCount = (tree as any)._count?.members ?? 0;
    const needCount = (tree as any)._count?.needs ?? 0;
    contextLines.push(`  Members: ${memberCount}`);
    contextLines.push(`  Total needs: ${needCount}`);

    // If needId provided, fetch that specific need for extra orientation
    if (needId && typeof needId === 'string') {
      const need = await prisma.need.findUnique({
        where: { id: needId },
        select: { title: true, description: true, status: true },
      });
      if (need) {
        contextLines.push('');
        contextLines.push(`Current need context:`);
        contextLines.push(`  Title: ${need.title}`);
        contextLines.push(`  Status: ${need.status}`);
        contextLines.push(`  Description: ${need.description.slice(0, 500)}`);
      }
    }

    // Fetch open needs count for a quick health snapshot
    const openNeeds = await prisma.need.count({
      where: { treeId, status: 'OPEN' },
    });
    contextLines.push(`  Open needs: ${openNeeds}`);

    contextLines.push('');
    contextLines.push(
      'Respond in Spanish. Be concise, helpful, and action-oriented.',
    );
    contextLines.push(
      'When the user asks about tasks, prioritize open needs from this tree.',
    );

    const systemPrompt = contextLines.join('\n');

    // ── Build user messages array ──────────────────────────────────────────
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message.trim() },
    ];

    // ── Call Hermes Agent API ─────────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Hermes-Session-Key': `tree-agent-${treeId}`,
    };
    if (API_SERVER_KEY) {
      headers['Authorization'] = `Bearer ${API_SERVER_KEY}`;
    }

    let response: globalThis.Response;
    try {
      response = await fetch(HERMES_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // ── Handle upstream errors ─────────────────────────────────────────────
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(
        `[concierge] Hermes API returned ${response.status}: ${errorText.slice(0, 300)}`,
      );
      return res.status(502).json({
        error: 'Agent service returned an error',
        status: response.status,
        detail: errorText.slice(0, 200),
      });
    }

    // ── Parse and return ──────────────────────────────────────────────────
    const data = (await response.json()) as any;

    const reply =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.content ??
      data?.reply ??
      '';

    // ── Persist chat messages ─────────────────────────────────────────────
    const userId = req.user?.id;
    if (userId) {
      try {
        // Store user message and assistant reply in a single transaction
        await prisma.$transaction([
          prisma.chatMessage.create({
            data: {
              userId,
              treeId,
              agentId: agentId || null,
              role: 'user',
              content: message.trim(),
            },
          }),
          prisma.chatMessage.create({
            data: {
              userId,
              treeId,
              agentId: agentId || null,
              role: 'assistant',
              content: reply,
            },
          }),
        ]);

        // Keep only the last 10 messages per user+tree
        const oldMessages = await prisma.chatMessage.findMany({
          where: { userId, treeId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
          skip: 10,
        });
        if (oldMessages.length > 0) {
          await prisma.chatMessage.deleteMany({
            where: { id: { in: oldMessages.map(m => m.id) } },
          });
        }
      } catch (dbErr) {
        // Non-fatal: don't fail the request if persistence fails
        console.error('[concierge] Failed to persist chat messages:', dbErr);
      }
    }

    res.json({ reply, agentId: agentId || null, treeId });
  } catch (error: any) {
    // Distinguish timeout from other errors
    if (
      error.name === 'AbortError' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED'
    ) {
      console.error('[concierge] Hermes API request timed out (30s)');
      return res
        .status(504)
        .json({ error: 'Agent service did not respond in time' });
    }

    if (error.cause?.code === 'ECONNREFUSED' || error.code === 'ECONNREFUSED') {
      console.error('[concierge] Hermes API not reachable at localhost:8642');
      return res.status(502).json({ error: 'Agent service is not running' });
    }

    // Prisma-level errors (DB connection, query failure)
    if (error?.clientVersion || error?.code?.startsWith('P')) {
      console.error('[concierge] Database error:', error.message || error);
      return res
        .status(500)
        .json({ error: 'Failed to retrieve tree context' });
    }

    console.error('[concierge] Unexpected error:', error.message || error);
    res.status(500).json({ error: 'Failed to process concierge request' });
  }
};

// ── GET /api/concierge/history ────────────────────────────────────────────────
// Returns paginated chat history for a tree, scoped to the authenticated user
// and sorted by createdAt asc (oldest first).
// Query: ?treeId=X&limit=100&before=ISO_TIMESTAMP
export const getHistoryHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const treeId = req.query.treeId as string;
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (query string) is required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 200);
    const before = req.query.before as string | undefined;

    const where: any = { userId, treeId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    res.json({ messages });
  } catch (error: any) {
    console.error('[concierge] History fetch error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
};
