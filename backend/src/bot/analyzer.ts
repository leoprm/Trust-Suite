/**
 * SPEC-3: Analizador de feedback pasivo.
 *
 * Escanea mensajes de grupo (sin mención al bot) en busca de menciones
 * a necesidades OPEN del árbol. Si detecta una y el sentimiento no es
 * neutral, registra un rating vía POST /api/ratings.
 */

import { PrismaClient } from "@prisma/client";

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface SentimentResult {
  score: number; // 1-10
  label: "positive" | "negative" | "neutral";
}

// ── Palabras clave ────────────────────────────────────────────────────────

const POSITIVE_WORDS = [
  "excelente",
  "buenísimo",
  "genial",
  "funciona",
  "resolvió",
  "útil",
  "gracias",
  "👍",
  "🎉",
  "❤️",
  "🚀",
  "✅",
];

const NEGATIVE_WORDS = [
  "malo",
  "no funciona",
  "error",
  "problema",
  "roto",
  "falla",
  "lento",
  "👎",
  "❌",
  "😡",
];

// ── S3.2: fuzzyMatch ──────────────────────────────────────────────────────

/**
 * Normaliza un string: lowercase, sin acentos, espacios colapsados.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos/diacríticos
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fuzzy match entre el texto de un mensaje y el título de una necesidad.
 * Retorna true si el título aparece como substring o si >=60% de las
 * palabras del título (de >2 chars) se encuentran en el texto.
 */
export function fuzzyMatch(text: string, title: string): boolean {
  const nText = normalize(text);
  const nTitle = normalize(title);

  // Substring match directo
  if (nText.includes(nTitle) || nTitle.includes(nText)) {
    return true;
  }

  // Word overlap: al menos 60% de las palabras del título en el texto
  const titleWords = nTitle.split(/\s+/).filter((w) => w.length > 2);
  if (titleWords.length === 0) return false;

  const matchCount = titleWords.filter((w) => nText.includes(w)).length;
  return matchCount / titleWords.length >= 0.6;
}

// ── S3.3: analyzeSentiment ────────────────────────────────────────────────

/**
 * Analiza el sentimiento de un texto mediante conteo simple de palabras
 * positivas y negativas.
 *
 * Base: 5 (neutral). Cada palabra positiva suma 1, cada negativa resta 1.
 * Clamp final a [1, 10].
 *
 * Label: positive (>6), negative (<4), neutral (4-6).
 */
export function analyzeSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();

  let score = 5;

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) score++;
  }

  for (const word of NEGATIVE_WORDS) {
    // "no funciona" también captura "funciona" sin el "no"
    // → chequear primero el multi-word para que no haya doble conteo
    if (lower.includes(word)) score--;
  }

  score = Math.max(1, Math.min(10, score));

  let label: SentimentResult["label"];
  if (score > 6) label = "positive";
  else if (score < 4) label = "negative";
  else label = "neutral";

  return { score, label };
}

// ── SPEC-6: inferRole ─────────────────────────────────────────────────────

const ROLE_PATTERNS: [RegExp, string][] = [
  [/implement|desarrollo|código|pr\b|pull request|commit/i, "implementer"],
  [/investig|research|paper|estudio|análisis/i, "researcher"],
  [/review|revisión|validación|check/i, "reviewer"],
  [/consenso|mediación|acuerdo|discusión/i, "mediator"],
];

/**
 * Infiere el rol al que va dirigido el feedback a partir de palabras clave
 * en el texto del mensaje. Default → "analyst".
 */
export function inferRole(text: string): string {
  for (const [pattern, role] of ROLE_PATTERNS) {
    if (pattern.test(text)) return role;
  }
  return "analyst";
}

// ── Helpers internos ──────────────────────────────────────────────────────

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";
const API_PORT = process.env.PORT ?? "3000";
const RATINGS_URL = `http://localhost:${API_PORT}/api/ratings`;

/**
 * Busca el Agent asociado a una necesidad.
 * Recorre las Tasks asignadas a AIs en el árbol de la necesidad.
 * Si no hay tasks AI, busca cualquier Agent con membresía en el tree.
 * Retorna null si no se encuentra ninguno.
 */
