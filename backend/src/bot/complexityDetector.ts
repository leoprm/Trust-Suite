/**
 * KA-1.1: Complexity Detector.
 *
 * Determine whether a natural-language message should be routed to the
 * Concierge pipeline (complex query) or handled by the simple command bot.
 *
 * Rules (ordered, short-circuit):
 *  1. Contains a developer/infra keyword → true
 *  2. Message longer than 300 chars        → true
 *  3. Otherwise                            → false
 */

// ── Keywords that signal a dev-ops / infra query ───────────────────────

const COMPLEX_KEYWORDS: ReadonlyArray<string> = [
  "ssh",
  "servidor",
  "vps",
  "instalar",
  "descargar",
  "clonar",
  "deploy",
  "build",
  "compilar",
  "ejecutar en",
  "configurar en",
];

// ── Helpers ─────────────────────────────────────────────────────────────

function containsKeyword(text: string, keywords: ReadonlyArray<string>): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ── Export ──────────────────────────────────────────────────────────────

/**
 * Returns `true` if the message should be treated as a complex query that
 * may need the Concierge pipeline.
 */
export default function isComplexQuery(message: string): boolean {
  if (typeof message !== "string") return false;

  if (containsKeyword(message, COMPLEX_KEYWORDS)) return true;
  if (message.length > 300) return true;

  return false;
}
