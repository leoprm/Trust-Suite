/**
 * Channel Adapter — routes bot responses through the correct formatter.
 *
 * All bot replies flow through this module. It detects the channel
 * (telegram | whatsapp) and applies the appropriate formatting rules.
 *
 * Telegram: passes text through unchanged (Markdown, 4000-char margin).
 * WhatsApp: splits at 4096 chars, converts formatting, handles media/interactive.
 */

import { Channel, ChannelMessage, BotResponse } from "./channel";
import { formatForWhatsApp } from "./whatsappFormatter";
import { InputFile } from "grammy";

// ── Telegram (passthrough) ─────────────────────────────────────────────────

function formatForTelegram(response: BotResponse): ChannelMessage[] {
  const messages: ChannelMessage[] = [];

  // Telegram keeps text as-is (Markdown parse_mode applied by sender)
  if (response.text) {
    messages.push({ kind: "text", text: response.text });
  }

  // Voice note (TTS-generated)
  if (response.voiceBuffer) {
    messages.push({ kind: "voice", voiceBuffer: response.voiceBuffer });
  }

  // Media via Telegram's native file sending (handled by the caller)
  if (response.media && response.media.length > 0) {
    for (const m of response.media) {
      messages.push({ kind: "media", media: m });
    }
  }

  // Interactive: Telegram uses inline keyboards (not implemented here yet,
  // but the type is carried through for future use)
  if (response.interactive) {
    messages.push({
      kind: "interactive",
      interactive: response.interactive,
    });
  }

  return messages;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert a BotResponse into an ordered array of platform-ready messages.
 *
 * @param response  The response from a command handler or concierge.
 * @param channel   The target channel ("telegram" | "whatsapp").
 * @returns         Ordered array of messages ready to send via the channel API.
 */
export function formatForChannel(
  response: BotResponse,
  channel: Channel,
): ChannelMessage[] {
  switch (channel) {
    case "whatsapp":
      return formatForWhatsApp(response);
    case "telegram":
    default:
      return formatForTelegram(response);
  }
}

/**
 * Format + send a response through a Telegram bot context.
 *
 * For Telegram, this sends text via ctx.reply() with MarkdownV2 parse_mode.
 * Media and interactive messages are sent with appropriate Grammy methods.
 *
 * @returns true if at least one message was sent.
 */
export async function sendViaTelegram(
  ctx: any, // grammy Context (avoiding tight coupling to BotContext type)
  messages: ChannelMessage[],
): Promise<boolean> {
  let sent = false;

  for (const msg of messages) {
    try {
      switch (msg.kind) {
        case "text":
          if (msg.text) {
            await ctx.reply(msg.text, { parse_mode: "Markdown" });
            sent = true;
          }
          break;

        case "voice":
          if (msg.voiceBuffer) {
            await ctx.replyWithVoice(
              new InputFile(msg.voiceBuffer, "voice.ogg"),
            );
            sent = true;
          }
          break;

        case "media":
          if (msg.media) {
            await sendTelegramMedia(ctx, msg.media);
            sent = true;
          }
          break;

        case "interactive":
          // Telegram interactive: send text body + inline keyboard
          if (msg.interactive) {
            await sendTelegramInteractive(ctx, msg.interactive);
            sent = true;
          }
          break;
      }
    } catch (err: any) {
      console.error(
        `[ChannelAdapter] Error sending ${msg.kind} message via Telegram:`,
        err.message,
      );
    }
  }

  return sent;
}

// ── Telegram media sender ──────────────────────────────────────────────────

async function sendTelegramMedia(ctx: any, media: import("./channel").BotMedia): Promise<void> {
  switch (media.type) {
    case "image":
      if (media.url) {
        await ctx.replyWithPhoto(media.url, {
          caption: media.caption || undefined,
        });
      } else if (media.id) {
        await ctx.replyWithPhoto(media.id, {
          caption: media.caption || undefined,
        });
      }
      break;

    case "audio":
      if (media.url) {
        await ctx.replyWithAudio(media.url, {
          caption: media.caption || undefined,
        });
      } else if (media.id) {
        await ctx.replyWithAudio(media.id, {
          caption: media.caption || undefined,
        });
      }
      break;

    case "video":
      if (media.url) {
        await ctx.replyWithVideo(media.url, {
          caption: media.caption || undefined,
        });
      } else if (media.id) {
        await ctx.replyWithVideo(media.id, {
          caption: media.caption || undefined,
        });
      }
      break;

    case "document":
      if (media.url) {
        await ctx.replyWithDocument(media.url, {
          caption: media.caption || undefined,
        });
      } else if (media.id) {
        await ctx.replyWithDocument(media.id, {
          caption: media.caption || undefined,
        });
      }
      break;
  }
}

// ── Telegram interactive sender ────────────────────────────────────────────

async function sendTelegramInteractive(
  ctx: any,
  interactive: import("./channel").BotInteractive,
): Promise<void> {
  const { InlineKeyboard } = require("grammy");

  if (interactive.type === "button" && interactive.action.buttons) {
    const buttons = interactive.action.buttons.map(
      (b: import("./channel").InteractiveButton) => [
        InlineKeyboard.text(b.title, b.id),
      ],
    );

    const text = interactive.body || "Selecciona una opción:";
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard(buttons),
    });
  } else if (interactive.type === "list" && interactive.action.sections) {
    // For Telegram, flatten list into inline keyboard (each row = button)
    const rows: any[][] = [];
    for (const section of interactive.action.sections) {
      for (const row of section.rows) {
        rows.push([InlineKeyboard.text(row.title, row.id)]);
      }
    }

    const text = interactive.body || "Selecciona una opción:";
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard(rows),
    });
  }
}

// ── WhatsApp sender (future — when WhatsApp webhook is wired) ──────────────

/**
 * Send messages via WhatsApp Cloud API.
 *
 * Requires WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN env vars.
 * Rate-limited to 80 msg/sec (Cloud API tier limit).
 *
 * @param to      Recipient phone number in international format (e.g., "56912345678").
 * @param messages Already-formatted ChannelMessage[] from formatForChannel().
 */
export async function sendViaWhatsApp(
  to: string,
  messages: ChannelMessage[],
): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    console.error(
      "[ChannelAdapter] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN not set — cannot send.",
    );
    return false;
  }

  const baseUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  let sent = false;

  for (const msg of messages) {
    let payload: Record<string, unknown>;

    switch (msg.kind) {
      case "text":
        payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: msg.text },
        };
        break;

      case "media":
        if (!msg.media) continue;
        payload = require("./whatsappFormatter").buildMediaPayload(to, msg.media);
        break;

      case "interactive":
        if (!msg.interactive) continue;
        if (msg.interactive.type === "button") {
          payload = require("./whatsappFormatter").buildInteractiveButtonsPayload(
            to,
            msg.interactive,
          );
        } else {
          payload = require("./whatsappFormatter").buildInteractiveListPayload(
            to,
            msg.interactive,
          );
        }
        break;

      default:
        continue;
    }

    try {
      const resp = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(
          `[ChannelAdapter] WhatsApp API error ${resp.status}:`,
          errText.substring(0, 300),
        );
      } else {
        sent = true;
      }
    } catch (err: any) {
      console.error(
        "[ChannelAdapter] WhatsApp send exception:",
        err.message,
      );
    }
  }

  return sent;
}
