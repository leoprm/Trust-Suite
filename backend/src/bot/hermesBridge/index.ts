/**
 * Hermes Bridge — Telegram → Hermes Agent integration.
 *
 * Barrel file. Re-exports the public API surface.
 * Phase 1 refactor splits the monolithic hermesBridge.ts into submodules:
 *   types.ts, conversation-window.ts, history.ts, decision-filter.ts,
 *   system-prompt.ts, route.ts
 */

// ── Named exports (re-exported from monolithic file during transition) ─────
export { routeToHermes } from "../hermesBridge";

// ── Telegram sender (extracted submodule) ────────────────────────────────
export {
  sendTelegramMessage,
  splitAtBoundary,
  TELEGRAM_MAX_CHARS,
} from "./telegram-sender";

// ── Conversation window (extracted submodule) ─────────────────────────────
export { ConversationWindow, conversationWindows } from "./conversation-window";

// ── History (extracted submodule) ─────────────────────────────────────────
export {
  agentsMdCache,
  getAgentsMd,
  collectRecentMessages,
  getChatHistory,
  summarizeHistory,
  compressHistory,
} from "./history";

// ── Decision filter (extracted submodule) ────────────────────────────────
export {
  scanForKeywords,
  scanForKeywordMatch,
  shouldAriRespondLocal,
  shouldAriRespond,
} from "./decision-filter";

// ── System prompt builder (extracted submodule) ───────────────────────────
export {
  buildSystemPrompt,
  checkKanbanCompletions,
  taskCounters,
} from "./system-prompt";

// ── Type namespace ─────────────────────────────────────────────────────────
export * as types from "./types";
