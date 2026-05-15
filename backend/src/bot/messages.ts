/**
 * Conversación natural vía concierge (SPEC-2).
 *
 * Procesa mensajes que mencionan @TrustMakerBot pero NO son comandos (/...).
 * Envía el texto al Hermes Agent a través del endpoint /api/concierge y
 * devuelve la respuesta.
 */

import { Context } from "grammy";
import { PrismaClient } from "@prisma/client";
import { findTreeByChat } from "./treeResolver";
import { extractCommandText } from "./commands";
import isComplexQuery from "./complexityDetector";
import { createKanbanTask } from "./kanbanBridge";

// ── Constantes ─────────────────────────────────────────────────────────────

const CONCIERGE_URL = "http://localhost:3100/api/concierge";
const CONCIERGE_TIMEOUT_MS = 600_000; // 10 minutos

// ── Handler ────────────────────────────────────────────────────────────────

/**
 * Procesa un mensaje natural mencionando al bot.
 *
 * Flujo:
 * 1. Extrae el texto sin la mención (@TrustMakerBot)
 * 2. Busca el árbol asociado al chat
 * 3. Muestra indicador "typing"
 * 4. Llama POST /api/concierge
 * 5. Devuelve la respuesta del agente
 *
 * Retorna null si el mensaje no es texto, no tiene mención, o no es procesable.
 */
export async function handleNaturalMessage(
  prisma: PrismaClient,
  ctx: Context
): Promise<{ text: string } | null> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return null;

  const chatId = ctx.chat?.id.toString();
  if (!chatId) return null;

  // 1. Extraer texto sin mención
  const cleanText = extractCommandText(msg.text);
  if (cleanText === null || !cleanText.trim()) return null;

  // 2. Buscar árbol
  const tree = await findTreeByChat(prisma, chatId);
  if (!tree) {
    return {
      text: "🌳 Este grupo no tiene un árbol. Agrega el bot a un grupo nuevo para crear uno.",
    };
  }

  // 3. Complexity check: route complex queries to Kanban (KA-1.2)
  if (isComplexQuery(cleanText)) {
    const taskId = await createKanbanTask(prisma, cleanText, tree.id, chatId);
    if (taskId) {
      return { text: `⏳ ${taskId}` };
    }
    // Fall through to concierge if kanban creation fails
  }

  // 3.5 Mostrar "typing" persistente (cada 4s)
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  // 4. Llamar concierge
  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";
  const userId = ctx.from?.id.toString() ?? "unknown";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONCIERGE_TIMEOUT_MS);

  try {
    const response = await fetch(CONCIERGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SERVER_KEY}`,
        "X-Hermes-Session-Key": `tg-user-${userId}`,
      },
      body: JSON.stringify({
        message: cleanText,
        treeId: tree.id,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { text: "Lo siento, no estoy disponible ahora." };
    }

    const data = (await response.json()) as any;
    const reply: string = data?.reply ?? "";

    if (!reply) {
      return { text: "Lo siento, no estoy disponible ahora." };
    }

    return { text: reply };
  } catch (error: any) {
    // Timeout
    if (error.name === "AbortError") {
      return {
        text: "El agente está pensando, intenta de nuevo.",
      };
    }
    // API down / connection refused
    return {
      text: "Lo siento, no estoy disponible ahora.",
    };
  } finally {
    clearTimeout(timeoutId);
    clearInterval(typingInterval);
  }
}
