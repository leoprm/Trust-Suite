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
 * Patrón basado en conciergeController.ts líneas 827-870.
 */

import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { messageQueue } from "./messageQueue";

import type {
  WindowState,
  HermesBridgeResponse,
  ShouldRespondResult,
  RecentMessage,
  CollectedMessage,
  ChatMessage,
} from "./hermesBridge/types";

import { getAgentsMd } from "./hermesBridge/history";

const HERMES_API = "http://127.0.0.1:8643/v1/chat/completions";
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function validateTreeId(treeId: string): void {
  if (!UUID_RE.test(treeId)) {
    throw new Error(`Invalid treeId format: ${treeId}`);
  }
}
const SUPPORT_HERMES_GATEWAY = process.env.HERMES_SUPPORT_GATEWAY || "http://127.0.0.1:8646";
const SUPPORT_HERMES_API_URL = process.env.SUPPORT_HERMES_API_URL || `${SUPPORT_HERMES_GATEWAY}/v1/chat/completions`;
const SUPPORT_HERMES_API_KEY = process.env.HERMES_SUPPORT_API_KEY || process.env.SUPPORT_HERMES_API_KEY || "";

// ── LLM stream dispatcher ──────────────────────────────────────────────
// Prevents undici's default 300s bodyTimeout from killing slow LLM streams.
// IMPORTANT: dynamic import to avoid top-level await issues with tsx.
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

// ── Task counter for skill auto-evaluation (every 20 tasks) ─────────────
const taskCounters = new Map<string, number>();

// ── Keyword scanning / decision filter (extracted to hermesBridge/decision-filter.ts) ──────
export {
  scanForKeywords,
  scanForKeywordMatch,
  shouldAriRespondLocal,
  shouldAriRespond,
} from "./hermesBridge/decision-filter";

/**
 * Revisa si hay tareas Kanban completadas que Ari delegó.
 * Lee <sandboxDir>/kanban_pending.json (JSONL),
 * ejecuta `hermes kanban show --json` para cada tarea,
 * quita las completadas y retorna los resultados formateados.
 *
 * @returns String con resultados formateados, o null si no hay.
 */
async function checkKanbanCompletions(
  treeId: string,
  sandboxDir: string,
): Promise<string | null> {
  const pendingFile = path.join(sandboxDir, "kanban_pending.json");

  if (!fs.existsSync(pendingFile)) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(pendingFile, "utf-8").trim();
  } catch {
    return null;
  }

  if (!raw) return null;

  // Parsear JSONL (un objeto JSON por línea)
  const entries: Array<{
    task_id: string;
    created_at: string;
    description: string;
  }> = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // ignorar líneas malformadas
    }
  }

  if (entries.length === 0) {
    try { fs.unlinkSync(pendingFile); } catch { /* best-effort */ }
    return null;
  }

  const hermesBin = "/home/trustmaker/.hermes/hermes-agent/venv/bin/hermes";
  const remaining: typeof entries = [];
  const completed: Array<{
    task_id: string;
    description: string;
    summary: string;
  }> = [];

  for (const entry of entries) {
    try {
      const output = await spawnHermesShow(hermesBin, entry.task_id);
      const data = JSON.parse(output);
      const status = data?.task?.status ?? data?.status ?? "";

      if (status === "done") {
        const summary =
          data?.task?.result ??
          data?.result ??
          data?.task?.summary ??
          "(completada)";
        completed.push({
          task_id: entry.task_id,
          description: entry.description,
          summary,
        });
      } else {
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }

  // Actualizar archivo de pendientes
  if (remaining.length === 0) {
    try { fs.unlinkSync(pendingFile); } catch { /* best-effort */ }
  } else {
    try {
      const content =
        remaining.map((e) => JSON.stringify(e)).join("\n") + "\n";
      fs.writeFileSync(pendingFile, content, "utf-8");
    } catch { /* best-effort */ }
  }

  if (completed.length === 0) return null;

  const parts = completed.map(
    (c) =>
      `- **${c.description}** (task \`${c.task_id}\`): ${c.summary}`,
  );
  return parts.join("\n");
}

/** Ejecuta `sudo -u trustmaker hermes kanban show <id> --json` y retorna stdout. */
function spawnHermesShow(bin: string, taskId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", [
      "-u",
      "trustmaker",
      bin,
      "kanban",
      "show",
      taskId,
      "--json",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `exit ${code}`));
    });
  });
}

