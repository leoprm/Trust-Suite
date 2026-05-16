/**
 * Detección de completitud, asignación (claim) y liberación (unclaim) de tareas
 * por lenguaje natural.
 *
 * PARTE 1: detectCompletion — detecta frases de completitud en el mensaje.
 * PARTE 2: detectClaim — detecta frases de asignación ("yo tomo la 3").
 * PARTE 3: detectUnclaim — detecta frases de liberación ("no puedo hacer la 2").
 * PARTE 4: Urgencia — al liberar cerca del deadline, escalar.
 */

// ── Stopwords para español e inglés ────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "al", "algo", "algun", "alguna", "algunas", "alguno", "algunos",
  "ante", "antes", "aquel", "aquella", "aquellas", "aquello", "aquellos",
  "asi", "aun", "aunque",
  "bien", "bueno",
  "cada", "casi", "como", "con", "contra", "cual", "cuando",
  "de", "del", "desde", "donde", "durante",
  "e", "el", "ella", "ellas", "ello", "ellos", "en", "entre", "era", "eran",
  "es", "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estado",
  "estan", "estar", "este", "esto", "estos",
  "fue", "fueron",
  "ha", "habia", "han", "hasta", "hay", "hecho", "hola",
  "la", "las", "le", "les", "lo", "los",
  "mas", "me", "mi", "mio", "misma", "mismas", "mismo", "mismos", "mucha",
  "muchas", "mucho", "muchos", "muy",
  "nada", "ni", "no", "nos", "nosotras", "nosotros",
  "o", "otra", "otras", "otro", "otros",
  "para", "pero", "poco", "por", "porque",
  "que", "quien", "quienes",
  "se", "ser", "si", "sido", "sin", "sobre", "su", "sus",
  "tambien", "tan", "tanto", "te", "tener", "ti", "tiene", "tienen",
  "todo", "toda", "todas", "todos", "tu", "tus",
  "un", "una", "unas", "uno", "unos",
  "usted", "ustedes",
  "va", "vamos", "van",
  "y", "ya", "yo",
  // English
  "a", "about", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "been", "being", "but", "by",
  "can", "could",
  "did", "do", "does", "done", "down",
  "each", "even",
  "for", "from",
  "get", "go",
  "had", "has", "have", "he", "her", "here", "hers", "him", "his", "how",
  "i", "if", "in", "into", "is", "it", "its",
  "just",
  "like",
  "may", "me", "might", "more", "most", "must", "my",
  "no", "not", "now",
  "of", "on", "once", "only", "or", "our", "ours", "out", "over", "own",
  "same", "she", "should", "so", "some", "still", "such",
  "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "to", "too",
  "under", "until", "up", "us",
  "very",
  "was", "we", "well", "were", "what", "when", "which", "who", "will",
  "with", "would",
  "you", "your",
]);

// ── Frases de completitud ──────────────────────────────────────────────────

const COMPLETION_PHRASES = [
  "listo", "hecho", "hecha",
  "complete", "completed", "done", "finished",
  "termine", "terminé", "termine", "terminado", "terminada",
  "ya hice", "ya esta", "ya está",
  "fui a",
  "lo hice", "la hice",
  "resuelto", "resuelta", "resolved",
  "cumplido", "cumplida",
  "acabe", "acabé", "acabado",
  "marcar como completado",
  "check", "checked", "ticked",
];

// ── Frases de asignación (claim) ───────────────────────────────────────────

const CLAIM_PHRASES = [
  // Español
  "yo tomo", "yo la tomo", "yo lo tomo",
  "yo la hago", "yo lo hago",
  "me apunto", "me encargo", "me ofrezco",
  "yo puedo", "yo puedo hacer", "yo voy",
  "dame la", "dame el", "dame",
  "yo me hago cargo",
  "yo me encargo de",
  "yo voy por",
  "yo la veo", "yo lo veo",
  "yo puedo con",
  "me la llevo", "me lo llevo",
  // English
  "i take", "i'll take", "i will take",
  "i do", "i'll do", "i will do",
  "i'm on", "i am on",
  "i volunteer", "i'll volunteer",
  "i got this", "i've got this",
  "i can do", "i can take",
  "assign me", "give me",
  "i'll handle", "i will handle",
];

// ── Frases de liberación (unclaim) ─────────────────────────────────────────

