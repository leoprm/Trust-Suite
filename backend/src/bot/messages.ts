/**
 * Conversación natural vía concierge (SPEC-2).
 *
 * Procesa mensajes que mencionan @TrustMakerBot pero NO son comandos (/...).
 * Envía el texto al Hermes Agent a través del endpoint /api/concierge y
 * devuelve la respuesta.
 *
 * También contiene el selector de idioma (MLS T3) para onboarding.
 */

import { Context, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { findTreeByChat } from "./treeResolver";
import { extractCommandText } from "./commands";
import isComplexQuery from "./complexityDetector";
import { createKanbanTask, getTasksForChat } from "./kanbanBridge";
import { t } from "./i18n";
import { textToSpeech } from "../services/ttsService";

// ── Constantes ─────────────────────────────────────────────────────────────

const CONCIERGE_URL = "http://localhost:3100/api/concierge";
const CONCIERGE_TIMEOUT_MS = 600_000; // 10 minutos

const EXEC_TIMEOUT_MS = 10_000; // 10s for hermes kanban show
const STATUS_EMOJI: Record<string, string> = {
  done: "✓",
  running: "●",
  ready: "☐",
  todo: "☐",
  blocked: "⚠",
  archived: "📦",
};

// ── Status Query Detection ─────────────────────────────────────────────────

/**
 * Detecta consultas de estado de tareas kanban:
 * "/status", "cómo vas/va/vamos", "progreso", "cómo van las tareas".
 */
export function detectNaturalStatusQuery(message: string): boolean {
  const patterns = [
    /^\/status$/i,
    /cómo\s+(va|vas|vamos)/i,
    /progreso/i,
    /cómo\s+van\s+las\s+tareas/i,
    /estado\s+de\s+(las\s+)?tareas/i,
  ];
  return patterns.some((p) => p.test(message));
}

// ── Status Query Handler ───────────────────────────────────────────────────

/**
 * Responde con el estado de todas las tareas kanban del chat.
 *
 * 1. getTasksForChat() obtiene los IDs del chat
 * 2. Para cada ID, ejecuta `hermes kanban show <id> --json` para estado real
 * 3. Formatea: "✓ T1 Schema (done)  ✓ T2 Locales (done)  ● T4 Migrar (running)"
 */
export async function handleStatusQuery(
  prisma: PrismaClient,
  ctx: Context,
  lng: string,
): Promise<string> {
  const chatId = ctx.chat?.id.toString();
  if (!chatId) return t("errors:generic", lng);

  const taskIds = await getTasksForChat(prisma, chatId);

  if (taskIds.length === 0) {
    return t("kanban:no_tasks", lng);
  }

  // Query real status for each task in parallel
  const results = await Promise.all(
    taskIds.map(
      (taskId) =>
        new Promise<{ id: string; status: string; title: string }>(
          (resolve) => {
            exec(
              `hermes kanban show ${taskId} --json`,
              { timeout: EXEC_TIMEOUT_MS },
              (error, stdout) => {
                if (error || !stdout) {
                  resolve({ id: taskId, status: "unknown", title: "?" });
                  return;
                }
                try {
                  const parsed = JSON.parse(stdout.trim());
                  resolve({
                    id: taskId,
                    status: parsed.task?.status ?? "unknown",
                    title: parsed.task?.title ?? taskId,
                  });
                } catch {
                  resolve({ id: taskId, status: "unknown", title: taskId });
                }
              },
            );
          },
        ),
    ),
  );

  // Format: one line per task with emoji, short title, and status
  const lines = results.map((r) => {
    const emoji = STATUS_EMOJI[r.status] || "?";
    const shortTitle =
      r.title.length > 60 ? r.title.substring(0, 57) + "..." : r.title;
    return `${emoji} ${shortTitle} (${r.status})`;
  });

  return t("kanban:status_header", lng) + "\n\n" + lines.join("\n");
}

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

  const lng = (await resolveUserLanguage(prisma, ctx)) || "es";

  // 1. Extraer texto sin mención
  const cleanText = extractCommandText(msg.text);
  if (cleanText === null || !cleanText.trim()) return null;

  // 1.5 Status query: intercept "/status" and natural status queries
  if (detectNaturalStatusQuery(cleanText)) {
    const statusReply = await handleStatusQuery(prisma, ctx, lng);
    return { text: statusReply };
  }

  // 2. Buscar árbol
  const tree = await findTreeByChat(prisma, chatId);
  if (!tree) {
    return { text: t("errors:no_tree_group", lng) };
  }

  // 3. Complexity check: route complex queries to Kanban (KA-1.2)
  if (isComplexQuery(cleanText)) {
    const taskId = await createKanbanTask(prisma, cleanText, tree.id, chatId);
    if (taskId) {
      return { text: t("errors:kanban_working", lng, { taskId }) };
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
      return { text: t("errors:unavailable", lng) };
    }

    const data = (await response.json()) as any;
    const reply: string = data?.reply ?? "";

    if (!reply) {
      return { text: t("errors:unavailable", lng) };
    }

    return { text: reply };
  } catch (error: any) {
    // Timeout
    if (error.name === "AbortError") {
      return { text: t("errors:agent_thinking", lng) };
    }
    // API down / connection refused
    return { text: t("errors:unavailable", lng) };
  } finally {
    clearTimeout(timeoutId);
    clearInterval(typingInterval);
  }
}

