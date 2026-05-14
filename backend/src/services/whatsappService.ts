/**
 * WhatsApp Cloud API — Message Sender
 *
 * Envía mensajes a números de WhatsApp usando la Cloud API de Meta.
 * Requiere WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .env
 *
 * API Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface WhatsAppTextMessage {
  to: string; // phone number with country code (e.g. "56912345678" for Chile)
  text: string;
  preview_url?: boolean;
}

export interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  languageCode?: string; // "es", "en", etc.
  parameters?: string[]; // template variables
}

export interface SendResult {
  ok: boolean;
  messageId?: string; // wamid
  error?: string;
  httpStatus?: number;
}

// ── Configuración ──────────────────────────────────────────────────────────────

function getConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    apiUrl: `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
  };
}

// ── Enviar mensaje de texto ────────────────────────────────────────────────────

export async function sendTextMessage(
  to: string,
  text: string,
  previewUrl = false,
): Promise<SendResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error: "WhatsApp no configurado (WHATSAAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID faltan).",
    };
  }

  // Limpiar número: quitar espacios, +, etc.
  const cleanTo = to.replace(/[\s\-\+\(\)]/g, "");

  try {
    const resp = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: {
          preview_url: previewUrl,
          body: text.slice(0, 4096), // WhatsApp text limit
        },
      }),
    });

    const body = (await resp.json()) as any;

    if (resp.ok && body.messages?.[0]?.id) {
      return { ok: true, messageId: body.messages[0].id };
    }

    const errMsg =
      body.error?.message || body.error?.error_user_msg || `HTTP ${resp.status}`;
    console.error("[WhatsApp Sender] Error enviando mensaje:", errMsg);
    return { ok: false, error: errMsg, httpStatus: resp.status };
  } catch (err: any) {
    console.error("[WhatsApp Sender] Error de red:", err.message || err);
    return { ok: false, error: err.message || "Network error" };
  }
}

// ── Enviar template ────────────────────────────────────────────────────────────

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = "es",
  parameters: string[] = [],
): Promise<SendResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error: "WhatsApp no configurado (WHATSAAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID faltan).",
    };
  }

  const cleanTo = to.replace(/[\s\-\+\(\)]/g, "");

  const components: any[] = [];
  if (parameters.length > 0) {
    components.push({
      type: "body",
      parameters: parameters.map((text) => ({
        type: "text",
        text,
      })),
    });
  }

  try {
    const resp = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    });

    const body = (await resp.json()) as any;

    if (resp.ok && body.messages?.[0]?.id) {
      return { ok: true, messageId: body.messages[0].id };
    }

    const errMsg =
      body.error?.message || `HTTP ${resp.status}`;
    console.error("[WhatsApp Sender] Error enviando template:", errMsg);
    return { ok: false, error: errMsg, httpStatus: resp.status };
  } catch (err: any) {
    console.error("[WhatsApp Sender] Error de red:", err.message || err);
    return { ok: false, error: err.message || "Network error" };
  }
}

// ── Notificación de cuota (usado por el scheduler) ─────────────────────────────

export async function sendQuotaNotification(
  to: string,
  treeName: string,
  amount: number,
  currency = "CLP",
): Promise<SendResult> {
  const text = [
    `🌳 *Trust Maker — Cuota mensual*`,
    ``,
    `Árbol: *${treeName}*`,
    `Cuota: ${amount.toLocaleString("es-CL")} ${currency}/mes`,
    ``,
    `Para pagar visita: ${process.env.PAYMENT_LINK || "https://trustmaker.app/pagos"}`,
  ].join("\n");

  return sendTextMessage(to, text);
}

// ── Verificar conectividad ─────────────────────────────────────────────────────

export async function checkWhatsAppConfig(): Promise<{
  configured: boolean;
  phoneNumberId?: string;
  error?: string;
}> {
  const config = getConfig();
  if (!config) {
    return {
      configured: false,
      error: "WHATSAAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados.",
    };
  }

  try {
    // Solo verificamos que el token sea válido pidiendo info del número
    const resp = await fetch(
      `https://graph.facebook.com/v22.0/${config.phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      },
    );

    if (resp.ok) {
      const body = (await resp.json()) as any;
      return {
        configured: true,
        phoneNumberId: config.phoneNumberId,
      };
    }

    const body = (await resp.json()) as any;
    return {
      configured: false,
      phoneNumberId: config.phoneNumberId,
      error: body.error?.message || `HTTP ${resp.status}`,
    };
  } catch (err: any) {
    return {
      configured: false,
      phoneNumberId: config.phoneNumberId,
      error: err.message || "Network error",
    };
  }
}