const UNCLAIM_PHRASES = [
  // Español
  "no puedo hacer", "no puedo con",
  "no voy a alcanzar", "no voy a poder",
  "no llego", "no alcanzo",
  "al final no puedo", "al final no",
  "me bajo", "me retiro",
  "sueltalo", "soltalo", "liberalo", "liberalo",
  "desasigname", "desasigname",
  "no puedo seguir", "lo dejo",
  "renuncio a", "abandono",
  "no me da", "no me alcanza",
  // English
  "can't do", "cannot do",
  "can't take", "cannot take",
  "won't make", "will not make",
  "dropping", "drop",
  "unassign", "release",
  "i'm out", "i am out",
  "i give up", "i quit",
  "can't handle", "cannot handle",
  "won't be able", "will not be able",
  "i bail", "bailing",
];

/**
 * Compila frases en un solo regex para detección rápida.
 */
function buildRegex(phrases: string[]): RegExp {
  const patterns = phrases.map((p) => {
    if (p.includes(" ")) {
      return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return `\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
  });
  return new RegExp(patterns.join("|"), "i");
}

const COMPLETION_REGEX = buildRegex(COMPLETION_PHRASES);
const CLAIM_REGEX = buildRegex(CLAIM_PHRASES);
const UNCLAIM_REGEX = buildRegex(UNCLAIM_PHRASES);

// ── Numeric reference regex ────────────────────────────────────────────────

const NUMERIC_REGEX =
  /(?:tarea|task|la|el|número|numero|nº|nro|num|punto|item|#)\s*(\d+)/i;

// ── Reminder detection regex ───────────────────────────────────────────────

const REMINDER_REGEX = /⏰.*Recordatorio.*"(.+?)".*fecha límite/i;

// ── Types ──────────────────────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  summary: string;
  text: string;
  createdByName: string | null;
  status: string;
  messageId: bigint;
  assignedTo?: bigint | null;
  assignedToName?: string | null;
  deadline?: Date | null;
  likeCount?: number;
}

export interface CompletionResult {
  todoId: string;
  createdByName: string | null;
  summary: string;
  matchStrategy: "numeric" | "fuzzy" | "reply";
  ambiguous?: TodoItem[]; // si >1 fuzzy match
}

export interface ClaimResult {
  todo: TodoItem;
  matchStrategy: "numeric" | "fuzzy" | "reply";
}

export interface UrgencyInfo {
  level: "critical" | "urgent";
  hoursRemaining: number;
  deadlineDate: Date;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Calcula similitud de keywords: intersección / unión.
 */
function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

// ── Detectores ─────────────────────────────────────────────────────────────

export function hasCompletionLanguage(text: string): boolean {
  return COMPLETION_REGEX.test(text.toLowerCase());
}

export function hasClaimLanguage(text: string): boolean {
  return CLAIM_REGEX.test(text.toLowerCase());
}

export function hasUnclaimLanguage(text: string): boolean {
  return UNCLAIM_REGEX.test(text.toLowerCase());
}

/**
 * Detecta si el texto es una respuesta al mensaje de ambigüedad del bot.
 * Ej: "1" o "2" o "la 1" o "primera"
 */
export function detectAmbiguityResolution(text: string): number | null {
  const numMatch = text.trim().match(/^(\d+)$/);
  if (numMatch) return parseInt(numMatch[1], 10);

  const wordNums: Record<string, number> = {
    "uno": 1, "primero": 1, "primera": 1, "one": 1, "first": 1,
    "dos": 2, "segundo": 2, "segunda": 2, "two": 2, "second": 2,
    "tres": 3, "tercero": 3, "tercera": 3, "three": 3, "third": 3,
    "cuatro": 4, "cuarto": 4, "cuarta": 4, "four": 4, "fourth": 4,
    "cinco": 5, "quinto": 5, "quinta": 5, "five": 5, "fifth": 5,
  };
  const lower = text.toLowerCase().trim();
  for (const [word, num] of Object.entries(wordNums)) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(lower)) return num;
  }

  return null;
}

// ── Matching ───────────────────────────────────────────────────────────────

function matchNumeric(text: string, todos: TodoItem[]): TodoItem | null {
  const match = text.match(NUMERIC_REGEX);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num >= 1 && num <= todos.length) {
    return todos[num - 1];
  }
  return null;
}

function matchFuzzy(text: string, todos: TodoItem[]): TodoItem[] {
  const textTokens = tokenize(text);
  if (textTokens.length === 0) return [];

  const scored = todos.map((todo) => {
    const todoTokens = tokenize(`${todo.summary} ${todo.text}`);
    const score = keywordOverlap(textTokens, todoTokens);
    return { todo, score };
  });

  return scored
    .filter((s) => s.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.todo);
}

function matchReply(
  isReplyToBot: boolean,
  replyMessageText: string | undefined,
  todos: TodoItem[],
): TodoItem | null {
  if (!isReplyToBot || !replyMessageText) return null;

  const lowerReply = replyMessageText.toLowerCase();

  // Check if the replied-to message mentions any todo summary
  for (const todo of todos) {
    if (lowerReply.includes(todo.summary.toLowerCase())) {
      return todo;
    }
  }

  // Check if replied-to message is a todo list (starts with 📋)
  if (lowerReply.includes("📋") || lowerReply.includes("pendientes")) {
    const numMatch = replyMessageText.match(NUMERIC_REGEX);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (num >= 1 && num <= todos.length) {
        return todos[num - 1];
      }
    }
  }

  return null;
}

/**
 * Match a todo from a reminder message the bot sent.
 * Reminder format: ⏰ *Recordatorio:* "{summary}" tiene fecha límite *{date}*. ...
 */
function matchReplyReminder(
  replyMessageText: string | undefined,
  todos: TodoItem[],
): TodoItem | null {
  if (!replyMessageText) return null;

  // Try to extract summary from reminder format
  const reminderMatch = replyMessageText.match(REMINDER_REGEX);
  if (reminderMatch) {
    const summary = reminderMatch[1].trim().toLowerCase();
    for (const todo of todos) {
      if (todo.summary.toLowerCase() === summary ||
          summary.includes(todo.summary.toLowerCase()) ||
          todo.summary.toLowerCase().includes(summary)) {
        return todo;
      }
    }
  }

  // Also try direct summary matching on reminder text
  const lowerReply = replyMessageText.toLowerCase();
  if (lowerReply.includes("recordatorio") || lowerReply.includes("⏰")) {
    for (const todo of todos) {
      if (lowerReply.includes(todo.summary.toLowerCase())) {
        return todo;
      }
    }
  }

  return null;
}

// ── Main API: Completion ───────────────────────────────────────────────────

export function detectCompletion(
  text: string,
  todos: TodoItem[],
  isReplyToBot: boolean = false,
  replyMsgText?: string,
): CompletionResult | null {
  if (todos.length === 0) return null;
  if (!hasCompletionLanguage(text)) return null;

  const numericMatch = matchNumeric(text, todos);
  if (numericMatch) {
    return {
      todoId: numericMatch.id,
      createdByName: numericMatch.createdByName,
      summary: numericMatch.summary,
      matchStrategy: "numeric",
    };
  }

  const replyMatch = matchReply(isReplyToBot, replyMsgText, todos);
  if (replyMatch) {
    return {
      todoId: replyMatch.id,
      createdByName: replyMatch.createdByName,
      summary: replyMatch.summary,
      matchStrategy: "reply",
    };
  }

  const fuzzyMatches = matchFuzzy(text, todos);
  if (fuzzyMatches.length === 1) {
    const m = fuzzyMatches[0];
    return {
      todoId: m.id,
      createdByName: m.createdByName,
      summary: m.summary,
      matchStrategy: "fuzzy",
    };
  }

  if (fuzzyMatches.length > 1) {
    return {
      todoId: "",
      createdByName: null,
      summary: "",
      matchStrategy: "fuzzy",
      ambiguous: fuzzyMatches.slice(0, 5),
    };
  }

  return null;
}

// ── Main API: Claim ────────────────────────────────────────────────────────

/**
 * Detecta si el mensaje es una asignación voluntaria ("yo tomo la 3").
 * Misma lógica de matching que completar: numérico → reply → reminder → fuzzy.
 */
export function detectClaim(
  text: string,
  todos: TodoItem[],
  isReplyToBot: boolean = false,
  replyMsgText?: string,
): ClaimResult | null {
  if (todos.length === 0) return null;
  if (!hasClaimLanguage(text)) return null;

  // Strategy 1: Numeric reference
  const numericMatch = matchNumeric(text, todos);
  if (numericMatch) {
    return { todo: numericMatch, matchStrategy: "numeric" };
  }

  // Strategy 2: Reply to bot message (todo list or specific todo)
  const replyMatch = matchReply(isReplyToBot, replyMsgText, todos);
  if (replyMatch) {
    return { todo: replyMatch, matchStrategy: "reply" };
  }

  // Strategy 2b: Reply to a reminder message
  const reminderMatch = matchReplyReminder(replyMsgText, todos);
  if (reminderMatch) {
    return { todo: reminderMatch, matchStrategy: "reply" };
  }

  // Strategy 3: Fuzzy keyword matching — take top match
  const fuzzyMatches = matchFuzzy(text, todos);
  if (fuzzyMatches.length >= 1) {
    return { todo: fuzzyMatches[0], matchStrategy: "fuzzy" };
  }

  return null;
}

// ── Main API: Unclaim ──────────────────────────────────────────────────────

/**
 * Detecta si el mensaje es una liberación ("no puedo hacer la 3").
 */
export function detectUnclaim(
  text: string,
  todos: TodoItem[],
  isReplyToBot: boolean = false,
  replyMsgText?: string,
): ClaimResult | null {
  if (todos.length === 0) return null;
  if (!hasUnclaimLanguage(text)) return null;

  // Only match assigned todos for unclaim — user must be assigned to it
  const assignedTodos = todos.filter((t) => t.assignedTo != null);

  // Strategy 1: Numeric reference
  const numericMatch = matchNumeric(text, assignedTodos.length > 0 ? assignedTodos : todos);
  if (numericMatch) {
    return { todo: numericMatch, matchStrategy: "numeric" };
  }

  // Strategy 2: Reply to bot message
  const replyMatch = matchReply(isReplyToBot, replyMsgText, assignedTodos.length > 0 ? assignedTodos : todos);
  if (replyMatch) {
    return { todo: replyMatch, matchStrategy: "reply" };
  }

  // Strategy 3: Fuzzy keyword matching
  const fuzzyMatches = matchFuzzy(text, assignedTodos.length > 0 ? assignedTodos : todos);
  if (fuzzyMatches.length >= 1) {
    return { todo: fuzzyMatches[0], matchStrategy: "fuzzy" };
  }

  return null;
}

// ── Urgency check ──────────────────────────────────────────────────────────

/**
 * Verifica urgencia al liberar una tarea con deadline.
 * Retorna null si no es urgente, o UrgencyInfo con nivel y horas restantes.
 */
export function checkUrgency(deadline: Date | null | undefined): UrgencyInfo | null {
  if (!deadline) return null;

  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    // Already overdue
    return { level: "critical", hoursRemaining: Math.abs(diffHours), deadlineDate: deadline };
  }
  if (diffHours < 2) {
    return { level: "critical", hoursRemaining: diffHours, deadlineDate: deadline };
  }
  if (diffHours < 6) {
    return { level: "urgent", hoursRemaining: diffHours, deadlineDate: deadline };
  }

  return null;
}

/**
 * Format time remaining in a human-readable way.
 */
export function formatTimeRemaining(hoursRemaining: number, lng: string = "es"): string {
  if (hoursRemaining < 0) {
    const mins = Math.abs(Math.round(hoursRemaining * 60));
    return lng === "en"
      ? `${mins} min ago`
      : `hace ${mins} min`;
  }
  if (hoursRemaining < 1) {
    const mins = Math.round(hoursRemaining * 60);
    return lng === "en"
      ? `${mins} min`
      : `${mins} min`;
  }
  if (hoursRemaining < 2) {
    const mins = Math.round(hoursRemaining * 60);
    return lng === "en"
      ? `${Math.floor(hoursRemaining)}h ${mins % 60}m`
      : `${Math.floor(hoursRemaining)}h ${mins % 60}m`;
  }
  return lng === "en"
    ? `${Math.round(hoursRemaining * 10) / 10}h`
    : `${Math.round(hoursRemaining * 10) / 10}h`;
}

/**
 * Format a deadline Date as a short locale string.
 */
export function formatDeadlineTime(deadline: Date, lng: string = "es"): string {
  const locale = lng === "en" ? "en-US" : "es-CL";
  return deadline.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " " + deadline.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}
