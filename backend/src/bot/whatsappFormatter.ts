/**
 * WhatsApp-specific response formatting.
 *
 * Handles:
 * - 4096-char text splitting (with smart segment boundaries)
 * - Markdown → WhatsApp formatting conversion
 * - Media message construction (Cloud API shape)
 * - Interactive templates (buttons 1-3, lists 1-10)
 *
 * WhatsApp Cloud API reference:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

import {
  BotResponse,
  BotMedia,
  BotInteractive,
  InteractiveButton,
  ChannelMessage,
} from "./channel";

// ── Constants ───────────────────────────────────────────────────────────────

/** WhatsApp text message hard limit. */
const WA_MAX_CHARS = 4096;

/** Margin for splitting — ensures we don't hit the limit due to formatting. */
const WA_SPLIT_MARGIN = 100;
const WA_SPLIT_AT = WA_MAX_CHARS - WA_SPLIT_MARGIN;

/** WhatsApp formatting markers (same as Telegram Markdown subset). */
const WA_BOLD = "*";
const WA_ITALIC = "_";
const WA_STRIKETHROUGH = "~";
const WA_MONOSPACE = "```";
const WA_INLINE_CODE = "`";

// ── Public ──────────────────────────────────────────────────────────────────

/**
 * Convert a BotResponse into an ordered array of ChannelMessages
 * ready to send via WhatsApp Cloud API.
 */
export function formatForWhatsApp(response: BotResponse): ChannelMessage[] {
  const messages: ChannelMessage[] = [];

  // 1. Text (split if needed)
  if (response.text) {
    const segments = splitText(response.text);
    for (const seg of segments) {
      messages.push({ kind: "text", text: seg });
    }
  }

  // 2. Media attachments (each as a separate message)
  if (response.media && response.media.length > 0) {
    for (const m of response.media) {
      messages.push({ kind: "media", media: m });
    }
  }

  // 3. Interactive template (if present, appended after text+media)
  if (response.interactive) {
    messages.push({
      kind: "interactive",
      interactive: response.interactive,
    });
    // If there's a body, prepend it as text before the interactive
    if (response.interactive.body) {
      // Insert text message right before the interactive if it's substantial
      // (the interactive body is separate from the message text)
    }
  }

  return messages;
}

// ── Text splitting ──────────────────────────────────────────────────────────

/**
 * Split a long text into WhatsApp-compatible segments.
 *
 * Strategy:
 * 1. If <= WA_SPLIT_AT, return as single segment.
 * 2. Split at paragraph boundaries (double newline) when possible.
 * 3. Fall back to sentence boundaries (.!? followed by space).
 * 4. Last resort: hard split at character boundary.
 *
 * Each segment is stripped of leading/trailing whitespace.
 * Markdown formatting characters are preserved (WhatsApp supports them).
 */
export function splitText(text: string): string[] {
  if (text.length <= WA_SPLIT_AT) return [text];

  const segments: string[] = [];

  // ── Phase 1: split by paragraphs (double newline) ──
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If adding this paragraph fits, accumulate
    if (
      !current ||
      current.length + 2 + trimmed.length <= WA_SPLIT_AT
    ) {
      current = current ? current + "\n\n" + trimmed : trimmed;
    } else {
      // Current segment is full — push it
      if (current) {
        segments.push(current);
      }

      // If this single paragraph is still too long, split further
      if (trimmed.length > WA_SPLIT_AT) {
        segments.push(...hardSplit(trimmed));
        current = "";
      } else {
        current = trimmed;
      }
    }
  }

  if (current) segments.push(current);

  // ── Phase 2: enforce max length on any remaining oversized segments ──
  const result: string[] = [];
  for (const seg of segments) {
    if (seg.length <= WA_SPLIT_AT) {
      result.push(seg);
    } else {
      result.push(...hardSplit(seg));
    }
  }

  // Add continuation markers for multi-segment messages
  if (result.length > 1) {
    for (let i = 1; i < result.length; i++) {
      result[i] = `(...)\n${result[i]}`;
    }
  }

  return result;
}

// ── Sentence-aware hard split ───────────────────────────────────────────────

