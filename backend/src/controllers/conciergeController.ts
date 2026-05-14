import { Request, Response } from 'express';
import { prisma } from '../index';
import { evaluateAndAssignTask } from './taskController';

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
  { regex: /(cu[aá]nto|cuanto|costos|costes|cobro|pago|precio|factura|gasto|financia|transparencia)/i, handler: 'costs' },
];

function detectFactualQuestion(message: string): string | null {
  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.regex.test(message)) return pattern.handler;
  }
  return null;
}

// ── Task creation intent detection ────────────────────────────────────────

/**
 * Task creation intent patterns.
 * Matches messages like:
 *   "necesito que alguien rediseñe el hero, 15 lucas"
 *   "necesito un dev que haga X por Y lucas"
 *   "crea una tarea para..."
 *   "busco alguien que..."
 */
const TASK_CREATION_PATTERNS: RegExp[] = [
  /(necesito|busco|quiero)\s+(que\s+alguien|un|una)\s+/i,
  /(necesito|busco|quiero)\s+(alguien|un\s+dev|un\s+desarrollador|un\s+diseñador)\s+(que|para)\s+/i,
  /\d+\s*(lucas|luca|clp|pesos|usd|dólares|dolares|eur)\b/i,
  /(crea|crear|creame|ábreme)\s+(una\s+)?(tarea|task|ticket)\b/i,
  /presupuesto\s*(de|es)?\s*\d+/i,
  /pago\s*\d+/i,
];

/**
 * Scores how likely a message is a task creation request.
 * Returns true if 2+ patterns match or budget keywords are present with a task-like phrase.
 */
