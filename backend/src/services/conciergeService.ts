import { searchNeeds, NeedSearchResult } from './needSearchService';
import { prisma } from '../index';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConciergeAction = 
  | 'suggest_existing' 
  | 'propose_new' 
  | 'create_tree' 
  | 'create_hashtag_branch'
  | 'clarify'
  | 'chat';

export type TutorialPhase = 
  | 'creator_intro'       // Preguntar qué tipo de comunidad
  | 'creator_financing'   // Preguntar gratuito vs suscripción
  | 'creator_configure'   // Generar config y botón de navegación
  | 'creator_post_creation' // Post-creación (frontend-only)
  | null;

export interface ConciergeMatch extends NeedSearchResult {}

export interface NeedDraft {
  title: string;
  description: string;
  tags: string[];
}

export interface ConciergeActionButton {
  type: 'create_tree' | 'create_need' | 'create_hashtag_branch' | 'view_need' | 'clarify' | 'creator_quick_reply' | 'configure_tree';
  label: string;
  payload: Record<string, any>;
}

export interface ConciergeResponse {
  action: ConciergeAction;
  matches: NeedSearchResult[];
  suggestion: string;
  nextSteps: string[];
  treeConfig?: any;
  needDraft?: NeedDraft;
  actionButtons?: ConciergeActionButton[];
  tutorialPhase?: TutorialPhase;
}

interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Hermes Agent API ───────────────────────────────────────────────────────────

const HERMES_API_URL = 'http://127.0.0.1:8642/v1/chat/completions';

const TRUST_SUITE_SYSTEM_PROMPT = `Eres Hermes, el asistente de Leo. Estás respondiendo desde dentro de Trust Suite (el Concierge).

Trust Suite es un ecosistema de confianza descentralizada. Conceptos clave:
- **Árbol (Tree)**: una organización/comunidad con economía, financiamiento y gobernanza propias
- **Necesidad (Need)**: un problema o requerimiento que el ecosistema debe resolver. Puede ser "Express" (#hashtag) o "Tradicional" (pasa por gobernanza: ideas → votación → podio → rama)
- **Rama (Branch)**: una rama de trabajo que nace de una necesidad aprobada
- **Rama Hashtag**: rama creada directamente con #hashtag, sin pasar por gobernanza. Solo admins pueden crearlas
- **Tarea (Task)**: trabajo concreto dentro de una rama
- **Berries**: sistema de puntos/recompensa interno
- **Modos de financiamiento**: Gratuito, Subscripción Fija, Subscripción Variable
- **Visibilidad**: PRIVATE o PUBLIC
- **Membresía**: OPEN (cualquiera puede unirse) o INVITE_ONLY (solo por invitación)

Tu trabajo: ayudar a Leo y otros usuarios con Trust Suite. Responde en español, sé conciso pero cálido. 
Cuando sugieras crear algo (árbol, necesidad, rama hashtag), sé específico sobre qué tipo y con qué configuración.

Formato de respuesta: texto natural. NO uses markdown. Sé conversacional, como en Telegram.`;

// ── Hermes API call ─────────────────────────────────────────────────────────────

async function callHermes(history: HermesMessage[]): Promise<string> {
  // Just forward messages directly — Hermes already knows who he is
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(HERMES_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: history,
        max_tokens: 400,
        temperature: 0.7,
        tool_choice: 'none',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Hermes API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Hermes API returned empty response');
    }
    return content;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Hermes API timeout (90s)');
    }
    throw err;
  }
}

// ── Action parser ──────────────────────────────────────────────────────────────

interface ParsedAction {
  buttons: ConciergeActionButton[];
}

/**
 * Parse Hermes's natural language response for actionable intents.
 * Extracts: create_tree, create_need, create_hashtag_branch, view_need.
 */
