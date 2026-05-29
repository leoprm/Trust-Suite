/**
 * Telegram message sender — chunking and delivery.
 *
 * Extracted from hermesBridge.ts (Phase 1 Task 1.7).
 * Sends messages to Telegram, splitting at paragraph boundaries for
 * the 4096-character limit, and at ``\n---\n`` for multi-message delivery.
 */

// ── Telegram message splitting ────────────────────────────────────────────
// Telegram has a 4096-character limit per message. This helper splits long
// messages at paragraph boundaries and sends them sequentially.

export const TELEGRAM_MAX_CHARS = 4000; // 4096 limit minus safety margin

export function splitAtBoundary(text: string, maxLen: number): string[] {
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
 * ALSO splits on ``\n---\n`` markers — when Ari wants to send multiple
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
  // Ari uses ``\n---\n`` to separate independent messages.
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