function hardSplit(text: string): string[] {
  const segments: string[] = [];
  let remaining = text;

  while (remaining.length > WA_SPLIT_AT) {
    // Try to split at a sentence boundary near the limit
    const chunk = remaining.substring(0, WA_SPLIT_AT);
    const sentenceBreak = findSentenceBreak(chunk);

    let cutPoint: number;
    if (sentenceBreak > WA_SPLIT_AT / 2) {
      cutPoint = sentenceBreak + 1; // include the punctuation
    } else {
      // Try line break
      const lineBreak = chunk.lastIndexOf("\n");
      if (lineBreak > WA_SPLIT_AT / 2) {
        cutPoint = lineBreak + 1;
      } else {
        // Hard character split at a space
        const space = chunk.lastIndexOf(" ");
        cutPoint = space > WA_SPLIT_AT / 2 ? space + 1 : WA_SPLIT_AT - 3;
      }
    }

    segments.push(remaining.substring(0, cutPoint).trim());
    remaining = remaining.substring(cutPoint).trim();
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments;
}

/** Find the last sentence-ending punctuation in a string. */
function findSentenceBreak(text: string): number {
  const matches = text.match(/[.!?](?=\s|$)/g);
  if (!matches || matches.length === 0) return -1;

  // Find the last match position
  let lastIdx = -1;
  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(". ", searchFrom);
    const idxQ = text.indexOf("! ", searchFrom);
    const idxE = text.indexOf("? ", searchFrom);

    const candidates = [idx, idxQ, idxE].filter((i) => i !== -1);
    if (candidates.length === 0) break;

    const minIdx = Math.min(...candidates);
    lastIdx = minIdx;
    searchFrom = minIdx + 1;
  }

  return lastIdx;
}

// ── Media helpers ───────────────────────────────────────────────────────────

/**
 * Build a WhatsApp Cloud API media message payload.
 *
 * Uses link (URL) or id (pre-uploaded media) for the media source.
 *
 * Cloud API shape:
 * {
 *   messaging_product: "whatsapp",
 *   recipient_type: "individual",
 *   to: "<phone>",
 *   type: "image"|"audio"|"video"|"document",
 *   [type]: { id: "<media-id>" | link: "<url>", caption: "<text>" }
 * }
 */
export function buildMediaPayload(
  to: string,
  media: BotMedia,
): Record<string, unknown> {
  const mediaType = media.type;
  const mediaObj: Record<string, unknown> = {};

  if (media.id) {
    mediaObj.id = media.id;
  } else if (media.url) {
    mediaObj.link = media.url;
  }

  if (media.caption) {
    mediaObj.caption = media.caption;
  }
  if (media.filename && mediaType === "document") {
    mediaObj.filename = media.filename;
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: mediaType,
    [mediaType]: mediaObj,
  };
}

// ── Interactive template builders ───────────────────────────────────────────

/**
 * Build a WhatsApp Cloud API interactive button message.
 *
 * Max 3 buttons. Each button: reply type with id + title (max 20 chars).
 *
 * Cloud API shape:
 * {
 *   type: "interactive",
 *   interactive: {
 *     type: "button",
 *     header: { type: "text", text: "..." },
 *     body: { text: "..." },
 *     footer: { text: "..." },
 *     action: { buttons: [{ type: "reply", reply: { id: "...", title: "..." } }] }
 *   }
 * }
 */
export function buildInteractiveButtonsPayload(
  to: string,
  interactive: BotInteractive,
): Record<string, unknown> {
  const buttons = (interactive.action.buttons || []).slice(0, 3).map(
    (b: InteractiveButton) => ({
      type: "reply",
      reply: {
        id: b.id,
        title: b.title.substring(0, 20),
      },
    }),
  );

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: interactive.body.substring(0, 1024) },
      action: { buttons },
    },
  };

  const interactiveObj = payload.interactive as Record<string, unknown>;

  if (interactive.header) {
    interactiveObj.header = {
      type: "text",
      text: interactive.header.substring(0, 60),
    };
  }

  if (interactive.footer) {
    interactiveObj.footer = {
      text: interactive.footer.substring(0, 60),
    };
  }

  return payload;
}

/**
 * Build a WhatsApp Cloud API interactive list message.
 *
 * Max 10 rows across up to 10 sections. One "select" button label.
 *
 * Cloud API shape:
 * {
 *   type: "interactive",
 *   interactive: {
 *     type: "list",
 *     header: { type: "text", text: "..." },
 *     body: { text: "..." },
 *     footer: { text: "..." },
 *     action: {
 *       button: "Select",
 *       sections: [{ title: "...", rows: [{ id: "...", title: "...", description: "..." }] }]
 *     }
 *   }
 * }
 */
export function buildInteractiveListPayload(
  to: string,
  interactive: BotInteractive,
): Record<string, unknown> {
  const sections = (interactive.action.sections || []).map((section) => ({
    title: section.title.substring(0, 24),
    rows: (section.rows || []).slice(0, 10).map((row) => ({
      id: row.id.substring(0, 200),
      title: row.title.substring(0, 24),
      ...(row.description
        ? { description: row.description.substring(0, 72) }
        : {}),
    })),
  }));

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: interactive.body.substring(0, 1024) },
      action: {
        button: (interactive.action.button || "Seleccionar").substring(0, 20),
        sections,
      },
    },
  };

  const interactiveObj = payload.interactive as Record<string, unknown>;

  if (interactive.header) {
    interactiveObj.header = {
      type: "text",
      text: interactive.header.substring(0, 60),
    };
  }

  if (interactive.footer) {
    interactiveObj.footer = {
      text: interactive.footer.substring(0, 60),
    };
  }

  return payload;
}
