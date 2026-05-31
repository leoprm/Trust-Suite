/**
 * Route module — Hermes Agent API call and response handling.
 *
 * Extracted from the monolithic hermesBridge.ts as Phase 1 Task 1.6.
 *
 * Functions:
 *   enforcePrefix         → Guarantees 🌳/🌿 prefix on multi-tree responses
 *   addMultiTreePrefix    → Deduplicated multi-tree name prefix helper
 *   routeToHermes         → Main API call: system prompt → SSE stream → response
 */

import crypto from "crypto";
import { treeMessageQueues } from "../messageQueue";

import type {
  HermesBridgeResponse,
  ChatMessage,
} from "./types";

import { ASSISTANT_MESSAGE_MAX_CHARS } from "./constants";

import {
  buildSystemPrompt,
  checkKanbanCompletions,
  taskCounters,
  validateTreeId,
} from "./system-prompt";
import { loadKeywords } from "./decision-filter";
import { getHermesApiKey } from "./getHermesApiKey";

const HERMES_API = "http://127.0.0.1:8643/v1/chat/completions";
const SUPPORT_HERMES_GATEWAY = process.env.HERMES_SUPPORT_GATEWAY || "http://127.0.0.1:8646";
const SUPPORT_HERMES_API_URL = process.env.SUPPORT_HERMES_API_URL || `${SUPPORT_HERMES_GATEWAY}/v1/chat/completions`;

// ── LLM stream dispatcher ──────────────────────────────────────────────
// Prevents undici's default 300s bodyTimeout from killing slow LLM streams.
let LLM_DISPATCHER: any = undefined;
async function getLLMDispatcher() {
  if (!LLM_DISPATCHER) {
    const { Agent } = await import("undici");
    LLM_DISPATCHER = new Agent({
      bodyTimeout: 900_000,   // 15 min — match Hermes dialog timeout
      headersTimeout: 60_000,  // 1 min
      keepAliveTimeout: 120_000,
      keepAliveMaxTimeout: 600_000,
    });
  }
  return LLM_DISPATCHER;
}

// ── History compression ──────────────────────────────────────────────────
const HISTORY_COMPRESSION_THRESHOLD = 10;
const HISTORY_KEEP_RECENT = 3;

async function summarizeHistory(
  chatHistory: ChatMessage[],
  treeId: string,
): Promise<string | null> {
  const historyText = chatHistory
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  const masterKey = getHermesApiKey(treeId);
  const derivedKey = masterKey
    ? crypto.createHmac("sha256", masterKey).update(`summarize:${treeId}`).digest("hex")
    : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hermes-Session-Key": `tree-agent-summary-${treeId}`,
  };
  if (derivedKey) {
    headers["Authorization"] = `Bearer ${derivedKey}`;
  }

  try {
    const response = await fetch(HERMES_API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "Eres un resumidor. Resume esta conversación en 2-3 frases concisas. " +
              "Solo devuelve el resumen, nada más. Usa el mismo idioma que la conversación.",
          },
          { role: "user", content: historyText },
        ],
        max_tokens: 150,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as any;
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function compressHistory(
  chatHistory: ChatMessage[],
  treeId: string,
): Promise<ChatMessage[]> {
  if (chatHistory.length <= HISTORY_COMPRESSION_THRESHOLD) {
    return chatHistory;
  }

  const splitPoint = chatHistory.length - HISTORY_KEEP_RECENT;
  const olderMessages = chatHistory.slice(0, splitPoint);
  const recentMessages = chatHistory.slice(splitPoint);

  const summary = await summarizeHistory(olderMessages, treeId);
  if (!summary) {
    // Fallback: keep last 5 messages if summarization fails
    return chatHistory.slice(-5);
  }

  return [
    {
      role: "system",
      content: `[Resumen de la conversación anterior]: ${summary}`,
    },
    ...recentMessages,
  ];
}

/**
 * Garantiza que la respuesta de Ari tenga el prefijo 🌳/🌿 aunque el modelo
 * lo olvide. El system prompt ya lo exige, pero este es el safety net a nivel
 * de bridge. Aplica en todos los return paths que tengan accumulatedContent
 * (happy path + catch de stream interrumpido).
 */