// ── History compression ──────────────────────────────────────────────────
// When chatHistory exceeds COMPRESSION_THRESHOLD messages, older messages
// are summarized via the same LLM and injected as a system message, keeping
// only the last KEEP_RECENT messages raw. This cuts token usage significantly.

const HISTORY_COMPRESSION_THRESHOLD = 10;
const HISTORY_KEEP_RECENT = 3;

async function summarizeHistory(
  chatHistory: ChatMessage[],
  treeId: string,
): Promise<string | null> {
  const historyText = chatHistory
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hermes-Session-Key": `tree-agent-summary-${treeId}`,
  };
  if (API_SERVER_KEY) {
    headers["Authorization"] = `Bearer ${API_SERVER_KEY}`;
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

async function buildSystemPrompt(
  prisma: PrismaClient,
  treeId: string,
  userId: string,
  displayName?: string,
): Promise<string> {
  const lines: string[] = [];

  // ── Tree info ─────────────────────────────────────────────────────────
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      name: true,
      icono: true,
      description: true,
      objectives: true,
      admissionPolicy: true,
      parentTreeId: true,
      interactionMode: true,
      language: true,
      createdAt: true,
    },
  });

  if (!tree) {
    return "You are Ari, the assistant of Trust Maker. Your name is Ari — never say you are Hermes Agent or any other AI. Respond in the language configured for this tree. Be helpful and community-oriented.";
  }

  // Resolve language from tree config
  const langMap: Record<string, string> = {
    es: "Spanish", en: "English", pt: "Portuguese", fr: "French",
    de: "German", it: "Italian", ja: "Japanese", zh: "Chinese",
  };
  const treeLanguage = langMap[tree.language] || "Spanish";
  const treeLanguageCode = tree.language || "es";

  // ── Compact identity block ────────────────────────────────────────────
  lines.push(`You are Ari, the Tree Agent for "${tree.name}" (${tree.icono}, id: ${treeId}) — a Trust Maker community.`);
  lines.push("");
  lines.push("CRITICAL RULES:");
  lines.push("- Your name is Ari. NEVER say you are Hermes Agent, Claude, GPT, or any other AI.");
  lines.push("- This is your ONLY tree. NEVER reference other trees. If asked: 'I only have access to this tree.'");
  lines.push(`- Output language: ${treeLanguage} (${treeLanguageCode}). ALWAYS respond in ${treeLanguage}.`);
  lines.push("");

  // Tree metadata (compact)
  lines.push(`Tree: ${tree.name} (${tree.description || "No description"})`);
  lines.push(`Admission: ${tree.admissionPolicy}`);
  if (tree.objectives) lines.push(`Objectives: ${tree.objectives}`);

  // ── Interaction Mode ──────────────────────────────────────────────────
  if (tree.interactionMode && tree.interactionMode !== "MAXIMUM") {
    if (tree.interactionMode === "MEDIUM") {
      lines.push("MODE: MEDIUM — only respond when directly mentioned or replied to.");
    } else if (tree.interactionMode === "MINIMUM") {
      lines.push("MODE: MINIMUM — only respond when @TrustMakerBot tagged or replied to.");
    }
  }

  // ── SYSTEM.md del árbol ───────────────────────────────────────────────
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
  validateTreeId(treeId);
  const sandboxDir = path.join(sandboxBase, treeId);
  const systemMdPath = path.join(sandboxDir, "SYSTEM.md");
  if (fs.existsSync(systemMdPath)) {
    try {
      const systemMdContent = fs.readFileSync(systemMdPath, "utf-8").trim();
      if (systemMdContent.length > 0) {
        const truncated = systemMdContent.length > 1500
          ? systemMdContent.slice(0, 1497) + "..."
          : systemMdContent;
        lines.push("");
        lines.push("═══ SYSTEM.md (custom behavior) ═══");
        for (const line of truncated.split("\n")) lines.push(line);
        lines.push("Follow these instructions above default behavior.");
      }
    } catch { /* non-blocking */ }
  }

  // ── AGENTS.md del árbol (cached) ──────────────────────────────────────
  const agentsMdContent = getAgentsMd(sandboxDir, treeId);
  if (agentsMdContent) {
    const truncated = agentsMdContent.length > 2000
      ? agentsMdContent.slice(0, 1997) + "..."
      : agentsMdContent;
    lines.push("");
    lines.push("═══ AGENTS.md (project rules) ═══");
    for (const line of truncated.split("\n")) lines.push(line);
    lines.push("Follow these project-level rules above default behavior.");
  }

  // ── Sandbox memory (tree-level memory.json) ────────────────────────────
  // ALWAYS show memory instructions so Ari knows how to save, even on first use.
  const memoryPath = path.join(sandboxDir, "memory", "memory.json");

  // Derive per-tree API key — Ari should NEVER receive the global master key.
  // This is the same HMAC-SHA256 derivation used by checkApiKey in both
  // treeSandboxController.ts and sandboxController.ts.
  const masterKey = process.env.HERMES_API_SERVER_KEY ?? "";
  const sandboxApiKey = masterKey && treeId
    ? crypto.createHmac("sha256", masterKey).update(treeId).digest("hex")
    : "";

  let memoryData: Record<string, string> = {};
  if (fs.existsSync(memoryPath)) {
    try {
      const memoryRaw = fs.readFileSync(memoryPath, "utf-8").trim();
      if (memoryRaw.length > 0) {
        memoryData = JSON.parse(memoryRaw);
      }
    } catch { /* non-blocking */ }
  }

  lines.push("");
  lines.push("═══ MEMORY (tree-level durable memory) ═══");
  lines.push("This is your persistent key-value memory. To UPDATE it, call:");
  lines.push(`  POST http://127.0.0.1:3100/api/trees/${treeId}/sandbox/memory`);
  lines.push(`  Headers: { "Authorization": "Bearer ${sandboxApiKey}" }`);
  lines.push('  Body: { "action": "write", "key": "<key>", "value": "<text>" }');
  lines.push('  To READ: { "action": "read", "key": "<key>" }');
  lines.push('  To LIST keys: { "action": "list" }');
  lines.push("NEVER use the built-in 'memory' tool — it writes to the wrong location.");
  lines.push("");
  lines.push("═══ CREDENTIALS ═══");
  lines.push(`Your sandbox API key: ${sandboxApiKey}`);
  lines.push(`This key ONLY works for tree ${treeId}. It will be REJECTED for any other tree.`);
  lines.push("Use this key for ALL sandbox operations (read, write, exec, search, patch, memory, etc.).");
  lines.push("Do NOT use HERMES_API_SERVER_KEY — that key no longer works for sandbox endpoints.");

  const keys = Object.keys(memoryData);
  if (keys.length > 0) {
    lines.push("Current memory contents:");
    for (const [k, v] of Object.entries(memoryData)) {
      const truncated = (v as string).length > 500
        ? (v as string).slice(0, 497) + "..."
        : v;
      lines.push(`  ${k}: ${truncated}`);
    }
  } else {
    lines.push("(memory is empty — use the write action above to save facts)");
  }

  // ── Ancestor chain (sub-trees only) ───────────────────────────────────
  const ancestorChain: Array<{ id: string; name: string; icono: string }> = [];
  let cursor: string | null = tree.parentTreeId;
  while (cursor) {
    const a = await prisma.tree.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, icono: true, parentTreeId: true },
    });
    if (!a) break;
    ancestorChain.push({ id: a.id, name: a.name, icono: a.icono || "🌳" });
    cursor = a.parentTreeId;
  }

  // ── Sub-trees ─────────────────────────────────────────────────────────
  const childTrees = await prisma.tree.findMany({
    where: { parentTreeId: treeId },
    select: { id: true, name: true },
  });
  const hasChildren = childTrees.length > 0;

  if (ancestorChain.length > 0) {
    lines.push("");
    lines.push("═══ ANCESTOR CHAIN ═══");
    lines.push(`You are a sub-tree. Ancestors (parent→root): ${ancestorChain.map(a => `${a.icono} ${a.name}`).join(" → ")}`);
    lines.push("Sandbox parent read: POST /api/trees/<id>/sandbox/parent/read (read-only)");
    lines.push("Sandbox ancestors read: POST /api/trees/<id>/sandbox/ancestors/read");
    lines.push("⚠️ READ-ONLY on ancestors. Use skill_view('trust-maker') for full API docs.");
  }

  // ── Root with children: multi-IA coordination ─────────────────────────
  if (hasChildren) {
    lines.push("");
    lines.push(`═══ ROOT TREE — ${childTrees.length} children ═══`);
    lines.push("Prefix your group responses with: 🌳 " + tree.name + ":");
    lines.push("Children: " + childTrees.map(c => `🌿 ${c.name}`).join(", "));
    lines.push("Respond when: @mentioned, keywords match objectives, or child needs attention.");
    lines.push("Stay silent on: messages for other trees, off-topic chat, simple greetings.");
    lines.push("Delegation: use hermes kanban create --assignee <child-name> (see trust-maker skill).");
  }

  // ── Active needs ──────────────────────────────────────────────────────
  const needs = await prisma.need.findMany({
    where: { treeId, status: "OPEN" },
    select: { title: true, description: true, importance: true },
    orderBy: { importance: "desc" },
    take: 10,
  });
  lines.push("");
  lines.push(`Open needs (${needs.length}):`);
  if (needs.length === 0) {
    lines.push("  (none)");
  } else {
    for (const n of needs) {
      const desc = n.description?.length > 100
        ? n.description.slice(0, 97) + "..."
        : (n.description || "");
      lines.push(`  - [${n.importance}] ${n.title}${desc ? ": " + desc : ""}`);
    }
  }

  // ── Members ───────────────────────────────────────────────────────────
  const members = await prisma.treeMember.findMany({
    where: { treeId, status: "ACTIVE" },
    include: { user: { select: { id: true, username: true, firstName: true } } },
    take: 20,
  });
  lines.push("");
  lines.push(`Members (${members.length}):`);
  if (members.length === 0) {
    lines.push("  (none)");
  } else {
    for (const m of members) {
      const displayName = m.user?.firstName || m.user?.username || "(anon)";
      lines.push(`  - ${displayName}`);
    }
  }

  // ── Community TODOs ───────────────────────────────────────────────────
  const todos = await prisma.todo.findMany({
    where: { treeId, status: "PENDING" },
    orderBy: { likeCount: "desc" },
    take: 10,
  });
  if (todos.length > 0) {
    lines.push("");
    lines.push("Community TODOs:");
    todos.forEach((t: any, i: number) => {
      const heartStr = t.likeCount > 0 ? ` (${t.likeCount} ❤️)` : "";
      const assignedStr = t.assignedToName ? ` [→${t.assignedToName}]` : "";
      lines.push(`  ${i + 1}. ${t.summary}${heartStr}${assignedStr}`);
    });
  }

  // ── User context ──────────────────────────────────────────────────────
  const tgUser = await prisma.user.findFirst({
    where: { telegramUserId: BigInt(userId) },
    select: { username: true, firstName: true, id: true },
  });
  if (tgUser || displayName) {
    const name = displayName || tgUser?.firstName || tgUser?.username || userId;
    lines.push("");
    lines.push(`Current user: ${name}`);
  }

  // ── CRITICAL: Load full API docs via skill ────────────────────────────
  lines.push("");
  lines.push("═══ FULL API & TOOLS DOCS ═══");
  lines.push("Load skill_view('trust-maker') for ALL sandbox APIs, security rules,");
  lines.push("tools, memory KV, conversation history, media search, kanban delegation,");
  lines.push("Obsidian vault, and office skills. This prompt only carries dynamic tree state.");
  lines.push("");

  // ── Response guidelines ───────────────────────────────────────────────
  lines.push("Respond in neutral Spanish (tú/usted, no voseo). Be concise, helpful, action-oriented.");
  lines.push("Use real data above — don't hallucinate. Use Telegram display names for members.");
  lines.push("");
  lines.push("MULTI-MESSAGE: When you want to send multiple independent messages (e.g., greeting");
  lines.push("then explanation, or list items best read one-by-one), separate them with \"---\"");
  lines.push("on its own line. Each segment becomes a separate Telegram message bubble.");
  lines.push("ONLY use --- when the messages are truly independent. For structured content");
  lines.push("within a single message (headings, bullet lists, paragraphs), keep it as one.");

  return lines.join("\n");
}