function parseActions(hermesResponse: string, userMessage: string): ParsedAction {
  const buttons: ConciergeActionButton[] = [];
  const msg = hermesResponse.toLowerCase();
  const userMsg = userMessage.toLowerCase();

  // ── create_hashtag_branch ──────────────────────────────────────────────────
  const branchMatch = hermesResponse.match(/(?:crear|crea|hacer|creemos)\s+(?:una\s+)?rama\s+(?:hashtag\s+)?[#]?(\w[\w-]*(?:\s+\w[\w-]*){0,3})/i);
  if (branchMatch) {
    const tag = branchMatch[1].replace(/\s+/g, '-').toLowerCase();
    buttons.push({
      type: 'create_hashtag_branch',
      label: `Crear rama #${tag}`,
      payload: { tag, description: userMessage },
    });
  } else if (
    /rama\s+hashtag|hashtag.*rama|crear.*rama/i.test(msg) &&
    /#?\w{2,}/.test(userMsg)
  ) {
    const tagMatch = userMsg.match(/#(\w{2,})/);
    const tag = tagMatch?.[1] || 'nueva';
    buttons.push({
      type: 'create_hashtag_branch',
      label: `Crear rama #${tag}`,
      payload: { tag, description: userMessage },
    });
  }

  // ── create_tree ────────────────────────────────────────────────────────────
  if (
    /crear.*(?:árbol|arbol|comunidad|grupo|espacio|red)/i.test(msg) ||
    /(?:configur[ée]|prepare|organicemos).*(?:árbol|arbol|comunidad)/i.test(msg)
  ) {
    buttons.push({
      type: 'create_tree',
      label: 'Configurar nuevo árbol',
      payload: { message: userMessage },
    });
  }

  // ── create_need ────────────────────────────────────────────────────────────
  if (
    /crear.*(?:necesidad|need)|propongo.*necesidad|nueva necesidad/i.test(msg) ||
    /(?:busco|necesito|quiero)\s+(?:un|una)\s+.+/i.test(userMsg)
  ) {
    const titleMatch = userMsg.match(/(?:busco|necesito|quiero)\s+(?:un|una)\s+(.{3,60})/i);
    const title = titleMatch?.[1]?.trim() || userMsg.slice(0, 50);
    buttons.push({
      type: 'create_need',
      label: `Crear necesidad: "${title}"`,
      payload: { needDraft: { title, description: userMessage, tags: [] }, message: userMessage },
    });
  }

  // ── view_need (search) ─────────────────────────────────────────────────────
  if (/buscar|encontr[ée]|busquemos|busca/i.test(msg) && !buttons.some(b => b.type === 'create_need')) {
    buttons.push({
      type: 'view_need',
      label: 'Buscar necesidades similares',
      payload: { hint: userMessage },
    });
  }

  return { buttons };
}

// ── Session store (in-memory, per-user history) ─────────────────────────────────

const sessions = new Map<string, HermesMessage[]>();
const MAX_HISTORY = 10; // keep last 10 messages (5 exchanges)

function getHistory(sessionId: string): HermesMessage[] {
  return sessions.get(sessionId) || [];
}

function addToHistory(sessionId: string, role: 'user' | 'assistant', content: string): void {
  const history = getHistory(sessionId);
  history.push({ role, content });
  // Trim old messages
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
  sessions.set(sessionId, history);
}

// ── Temporary participant system prompt ────────────────────────────────────────

const TEMP_PARTICIPANT_SYSTEM_PROMPT = `Eres Hermes, el asistente de Trust Suite. Estás ayudando a un PARTICIPANTE TEMPORAL que llegó a través de un enlace de invitación.

Tu trabajo:
- Dale la bienvenida cálida a esta rama específica
- Mostrale las tareas disponibles (nombre, descripción, dificultad)
- Si pregunta por una tarea, explícale en qué consiste
- NO muestres otras ramas, finanzas del árbol, lista de miembros, gobernanza, ni votaciones
- Enfocate SOLO en esta rama y sus tareas
- Cuando el usuario muestre interés en tomar una tarea, decile: "Para tomar esta tarea necesitás crear una cuenta gratuita. ¿Querés registrarte? Toma solo un minuto."
- Si ya completó tareas (o muestra interés genuino), sugerile: "¿Querés crear una cuenta para guardar tu progreso y unirte a la comunidad?"
- Responde en español, sé cálido y conciso.
- NO uses markdown. Sé conversacional.`;

// ── Tutorial: Creator flow system prompts ───────────────────────────────────────

const TUTORIAL_CREATOR_PROMPTS: Record<string, string> = {
  creator_intro: `Eres Hermes, asistente de Trust Suite. Modo TUTORIAL: crear árbol.

Tu tarea:
- Pregunta al usuario qué tipo de comunidad o grupo quiere crear
- Sé cálido, conversacional y breve (2-3 frases máximo)
- Da ejemplos: "diseñadores gráficos", "desarrolladores web", "músicos independientes"
- NO menciones action buttons — el usuario responderá con texto libre

Responde en español. NO uses markdown. Sé conversacional.`,

  creator_financing: `Eres Hermes, asistente de Trust Suite. Modo TUTORIAL: crear árbol.

El usuario describió su comunidad. Tu tarea:
- Reconoce con entusiasmo lo que describió
- Sugiere un posible nombre para el árbol basado en su descripción
- Pregunta: ¿será gratuito o con suscripción?
- Sé cálido y breve (2-3 frases)
- El backend pondrá los botones de respuesta — NO menciones botones ni digas "clic"

Responde en español. NO uses markdown. Sé conversacional.`,

  creator_configure: `Eres Hermes, asistente de Trust Suite. Modo TUTORIAL: crear árbol.

El usuario ya eligió el financiamiento. Tu tarea:
- Resumí lo que se va a crear: nombre, tipo de comunidad, financiamiento
- Decile que ya está todo listo para configurar
- Sé cálido y breve (2 frases máximo)
- El backend pondrá el botón "Configurar árbol"

Responde en español. NO uses markdown. Sé conversacional.`,
};

// ── Branch context for temp participants ────────────────────────────────────────

interface BranchTaskContext {
  id: string;
  name: string;
  description: string;
  status: string;
  difficulty: number | null;
  tags: string[];
}

interface BranchContextSummary {
  branchId: string;
  branchName: string;
  branchType: string;
  treeName: string;
  tasks: BranchTaskContext[];
}

async function getBranchContext(branchId: string): Promise<BranchContextSummary | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: {
      tree: { select: { name: true } },
      tasks: {
        where: { status: { not: 'COMPLETED' } },
        include: { tags: true },
        take: 30,
      },
    },
  });

  if (!branch || !branch.tree) return null;

  return {
    branchId: branch.id,
    branchName: branch.name || 'sin nombre',
    branchType: branch.type,
    treeName: branch.tree.name,
    tasks: branch.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description?.slice(0, 300) || '',
      status: t.status,
      difficulty: t.difficulty,
      tags: t.tags.map((tg) => tg.skillName),
    })),
  };
}