export async function enforcePrefix(
  content: string,
  treeId: string | null,
  prisma: any,
): Promise<string> {
  if (!treeId || !content) return content;
  const trimmed = content.trimStart();
  const hasPrefix = trimmed.startsWith("🌳") || trimmed.startsWith("🌿");
  if (hasPrefix) return content;
  try {
    const treeInfo = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { name: true, parentTreeId: true },
    });
    if (treeInfo?.name) {
      // Only enforce prefix when tree HAS children (root coordinating with sub-trees).
      // Sub-trees (with parentTreeId) do NOT get a prefix — they respond normally.
      const hasChildren =
        (await prisma.tree.count({ where: { parentTreeId: treeId } })) > 0;
      const isMultiTree = hasChildren; // root trees only — sub-trees never get prefix
      if (!isMultiTree) return content; // sub-tree or standalone → no prefix needed
      
      const prefix = `🌳 ${treeInfo.name}: `;
      console.log(`[hermesBridge] Prefix enforced: 🌳 root`);
      return prefix + content;
    }
  } catch {
    // non-blocking: prefix enforcement must never break the flow
  }
  return content;
}

/**
 * Multi-tree name prefix helper.
 *
 * When a Telegram chat hosts multiple trees, prepend the tree's name and icon
 * so users know which tree Ari is speaking for. Uses prisma.tree.count to detect
 * multi-tree chats; silently skips if lookup fails.
 *
 * Deduplicates the 20-line block that appeared at both the happy path and the
 * catch path of the SSE stream loop (C2/C10).
 */
async function addMultiTreePrefix(
  content: string,
  treeId: string | null,
  chatId: number | undefined,
  prisma: any,
): Promise<string> {
  if (chatId === undefined || !treeId) return content;
  try {
    const treeCount = await prisma.tree.count({
      where: { telegramChatId: String(chatId) },
    });
    if (treeCount > 1) {
      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { name: true, icono: true },
      });
      if (tree?.name) {
        const icon = tree.icono || "";
        const prefix = `${icon} ${tree.name}`.trim();
        return `- ${prefix}:\n\n${content}`;
      }
    }
  } catch {
    // Non-critical — silently skip prefix if lookup fails
  }
  return content;
}

