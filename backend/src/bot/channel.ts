/**
 * Channel abstraction layer — types for multi-channel bot responses.
 * 
 * Supported channels: telegram, whatsapp.
 * WhatsApp limits: 4096 chars per text message, media via Cloud API,
 * interactive templates (buttons up to 3, lists up to 10 rows).
 */

// ── Channel ──────────────────────────────────────────────────────────────────

export type Channel = "telegram" | "whatsapp";

export function detectChannel(source: string): Channel {
  if (source === "whatsapp" || source === "wa") return "whatsapp";
  return "telegram"; // default
}

// ── Bot Response (what command handlers return) ──────────────────────────────

/** Rich response from a command/concierge handler. */
export interface BotResponse {
  text: string;
  react?: boolean;
  media?: BotMedia[];
  interactive?: BotInteractive;
  /** OGG Opus buffer for Telegram voice note (sendVoice). */
  voiceBuffer?: Buffer;
}

/** Media attachment (image, audio, video, document). */
export interface BotMedia {
  type: "image" | "audio" | "video" | "document";
  url?: string;   // public URL (WhatsApp Cloud API: link)
  id?: string;    // provider media ID (WhatsApp: media id)
  caption?: string;
  filename?: string;
}

/** Interactive template (WhatsApp buttons or list). */
export interface BotInteractive {
  type: "button" | "list";
  body: string; // main text shown above the buttons/list
  header?: string; // optional header
  footer?: string; // optional footer
  action: BotInteractiveAction;
}

export interface BotInteractiveAction {
  buttons?: InteractiveButton[]; // for type="button": 1-3 buttons
  button?: string;               // for type="list": the "select" button label
  sections?: InteractiveSection[]; // for type="list": 1-10 sections
}

export interface InteractiveButton {
  id: string;
  title: string; // max 20 chars
}

export interface InteractiveSection {
  title: string; // max 24 chars
  rows: InteractiveRow[]; // 1-10 rows
}

export interface InteractiveRow {
  id: string;       // max 200 chars
  title: string;    // max 24 chars
  description?: string; // max 72 chars
}

// ── Channel Message (what gets sent to the platform) ─────────────────────────

/** A single message ready to be sent via the channel API. */
export interface ChannelMessage {
  kind: "text" | "media" | "interactive" | "voice";
  text?: string;
  media?: BotMedia;
  interactive?: BotInteractive;
  /** OGG Opus buffer for Telegram replyWithVoice. */
  voiceBuffer?: Buffer;
}
