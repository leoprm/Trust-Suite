/**
 * Hermes Bridge — Telegram → Hermes Agent integration.
 *
 * Barrel file. Re-exports the public API surface.
 * Phase 1 refactor splits the monolithic hermesBridge.ts into submodules:
 *   types.ts, conversation-window.ts, history.ts, decision-filter.ts,
 *   system-prompt.ts, route.ts
 */

// ── Constants ──────────────────────────────────────────────────────────────
export * as constants from "./constants";

// ── Route (including enforcePrefix for multi-tree prefixing) ──────────────
export { enforcePrefix, routeToHermes, getHermesApiKey } from "./route";

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
  loadKeywords,
} from "./decision-filter";

// ── System prompt builder (extracted submodule) ───────────────────────────
export {
  buildSystemPrompt,
  checkKanbanCompletions,
  taskCounters,
  validateTreeId,
} from "./system-prompt";

// ── Kanban dead-letter queue ──────────────────────────────────────────────
export {
  writeDlqEntry,
  readDlqEntries,
  buildDlqWarning,
  clearDlq,
} from "./kanban-dlq";
export type { DlqEntry } from "./kanban-dlq";

// ── Types ─────────────────────────────────────────────────────────────────
export type { ShouldRespondResult } from "./types";
export * as types from "./types";