export async function routeToHermes(
  message: string,
  treeId: string | null,
  userId: string,
  chatHistory?: ChatMessage[],
  displayName?: string,
  chatId?: number,
  messageId?: number,
  complex?: boolean,
): Promise<HermesBridgeResponse | null> {
  let didEnqueue = false; // track whether we acquired the semaphore

  // ── Lazy import prisma (avoid circular deps) ───────────────────────────
  const { prisma } = await import("../../index");

  // ── Queue gate: enqueue before calling Ari ──────────────────────────────
  if (chatId !== undefined && messageId !== undefined) {
    const numericUserId = parseInt(userId, 10) || 0;

    // Look up user role for priority queue
    let role: string | undefined;
    try {
      const member = await prisma.treeMember.findFirst({
        where: {
          treeId,
          user: { telegramUserId: BigInt(userId) },
        },
        select: { role: true },
      });
      role = member?.role ?? undefined;
    } catch {
      // role stays undefined if lookup fails — non-admin treatment
    }

    const queued = treeMessageQueues.getQueue(treeId).enqueue({
      chatId,
      text: message,
      userId: numericUserId,
      messageId,
      role,
    });

    if (!queued.accepted) {
      return { text: null, saturationMessage: queued.message };
    }

    if (queued.position !== undefined && queued.position > 0) {
      return { text: null, queued: true, queuePosition: queued.position };
    }
    // position === 0 → proceed to call Ari
    didEnqueue = true;
  }

  try {
  const API_SERVER_KEY = getHermesApiKey(treeId);

  // ── Build system prompt with tree context from DB ─────────────────────
  let systemPrompt: string;
  if (treeId) {
    systemPrompt = await buildSystemPrompt(prisma, treeId, userId, displayName);
  } else {
    const name = displayName || userId;
    systemPrompt = [
      "You are Trust Manager, the support assistant for Trust Maker.",
      "Your identity and full instructions are in your SOUL.md.",
      `Current user: ${name}`,
    ].join("\n");
  }

  // ── Load custom keywords + check Kanban completions ──────────────────
  if (treeId) {
    const sandboxBase =
      process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
    validateTreeId(treeId);
    const sandboxDir = `${sandboxBase}/${treeId}`;

    // Load tree-specific engagement keywords (S13)
    await loadKeywords(sandboxDir);

    try {
      const kanbanResults = await checkKanbanCompletions(
        treeId,
        sandboxDir,
      );
      if (kanbanResults) {
        systemPrompt +=
          `\n\n## RESULTADOS DE TAREAS DELEGADAS\n${kanbanResults}\n\nACTÚA sobre estos resultados en tu respuesta. Informa al usuario.`;
      }
    } catch (err) {
      console.error(
        `[hermesBridge] checkKanbanCompletions failed:` +
          ` ${(err as Error)?.message}`,
      );
    }
  }

  // ── Build messages array ──────────────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject chat history with compression (A3)
  if (chatHistory && chatHistory.length > 0 && treeId) {
    const compressed = await compressHistory(chatHistory, treeId);
    messages.push(...compressed);
  } else if (chatHistory && chatHistory.length > 0) {
    messages.push(...chatHistory);
  }

  messages.push({ role: "user", content: message.trim() });

    // ── Call Hermes Agent API ─────────────────────────────────────────────
  const maxTokens = complex ? 2048 : 1024;
  const MAX_RESPONSE_CHARS = maxTokens * 4; // ~4 chars per token — hard cap to prevent OOM
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 900_000); // 15 min — matches Hermes dialog_timeout_s

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hermes-Session-Key": treeId ? `tree-agent-${treeId}` : `tree-agent-support-${userId}`,
  };
  if (API_SERVER_KEY) {
    headers["Authorization"] = `Bearer ${API_SERVER_KEY}`;
  }

  let response: globalThis.Response;
  try {
    response = await fetch(treeId ? HERMES_API : SUPPORT_HERMES_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        stream: true,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
      // @ts-ignore — undici-specific: prevent premature body timeout on slow LLM streams
      dispatcher: await getLLMDispatcher(),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[hermesBridge] Hermes API timed out after ${Math.round(900_000/60000)} minutes`);
    } else {
      console.error("[hermesBridge] Hermes API fetch failed:", err);
    }
    return {
      text: "⚠️ El servidor de IA no respondió a tiempo. Esto suele pasar por una caída temporal de conexión. Intenta de nuevo en un momento — si el problema persiste, intenta con un mensaje más corto o concreto.",
    };
  }

  // ── Handle upstream errors ─────────────────────────────────────────────
  if (!response.ok) {
    clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => "");
    console.error(
      `[hermesBridge] Hermes API returned ${response.status}: ${errorText.slice(0, 300)}`,
    );
    return {
      text: `⚠️ Error del servidor de IA (${response.status}). Intenta de nuevo en un momento.`,
    };
  }

  let accumulatedContent = "";
  // ── Parse SSE stream ──────────────────────────────────────────────────
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeoutId);
      console.error("[hermesBridge] No response body reader available");
      return null;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let shouldStop = false;

    while (!shouldStop) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trimStart();
        if (payload === "[DONE]") {
          shouldStop = true;
          break;
        }
        try {
          const parsed = JSON.parse(payload);
          // Non-streaming response: full content in one event — break immediately.
          // No need to wait for [DONE]; the full message is already here.
          const messageContent = parsed?.choices?.[0]?.message?.content;
          if (messageContent) {
            accumulatedContent += messageContent;
            if (accumulatedContent.length > MAX_RESPONSE_CHARS) {
              console.warn(`[hermesBridge] Response exceeded ${MAX_RESPONSE_CHARS} chars — truncating`);
              accumulatedContent = accumulatedContent.slice(0, MAX_RESPONSE_CHARS);
              shouldStop = true;
            }
            break;
          }
          // Streaming response: accumulate deltas, continue until [DONE].
          const deltaContent = parsed?.choices?.[0]?.delta?.content;
          if (deltaContent) {
            accumulatedContent += deltaContent;
            if (accumulatedContent.length > MAX_RESPONSE_CHARS) {
              console.warn(`[hermesBridge] Response exceeded ${MAX_RESPONSE_CHARS} chars — truncating`);
              accumulatedContent = accumulatedContent.slice(0, MAX_RESPONSE_CHARS);
              shouldStop = true;
              break;
            }
          }
        } catch {
          // Skip unparseable SSE payloads
        }
      }
    }

    clearTimeout(timeoutId);

    if (!accumulatedContent) {
      console.error("[hermesBridge] Empty response from Hermes SSE stream");
      return {
        text: "⚠️ Procesé tu solicitud pero no pude generar una respuesta completa. ¿Podrías intentarlo de nuevo con una pregunta más específica?",
      };
    }

    console.log(`[hermesBridge] Response: ${accumulatedContent.length} chars`);

    // ── Prefix Enforcement ──────────────────────────────────────────────
    accumulatedContent = await enforcePrefix(accumulatedContent, treeId, prisma);

    // ── Multi-tree name prefix ──────────────────────────────────────────
    accumulatedContent = await addMultiTreePrefix(accumulatedContent, treeId, chatId, prisma);

    // Increment task counter for skill auto-evaluation
    if (treeId) taskCounters.set(treeId, (taskCounters.get(treeId) ?? 0) + 1);

    // ── Log Ari's response to daily conversation log ────────────────────
    if (treeId && accumulatedContent) {
      void (async () => {
        try {
          const { appendToDailyLog } = await import("../../lib/dailyLog");
          appendToDailyLog(treeId, new Date(), "Ari", accumulatedContent, false, "assistant");

          // Resolve DB user UUID from Telegram numeric ID
          let dbUserId = userId;
          if (userId && /^\d+$/.test(userId)) {
            const dbUser = await (prisma as any).user.findFirst({
              where: { telegramUserId: BigInt(userId) },
              select: { id: true },
            });
            if (dbUser) dbUserId = dbUser.id;
          }

          // Persist assistant response FIRST
          await (prisma as any).chatMessage.create({
            data: {
              userId: dbUserId,
              treeId,
              role: "assistant",
              content: accumulatedContent.slice(0, ASSISTANT_MESSAGE_MAX_CHARS),
            },
          });

          // Persist user message AFTER assistant — eliminates orphaned user messages
          await (prisma as any).chatMessage.create({
            data: {
              userId: dbUserId,
              treeId,
              role: "user",
              content: message.trim(),
            },
          });
        } catch (err: any) {
          console.error(`[hermesBridge] Failed to persist messages: ${err?.message || err}`);
        }
      })();
    }

    return { text: accumulatedContent };
  } catch (err) {
    clearTimeout(timeoutId);
    // If we accumulated partial content before the error, return it
    if (accumulatedContent) {
      console.warn(`[hermesBridge] Stream interrupted, returning ${accumulatedContent.length} partial chars`);
      accumulatedContent = await enforcePrefix(accumulatedContent, treeId, prisma);
      // ── Multi-tree name prefix (same as happy path) ──────────────────
      accumulatedContent = await addMultiTreePrefix(accumulatedContent, treeId, chatId, prisma);
      if (treeId) taskCounters.set(treeId, (taskCounters.get(treeId) ?? 0) + 1);
      return { text: accumulatedContent };
    }
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[hermesBridge] Hermes API stream timed out after ${Math.round(900_000/60000)} minutes`);
    } else {
      console.error("[hermesBridge] Error reading SSE stream:", err);
    }
    return null;
  }
  } finally {
    if (didEnqueue) {
      treeMessageQueues.getQueue(treeId).dequeue();
    }
  }
}