function formatBranchContext(ctx: BranchContextSummary): string {
  const lines = [
    `🌿 **${ctx.branchName}** — rama ${ctx.branchType === 'HASHTAG' ? 'hashtag' : 'normal'} del árbol **${ctx.treeName}**`,
    '',
    `📋 **Tareas disponibles (${ctx.tasks.length}):**`,
  ];

  if (ctx.tasks.length === 0) {
    lines.push('  _(no hay tareas abiertas en este momento)_');
  } else {
    ctx.tasks.forEach((t) => {
      const diffLabel = t.difficulty ? ` [dificultad ${t.difficulty}/10]` : '';
      const tagStr = t.tags.length > 0 ? ` • ${t.tags.join(', ')}` : '';
      lines.push(`  • **${t.name}**${diffLabel}${tagStr}`);
      if (t.description) {
        lines.push(`    ${t.description.slice(0, 150)}`);
      }
    });
  }

  return lines.join('\n');
}

// ── Tree context injection ─────────────────────────────────────────────────────

interface TreeContextSummary {
  treeId: string;
  treeName: string;
  memberCount: number;
  openNeeds: { title: string; phase: string; voteCount: number }[];
  activeBranches: { name: string; type: string; phase: string }[];
}

async function getTreeContext(userId: string): Promise<TreeContextSummary[]> {
  const memberships = await prisma.treeMember.findMany({
    where: { userId, status: 'ACTIVE' },
    include: {
      tree: {
        include: {
          needLinks: {
            where: { need: { status: { in: ['OPEN', 'IN_VOTING', 'IN_IDEAS'] } } },
            include: { need: true },
            take: 15,
          },
          branches: {
            where: { phase: { not: 'ARCHIVED' } },
            take: 15,
          },
          _count: { select: { members: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
    take: 10,
  });

  return memberships.map((m) => ({
    treeId: m.tree.id,
    treeName: m.tree.name,
    memberCount: m.tree._count.members,
    openNeeds: m.tree.needLinks.map((nt) => ({
      title: nt.need.title,
      phase: nt.need.status,
      voteCount: nt.need.totalPeopleEquivalent || 0,
    })),
    activeBranches: m.tree.branches.map((b) => ({
      name: b.name,
      type: b.type,
      phase: b.phase,
    })),
  }));
}

function formatTreeContext(trees: TreeContextSummary[]): string {
  if (trees.length === 0) return '';

  return trees
    .map((tree) => {
      const lines = [`🌳 **${tree.treeName}** (${tree.memberCount} miembros)`];

      if (tree.openNeeds.length > 0) {
        lines.push('  Necesidades abiertas:');
        tree.openNeeds.forEach((n) => {
          const phaseLabel =
            n.phase === 'IN_VOTING'
              ? `en votación (${n.voteCount} votos)`
              : n.phase === 'IN_IDEAS'
                ? 'en fase de ideas'
                : 'abierta';
          lines.push(`    • "${n.title}" — ${phaseLabel}`);
        });
      }

      if (tree.activeBranches.length > 0) {
        lines.push('  Ramas activas:');
        tree.activeBranches.forEach((b) => {
          const label =
            b.type === 'HASHTAG'
              ? `#${b.name.replace(/^#/, '')}`
              : b.name;
          lines.push(`    • ${label} (${b.type === 'HASHTAG' ? 'hashtag' : 'normal'}, ${b.phase.toLowerCase()})`);
        });
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

// ── Public tree search (member tutorial) ───────────────────────────────────────

export interface TreeSearchResult {
  id: string;
  name: string;
  description: string;
  capacidades: string[];
  memberCount: number;
  visibility: string;
  admissionPolicy: string;
  score: number;
  matchReason: string;
  openNeedsCount: number;
}

export async function searchPublicTrees(
  query: string,
  userId: string
): Promise<TreeSearchResult[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Fetch all public trees the user is NOT a member of
  const publicTrees = await prisma.tree.findMany({
    where: {
      visibility: 'PUBLIC',
      members: {
        none: { userId },
      },
    },
    include: {
      _count: { select: { members: true } },
      needLinks: {
        where: {
          need: { status: { in: ['ACTIVE', 'IN_PROGRESS'] } },
        },
        include: { need: { select: { id: true, title: true, description: true, status: true } } },
        take: 20,
      },
    },
    take: 50,
  });

  // Score each tree against the query
  const scored = publicTrees.map((tree) => {
    let score = 0;
    let matchReason = '';

    const name = (tree.name || '').toLowerCase();
    const desc = (tree.description || '').toLowerCase();
    // capacidades is stored as JSON string: '["skill1","skill2"]'
    let capsStr = '';
    let capsArray: string[] = [];
    try {
      const parsed = JSON.parse(tree.capacidades || '[]');
      if (Array.isArray(parsed)) {
        capsArray = parsed;
        capsStr = capsArray.map((c: string) => c.toLowerCase()).join(' ');
      }
    } catch {
      capsStr = (tree.capacidades || '').toLowerCase();
    }

    // Direct name match (highest weight)
    if (name.includes(q)) {
      score += 40;
      matchReason = 'nombre coincide';
    }

    // Description match
    if (desc.includes(q)) {
      score += 25;
      if (!matchReason) matchReason = 'descripción coincide';
    }

    // Capacidades match
    if (capsStr.includes(q)) {
      score += 25;
      if (!matchReason) matchReason = 'capacidades coinciden';
    }

    // Token-level fuzzy matching on name/description
    const tokens = q.split(/\s+/);
    for (const token of tokens) {
      if (token.length < 3) continue;
      if (name.includes(token)) score += 10;
      if (desc.includes(token)) score += 8;
      if (capsStr.includes(token)) score += 8;
    }

    // Needs matching (bonus per matching need)
    const matchingNeeds = tree.needLinks.filter((nt) => {
      const ntTitle = nt.need.title?.toLowerCase() || '';
      const ntDesc = nt.need.description?.toLowerCase() || '';
      return ntTitle.includes(q) || ntDesc.includes(q) ||
        tokens.some((t) => t.length >= 3 && (ntTitle.includes(t) || ntDesc.includes(t)));
    });

    if (matchingNeeds.length > 0) {
      score += matchingNeeds.length * 15;
      if (!matchReason) matchReason = `${matchingNeeds.length} necesidades coinciden`;
    }

    // Member count bonus (bigger trees are more likely relevant)
    score += Math.min(tree._count.members * 0.1, 5);

    if (!matchReason) matchReason = 'coincidencia parcial';

    return {
      id: tree.id,
      name: tree.name,
      description: tree.description,
      capacidades: capsArray,
      memberCount: tree._count.members,
      visibility: tree.visibility,
      admissionPolicy: tree.admissionPolicy,
      score: Math.round(score),
      matchReason,
      openNeedsCount: tree.needLinks.length,
    };
  });

  // Sort by score desc, return top 5
  return scored
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ── Tutorial action button generator ──────────────────────────────────────────

function getTutorialActionButtons(
  phase: string,
  hermesReply: string,
  userMessage: string
): { buttons: ConciergeActionButton[]; nextPhase: string | null } {
  switch (phase) {
    case 'creator_intro':
      // No buttons — user types freely. Next phase: ask financing
      return { buttons: [], nextPhase: 'creator_financing' };

    case 'creator_financing':
      // Quick-reply buttons for financing choice
      return {
        buttons: [
          { type: 'creator_quick_reply', label: '\u{1F3F7}\uFE0F Gratuito', payload: { value: 'Gratuito', nextPhase: 'creator_configure' } },
          { type: 'creator_quick_reply', label: '\u{1F48E} Con suscripci\u00F3n', payload: { value: 'Con suscripci\u00F3n', nextPhase: 'creator_configure' } },
        ],
        nextPhase: 'creator_financing', // stay here until user clicks a button
      };

    case 'creator_configure': {
      // Extract name suggestion from Hermes reply
      const nameMatch = hermesReply.match(/(?:llamar|nombre|llamarse|["\u201C])[:\s]*([^"\n\u201D]{3,50})/i);
      const nameSuggestion = nameMatch?.[1]?.trim() || 'Mi Comunidad';
      const isFree = userMessage.toLowerCase().includes('gratuito') || userMessage.toLowerCase().includes('gratis');

      return {
        buttons: [{
          type: 'configure_tree',
          label: '\u2699\uFE0F Configurar \u00E1rbol',
          payload: {
            treeConfig: {
              name: nameSuggestion,
              description: userMessage,
              economyMode: 'BERRIES',
              financingMode: isFree ? 'GRATUITO' : 'SUBSCRIPCION_FIJA',
              visibility: 'PUBLIC',
              billingMode: isFree ? 'NONE' : 'MONTHLY',
              tags: [],
              membershipMode: 'OPEN',
            },
          },
        }],
        nextPhase: null, // tutorial done
      };
    }

    default:
      return { buttons: [], nextPhase: null };
  }
}

// ── Main concierge processor ───────────────────────────────────────────────────

export async function processConcierge(
  message: string,
  sessionId?: string,
  userId?: string,
  mode?: 'temporary' | 'normal',
  contextId?: string,
  tutorialPhase?: string | null
): Promise<ConciergeResponse> {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      action: 'clarify',
      matches: [],
      suggestion: 'Cuéntame qué necesitas. Puedo ayudarte con Trust Suite.',
      nextSteps: ['Describe lo que buscas o qué quieres crear'],
    };
  }

  const sid = sessionId || 'default';

  // Add user message to history
  addToHistory(sid, 'user', trimmed);

  // Build conversation history for Hermes
  const history = getHistory(sid);

  try {
    // ── Tutorial mode: creator flow ──────────────────────────────────────────
    let hermesHistory = [...history];
    const isTemp = mode === 'temporary';
    let nextTutorialPhase: string | null = null;

    if (tutorialPhase && TUTORIAL_CREATOR_PROMPTS[tutorialPhase]) {
      // Use tutorial-specific system prompt — inject before conversation history
      hermesHistory = [
        { role: 'system' as const, content: TUTORIAL_CREATOR_PROMPTS[tutorialPhase] },
        ...history,
      ];
    } else if (isTemp && contextId) {
    // ── Temporary participant mode ──────────────────────────────────────────
      try {
        const branchCtx = await getBranchContext(contextId);
        if (branchCtx) {
          const formatted = formatBranchContext(branchCtx);
          hermesHistory = [
            {
              role: 'system' as const,
              content: `${TEMP_PARTICIPANT_SYSTEM_PROMPT}\n\nCONTEXTO DE LA RAMA:\n\n${formatted}`,
            },
            ...history,
          ];
        }
      } catch (err) {
        console.warn('[concierge] Branch context fetch failed:', (err as Error).message);
      }
    } else if (userId) {
    // Inject tree context if we have a userId
      try {
        const trees = await getTreeContext(userId);
        const context = formatTreeContext(trees);
        if (context) {
          // Insert tree context as a system message before the conversation
          hermesHistory = [
            {
              role: 'system' as const,
              content: `Eres Hermes, asistente de Trust Suite. El usuario pertenece a estos árboles:\n\n${context}\n\nReglas:\n- Si el usuario pide algo que YA EXISTE como necesidad en alguno de sus árboles, sugiérele VOTAR en vez de crear un duplicado.\n- Si existe una rama similar, menciónala.\n- Sé conciso. Responde en español.`,
            },
            ...history,
          ];
        }
      } catch (err) {
        console.warn('[concierge] Tree context fetch failed, continuing without:', (err as Error).message);
      }
    }

    // Call Hermes Agent
    const hermesReply = await callHermes(hermesHistory);

    // Add Hermes reply to history
    addToHistory(sid, 'assistant', hermesReply);

    // Parse actions — use tutorial buttons when in tutorial mode, otherwise legacy parser
    let buttons: ConciergeActionButton[] = [];

    if (tutorialPhase && TUTORIAL_CREATOR_PROMPTS[tutorialPhase]) {
      const result = getTutorialActionButtons(tutorialPhase, hermesReply, trimmed);
      buttons = result.buttons;
      nextTutorialPhase = result.nextPhase;
    } else {
      const { buttons: parsedButtons } = parseActions(hermesReply, trimmed);
      buttons = parsedButtons;
    }

    // Search for matching needs (keep existing functionality)
    let matches: NeedSearchResult[] = [];
    try {
      matches = await searchNeeds(trimmed);
    } catch {
      // Silent fail — search is optional
    }

    return {
      action: 'chat',
      matches: matches.slice(0, 3),
      suggestion: hermesReply,
      nextSteps: buttons.length > 0 
        ? buttons.map(b => b.label)
        : ['¿Algo más en lo que pueda ayudarte?'],
      actionButtons: buttons.length > 0 ? buttons : undefined,
      tutorialPhase: nextTutorialPhase as TutorialPhase | undefined,
    };
  } catch (err: any) {
    console.error('[concierge] Hermes API error:', err.message || err);

    // Fallback with more detail
    const errorDetail = err.message || 'Error desconocido';
    return {
      action: 'clarify',
      matches: [],
      suggestion: `Estoy teniendo problemas para conectarme con Hermes (${errorDetail}). ¿Puedes intentar de nuevo?`,
      nextSteps: ['Reintentar', 'Usar la interfaz normal de Trust Suite'],
    };
  }
}
