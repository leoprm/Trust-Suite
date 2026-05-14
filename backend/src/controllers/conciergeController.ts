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

// ── Factual question detection ─────────────────────────────────────────────

const FACTUAL_PATTERNS: Array<{ regex: RegExp; handler: string }> = [
  { regex: /(soy|eres|estoy|estás)\s+(miembro|member|parte|en\s+el\s+árbol|en\s+este\s+árbol)/i, handler: 'membership' },
  { regex: /(qué|que|cuáles|cuales|cual|cuál)\s+(árboles|trees|arboles)\s+(hay|existen|tengo|estoy|estás)/i, handler: 'treelist' },
  { regex: /(cuántas|cuantas|cuántos|cuantos)\s+(necesidades|needs|ideas|miembros|members)/i, handler: 'stats' },
  { regex: /(qui[eé]n|quien)\s+(soy|eres)/i, handler: 'whoami' },
  { regex: /(mis|mis\s+datos|mi\s+perfil|mi\s+cuenta)/i, handler: 'profile' },
];

function detectFactualQuestion(message: string): string | null {
  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.regex.test(message)) return pattern.handler;
  }
  return null;
}

// ── User resolution with auto-registration ─────────────────────────────────

/**
 * Busca o crea un usuario basado en su telegramUserId.
 * Si el usuario no existe, lo crea automáticamente con role USER.
 * Retorna el usuario (id, username, role) o null si no hay telegramUserId.
 */
async function resolveOrCreateUser(telegramUserId: string): Promise<{ id: string; username: string; role: string; createdAt: Date } | null> {
  if (!telegramUserId) return null;

  const tgId = BigInt(telegramUserId);

  // 1. Buscar existente
  const existing = await (prisma as any).user.findUnique({
    where: { telegramUserId: tgId },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  if (existing) return existing;

  // 2. Auto-registrar
  try {
    const created = await (prisma as any).user.create({
      data: {
        username: `tg_${telegramUserId}`,
        telegramUserId: tgId,
        role: 'USER',
      },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    console.log(`[concierge] Auto-registrado usuario: ${created.username} (${created.id})`);
    return created;
  } catch (err: any) {
    console.error('[concierge] Failed to auto-register user:', err.message);
    return null;
  }
}

// ── DB-backed responses for factual questions ──────────────────────────────

async function handleMembershipQuery(treeId: string, telegramUserId: string): Promise<string> {
  // Auto-register if needed
  const user = await resolveOrCreateUser(telegramUserId);

  if (!user) {
    return `No estás registrado en Trust Maker. Usa el comando /login en el grupo para crear tu cuenta.`;
  }

  // Check membership in this tree — auto-join if OPEN
  let member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: user.id, treeId } },
    select: { status: true, joinedAt: true },
  });

  if (!member) {
    // Auto-join: si el árbol es OPEN, agregar al usuario
    const tree = await prisma.tree.findUnique({ where: { id: treeId }, select: { admissionPolicy: true } });
    if (tree?.admissionPolicy === 'OPEN') {
      try {
        await prisma.treeMember.create({
          data: { userId: user.id, treeId, status: 'ACTIVE' },
        });
        member = { status: 'ACTIVE', joinedAt: new Date() } as any;
        console.log(`[concierge] handleMembershipQuery auto-joined user ${user.username} to tree`);
      } catch (err: any) {
        if (!err.message?.includes('Unique constraint')) {
          console.error('[concierge] Auto-join failed:', err.message);
        }
      }
    }
  }

  if (member) {
    return `✅ Sí, eres miembro de este árbol desde ${member.joinedAt.toLocaleDateString('es-CL')}. Tu estado es: ${member.status}.`;
  }

  // Check memberships in other trees
  const otherMemberships = await prisma.treeMember.findMany({
    where: { userId: user.id },
    include: { tree: { select: { id: true, name: true, icono: true } } },
  });

  if (otherMemberships.length > 0) {
    const treeNames = otherMemberships.map(m => `${m.tree.icono} ${m.tree.name}`).join(', ');
    return `No eres miembro de este árbol, pero perteneces a: ${treeNames}. ¿Quieres unirte a este?`;
  }

  return `No eres miembro de ningún árbol aún. ¡Vamos a crear o unirte a uno!`;
}

