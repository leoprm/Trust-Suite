/**
 * Detección de intención "agregar todo" por lenguaje natural cuando tagean a @Ari.
 *
 * Se activa cuando un mensaje menciona a @TrustMakerBot / @TrustMaker / @Ari / @ari
 * y contiene frases como "anota X", "agrega X a la lista", "ponme X", etc.
 * No se activa si el mensaje ya contiene /todo (ese lo maneja el scanner).
 */

// ── Mención del bot (en cualquier parte del mensaje) ──────────────────────
const MENTION_ANYWHERE = /@(TrustMakerBot|TrustMaker|[Aa]ri)\b/i;

// ── Frases de intención ───────────────────────────────────────────────────

/**
 * Grupo A: verbo + pronombre "me" → "agregame X", "ponme X", "anotame X"
 * Captura el texto de la tarea en grupo 1.
 */
const VERB_ME_RE = /(?:agr[eé]game|agregame|p[oó]nme|ponme|an[oó]tame|anotame)\s+(.+)/i;

/**
 * Grupo B: verbo imperativo simple → "agrega X", "anota X", "apunta X", "pon X", "suma X"
 * Usa word boundary para no solaparse con Grupo A.
 */
const VERB_PLAIN_RE = /\b(?:agr[eé]ga|agrega|an[oó]ta|anota|apunta|p[oó]n|pon|suma)\s+(.+)/i;

/**
 * Grupo C: tarea seguida de preposición → "X a la lista", "X en la lista", "X al todo", etc.
 * Captura el texto de la tarea en grupo 1.
 */
const TRAILING_PREP_RE = /(.+?)\s+(?:a|en)\s+(?:la\s+)?(?:lista|tareas|todos|todo)s?\s*$/i;

/**
 * Grupo D: formato explícito → "para la lista: X", "tarea nueva: X"
 * Captura el texto de la tarea en grupo 1.
 */
const COLON_RE = /(?:para\s+la\s+lista|tarea\s+nueva)\s*:\s*(.+)/i;

// ── Frases ambiguas (demasiado genéricas) ─────────────────────────────────

const AMBIGUOUS_PRONOUNS = /\b(?:eso|esto|aquello|lo|algo)\s*$/i;
const AMBIGUOUS_PHRASES = /^(?:eso|esto|aquello|lo|algo|lo mismo|lo de siempre)\s*$/i;

// ── Límites ───────────────────────────────────────────────────────────────

const MIN_TASK_LENGTH = 5;
/** Máximo de caracteres para el resumen (mismo que formatters.ts). */
const TODO_SUMMARY_MAX_LENGTH = 80;

// ── Utilidad: resumir (replica lógica de formatters.ts) ──────────────────
function summarizeTodo(text: string): string {
  if (text.length <= TODO_SUMMARY_MAX_LENGTH) return text;
  const truncated = text.slice(0, TODO_SUMMARY_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 10 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

// ── Limpiar menciones del texto ──────────────────────────────────────────
function stripMentions(text: string): string {
  return text.replace(MENTION_ANYWHERE, "").replace(/\s+/g, " ").trim();
}

// ── Detector principal ───────────────────────────────────────────────────

/**
 * Detecta intención de "agregar todo" por lenguaje natural.
 *
 * @param text  Texto completo del mensaje (sin procesar).
 * @returns     El texto de la tarea a agregar, o null si no se detecta intención.
 */
export function detectNaturalAddIntent(text: string): string | null {
  // 1. Debe mencionar al bot
  if (!MENTION_ANYWHERE.test(text)) return null;

  // 2. No debe contener /todo (eso lo maneja el scanner)
  if (/\/todo\b/i.test(text)) return null;

  // 3. Limpiar menciones para analizar el contenido
  const cleaned = stripMentions(text);
  if (!cleaned) return null;

  // ── Probar cada grupo de patrones ──

  // Grupo A: verbo+me ("agregame comprar pan")
  let match = cleaned.match(VERB_ME_RE);
  if (match) {
    return validateAndExtract(match[1]);
  }

  // Grupo D: formato explícito ("para la lista: comprar pan") — chequear antes de B
  // porque "pon ... para la lista" capturaría mal en el verbo simple
  match = cleaned.match(COLON_RE);
  if (match) {
    return validateAndExtract(match[1]);
  }

  // Grupo C: preposición al final ("comprar pan a la lista")
  match = cleaned.match(TRAILING_PREP_RE);
  if (match) {
    return validateAndExtract(match[1]);
  }

  // Grupo B: verbo simple ("agrega comprar pan")
  match = cleaned.match(VERB_PLAIN_RE);
  if (match) {
    // Check that it's not a false positive from trailing-prep pattern
    // e.g. "agrega comprar pan a la lista" — trailing prep would be better
    const taskText = match[1];
    // If the extracted text ends with a prep phrase, try to trim it
    const trailingInTask = taskText.match(TRAILING_PREP_RE);
    if (trailingInTask) {
      return validateAndExtract(trailingInTask[1]);
    }
    return validateAndExtract(taskText);
  }

  return null;
}

// ── Validación y extracción ──────────────────────────────────────────────

function validateAndExtract(raw: string): string | null {
  // Normalizar whitespace
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;

  // Longitud mínima
  if (text.length < MIN_TASK_LENGTH) return null;

  // Ambigüedad: pronombres genéricos como tarea completa ("anota eso")
  if (AMBIGUOUS_PHRASES.test(text)) return null;

  // Ambigüedad: termina en pronombre genérico precedido de verbo
  // "pon eso", "agrega esto" — la tarea es el pronombre, no hay contenido real
  if (AMBIGUOUS_PRONOUNS.test(text)) return null;

  // Limpiar puntuación sobrante al final
  let cleaned = text.replace(/[,.;:!?¿¡]+$/g, "").trim();
  if (cleaned.length < MIN_TASK_LENGTH) return null;

  // Resumir si es muy largo
  if (cleaned.length > TODO_SUMMARY_MAX_LENGTH) {
    cleaned = summarizeTodo(cleaned);
  }

  return cleaned;
}
