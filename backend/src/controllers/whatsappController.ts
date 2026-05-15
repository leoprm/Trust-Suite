import { Request, Response } from 'express';
import { sendTextMessage } from '../services/whatsappService';

// ── WhatsApp Cloud API Webhook ─────────────────────────────────────────────
// Recibe mensajes de WhatsApp Cloud API, verifica el token de validación,
// normaliza el mensaje al mismo formato interno que usa Telegram
// (sender, text, chatId), y lo reenvía al pipeline del concierge.

const CONCIERGE_URL = 'http://localhost:3100/api/concierge';
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
const WHATSAPP_DEFAULT_TREE_ID = process.env.WHATSAPP_DEFAULT_TREE_ID ?? '';
const CONCIERGE_TIMEOUT_MS = 900_000; // 15 min

// ── WhatsApp Cloud API types ──────────────────────────────────────────────

interface WhatsAppMessage {
  from: string;       // sender phone number
  id: string;         // message ID
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; mime_type: string; filename: string; sha256: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  button?: { payload: string; text: string };
  interactive?: { type: string };
  contacts?: Array<{ name: { formatted_name: string }; phones: Array<{ phone: string }> }>;
}

interface WhatsAppValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: WhatsAppMessage[];
  statuses?: any[];
}

interface WhatsAppEntry {
  id: string;
  changes: Array<{
    value: WhatsAppValue;
    field: string;
  }>;
}

interface WhatsAppWebhookBody {
  object: string;
  entry: WhatsAppEntry[];
}

// ── Internal message format (same as Telegram) ────────────────────────────

interface NormalizedMessage {
  sender: string;   // phone number (WhatsApp user ID)
  text: string;     // message body
  chatId: string;   // phone number (WhatsApp is 1:1 in practice)
  timestamp: string;
  messageId: string;
  contactName?: string;
}

// ── Message normalization ─────────────────────────────────────────────────

function normalizeMessage(
  msg: WhatsAppMessage,
  contact?: { profile: { name: string }; wa_id: string },
): NormalizedMessage | null {
  let text = '';

  switch (msg.type) {
    case 'text':
      text = msg.text?.body ?? '';
      break;
    case 'image':
      text = msg.image?.id
        ? '[📷 Imagen]'
        : '';
      break;
    case 'document':
      text = msg.document
        ? `[📄 Documento: ${msg.document.filename ?? 'sin_nombre'}]`
        : '';
      break;
    case 'audio':
      text = '[🎤 Audio]';
      break;
    case 'video':
      text = '[🎬 Video]';
      break;
    case 'location':
      text = msg.location
        ? `[📍 Ubicación: ${msg.location.latitude},${msg.location.longitude}${msg.location.name ? ` (${msg.location.name})` : ''}]`
        : '';
      break;
    case 'contacts':
      text = '[👤 Contacto compartido]';
      break;
    case 'button':
      text = msg.button?.text ?? '[Botón]';
      break;
    case 'interactive':
      text = '[📋 Interactivo]';
      break;
    default:
      // Unknown message type — skip silently
      return null;
  }

  if (!text.trim()) return null;

  return {
    sender: msg.from,
    text: text.trim(),
    chatId: msg.from, // WhatsApp 1:1: chatId = sender phone
    timestamp: msg.timestamp,
    messageId: msg.id,
    contactName: contact?.profile?.name,
  };
}

// ── Forward to concierge pipeline ──────────────────────────────────────────

async function forwardToConcierge(
  normalized: NormalizedMessage,
  treeId: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONCIERGE_TIMEOUT_MS);

  try {
    const response = await fetch(CONCIERGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_SERVER_KEY}`,
        'X-Hermes-Session-Key': `wa-user-${normalized.sender}`,
      },
      body: JSON.stringify({
        message: normalized.text,
        treeId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[WhatsApp] Concierge responded ${response.status}: ${errText}`);
      return 'Lo siento, no estoy disponible ahora. Intenta de nuevo más tarde.';
    }

    const data = (await response.json()) as any;
    return data?.reply ?? 'Lo siento, no pude procesar tu mensaje.';
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[WhatsApp] Concierge timeout');
      return 'Estoy procesando tu mensaje, dame un momento.';
    }
    console.error('[WhatsApp] Concierge error:', error.message);
    return 'Lo siento, no estoy disponible ahora.';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── GET /api/whatsapp/webhook — Verificación del webhook ──────────────────

export const whatsappVerify = async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (!WHATSAPP_VERIFY_TOKEN) {
    console.error('[WhatsApp] WHATSAPP_VERIFY_TOKEN not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verified successfully');
    return res.status(200).send(challenge ?? '');
  }

  console.warn('[WhatsApp] Webhook verification failed — token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
};

// ── POST /api/whatsapp/webhook — Recepción de mensajes ────────────────────

export const whatsappReceive = async (req: Request, res: Response) => {
  // Always respond 200 quickly — WhatsApp retries if we don't
  res.status(200).json({ status: 'received' });

  const body = req.body as WhatsAppWebhookBody;

  if (!body?.object || body.object !== 'whatsapp_business_account') {
    console.warn('[WhatsApp] Unexpected webhook object:', body?.object);
    return;
  }

  if (!body.entry || !Array.isArray(body.entry)) {
    console.warn('[WhatsApp] Missing entry array');
    return;
  }

  // Resolve tree: env var or default to first OPEN tree
  let treeId = WHATSAPP_DEFAULT_TREE_ID;

  if (!treeId) {
    try {
      // Dynamic import to avoid circular dependency
      const { prisma } = await import('../index');
      const firstTree = await (prisma as any).tree.findFirst({
        where: { admissionPolicy: 'OPEN' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      treeId = firstTree?.id ?? '';
      if (!treeId) {
        console.error('[WhatsApp] No OPEN tree found and WHATSAPP_DEFAULT_TREE_ID not set');
        return;
      }
    } catch (err: any) {
      console.error('[WhatsApp] Failed to resolve default tree:', err.message);
      return;
    }
  }

  // Process each entry
  for (const entry of body.entry) {
    for (const change of entry.changes) {
      const value = change.value;

      // Skip status updates (delivered, read, etc.)
      if (!value?.messages || value.messages.length === 0) continue;

      const contact = value.contacts?.[0];

      for (const msg of value.messages) {
        // Skip messages sent BY the bot itself (echo prevention)
        if (msg.from === value.metadata?.phone_number_id) continue;

        const normalized = normalizeMessage(msg, contact);
        if (!normalized) continue;

        console.log(
          `[WhatsApp] Message from ${normalized.sender} (${normalized.contactName ?? 'unknown'}): "${normalized.text.slice(0, 80)}"`,
        );

        // Forward to concierge (fire-and-forget — response already sent)
        forwardToConcierge(normalized, treeId)
          .then(async (reply) => {
            console.log(`[WhatsApp] Concierge reply to ${normalized.sender}: "${reply.slice(0, 80)}"`);
            // Send reply back to WhatsApp via Cloud API
            const result = await sendTextMessage(normalized.sender, reply);
            if (!result.ok) {
              console.error(`[WhatsApp] Failed to send reply to ${normalized.sender}: ${result.error}`);
            }
          })
          .catch((err) => {
            console.error('[WhatsApp] Forward error:', err.message);
          });
      }
    }
  }
};
