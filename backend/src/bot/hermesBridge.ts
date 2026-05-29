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
 * This file is now a barrel re-export + sendTelegramMessage.
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

// ═══════════════════════════════════════════════════════════════════════════
// Telegram message sender
// ═══════════════════════════════════════════════════════════════════════════

// ── Telegram message splitting ────────────────────────────────────────────
// Telegram has a 4096-character limit per message. This helper splits long
// messages at paragraph boundaries and sends them sequentially.

const TELEGRAM_MAX_CHARS = 4000; // 4096 limit minus safety margin

function splitAtBoundary(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at double newline (paragraph)
    let splitPos = remaining.lastIndexOf("\n\n", maxLen);
    // Then single newline
    if (splitPos === -1 || splitPos < maxLen * 0.5) {
      splitPos = remaining.lastIndexOf("\n", maxLen);
    }
    // Then sentence boundary (. followed by space)
    if (splitPos === -1 || splitPos < maxLen * 0.5) {
      splitPos = remaining.lastIndexOf(". ", maxLen);
    }
    // Fallback: hard cut
    if (splitPos === -1 || splitPos < 100) {
      splitPos = maxLen;
    }
    chunks.push(remaining.slice(0, splitPos).trim());
    remaining = remaining.slice(splitPos).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Send a potentially-long message to Telegram, splitting at paragraph
 * boundaries if it exceeds the 4096-character limit.
 *
 * ALSO splits on ``\\n---\\n`` markers — when Ari wants to send multiple
 * independent messages, she separates them with a triple-dash on its own line.
 * Each segment becomes its own Telegram message, and each is independently
 * split at paragraph boundaries if it still exceeds TELEGRAM_MAX_CHARS.
 */
export async function sendTelegramMessage(
  ctx: any,
  text: string,
  parseMode: "Markdown" | "HTML" = "Markdown",
): Promise<void> {
  if (!text) return;

  // ── Multi-message split: ``---`` on its own line ────────────────────
  // Ari uses ``\\n---\\n`` to separate independent messages.
  const MSG_SEPARATOR = /\n---\n/;
  if (MSG_SEPARATOR.test(text)) {
    const segments = text.split(MSG_SEPARATOR).map(s => s.trim()).filter(Boolean);
    console.log(
      `[hermesBridge] Multi-message split: ${segments.length} segments from ${text.length} chars`,
    );
    for (const segment of segments) {
      await sendTelegramMessage(ctx, segment, parseMode);
    }
    return;
  }
  // ──────────────────────────────────────────────────────────────────────

  if (text.length <= TELEGRAM_MAX_CHARS) {
    try {
      await ctx.reply(text, { parse_mode: parseMode });
    } catch (err: any) {
      if (err?.message?.includes("can't parse entities")) {
        console.warn("[hermesBridge] Markdown parse error, retrying without parse_mode");
        await ctx.reply(text);
      } else {
        throw err;
      }
    }
    return;
  }

  console.log(
    `[hermesBridge] Splitting long message: ${text.length} chars → chunks`,
  );
  const chunks = splitAtBoundary(text, TELEGRAM_MAX_CHARS);
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: parseMode });
    } catch (err: any) {
      // If a chunk still fails (e.g., Markdown parsing error), retry without parse_mode
      if (err?.message?.includes("can't parse entities")) {
        await ctx.reply(chunk);
      } else {
        console.error(`[hermesBridge] Failed to send chunk:`, err?.message);
      }
    }
  }
}