function detectTaskCreationIntent(message: string): boolean {
  const trimmed = message.trim();
  const budgetPhrase = /\d+\s*(lucas|luca|clp|pesos|usd|dólares|dolares|eur|k)\b/i;
  const requestPhrase = /(necesito|busco|quiero|encargo|pido)\s+/i;
  const workPhrase = /(alguien\s+que|que\s+(me\s+)?(haga|hagan|desarrolle|implemente|diseñe|programe|rediseñe|arregle|fix|codee|escriba))/i;

  // Strong signal: budget + request + work action
  const hasBudget = budgetPhrase.test(trimmed);
  const hasRequest = requestPhrase.test(trimmed);
  const hasWork = workPhrase.test(trimmed);

  if (hasBudget && (hasRequest || hasWork)) return true;
  if (hasRequest && hasWork) return true;

  // Count pattern matches
  let matches = 0;
  for (const pattern of TASK_CREATION_PATTERNS) {
    if (pattern.test(trimmed)) matches++;
  }
  return matches >= 2;
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
  // Find user's tree IDs first
  let userTreeIds: string[] = [];
  if (telegramUserId) {
    const user = await resolveOrCreateUser(telegramUserId);
    if (user) {
      const memberships = await prisma.treeMember.findMany({
        where: { userId: user.id },
        select: { treeId: true },
      });
      userTreeIds = memberships.map(m => m.treeId);
    }
  }

  // Only show OPEN trees + trees where the user is a member
  const trees = await prisma.tree.findMany({
    where: userTreeIds.length > 0
      ? {
          OR: [
            { admissionPolicy: 'OPEN' },
            { id: { in: userTreeIds } },
          ],
        }
      : { admissionPolicy: 'OPEN' },
    select: { id: true, name: true, icono: true, description: true, _count: { select: { members: true, needs: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (trees.length === 0) {
    return 'No hay árboles disponibles aún. ¡Sé el primero en crear uno!';
  }

  const lines = ['🌳 **Árboles disponibles:**\n'];
  for (const t of trees) {
    const marker = userTreeIds.includes(t.id) ? '👤' : '🌐';
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

// ── Cost transparency query ─────────────────────────────────────────────

async function handleCostQuery(): Promise<string> {
  const configs = await (prisma as any).platformConfig.findMany();
  const getVal = (key: string): string => {
    const c = configs.find((c: any) => c.key === key);
    return c?.value ?? '0';
  };

  const salaries = parseFloat(getVal('cost_salaries'));
  const infra = parseFloat(getVal('cost_infrastructure'));
  const fixed = parseFloat(getVal('cost_fixed'));
  const margin = parseFloat(getVal('growth_margin_pct'));

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usage = await (prisma as any).apiUsage.findMany({
    where: { createdAt: { gte: startOfMonth } },
  });

  const byProvider: Record<string, number> = {};
  let totalApi = 0;
  for (const u of usage) {
    const p = u.provider || 'unknown';
    if (!byProvider[p]) byProvider[p] = 0;
    byProvider[p] += u.cost;
    totalApi += u.cost;
  }

  const totalFixed = salaries + infra + fixed;
  const users = new Set(usage.map((u: any) => u.userId.toString())).size || 1;
  const avgTotal = (totalApi + totalFixed) / users;

  return [
    '📊 **Transparencia de costos — Trust Maker**',
    '',
    '🏢 **Costos fijos mensuales:**',
    `• Sueldos del equipo: $${salaries.toLocaleString()}/mes`,
    `• Infraestructura (servidores, APIs, hosting): $${infra.toLocaleString()}/mes`,
    `• Gastos fijos (electricidad, internet, oficina): $${fixed.toLocaleString()}/mes`,
    `• **Total fijo: $${totalFixed.toLocaleString()}/mes**`,
    '',
    '🤖 **Uso de APIs este mes:**',
    ...Object.entries(byProvider).map(([p, c]) => `• ${p}: $${c.toFixed(2)}`),
    `• **Total APIs: $${totalApi.toFixed(2)}**`,
    '',
    '👤 **Costo promedio por usuario:**',
    `• $${avgTotal.toFixed(2)}/mes (${users} usuarios activos)`,
    `• Margen de crecimiento: ${margin}%`,
    '',
    `💰 Cada usuario paga solo lo que consume en APIs + su parte de costos fijos.`,
    `Si tienes dudas sobre tu factura específica, puedes consultarme.`,
  ].join('\n');
}

// ── Extract Telegram user from session header ──────────────────────────────

function extractTelegramUserId(req: Request): string | null {
  const sessionKey = req.headers['x-hermes-session-key'] as string | undefined;
  if (!sessionKey) return null;
  const match = sessionKey.match(/^tg-user-(\d+)$/);
  return match ? match[1] : null;
}

// ── Task creation via natural language ─────────────────────────────────────

interface ExtractedTask {
  title: string;
  description: string;
  budget: string | null;
  needId: string | null;
}

/**
 * Builds a system prompt that instructs the Hermes Agent to extract
 * structured task fields from the user's message and return them as JSON.
 */
function buildTaskCreationSystemPrompt(treeName: string, treeIcono: string): string {
  return [
    `Eres el asistente de Trust Maker para el árbol "${treeName}" (${treeIcono}).`,
    '',
    'El usuario quiere crear una tarea en lenguaje natural.',
    'Tu trabajo es extraer la siguiente información del mensaje:',
    '',
    '1. **title**: un título corto y descriptivo (máx 100 chars)',
    '2. **description**: descripción detallada de lo que se necesita',
    '3. **budget**: presupuesto mencionado (ej: "15 lucas", "50 USD"), o null si no se menciona',
    '4. **needId**: null (a menos que el usuario mencione explícitamente una necesidad existente)',
    '',
    'REGLAS CRÍTICAS:',
    '- Si el mensaje es ambiguo o no entiendes qué tarea quiere crear, responde con una pregunta aclaratoria en español.',
    '- Si entiendes la tarea pero falta algún campo (como presupuesto), da una respuesta amable confirmando lo que entendiste Y pregunta educadamente por lo que falta.',
    '- Si tienes TODOS los campos (título y descripción como mínimo), responde ÚNICAMENTE con el siguiente JSON (sin markdown, sin backticks, sin texto adicional):',
    '',
    '{"intent":"create_task","title":"...","description":"...","budget":"... o null","needId":null}',
    '',
    'Ejemplo de respuesta con todos los campos:',
    '{"intent":"create_task","title":"Rediseñar hero section","description":"Rediseñar la sección hero de la landing page con nuevo copy e imágenes. Presupuesto: 15 lucas.","budget":"15 lucas","needId":null}',
    '',
    'Ejemplo de respuesta cuando falta presupuesto:',
    '¡Entendido! Veo que necesitas rediseñar el hero. ¿Cuál es tu presupuesto aproximado para esta tarea?',
    '',
    'Responde SIEMPRE en español. Sé conciso y amable.',
  ].join('\n');
}

/**
 * Tries to parse a create_task JSON from the agent response.
 * Returns the parsed task or null if not found / invalid.
 */
function parseTaskJson(reply: string): { title: string; description: string; budget: string | null } | null {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(reply.trim());
    if (parsed.intent === 'create_task' && parsed.title && parsed.description) {
      return {
        title: parsed.title.trim(),
        description: parsed.description.trim(),
        budget: parsed.budget ?? null,
      };
    }
  } catch {
    // Not direct JSON — try to find JSON block in the text
  }

  // Try to extract JSON object from text (common with Hermes Agent)
  const jsonMatch = reply.match(/\{[\s\S]*"intent"\s*:\s*"create_task"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.description) {
        return {
          title: parsed.title.trim(),
          description: parsed.description.trim(),
          budget: parsed.budget ?? null,
        };
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Creates a task from bot interaction (no JWT required).
 * Used internally by concierge when the Hermes Agent extracts a task.
 */
async function createTaskFromBot(
  treeId: string,
  title: string,
  description: string,
  budget: string | null,
  actorId: string,
): Promise<{ id: string; title: string }> {
  const task = await prisma.task.create({
    data: {
      treeId,
      title,
      description: budget
        ? `${description}\n\n💰 Presupuesto: ${budget}`
        : description,
      budget: budget ? parseInt(budget) : 0,
      creatorId: actorId,
      status: 'PENDING',
    },
  });

  // Fire-and-forget: evaluate difficulty + route
  evaluateAndAssignTask(
    task.id,
    treeId,
    title,
    task.description,
    actorId,
  ).catch((err) => {
    console.error('[concierge] evaluateAndAssignTask error:', err);
  });

  console.log(`[concierge] Task created via natural language: ${task.id} — "${title}"`);
  return { id: task.id, title: task.title };
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
        case 'costs':
          reply = await handleCostQuery();
          break;
        default:
          reply = 'No pude interpretar tu pregunta.';
      }

      return res.json({ reply, agentId: agentId || null, treeId, source: 'db' });
    }

    // ── Detect task creation intent ────────────────────────────────────────
    const isTaskCreation = detectTaskCreationIntent(message.trim());

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
    const contextLines: string[] = isTaskCreation
      ? [buildTaskCreationSystemPrompt(tree.name, tree.icono)]
      : [
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
      'Respond in neutral Spanish (no voseo, no regionalisms like "ché", "vos", "andá", "tenés"). Use "tú" or "usted" consistently. Be concise, helpful, and action-oriented.',
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

    // ── Track API usage ──────────────────────────────────────────────────
    const usage = data?.usage;
    if (usage && telegramUserId) {
      const tgId = BigInt(telegramUserId);

      // Skip usage tracking for platform admins
      const isAdmin = await (prisma as any).user.findUnique({
        where: { telegramUserId: tgId },
        select: { isPlatformAdmin: true },
      });
      if (isAdmin?.isPlatformAdmin) {
        console.log('[concierge] Skipping usage tracking for platform admin');
      } else {
        try {
          // Detectar el provider/model de la respuesta o usar defaults
        const model = data?.model || 'deepseek-v4-pro';
        const provider = model.includes('gpt') ? 'openai' 
          : model.includes('claude') ? 'anthropic' 
          : 'deepseek';

        // Intentar leer precios de PlatformConfig
        let priceInput = 0.27, priceOutput = 1.10;
        try {
          const configInput = await (prisma as any).platformConfig.findUnique({ where: { key: 'cost_api_input_1m' } });
          const configOutput = await (prisma as any).platformConfig.findUnique({ where: { key: 'cost_api_output_1m' } });
          if (configInput) priceInput = parseFloat(JSON.parse(configInput.value));
          if (configOutput) priceOutput = parseFloat(JSON.parse(configOutput.value));
        } catch {}

        const costInput = (usage.prompt_tokens || 0) * priceInput / 1_000_000;
        const costOutput = (usage.completion_tokens || 0) * priceOutput / 1_000_000;
        const cost = costInput + costOutput;

        await (prisma as any).apiUsage.create({
          data: {
            userId: tgId,
            treeId,
            provider,
            model,
            tokensIn: usage.prompt_tokens || 0,
            tokensOut: usage.completion_tokens || 0,
            cost,
            messagePreview: message.trim().slice(0, 100),
          },
        });
      } catch (usageErr) {
        // Non-fatal — don't fail the request if usage tracking fails
        console.error('[concierge] Failed to track API usage:', usageErr);
      }
      }
    }

    // ── Task creation: parse JSON and create task ──────────────────────────
    if (isTaskCreation && reply) {
      const extractedTask = parseTaskJson(reply);
      if (extractedTask) {
        // Task extracted successfully — create it
        const tgId = telegramUserId || 'system';
        const user = telegramUserId ? await resolveOrCreateUser(telegramUserId) : null;
        const actorId = user?.id ?? tgId;

        const created = await createTaskFromBot(
          treeId,
          extractedTask.title,
          extractedTask.description,
          extractedTask.budget,
          actorId,
        );

        const confirmation = [
          `✅ **Tarea creada exitosamente**`,
          ``,
          `📋 **${created.title}**`,
          `🆔 \`${created.id}\``,
          ``,
          `La tarea ha sido publicada y será asignada automáticamente al agente más adecuado.`,
          extractedTask.budget ? `💰 Presupuesto: ${extractedTask.budget}` : '',
        ].filter(Boolean).join('\n');

        return res.json({ reply: confirmation, agentId: agentId || null, treeId, source: 'task-created' });
      }
    }

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