async function findAgentForNeed(
  prisma: PrismaClient,
  needId: string,
  treeId: string
): Promise<string | null> {
  // 1. Buscar tasks AI asignadas a esta necesidad
  const aiTasks = await prisma.task.findMany({
    where: { needId, assignedTo: { not: null } },
    include: { assignedAI: true },
    take: 1,
  });

  for (const task of aiTasks) {
    const member = task.assignedAI;
    if (member?.isAI && member?.aiProfile) {
      const agent = await prisma.agent.findUnique({
        where: { name: member.aiProfile },
      });
      if (agent) return agent.id;
    }
  }

  // 2. Fallback: cualquier Agent con membresía en este árbol
  const anyMembership = await prisma.agentMembership.findFirst({
    where: { treeId },
    select: { agentId: true },
  });
  if (anyMembership) return anyMembership.agentId;

  return null;
}

/**
 * SPEC-6: Fallback — busca un agente activamente asignado al árbol para un rol
 * específico vía AgentRoleHistory (releasedAt = null).
 */
async function findAgentByRole(
  prisma: PrismaClient,
  treeId: string,
  role: string
): Promise<string | null> {
  const assignment = await prisma.agentRoleHistory.findFirst({
    where: { treeId, role, releasedAt: null },
    select: { agentId: true },
    orderBy: { assignedAt: "desc" },
  });
  return assignment?.agentId ?? null;
}

/**
 * Obtiene un taskId válido para el rating.
 * Busca una Task asociada a la necesidad; si no existe, crea una
 * placeholder mínima (title = titulo de la need, status OPEN).
 */
async function resolveTaskId(
  prisma: PrismaClient,
  needId: string,
  treeId: string,
  needTitle: string
): Promise<string | null> {
  // Buscar task existente
  const existing = await prisma.task.findFirst({
    where: { needId },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Crear placeholder task (la FK de Rating a Task lo exige)
  try {
    const created = await prisma.task.create({
      data: {
        treeId,
        needId,
        title: needTitle.slice(0, 200),
        description: `Feedback pasivo desde Telegram`,
        status: "OPEN",
      },
    });
    return created.id;
  } catch {
    return null;
  }
}

// ── S3.1: analyzeMessage ──────────────────────────────────────────────────

/**
 * Analiza un mensaje de grupo en busca de feedback pasivo sobre necesidades.
 *
 * 1. Busca necesidades OPEN del árbol (por telegramChatId)
 * 2. Para cada necesidad: fuzzy match contra el texto del mensaje
 * 3. Si hay match: analiza sentimiento
 * 4. Si el sentimiento no es neutral → POST /api/ratings
 *
 * Esta función es fire-and-forget: no lanza errores hacia arriba.
 */
export async function analyzeMessage(
  prisma: PrismaClient,
  ctx: any,
  chatId: string
): Promise<void> {
  try {
    const msg = ctx.message;
    // Solo aplica a mensajes de texto en grupos
    if (!msg || !("text" in msg) || !msg.text) return;
    if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") return;

    const text: string = msg.text;

    // ── 1. Buscar el árbol ──────────────────────────────────────────────
    const tree = await prisma.tree.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    if (!tree) return;

    const treeId: string = tree.id;

    // ── 2. Necesidades OPEN del árbol ───────────────────────────────────
    const openNeeds = await prisma.need.findMany({
      where: { treeId, status: "OPEN" },
      select: { id: true, title: true },
    });
    if (openNeeds.length === 0) return;

    // ── 3. Recorrer necesidades → fuzzy match → sentimiento → rating ────
    for (const need of openNeeds) {
      if (!fuzzyMatch(text, need.title)) continue;

      const sentiment = analyzeSentiment(text);
      if (sentiment.label === "neutral") continue;

      // Resolver rol, agent y task
      const role = inferRole(text);
      const agentId =
        (await findAgentForNeed(prisma, need.id, treeId)) ??
        (await findAgentByRole(prisma, treeId, role));
      if (!agentId) continue; // sin agent no hay rating

      const taskId = await resolveTaskId(prisma, need.id, treeId, need.title);
      if (!taskId) continue;

      // ── 4. POST /api/ratings ────────────────────────────────────────
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (API_SERVER_KEY) {
        headers["Authorization"] = `Bearer ${API_SERVER_KEY}`;
      }

      await fetch(RATINGS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          agentId,
          treeId,
          taskId,
          ratings: [{ role, stars: sentiment.score }],
          crossTreeContribution: true,
        }),
      });

      // Solo registramos el primer match encontrado por mensaje
      console.log(
        `[analyzer] Rating registrado: need="${need.title}" role=${role} score=${sentiment.score} label=${sentiment.label}`
      );
      return;
    }
  } catch (err: any) {
    // Fire-and-forget: no interrumpir el flujo del bot
    console.error("[analyzer] Error en analyzeMessage:", err.message || err);
  }
}
