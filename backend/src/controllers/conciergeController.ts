import { Request, Response } from 'express';
import { prisma, telegramBot } from '../index';
import { evaluateAndAssignTask } from './taskController';
import { execCommand } from '../services/sshGateway';
import { getTreeSocialProfiles, formatSocialMapContext } from '../services/socialMapService';
import {
  buildSnapshot, buildDelta, TreeSnapshot, TreeDelta,
  writeSnapshotToDisk, readSnapshotFromDisk,
  writeDeltaToDisk, readDeltaFromDisk,
  getHistory as getHistoryFromService,
} from '../services/conciergeContextService';

// ── Centralized context builder ────────────────────────────────────────────────

/** Safely parse user skills JSON, return null on failure */
function parseSkills(raw: any): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Centralized context builder — single source of truth for tree context.
 * Used by both the concierge endpoint and hermesBridge (bot).
 * Includes social map data if available (MemberSocialProfile).
 */
export async function buildTreeContext(treeId: string, opts?: { maxNeeds?: number; maxMembers?: number }) {
  const maxNeeds = opts?.maxNeeds ?? 10;
  const maxMembers = opts?.maxMembers ?? 20;

  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      id: true, name: true, icono: true, description: true,
      objectives: true, admissionPolicy: true, createdAt: true,
    },
  });
  if (!tree) return null;

  const [needs, members, totalMembers, totalNeeds, openNeeds, socialProfiles] = await Promise.all([
    prisma.need.findMany({
      where: { treeId, status: 'OPEN' },
      select: { id: true, title: true, description: true, importance: true, status: true },
      orderBy: { importance: 'desc' },
      take: maxNeeds,
    }),
    prisma.treeMember.findMany({
      where: { treeId, status: 'ACTIVE', user: { isNot: null } },
      include: { user: { select: { username: true, skills: true } } },
      take: maxMembers,
    }).catch(() => []),
    prisma.treeMember.count({ where: { treeId, status: 'ACTIVE' } }),
    prisma.need.count({ where: { treeId } }),
    prisma.need.count({ where: { treeId, status: 'OPEN' } }),
    getTreeSocialProfiles(treeId).catch(() => []),
  ]);

  // Build social map summary for Ari
  let socialMapText = '';
  if (socialProfiles.length > 0) {
    socialMapText = formatSocialMapContext(socialProfiles);
  }

  return {
    tree: {
      id: tree.id,
      name: tree.name,
      icono: tree.icono,
      description: tree.description,
      objectives: tree.objectives,
      admissionPolicy: tree.admissionPolicy,
      createdAt: tree.createdAt.toISOString(),
    },
    needs: needs.map((n) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      importance: n.importance,
      status: n.status,
    })),
    members: members.map((m) => ({
      username: m.user?.username || '(anónimo)',
      skills: parseSkills(m.user?.skills),
    })),
    stats: { totalMembers, totalNeeds, openNeeds },
    socialMap: socialProfiles.map((p: any) => ({
      username: p.username,
      contributionSummary: p.contributionSummary,
      proposedNeedTopics: p.proposedNeedTopics,
      votingPatterns: p.votingPatterns,
      taskCompletionRate: p.taskCompletionRate,
      chatActivity: p.chatActivity,
    })),
    socialMapText,
    generatedAt: new Date().toISOString(),
  };
}

// ── POST /api/concierge/context ────────────────────────────────────────────────

export const contextHandler = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.body;
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (string) is required' });
    }
    const context = await buildTreeContext(treeId);
    if (!context) {
      return res.status(404).json({ error: 'Tree not found' });
    }
    res.json(context);
  } catch (error: any) {
    console.error('[concierge/context] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to build tree context' });
  }
};

// ── POST /api/concierge ────────────────────────────────────────────────────────
// Proxies a concierge query to the local Hermes Agent API.
// Body: { message, treeId, needId?, agentId }
//   - treeId is required — session key and system prompt are tree-scoped.
//   - needId and agentId are optional extra context.
//
// Rate-limited at 30 req/min via conciergeLimiter (applied in index.ts).
// Imports prisma from index.ts (singleton) — same pattern as all other controllers.