// ── Language Selector (MLS T3) ─────────────────────────────────────────────

/**
 * Muestra el selector de idioma con inline keyboard + audio TTS en inglés.
 *
 * El mensaje es bilingüe por diseño:
 * "🌐 Select your language / Selecciona tu idioma"
 *
 * El audio DEBE ser en inglés: "Select your language" con voz en-US-JennyNeural.
 *
 * Se usa durante onboarding (/start, primer mensaje DM, bienvenida a grupo)
 * cuando el usuario NO tiene language configurado.
 */
export async function showLanguageSelector(
  ctx: Context,
): Promise<void> {
  // Send inline keyboard message with bilingual prompt
  await ctx.reply(t("common.language_selector_prompt"), {
    reply_markup: {
      inline_keyboard: [[
        {
          text: t("common.language_button_en"),
          callback_data: "lang:en",
        },
        {
          text: t("common.language_button_es"),
          callback_data: "lang:es",
        },
      ]],
    },
  });

  // Send TTS audio in English (forced en-US-JennyNeural)
  try {
    const voiceBuffer = await textToSpeech("Select your language", "en");
    await ctx.replyWithVoice(new InputFile(voiceBuffer));
  } catch {
    // Non-blocking — voice is a nice-to-have, text is what matters
  }
}

/**
 * Handler para los callbacks lang:en y lang:es del selector de idioma.
 *
 * 1. Guarda User.language en Prisma vía telegramUserId
 * 2. answerCallbackQuery para cerrar el loading spinner
 * 3. editMessageText para confirmar la selección en el idioma elegido
 * 4. Envía ayuda contextual en el idioma seleccionado
 */
export async function handleLanguageCallback(
  prisma: PrismaClient,
  ctx: Context,
  language: string,
): Promise<void> {
  const tgUser = ctx.from;
  if (!tgUser) {
    await ctx.answerCallbackQuery({ text: t("common:not_identified", language) });
    return;
  }

  const telegramId = BigInt(tgUser.id);

  try {
    await (prisma as any).user.updateMany({
      where: { telegramUserId: telegramId },
      data: { language },
    });
  } catch (err: any) {
    console.error("[lang] Failed to update user language:", err.message);
  }

  await ctx.answerCallbackQuery();

  // Edit the selector message to confirm selection
  try {
    await ctx.editMessageText(t("common.language_selected", language), {
      reply_markup: undefined,
    });
  } catch {
    // If editMessageText fails, send as new message
    await ctx.reply(t("common.language_selected", language));
  }

  // Follow-up with contextual help
  await ctx.reply(t("common.welcome_detail", language), {
    parse_mode: "Markdown",
  });
}

/**
 * Resuelve el idioma del usuario desde la base de datos.
 * Retorna el código de idioma si el usuario existe y tiene uno configurado,
 * o null si el usuario no existe o no ha seleccionado idioma.
 *
 * Estrategia: los usuarios nuevos se crean con language=null.
 * Solo después de pasar por el selector de idioma se asigna "es" o "en".
 * Así podemos distinguir "nunca eligió" (null) de "eligió español" ("es").
 */
export async function resolveUserLanguage(
  prisma: PrismaClient,
  ctx: Context,
): Promise<string | null> {
  const tgUser = ctx.from;
  if (!tgUser) return null;

  const telegramId = BigInt(tgUser.id);

  try {
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: telegramId },
      select: { language: true },
    });
    return user?.language ?? null;
  } catch {
    return null;
  }
}
