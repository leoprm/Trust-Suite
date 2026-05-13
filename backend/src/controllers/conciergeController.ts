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
export const conciergeHandler = async (req: Request, res: Response) => {
  try {
    const { message, treeId, needId, agentId } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message (string) is required' });
    }
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (string) is required' });
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

    let response: globalThis.Response;
    try {
      response = await fetch('http://127.0.0.1:8642/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hermes-Session-Key': `tree-agent-${treeId}`,
        },
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