const HERMES_API = 'http://127.0.0.1:8643/v1/chat/completions';
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';

// ── Factual question detection ─────────────────────────────────────────────

const FACTUAL_PATTERNS: Array<{ regex: RegExp; handler: string }> = [
  { regex: /(soy|eres|estoy|estás)\s+(miembro|member|parte|en\s+el\s+árbol|en\s+este\s+árbol)/i, handler: 'membership' },
  { regex: /(qué|que|cuáles|cuales|cual|cuál)\s+(árboles|trees|arboles)\s+(hay|existen|tengo|estoy|estás)/i, handler: 'treelist' },
  { regex: /(cuántas|cuantas|cuántos|cuantos)\s+(necesidades|needs|ideas|miembros|members)/i, handler: 'stats' },
  { regex: /(qui[eé]n|quien)\s+(soy|eres)/i, handler: 'whoami' },
  { regex: /\b(mis\s+datos|mi\s+perfil|mi\s+cuenta)\b/i, handler: 'profile' },
  { regex: /(cu[aá]nto\s+(cuesta|vale|cobra|sale|debo|pagar|hay\s+que\s+pagar)|cu[aá]nto\s+me\s+(cuestan|cobran|saldr[ií]a)|precio\s+(de|del|por)|costos?\s+(de|del|fijos|mensuales|mensual|total)|factura\b|gasto\s+(de|del|total)|transparencia\s+(de\s+costos|econ[oó]mica))/i, handler: 'costs' },
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

// ── Organize intent detection ────────────────────────────────────────────

const ORGANIZE_PATTERNS: RegExp[] = [
  /organiza[r]?\s+(un|una|el|la)\s+(asado|evento|reuni[oó]n|fiesta|proyecto|pyme)/i,
  /organiza[r]?\s+(el\s+)?(trabajo|equipo|tareas|gente|gremio)/i,
  /repart[ií]\s+(las\s+)?tareas/i,
  /asigna[r]?\s+(roles|tareas|responsabilidades)/i,
  /arma[r]?\s+(un\s+)?equipo/i,
  /(c[oó]mo|qui[eé]n)\s+(reparto|distribuyo|asigno|organizo)\s+/i,
];

function detectOrganizeIntent(message: string): boolean {
  const trimmed = message.trim();
  for (const pattern of ORGANIZE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

const ORGANIZE_SYSTEM_PROMPT = [
  'Eres un organizador de equipos para Trust Maker. Tu tarea es:',
  '',
  '1. Analizar la solicitud del usuario y entender qué tipo de evento o proyecto quiere organizar.',
  '2. Revisar las habilidades de los miembros del árbol (abajo te paso la lista REAL de la base de datos).',
  '3. Dividir el trabajo en roles concretos necesarios para la tarea.',
  '4. Asignar cada rol al miembro más calificado según sus habilidades.',
  '5. Si hay empate (misma puntuación), elegir al que tenga menos carga de trabajo o al azar.',
  '6. Presentar el plan en formato de tabla clara con emojis.',
  '',
  'Responde en español neutro, con emojis para hacerlo visual y motivador.',
  'No inventes habilidades ni miembros — usa SOLO los datos reales que te paso.',
  'Si ningún miembro tiene las habilidades necesarias, dilo con honestidad y sugiere qué habilidades harían falta.',
  'Si hay pocos miembros (menos de 3), sugiere invitar a más personas al árbol.',
].join('\n');

// ── User resolution with auto-registration ─────────────────────────────────

/**
 * Busca o crea un usuario basado en su telegramUserId.
 * Si el usuario no existe, lo crea automáticamente con role USER.
 * Retorna el usuario (id, username, role) o null si no hay telegramUserId.
 */
async function resolveOrCreateUser(telegramUserId: string, displayName?: string): Promise<{ id: string; username: string; role: string; createdAt: Date } | null> {
  if (!telegramUserId) return null;

  const tgId = BigInt(telegramUserId);

  // 1. Buscar existente
  const existing = await prisma.user.findUnique({
    where: { telegramUserId: tgId },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  if (existing) {
    // Update firstName if it's still the default tg_ pattern and we have a real name
    if (displayName && existing.username.startsWith('tg_')) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { username: displayName, firstName: displayName },
      }).catch(() => {});
      return { ...existing, username: displayName };
    }
    return existing;
  }

  // 2. Auto-registrar
  const username = displayName || `tg_${telegramUserId}`;
  try {
    const created = await prisma.user.create({
      data: {
        username,
        firstName: displayName || undefined,
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
  const ideaCount = await prisma.needIdea.count({ where: { need: { treeId } } });

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

async function handleCostQuery(telegramUserId: string): Promise<string> {
  const configs = await prisma.platformConfig.findMany();
  const getVal = (key: string): string => {
    const c = configs.find((c: any) => c.key === key);
    return c?.value ?? '0';
  };

  const salaries = parseFloat(getVal('cost_salaries'));
  const infra = parseFloat(getVal('cost_infrastructure'));
  const fixed = parseFloat(getVal('cost_fixed'));
  const margin = parseFloat(getVal('growth_margin_pct'));
  const totalFixed = salaries + infra + fixed;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usage = await prisma.apiUsage.findMany({
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

  // Free period: users in trial + absorbed cost
  const freeUsersSet = new Set(usage.filter((u: any) => u.isFreePeriod).map((u: any) => u.userId.toString()));
  const freeUserCount = freeUsersSet.size;
  const absorbed = usage.filter((u: any) => u.isFreePeriod).reduce((sum: number, u: any) => sum + (u.absorbedByPlatform || 0), 0);

  // ── Per-tree costs for this user ──────────────────────────────────────
  let treeLines: string[] = [];

  if (telegramUserId) {
    const user = await resolveOrCreateUser(telegramUserId);
    if (user) {
      const memberships = await prisma.treeMember.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        include: { tree: { select: { id: true, name: true } } },
      });

      if (memberships.length > 0) {
        // Active trees total (for fixed cost division)
        const activeTrees = await prisma.treeMember.groupBy({
          by: ['treeId'],
          where: { status: 'ACTIVE' },
        });
        const fixedPerTree = totalFixed / (activeTrees.length || 1);

        treeLines = ['', '🌳 **Tus árboles este mes:**'];

        for (const m of memberships) {
          const treeId = m.treeId;

          // API usage for this tree this month (excluding free period)
          const apiUsage = await prisma.apiUsage.aggregate({
            where: {
              treeId,
              createdAt: { gte: startOfMonth },
              isFreePeriod: false,
            },
            _sum: { cost: true },
          });

          const apiCost = apiUsage._sum?.cost || 0;

          // Active members in this tree
          const memberCount = await prisma.treeMember.count({
            where: { treeId, status: 'ACTIVE' },
          });

          const treeTotal = apiCost + fixedPerTree;
          const perPerson = treeTotal / (memberCount || 1);

          treeLines.push(
            `• ${m.tree.name} (${memberCount} miembros): $${treeTotal.toFixed(2)} → **$${perPerson.toFixed(2)} por persona**`
          );
        }
      }
    }
  }

  return [
    '📊 **Costos — Trust Maker**',
    '',
    `🏢 **Costos fijos mensuales: $${totalFixed.toLocaleString()}** (divididos entre todos los árboles activos)`,
    '',
    '🤖 **Uso de APIs este mes:**',
    ...Object.entries(byProvider).map(([p, c]) => `• ${p}: $${c.toFixed(2)}`),
    `• **Total APIs: $${totalApi.toFixed(2)}**`,
    ...treeLines,
    '',
    '💸 Los costos se dividen por igual entre todos los miembros del árbol.',
    'Los primeros 2 meses son gratis para nuevos usuarios.',
    `• Margen de crecimiento: ${margin}%`,
    '',
    '🎁 **Período gratuito activo:**',
    `• Usuarios en período de prueba: ${freeUserCount}`,
    `• Costo absorbido por la plataforma este mes: $${absorbed.toFixed(2)}`,
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
    const { message, treeId, needId, agentId, displayName } = req.body;

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

    // ── Detect factual questions → pre-fetch data for Hermes to use IF relevant ─
    const factualType = detectFactualQuestion(message.trim());
    let factualContext = '';
    let factualLabel = '';

    if (factualType) {
      const tgId = telegramUserId || '';

      switch (factualType) {
        case 'membership':
          factualContext = await handleMembershipQuery(treeId, tgId);
          factualLabel = 'membresía';
          break;
        case 'treelist':
          factualContext = await handleTreeListQuery(tgId);
          factualLabel = 'árboles disponibles';
          break;
        case 'stats':
          factualContext = await handleStatsQuery(treeId);
          factualLabel = 'estadísticas';
          break;
        case 'whoami':
        case 'profile':
          factualContext = await handleWhoAmI(tgId);
          factualLabel = 'perfil';
          break;
        case 'costs':
          factualContext = await handleCostQuery(tgId);
          factualLabel = 'costos';
          break;
      }
    }

    // ── Detect task creation intent ────────────────────────────────────────
    const isTaskCreation = detectTaskCreationIntent(message.trim());

    // ── Detect organize intent ─────────────────────────────────────────────
    const isOrganize = detectOrganizeIntent(message.trim());

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
      const user = await resolveOrCreateUser(telegramUserId, displayName);
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

    // ── Fetch member skills for organize intent ─────────────────────────────
    let memberSkillsContext = '';
    if (isOrganize) {
      const members = await prisma.treeMember.findMany({
        where: { treeId, status: 'ACTIVE' },
        include: {
          user: { select: { id: true, username: true, skills: true, totalXp: true } },
        },
      });

      const skillLines: string[] = [];
      let membersWithSkills = 0;
      for (const m of members) {
        const username = m.user?.username || '(anónimo)';
        if (m.user?.skills) {
          try {
            const skills = JSON.parse(m.user.skills as string);
            if (typeof skills === 'object' && skills !== null) {
              const entries = Object.entries(skills as Record<string, number>);
              if (entries.length > 0) {
                const skillStr = entries.map(([k, v]) => `${k}(${v})`).join(', ');
                skillLines.push(`- ${username}: ${skillStr}`);
                membersWithSkills++;
                continue;
              }
            }
          } catch {
            // JSON inválido — tratar como sin habilidades
          }
        }
        skillLines.push(`- ${username}: (sin habilidades registradas)`);
      }

      memberSkillsContext = [
        '',
        '## Miembros del árbol y sus habilidades (REAL, de DB)',
        skillLines.length > 0 ? skillLines.join('\n') : '(ningún miembro tiene habilidades registradas)',
        '',
        `Total miembros activos: ${members.length} — con habilidades: ${membersWithSkills}`,
        '',
        'Asigna roles basados en estas habilidades reales. Si nadie califica para un rol, dilo honestamente.',
      ].join('\n');
    }

    // ── Build system prompt with real tree context ─────────────────────────
    const contextLines: string[] = isOrganize
      ? [
          ORGANIZE_SYSTEM_PROMPT,
          '',
          `Árbol: "${tree.name}" (${tree.icono})`,
          `Descripción: ${tree.description || 'Sin descripción'}`,
          `Creado: ${tree.createdAt.toLocaleDateString('es-CL')}`,
        ]
      : isTaskCreation
      ? [buildTaskCreationSystemPrompt(tree.name, tree.icono)]
      : [
          `You are the Tree Agent for "${tree.name}" (${tree.icono}) — a Trust Maker community.`,
          'You are the Hermes Agent integrated into Trust Maker, responding in Spanish.',
          '',
          '## 🔒 SANDBOX — CRITICAL SECURITY',
          `Your workspace is the sandbox: /home/trustmaker/trees/${treeId}/`,
          'ALL file access (read, write, search, execute) MUST stay inside this directory.',
          'You CANNOT access /etc, /home/leo, /root, /var, or any path outside the sandbox.',
          'Use the sandbox API for file operations: POST /api/trees/${treeId}/sandbox/...',
          'Load skill_view("trust-maker") for the full API reference.',
          'The "terminal" tool is FORBIDDEN unless the command only touches sandbox paths.',
          'Do NOT read /etc/passwd, /home/*, /root, or any system file. This is a HARD rule.',
          '',
          `Tree metadata (REAL, from DB):`,
          `  Name: ${tree.name}`,
          `  Description: ${tree.description || 'No description set'}`,
          `  Admission: ${tree.admissionPolicy}`,
          `  Created: ${tree.createdAt.toISOString()}`,
        ];

    const memberCount = (tree as any)._count?.members ?? 0;
    const needCount = (tree as any)._count?.needs ?? 0;
    contextLines.push(isOrganize ? `Miembros: ${memberCount}` : `  Members: ${memberCount}`);
    contextLines.push(isOrganize ? `Necesidades totales: ${needCount}` : `  Total needs: ${needCount}`);

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

    // Inject tree objectives into context if set (T24)
    if (tree.objectives) {
      contextLines.push('');
      contextLines.push(`Tree objectives (set by community):`);
      contextLines.push(`  "${tree.objectives}"`);
      contextLines.push('Adapt your responses and priorities to this context.');
      contextLines.push('Suggest solutions relevant to this type of organization.');
    }

    // Inject tech stack from DB (T26)
    try {
      const techStack = await prisma.treeTechStack.findMany({
        where: { treeId, status: 'active' },
        include: { stackItem: { select: { name: true, description: true, category: true } } },
        take: 10,
      });
      if (techStack.length > 0) {
        contextLines.push('');
        contextLines.push('## Tech Stack (REAL, from DB)');
        for (const ts of techStack) {
          contextLines.push(`- ${ts.stackItem.name} (${ts.stackItem.category}): ${ts.stackItem.description}`);
        }
        contextLines.push('Mention these tools when relevant. Suggest solutions compatible with this stack.');
      }
    } catch {
      // Non-fatal — tech stack not available yet
    }

    // Inject SSH servers from DB (F3-SSH)
    try {
      const servers = await prisma.managedServer.findMany({
        where: { treeId },
        select: { id: true, name: true, ip: true, port: true, status: true },
      });
      if (servers.length > 0) {
        contextLines.push('');
        contextLines.push('## Servidores SSH (REAL, from DB)');
        for (const s of servers) {
          contextLines.push(`- ${s.name} (${s.id}) — ${s.ip}:${s.port} — ${s.status}`);
        }
        contextLines.push('Use these servers for deployment, diagnostics, or SSH-related questions.');
      }
    } catch {
      // Non-fatal — managedServer table not available yet
    }

    // ── ssh_exec tool instruction (F3-SSH) ─────────────────────────────────
    contextLines.push('');
    contextLines.push('## SSH Command Execution');
    contextLines.push('Puedes ejecutar comandos en los servidores SSH del árbol usando ssh_exec(serverId, command).');
    contextLines.push('Para ejecutar un comando, responde con el siguiente formato exacto:');
    contextLines.push('[TOOL:ssh_exec serverId="<server-id>" command="<comando-a-ejecutar>"]');
    contextLines.push('');
    contextLines.push('Ejemplo: para instalar algo en un servidor:');
    contextLines.push('[TOOL:ssh_exec serverId="550e8400-e29b-41d4-a716-446655440000" command="sudo apt update && sudo apt install -y nginx"]');
    contextLines.push('');
    contextLines.push('El sistema detectará este formato y ejecutará el comando en el servidor correspondiente vía sshGateway.');
    contextLines.push('Usa los IDs reales de la lista de servidores de arriba. No inventes IDs.');

    // Add user context
    contextLines.push(userContext);

    // Add member skills for organize mode
    if (memberSkillsContext) {
      contextLines.push(memberSkillsContext);
    }

    contextLines.push('');
    contextLines.push(
      'Respond in neutral Spanish (no voseo, no regionalisms like "ché", "vos", "andá", "tenés"). Use "tú" or "usted" consistently. Be concise, helpful, and action-oriented.',
    );
    contextLines.push(
      'When the user asks about tasks, prioritize open needs from this tree.',
    );
    contextLines.push(
      'Voting: ideas use 3 weight levels — like (1 point), heart ❤️ (2 pts), star ⭐ (3 pts).',
    );
    contextLines.push('');
    contextLines.push('IMPORTANT: You have REAL user and tree data above. Use it. Do NOT invent or hallucinate.');
    contextLines.push('If the user asks about membership, trees, or stats, the data above IS authoritative.');

    // ── Inject pre-fetched factual data (if keyword was detected) ──────────
    if (factualContext) {
      contextLines.push('');
      contextLines.push('⚠️ DETECCIÓN AUTOMÁTICA (posiblemente incorrecta):');
      contextLines.push(`Se detectó que el usuario PODRÍA estar preguntando sobre: ${factualLabel}`);
      contextLines.push('');
      contextLines.push('Datos pre-cargados por si son relevantes:');
      contextLines.push(factualContext);
      contextLines.push('');
      contextLines.push('⚠️ REGLA CRÍTICA: Solo usa estos datos si el usuario REALMENTE está preguntando sobre este tema.');
      contextLines.push('Si su mensaje es sobre otra cosa, IGNORA completamente estos datos y responde a lo que realmente preguntó.');
    }

    const systemPrompt = contextLines.join('\n');

    // ── Build user messages array ──────────────────────────────────────────
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message.trim() },
    ];

    // ── Call Hermes Agent API ─────────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 900_000); // 15 minutos

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
          skills: ['trust-maker', 'trustmaker-exec'],
          profile: 'trustmaker',
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

    let reply =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.content ??
      data?.reply ??
      '';

    // ── SSH tool call detection and execution loop (F3-SSH) ──────────────
    // After receiving Hermes Agent's response, detect [TOOL:ssh_exec ...]
    // tool calls, execute the commands via sshGateway, inject results as
    // system messages, and re-call Hermes Agent for a final response.
    // Maximum 3 rounds of tool calls per request.
    const MAX_TOOL_ROUNDS = 3;
    const SSH_EXEC_REGEX = /\[TOOL:ssh_exec\s+serverId="([^"]+)"\s+command="([^"]+)"]/;
    let toolRound = 0;

    while (toolRound < MAX_TOOL_ROUNDS) {
      const toolMatch = reply.match(SSH_EXEC_REGEX);
      if (!toolMatch) break;

      const serverId = toolMatch[1];
      const command = toolMatch[2];
      console.log(
        `[concierge] Round ${toolRound + 1}: ssh_exec serverId=${serverId.slice(0,8)}... command="${command.slice(0, 80)}"`,
      );

      // Execute the command via sshGateway (rate-limited, key-decrypted, 30s timeout)
      let toolResult: string;
      try {
        const result = await execCommand(serverId, command, { timeoutMs: 30_000 });
        const output = result.stdout || result.stderr || '(command produced no output)';
        const exitInfo = result.exitCode !== null ? ` (exit code: ${result.exitCode})` : '';
        toolResult = `[RESULTADO ssh_exec serverId="${serverId}" command="${command}"]${exitInfo}\n${output}`;
        console.log(`[concierge] ssh_exec OK: ${output.slice(0, 80)}`);
      } catch (err: any) {
        toolResult = `[ERROR ssh_exec serverId="${serverId}" command="${command}"]\n${err.code || 'SSH_ERROR'}: ${err.message}`;
        console.error(`[concierge] ssh_exec FAILED [${err.code}]: ${err.message}`);
      }

      // Inject the assistant's tool-call message and the tool result as system
      messages.push({ role: 'assistant', content: reply });
      messages.push({ role: 'system', content: toolResult });

      // Re-call Hermes Agent with the extended conversation
      const toolController = new AbortController();
      const toolTimeoutId = setTimeout(() => toolController.abort(), 900_000); // 15 minutos

      let toolResponse: globalThis.Response;
      try {
        toolResponse = await fetch(HERMES_API, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messages, stream: false }),
          signal: toolController.signal,
        });
      } finally {
        clearTimeout(toolTimeoutId);
      }

      if (!toolResponse.ok) {
        const errorText = await toolResponse.text().catch(() => '');
        console.error(
          `[concierge] Hermes API returned ${toolResponse.status} on tool round ${toolRound + 1}: ${errorText.slice(0, 300)}`,
        );
        break; // Return the last good reply
      }

      const toolData = (await toolResponse.json()) as any;
      const newReply =
        toolData?.choices?.[0]?.message?.content ??
        toolData?.choices?.[0]?.text ??
        toolData?.content ??
        toolData?.reply ??
        '';

      if (!newReply) {
        console.error('[concierge] Empty response from Hermes on tool round');
        break;
      }

      reply = newReply;
      toolRound++;
    }

    // ── Track API usage ──────────────────────────────────────────────────
    const usage = data?.usage;
    if (usage && telegramUserId) {
      const tgId = BigInt(telegramUserId);

      // Skip usage tracking for platform admins
      const isAdmin = await prisma.user.findUnique({
        where: { telegramUserId: tgId },
        select: { isPlatformAdmin: true },
      });
      if (isAdmin?.isPlatformAdmin) {
        console.log('[concierge] Skipping usage tracking for platform admin');
      } else {
        try {
          // Check if user is in free period
          let isFreePeriod = false;
          const user = await resolveOrCreateUser(telegramUserId);
          if (user) {
            let freeMonths = 2;
            try {
              const config = await prisma.platformConfig.findUnique({ where: { key: 'free_period_months' } });
              if (config) freeMonths = parseInt(config.value, 10) || 2;
            } catch {}
            const billingStart = new Date(user.createdAt);
            billingStart.setMonth(billingStart.getMonth() + freeMonths);
            isFreePeriod = new Date() < billingStart;
          }

          // Detectar el provider/model de la respuesta o usar defaults
        const model = data?.model || 'deepseek-v4-pro';
        const provider = model.includes('gpt') ? 'openai' 
          : model.includes('claude') ? 'anthropic' 
          : 'deepseek';

        // Intentar leer precios de PlatformConfig
        let priceInput = 0.27, priceOutput = 1.10;
        try {
          const configInput = await prisma.platformConfig.findUnique({ where: { key: 'cost_api_input_1m' } });
          const configOutput = await prisma.platformConfig.findUnique({ where: { key: 'cost_api_output_1m' } });
          if (configInput) priceInput = parseFloat(JSON.parse(configInput.value));
          if (configOutput) priceOutput = parseFloat(JSON.parse(configOutput.value));
        } catch {}

        const costInput = (usage.prompt_tokens || 0) * priceInput / 1_000_000;
        const costOutput = (usage.completion_tokens || 0) * priceOutput / 1_000_000;
        const cost = costInput + costOutput;

        await prisma.apiUsage.create({
          data: {
            userId: tgId,
            treeId,
            provider,
            model,
            tokensIn: usage.prompt_tokens || 0,
            tokensOut: usage.completion_tokens || 0,
            cost,
            messagePreview: message.trim().slice(0, 100),
            isFreePeriod,
            absorbedByPlatform: isFreePeriod ? cost : 0,
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

// ── POST /api/concierge/suggest ──────────────────────────────────────────────
// System endpoint for cron-driven proactive notifications (Ari).
// Authenticated via HERMES_API_SERVER_KEY header (no JWT required).
// Body: { type, message, treeId, priority }
// Sends the message to the tree's linked Telegram group if one exists.
export const suggestHandler = async (req: Request, res: Response) => {
  try {
    // ── Auth: require HERMES_API_SERVER_KEY ───────────────────────────────
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const expectedKey = process.env.HERMES_API_SERVER_KEY;
    if (!expectedKey || token !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized — valid HERMES_API_SERVER_KEY required' });
    }

    const { type, message, treeId, priority } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message (string) is required' });
    }
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (string) is required' });
    }

    // ── Find tree and its Telegram chat ────────────────────────────────────
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, name: true, telegramChatId: true },
    });

    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    // ── Send to Telegram if linked ─────────────────────────────────────────
    const emoji = type === 'inactivity_nudge' ? '💤'
      : type === 'stagnation_alert' ? '⚠️'
      : type === 'pending_summary' ? '📋'
      : '🤖';

    const formattedMessage = `${emoji} *Ari · ${tree.name}*\n\n${message}`;
    let telegramSent = false;

    if (tree.telegramChatId && telegramBot) {
      try {
        await telegramBot.api.sendMessage(tree.telegramChatId, formattedMessage, {
          parse_mode: 'Markdown',
          
        });
        telegramSent = true;
        console.log(`[concierge:suggest] Sent to Telegram chat ${tree.telegramChatId}: ${type}`);
      } catch (tgErr: any) {
        console.error(`[concierge:suggest] Telegram send failed for ${tree.telegramChatId}:`, tgErr.message);
      }
    }

    res.json({
      ok: true,
      treeId,
      treeName: tree.name,
      type,
      priority: priority || 'medium',
      telegramSent,
      hasTelegramChat: !!tree.telegramChatId,
    });
  } catch (error: any) {
    console.error('[concierge:suggest] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to process suggestion' });
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

// ════════════════════════════════════════════════════════════════════════════════
// Ari: Caché local + delta sync — new endpoints
// ════════════════════════════════════════════════════════════════════════════════

// ── POST /api/concierge/delta ──────────────────────────────────────────────────
// Lightweight push of external-only data that Ari cannot know himself.
// Body: { treeId }
// Auth: HERMES_API_SERVER_KEY (same as suggest)
// Response: TreeDelta with provider ratings, token costs, maintenance,
//   financial health, cross-tree benchmarks, resource consumption,
//   agent availability, external alerts.
export const deltaHandler = async (req: Request, res: Response) => {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const expectedKey = process.env.HERMES_API_SERVER_KEY;
    if (!expectedKey || token !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized — valid HERMES_API_SERVER_KEY required' });
    }

    const { treeId } = req.body;
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (string) is required' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId }, select: { id: true } });
    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    const delta = await buildDelta(treeId);
    // Write to sandbox cache
    try { writeDeltaToDisk(treeId, delta); } catch {}

    res.json(delta);
  } catch (error: any) {
    console.error('[concierge/delta] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to build delta context' });
  }
};

// ── GET /api/concierge/snapshot ────────────────────────────────────────────────
// Full snapshot of all local tree data. Called ONCE on startup/reconnect.
// Query: ?treeId=X
// Auth: HERMES_API_SERVER_KEY (Ari calls this from sandbox)
// Returns cached copy if fresh (<5 min), otherwise rebuilds.
export const snapshotHandler = async (req: Request, res: Response) => {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const expectedKey = process.env.HERMES_API_SERVER_KEY;
    if (!expectedKey || token !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized — valid HERMES_API_SERVER_KEY required' });
    }

    const treeId = req.query.treeId as string;
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (query string) is required' });
    }

    // Check for fresh cached snapshot (≤5 min old)
    const cacheHit = readSnapshotFromDisk(treeId);
    if (cacheHit) {
      const cacheAge = Date.now() - new Date(cacheHit.generatedAt).getTime();
      if (cacheAge < 5 * 60 * 1000) {
        return res.json({ ...cacheHit, _source: 'cache', _ageMs: cacheAge });
      }
    }

    // Build fresh snapshot
    const snapshot = await buildSnapshot(treeId);
    if (!snapshot) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    // Write to sandbox cache
    try { writeSnapshotToDisk(treeId, snapshot); } catch {}

    res.json(snapshot);
  } catch (error: any) {
    console.error('[concierge/snapshot] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to build snapshot' });
  }
};

// ── GET /api/concierge/history-events ──────────────────────────────────────────
// Returns event log timeline for a tree with optional date range.
// NOTE: This is a separate path from GET /api/concierge/history (chat messages).
// Query: ?treeId=X&from=YYYY-MM-DD&limit=100
// Auth: JWT (user must be member of the tree)
export const historyEventsHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const treeId = req.query.treeId as string;
    if (!treeId || typeof treeId !== 'string') {
      return res.status(400).json({ error: 'treeId (query string) is required' });
    }

    const from = req.query.from as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const result = await getHistoryFromService(treeId, { userId, from, limit });
    res.json(result);
  } catch (error: any) {
    console.error('[concierge/history-events] Error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch event history' });
  }
};
