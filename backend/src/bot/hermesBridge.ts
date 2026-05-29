/**
 * Hermes Agent Bridge — Telegram bot → Hermes Agent API directo.
 *
 * Cuando HERMES_BRIDGE_ENABLED=true, el bot de Telegram enruta todos los
 * mensajes de grupo y DM a través de esta función en vez de handleMessage /
 * handleNaturalMessage / handleDM.
 *
 * La función llama a la API de Hermes Agent (http://127.0.0.1:8642) con un
 * system prompt que incluye el contexto real del árbol (nombre, necesidades
 * activas, miembros) obtenido de la base de datos.
 *
 * Phase 1 refactor: core logic extracted to src/bot/hermesBridge/ submodules.
 * This file is now a pure barrel re-export.
 */

// ── Route (extracted to hermesBridge/route.ts) ──────────────────────────
export { enforcePrefix, routeToHermes } from "./hermesBridge/route";

// ── ConversationWindow (extracted to hermesBridge/conversation-window.ts) ─
export { ConversationWindow, conversationWindows } from "./hermesBridge/conversation-window";

// ── History (extracted to hermesBridge/history.ts) ──────────────────────
export {
  agentsMdCache,
  getAgentsMd,
  collectRecentMessages,
  getChatHistory,
  summarizeHistory,
  compressHistory,
} from "./hermesBridge/history";

// ── Keyword scanning / decision filter (extracted to hermesBridge/decision-filter.ts) ──────
export {
  scanForKeywords,
  scanForKeywordMatch,
  shouldAriRespondLocal,
  shouldAriRespond,
} from "./hermesBridge/decision-filter";

// ── System prompt builder (extracted to hermesBridge/system-prompt.ts) ──
export {
  buildSystemPrompt,
  checkKanbanCompletions,
  taskCounters,
  validateTreeId,
} from "./hermesBridge/system-prompt";

// ── Types ────────────────────────────────────────────────────────────────
export type { ShouldRespondResult } from "./hermesBridge/types";

// ── Telegram sender (extracted to hermesBridge/telegram-sender.ts) ─────
export {
  sendTelegramMessage,
  splitAtBoundary,
  TELEGRAM_MAX_CHARS,
} from "./hermesBridge/telegram-sender";
