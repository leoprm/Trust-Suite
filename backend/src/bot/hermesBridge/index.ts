/**
 * Hermes Bridge — Telegram → Hermes Agent integration.
 *
 * Barrel file. Re-exports the public API surface.
 * Phase 1 refactor splits the monolithic hermesBridge.ts into submodules:
 *   types.ts, conversation-window.ts, shouldAriRespond.ts,
 *   routeToHermes.ts, sendTelegramMessage.ts
 */

// ── Named exports (re-exported from monolithic file during transition) ─────
export {
  routeToHermes,
  shouldAriRespond,
  sendTelegramMessage,
} from "../hermesBridge";

// ── Conversation window (extracted submodule) ─────────────────────────────
export { ConversationWindow, conversationWindows } from "./conversation-window";

// ── Type namespace ─────────────────────────────────────────────────────────
export * as types from "./types";