// shouldAriRespond — extracted to hermesBridge/decision-filter.ts (re-exported above)
export type { ShouldRespondResult } from "./hermesBridge/types";

/**
 * Enruta un mensaje del bot de Telegram al Hermes Agent API directamente.
 *
 * Flujo:
 * 1. Construye system prompt con contexto real del árbol (nombre, necesidades, miembros)
 * 2. Llama POST http://127.0.0.1:8642/v1/chat/completions
 * 3. Parsea data.choices[0].message.content
 * 4. Retorna el texto de respuesta
 *
 * @param message   Texto del usuario (ya limpio, sin mención al bot)
 * @param treeId    ID del árbol asociado al chat
 * @param userId    Telegram user ID como string
 * @param chatHistory  Historial de mensajes previos (opcional)
 * @returns         { text: string }
 */
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
  const { prisma } = await import("../index");

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

    const queued = messageQueue.enqueue({
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
  const API_SERVER_KEY = treeId
    ? (process.env.HERMES_API_SERVER_KEY ?? "")
    : SUPPORT_HERMES_API_KEY;

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

  // ── Check for completed Kanban tasks ─────────────────────────────────
  if (treeId) {
    const sandboxBase =
      process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
    validateTreeId(treeId);
    const sandboxDir = `${sandboxBase}/${treeId}`;
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

    // ── Persist user message to ChatMessage table (for getChatHistory) ─
    if (treeId) {
      try {
        const { prisma: p } = await import("../index");
        // Resolve DB user UUID from Telegram numeric ID
        let dbUserId = userId;
        if (userId && /^\d+$/.test(userId)) {
          const dbUser = await (p as any).user.findFirst({
            where: { telegramUserId: BigInt(userId) },
            select: { id: true },
          });
          if (dbUser) dbUserId = dbUser.id;
        }
        await (p as any).chatMessage.create({
          data: {
            userId: dbUserId,
            treeId,
            role: "user",
            content: message.trim(),
          },
        });
      } catch (err: any) {
        console.error(`[hermesBridge] Failed to persist user message: ${err?.message || err}`);
      }
    }

    // ── Call Hermes Agent API ─────────────────────────────────────────────
  const maxTokens = complex ? 2048 : 1024;
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

    // Helper: create a promise that rejects when the AbortController fires
    const abortPromise = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      controller.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

    let streamDone = false;
    while (!streamDone) {
      const { done, value } = await Promise.race([
        reader.read(),
        abortPromise,
      ]);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trimStart();
        if (payload === "[DONE]") {
          streamDone = true;
          break;
        }
        try {
          const parsed = JSON.parse(payload);
          // Handle both streaming (delta) and non-streaming (message) formats
          const delta = parsed?.choices?.[0]?.delta?.content
            ?? parsed?.choices?.[0]?.message?.content;
          if (delta) accumulatedContent += delta;
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
    if (chatId !== undefined && treeId) {
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
            accumulatedContent = `- ${prefix}:\n\n${accumulatedContent}`;
          }
        }
      } catch {
        // Non-critical — silently skip prefix if lookup fails
      }
    }

    // Increment task counter for skill auto-evaluation
    if (treeId) taskCounters.set(treeId, (taskCounters.get(treeId) ?? 0) + 1);

    // ── Log Ari's response to daily conversation log ────────────────────
    if (treeId && accumulatedContent) {
      try {
        const [{ appendToDailyLog }, { prisma: p }] = await Promise.all([
          import("../lib/dailyLog"),
          import("../index"),
        ]);
        appendToDailyLog(treeId, new Date(), "Ari", accumulatedContent, false, "assistant");
        // Persist assistant response to ChatMessage table
        // Resolve DB user UUID from Telegram numeric ID (same as user persist)
        let dbUserId2 = userId;
        if (userId && /^\d+$/.test(userId)) {
          const dbUser2 = await (p as any).user.findFirst({
            where: { telegramUserId: BigInt(userId) },
            select: { id: true },
          });
          if (dbUser2) dbUserId2 = dbUser2.id;
        }
        await (p as any).chatMessage.create({
          data: {
            userId: dbUserId2,
            treeId,
            role: "assistant",
            content: accumulatedContent.slice(0, 2000),
          },
        });
      } catch (err: any) {
        console.error(`[hermesBridge] Failed to persist assistant response: ${err?.message || err}`);
      }
    }

    return { text: accumulatedContent };
  } catch (err) {
    clearTimeout(timeoutId);
    // If we accumulated partial content before the error, return it
    if (accumulatedContent) {
      console.warn(`[hermesBridge] Stream interrupted, returning ${accumulatedContent.length} partial chars`);
      accumulatedContent = await enforcePrefix(accumulatedContent, treeId, prisma);
      // ── Multi-tree name prefix (same as happy path) ──────────────────
      if (chatId !== undefined && treeId) {
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
              accumulatedContent = `- ${prefix}:\n\n${accumulatedContent}`;
            }
          }
        } catch {
          // Non-critical — silently skip
        }
      }
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
      messageQueue.dequeue();
    }
  }
}

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