async function handleTreeListQuery(telegramUserId: string): Promise<string> {
  const trees = await prisma.tree.findMany({
    select: { id: true, name: true, icono: true, description: true, _count: { select: { members: true, needs: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Find user's trees
  let userTrees: string[] = [];
  if (telegramUserId) {
    const user = await resolveOrCreateUser(telegramUserId);
    if (user) {
      const memberships = await prisma.treeMember.findMany({
        where: { userId: user.id },
        select: { treeId: true },
      });
      userTrees = memberships.map(m => m.treeId);
    }
  }

  if (trees.length === 0) {
    return 'No hay árboles aún. ¡Sé el primero en crear uno!';
  }

  const lines = ['🌳 **Árboles disponibles:**\n'];
  for (const t of trees) {
    const marker = userTrees.includes(t.id) ? '👤' : '🌐';
    lines.push(`${t.icono} **${t.name}** ${marker} — ${t._count.members} miembros, ${t._count.needs} necesidades`);
    if (t.description) lines.push(`  _${t.description.slice(0, 100)}_`);
  }
  return lines.join('\n');
}

async function handleStatsQuery(treeId: string): Promise<string> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    include: { _count: { select: { members: true, needs: true, ratings: true } } },
  });

  if (!tree) return 'Árbol no encontrado.';

  const openNeeds = await prisma.need.count({ where: { treeId, status: 'OPEN' } });
  const ideaCount = await (prisma as any).needIdea.count({ where: { need: { treeId } } });

  return [
    `📊 **${tree.icono} ${tree.name}**\n`,
    `👥 Miembros: ${tree._count.members}`,
    `📝 Necesidades totales: ${tree._count.needs} (${openNeeds} abiertas)`,
    `💡 Ideas: ${ideaCount}`,
    `⭐ Ratings: ${tree._count.ratings}`,
  ].join('\n');
}

async function handleWhoAmI(telegramUserId: string): Promise<string> {
  if (!telegramUserId) return 'No pude identificar tu usuario de Telegram.';

  const user = await resolveOrCreateUser(telegramUserId);

  if (!user) {
    return `No estás registrado. Usa /login en el grupo para crear tu cuenta.`;
  }

  const memberships = await prisma.treeMember.findMany({
    where: { userId: user.id },
    include: { tree: { select: { name: true, icono: true } } },
  });

  const lines = [
    `👤 **${user.username}**`,
    `🛡️ Rol: ${user.role}`,
    `📅 Registrado: ${user.createdAt.toLocaleDateString('es-CL')}`,
  ];

  if (memberships.length > 0) {
    lines.push(`🌳 Árboles: ${memberships.map(m => `${m.tree.icono} ${m.tree.name}`).join(', ')}`);
  } else {
    lines.push('🌳 Sin árboles aún.');
  }

  return lines.join('\n');
}

// ── Extract Telegram user from session header ──────────────────────────────

function extractTelegramUserId(req: Request): string | null {
  const sessionKey = req.headers['x-hermes-session-key'] as string | undefined;
  if (!sessionKey) return null;
  const match = sessionKey.match(/^tg-user-(\d+)$/);
  return match ? match[1] : null;
}

// ── Main handler ───────────────────────────────────────────────────────────

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

    // ── Extract Telegram user from session header ──────────────────────────
    const telegramUserId = extractTelegramUserId(req);

    // ── Detect factual questions → answer from DB directly ─────────────────
    const factualType = detectFactualQuestion(message.trim());
    if (factualType) {
      let reply: string;
      const tgId = telegramUserId || '';

      switch (factualType) {
        case 'membership':
          reply = await handleMembershipQuery(treeId, tgId);
          break;
        case 'treelist':
          reply = await handleTreeListQuery(tgId);
          break;
        case 'stats':
          reply = await handleStatsQuery(treeId);
          break;
        case 'whoami':
        case 'profile':
          reply = await handleWhoAmI(tgId);
          break;
        default:
          reply = 'No pude interpretar tu pregunta.';
      }

      return res.json({ reply, agentId: agentId || null, treeId, source: 'db' });
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

    // ── Fetch user context from DB ─────────────────────────────────────────
    let userContext = '';
    if (telegramUserId) {
      const user = await resolveOrCreateUser(telegramUserId);
      if (user) {
        let isMember = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: user.id, treeId } },
        });

        // Auto-join: si el árbol es OPEN y el usuario no es miembro, agregarlo
        if (!isMember && tree.admissionPolicy === 'OPEN') {
          try {
            await prisma.treeMember.create({
              data: { userId: user.id, treeId, status: 'ACTIVE' },
            });
            isMember = { userId: user.id, treeId, status: 'ACTIVE', joinedAt: new Date() } as any;
            console.log(`[concierge] Auto-joined user ${user.username} to tree ${tree.name}`);
          } catch (err: any) {
            // Si ya existe (race condition), ignorar
            if (!err.message?.includes('Unique constraint')) {
              console.error('[concierge] Auto-join failed:', err.message);
            }
          }
        }
        const allMemberships = await prisma.treeMember.findMany({
          where: { userId: user.id },
          include: { tree: { select: { id: true, name: true, icono: true } } },
        });

        userContext = [
          '',
          '## Current User (REAL, from DB)',
          `Username: ${user.username}`,
          `Role: ${user.role}`,
          `Is member of this tree: ${isMember ? 'YES' : 'NO'}`,
          `All tree memberships: ${allMemberships.map(m => `${m.tree.icono} ${m.tree.name} (${m.tree.id})`).join(', ') || 'none'}`,
        ].join('\n');
      }
    }

    // ── Build system prompt with real tree context ─────────────────────────
    const contextLines: string[] = [
      `You are the Tree Agent for "${tree.name}" (${tree.icono}) — a Trust Maker community.`,
      'You are the Hermes Agent integrated into Trust Maker, responding in Spanish.',
      '',
      `Tree metadata (REAL, from DB):`,
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

    // Add user context
    contextLines.push(userContext);

    contextLines.push('');
    contextLines.push(
      'Respond in Spanish. Be concise, helpful, and action-oriented.',
    );
    contextLines.push(
      'When the user asks about tasks, prioritize open needs from this tree.',
    );
    contextLines.push('');
    contextLines.push('IMPORTANT: You have REAL user and tree data above. Use it. Do NOT invent or hallucinate.');
    contextLines.push('If the user asks about membership, trees, or stats, the data above IS authoritative.');

    const systemPrompt = contextLines.join('\n');

    // ── Build user messages array ──────────────────────────────────────────
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message.trim() },
    ];

    // ── Call Hermes Agent API ─────────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000); // 5 minutos

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
