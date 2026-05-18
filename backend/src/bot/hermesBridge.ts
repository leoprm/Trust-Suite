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
import path from "path";
import { messageQueue } from "./messageQueue";

const HERMES_API = "http://127.0.0.1:8644/v1/chat/completions";

// ── ConversationWindow ───────────────────────────────────────────────────
// In-memory per-tree window for proactive engagement. Each openWindow starts
// a countdown of 20 interactions. tickWindow decrements; when it hits 0 the
// window auto-closes. resetWindow extends it back to 20.

export interface WindowState {
  treeId: string;
  keyword: string | null;
  remaining: number;
  openedAt: Date;
}

export class ConversationWindow {
  private windows: Map<string, WindowState> = new Map();

  /** Open a conversation window on a tree. Default 20-message lifespan. */
  openWindow(treeId: string, keyword?: string): WindowState {
    const state: WindowState = {
      treeId,
      keyword: keyword ?? null,
      remaining: 20,
      openedAt: new Date(),
    };
    this.windows.set(treeId, state);
    return state;
  }

  /** Decrement remaining count. Returns the new state, or null when expired. */
  tickWindow(treeId: string): WindowState | null {
    const state = this.windows.get(treeId);
    if (!state) return null;
    state.remaining--;
    if (state.remaining <= 0) {
      this.windows.delete(treeId);
      return null;
    }
    return state;
  }

  /** Extend window lifespan back to 20 messages. Returns state or null. */
  resetWindow(treeId: string): WindowState | null {
    const state = this.windows.get(treeId);
    if (!state) return null;
    state.remaining = 20;
    return state;
  }

  /** Force-close a window. */
  closeWindow(treeId: string): void {
    this.windows.delete(treeId);
  }

  /** Check if a tree has an active conversation window. */
  hasActiveWindow(treeId: string): boolean {
    return this.windows.has(treeId);
  }

  /** Get current window state (null if none). */
  getWindow(treeId: string): WindowState | null {
    return this.windows.get(treeId) ?? null;
  }

  /** Legacy alias for hasActiveWindow. */
  isWindowActive(treeId: string): boolean {
    return this.hasActiveWindow(treeId);
  }
}

export const conversationWindows = new ConversationWindow();

export interface HermesBridgeResponse {
  text: string | null;
  /** When true, the message is queued (Ari is busy). Caller should tell user their position. */
  queued?: boolean;
  /** Position in queue (1-based) when queued is true. */
  queuePosition?: number;
  /** Saturation message when the queue is full. Caller must reply with this. */
  saturationMessage?: string;
}

export interface ShouldRespondResult {
  shouldRespond: boolean;
  text?: string;
}

interface RecentMessage {
  senderName: string;
  content: string;
}

/** Lightweight message returned by collectRecentMessages */
interface CollectedMessage {
  displayName: string;
  text: string;
}

/**
 * Fetch the last `count` text messages from a Telegram group.
 *
 * Spawns `lib/tg_messages.py` which uses Telethon (MTProto) — the Bot API
 * has no endpoint for historical message retrieval.
 *
 * @returns Array of {displayName, text}, chronological order (oldest first).
 */
export async function collectRecentMessages(
  chatId: number,
  count: number,
): Promise<CollectedMessage[]> {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID / TELEGRAM_API_HASH not set");
  }
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const script = path.resolve(__dirname, "../../lib/tg_messages.py");
  const input = JSON.stringify({
    api_id: Number(apiId),
    api_hash: apiHash,
    chat_id: chatId,
    bot_token: botToken,
    count,
  });

  return new Promise<CollectedMessage[]>((resolve, reject) => {
    const child = spawn("python3", [script], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      reject(new Error(`tg_messages.py spawn failed: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`tg_messages.py exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as CollectedMessage[]);
      } catch {
        reject(new Error(`tg_messages.py invalid JSON: ${stdout.slice(0, 300)}`));
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Keyword scanning ────────────────────────────────────────────────────
// Detects engagement signals in ambient (non-addressed) group messages.
// Returns matched keyword string or null if no match.

const ENGAGEMENT_KEYWORDS: RegExp[] = [
  // Spanish question starters
  /\b(qué|que|quién|quien|quiénes|quienes|cómo|como|cuándo|cuando|dónde|donde|por qu[ée]|cuál|cual|cuáles|cuales)\b/i,
  // Help / need signals
  /\b(ayuda|help|necesito|necesitamos|alguien\s+sabe|alguien\s+me\s+puede|se\s+necesita)\b/i,
  // Engagement / opinion requests
  /\b(qué\s+opinan|qué\s+piensan|alguien\s+ha\s+(hecho|probado|usado)|recomiendan|sugerencias|consejos?)\b/i,
  // Bridge keywords (legacy — ari, trust maker, etc.)
  /\b(ari|trust\s*maker|trustmaker|árbol|agente|asistente|@TrustMakerBot)\b/i,
  // Urgent / time-sensitive
  /\b(urgente|emergencia|rápido|rapido|ahora\s+mismo|para\s+ya|cu[áa]nto\s+antes)\b/i,
  // Technical / project questions
  /\b(c[óo]mo\s+se\s+hace|c[óo]mo\s+funciona|qu[ée]\s+es\s+(un|una|el|la)|para\s+qu[ée]\s+sirve)\b/i,
  // Indefinite pronouns — someone is being sought
  /\b(alguien|alguno|alguna|ninguno|ninguna|nadie|cualquiera)\b/i,
  // Input-seeking phrases
  /\b(saben\s+(cómo|si|qué|dónde|cuándo|algo)|sabes\s+(cómo|si|qué|dónde|cuándo|algo)|se\s+puede|hay\s+que)\b/i,
  // Proposals / suggestions
  /\b(podemos|podr[ií]amos|podr[ií]an|podr[ií]a|pueden|deber[ií]amos|qué\s+tal\s+si|y\s+si\s+)\b/i,
  // Explicit requests for input
  /\b(ayudar|ay[úu]dame|expl[ií]came|expl[ií]car|alguna\s+idea|ideas?|opini[óo]n|qu[ée]\s+opinan|qu[ée]\s+piensan)\b/i,
];

/** Legacy boolean scanner — preserved for backward compatibility. */
export function scanForKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  for (const re of ENGAGEMENT_KEYWORDS) {
    if (re.test(lower)) return true;
  }
  return false;
}

/**
 * Scan a message for engagement keywords.
 * Returns the matched text, or null if no match.
 */
export function scanForKeywordMatch(text: string): string | null {
  if (!text || text.length < 3) return null;
  for (const re of ENGAGEMENT_KEYWORDS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Local pre-filter — always passes through to the LLM-based shouldAriRespond().
 * Exists as a lightweight gate that only stops truly expired windows.
 *
 * Rules:
 *  - Always respond if window is active (remaining > 0).
 *  - Never respond if remaining is 0 (window expired).
 */
export function shouldAriRespondLocal(
  window: WindowState | null,
  messageText: string,
): boolean {
  if (!window) return false;
  return window.remaining > 0;
}

/**
 * Construye el system prompt con contexto real del árbol.
 * Incluye: nombre, descripción, necesidades activas y miembros.
 */
async function buildSystemPrompt(
  prisma: PrismaClient,
  treeId: string,
  userId: string,
  displayName?: string,
): Promise<string> {
  const lines: string[] = [];

  // ── Tree info ─────────────────────────────────────────────────────────
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      name: true,
      icono: true,
      description: true,
      objectives: true,
      admissionPolicy: true,
      createdAt: true,
    },
  });

  if (!tree) {
    return "You are Ari, the assistant of Trust Maker. Your name is Ari — never say you are Hermes Agent or any other AI. Respond in Spanish. Be helpful and community-oriented.";
  }

  lines.push(
    `You are Ari, the Tree Agent for "${tree.name}" (${tree.icono}) — a Trust Maker community.`,
  );
  lines.push("");
  lines.push("ABSOLUTE IDENTITY RULES (never break these):");
  lines.push("- Your name is Ari. You are the AI assistant for this Trust Maker tree.");
  lines.push("- NEVER say you are Hermes Agent, Claude, GPT, or any other AI name.");
  lines.push("- If asked who you are, say: I am Ari, the assistant of this tree.");
  lines.push("- You speak Spanish by default. Respond in Spanish unless asked otherwise.");
  lines.push("- You are helpful, warm, and community-oriented.");
  lines.push("");
  lines.push("Tree metadata (REAL, from DB):");
  lines.push(`  Name: ${tree.name}`);
  lines.push(`  Description: ${tree.description || "No description set"}`);
  lines.push(`  Admission: ${tree.admissionPolicy}`);
  if (tree.objectives) {
    lines.push(`  Objectives: ${tree.objectives}`);
  }

  // ── Active needs ──────────────────────────────────────────────────────
  const needs = await (prisma as any).need.findMany({
    where: { treeId, status: "OPEN" },
    select: { title: true, description: true, importance: true },
    orderBy: { importance: "desc" },
    take: 10,
  });

  const needCount = needs.length;
  lines.push("");
  lines.push(`Open needs (${needCount}):`);

  if (needs.length === 0) {
    lines.push("  (no open needs)");
  } else {
    for (const n of needs) {
      const desc =
        n.description?.length > 120
          ? n.description.slice(0, 117) + "..."
          : (n.description || "Sin descripción");
      lines.push(`  - [${n.importance}] ${n.title}: ${desc}`);
    }
  }

  // ── Members ───────────────────────────────────────────────────────────
  const members = await (prisma as any).treeMember.findMany({
    where: { treeId, status: "ACTIVE" },
    include: {
      user: { select: { username: true, firstName: true, skills: true } },
    },
    take: 20,
  });

  const memberCount = members.length;
  lines.push("");
  lines.push(`Members (${memberCount} active):`);

  if (members.length === 0) {
    lines.push("  (no active members)");
  } else {
    for (const m of members) {
      const displayName = m.user?.firstName || m.user?.username || "(anónimo)";
      let skillsStr = "";
      if (m.user?.skills) {
        try {
          const skills = JSON.parse(m.user.skills as string);
          if (typeof skills === "object" && skills !== null) {
            const entries = Object.entries(skills as Record<string, number>);
            if (entries.length > 0) {
              skillsStr =
                " [" +
                entries
                  .slice(0, 5)
                  .map(([k, v]) => `${k}(${v})`)
                  .join(", ") +
                "]";
            }
          }
        } catch {
          // ignore
        }
      }
      lines.push(`  - ${displayName}${skillsStr}`);
    }
  }

  // ── Community Todo List ────────────────────────────────────────────────
  const todos = await (prisma as any).todo.findMany({
    where: { treeId, status: "PENDING" },
    orderBy: { likeCount: "desc" },
    take: 10,
  });

  if (todos.length > 0) {
    lines.push("");
    lines.push("Community TODO list (ranked by likes — reference when giving advice):");
    todos.forEach((t: any, i: number) => {
      const heartStr = t.likeCount > 0 ? ` (${t.likeCount} likes)` : "";
      const assignedStr = t.assignedToName ? ` [assigned: ${t.assignedToName}]` : "";
      lines.push(`  ${i + 1}. ${t.summary}${heartStr}${assignedStr}`);
    });
    lines.push("");
    lines.push("When suggesting plans or tools, check if any of these TODOs align with your suggestion. Mention relevant TODOs naturally: e.g., \"Veo que tienen pendiente X — esta app tambien cubre eso\".");
    lines.push("If a TODO has an assignee, acknowledge that someone is already working on it — don't suggest reassigning it unless there is a crisis.");
  }

  // ── User context ──────────────────────────────────────────────────────
  const tgUser = await (prisma as any).user.findFirst({
    where: { telegramUserId: BigInt(userId) },
    select: { username: true, firstName: true, id: true },
  });
  if (tgUser || displayName) {
    const name = displayName || tgUser?.firstName || tgUser?.username || userId;
    lines.push("");
    lines.push(`Current user: ${name}`);
    lines.push("Address this user by their name when responding. Never use internal IDs.");
  }

  // ── Sandbox tools ────────────────────────────────────────────────────
  lines.push("");
  lines.push("═══ HERRAMIENTAS DISPONIBLES (SANDBOX) ═══");
  lines.push("");
  lines.push(`Tu Tree ID es: ${treeId}`);
  lines.push("Para ejecutar operaciones de archivos o comandos, usa EXCLUSIVAMENTE");
  lines.push("los siguientes endpoints REST del sandbox del árbol:");
  lines.push("");
  lines.push("1. EJECUTAR COMANDOS:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/exec`);
  lines.push('   Body: { "command": "ls -la", "cwd": "/sandbox" }');
  lines.push('   Response: { "stdout": "...", "stderr": "...", "exitCode": 0 }');
  lines.push("");
  lines.push("2. LEER ARCHIVOS:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/read`);
  lines.push('   Body: { "path": "archivo.txt" }');
  lines.push('   Response: { "content": "...", "exists": true }');
  lines.push("");
  lines.push("3. ESCRIBIR ARCHIVOS:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/write`);
  lines.push('   Body: { "path": "archivo.txt", "content": "contenido..." }');
  lines.push('   Response: { "success": true }');
  lines.push("");
  lines.push(
    "Formato de solicitud HTTP — usa fetch con Authorization Bearer HERMES_API_SERVER_KEY:",
  );
  lines.push("");
  lines.push("```javascript");
  lines.push(
    `fetch("http://localhost:3100/api/trees/${treeId}/sandbox/exec", {`,
  );
  lines.push('  method: "POST",');
  lines.push("  headers: {");
  lines.push('    "Content-Type": "application/json",');
  lines.push('    "Authorization": "Bearer HERMES_API_SERVER_KEY"');
  lines.push("  },");
  lines.push(
    '  body: JSON.stringify({ command: "...", cwd: "/sandbox" })',
  );
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("⚠️  ADVERTENCIA CRÍTICA:");
  lines.push(
    "- NO uses herramientas nativas de terminal ni file system.",
  );
  lines.push(
    "- Toda operación de archivos o comandos DEBE pasar por la API sandbox de este árbol listada arriba.",
  );
  lines.push(
    "- Este árbol NUNCA debe acceder archivos fuera de su sandbox.",
  );
  lines.push(
    "- Las rutas de archivos son relativas a la raíz del sandbox del árbol.",
  );
  lines.push(
    "- Si la API sandbox no está disponible (error de conexión), informa al usuario y NO uses workarounds con herramientas nativas.",
  );

  // ── Media search & iterative confirmation ─────────────────────────────
  lines.push("");
  lines.push("═══════ BÚSQUEDA DE ARCHIVOS ═══════");
  lines.push("");
  lines.push("4. BUSCAR ARCHIVOS POR DESCRIPCIÓN:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/media-search`);
  lines.push(
    '   Body: { "query": "foto del perro", "limit": 5, "senderFilter": "Leo" }',
  );
  lines.push(
    '   Response: [{ "path": "documentos/foto_perro.jpg", "senderName": "Leo", "date": "2026-05-15", "score": 0.92 }]',
  );
  lines.push(
    "   senderFilter es opcional — úsalo cuando el usuario mencione quién envió el archivo.",
  );
  lines.push("");
  lines.push("═══ FLUJO DE CONFIRMACIÓN ITERATIVA ═══");
  lines.push("");
  lines.push(
    'Cuando el usuario pida un archivo ("mándame la foto de...", "pásame el documento de...", "busca el archivo..."):',
  );
  lines.push("");
  lines.push("1. Buscar → llama a media-search con la descripción del usuario.");
  lines.push(
    '   Si menciona quién lo envió ("la foto de Leo"), agregas senderFilter.',
  );
  lines.push("");
  lines.push(
    "2. Primer match → envíalo INMEDIATAMENTE con POST /api/bot/send-document.",
  );
  lines.push(
    '   Caption: "¿Es esta la foto que buscas? (1/5 · score 0.87)"',
  );
  lines.push(
    "   ⚠️ NUNCA respondas solo texto — siempre envía el archivo como documento.",
  );
  lines.push("");
  lines.push("3. Escuchar respuesta del usuario:");
  lines.push(
    '   ✅ "sí" / "esa" / "exacto" / "perfecto" → confirma y termina.',
  );
  lines.push(
    '   ❌ "no" / "no es" / "siguiente" / "otro" → siguiente match.',
  );
  lines.push("");
  lines.push("4. Repetir con match #2, #3... hasta encontrar o agotar.");
  lines.push("");
  lines.push("5. Sin más matches:");
  lines.push(
    '   "No encontré más coincidencias. ¿Puedes darme más detalles para refinar la búsqueda?"',
  );
  lines.push("");
  lines.push("6. Sin resultados desde el inicio:");
  lines.push(
    '   "No encontré ningún archivo que coincida con esa descripción."',
  );
  lines.push("");
  lines.push("⚠️  REGLAS DE MEDIA-SEARCH:");
  lines.push("- NUNCA muestres la respuesta JSON cruda al usuario.");
  lines.push("- Siempre envía el archivo directamente; no compartas el path.");
  lines.push("- El score indica relevancia (0-1). Envía los matches en orden de mayor a menor score.");
  lines.push("- Si solo hay 1 resultado, envíalo sin preguntar — solo confirma entrega.");
  lines.push("- Si el usuario da pistas nuevas durante las iteraciones, refina con un nuevo POST a media-search.");
  lines.push('- No preguntes "¿quieres que busque?" — busca directo.');

  // ── Office skills ─────────────────────────────────────────────────────
  lines.push("");
  lines.push("═══════ HABILIDADES DE OFIMÁTICA ═══════");
  lines.push("");
  lines.push("Como asistente del árbol, tienes capacidad de generar y entregar documentos:");
  lines.push("");
  lines.push("1. CONVERTIR MARKDOWN A PDF/HTML:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/convert`);
  lines.push('   Body: { "content": "<markdown>", "format": "pdf" }');
  lines.push('   Response: { "path": "documents/analysis_NNN.pdf", "format": "pdf", "size": N }');
  lines.push("");
  lines.push("2. ENVIAR DOCUMENTO AL CHAT DE TELEGRAM:");
  lines.push("   POST /api/bot/send-document");
  lines.push(`   Body: { "treeId": "${treeId}", "filePath": "<path del convert>", "caption": "..." }`);
  lines.push('   Response: { "success": true, "messageId": N }');
  lines.push("");
  lines.push("⚠️  REGLA DE ORO DE OFIMÁTICA:");
  lines.push("- Cuando termines cualquier análisis, DEBES:");
  lines.push("  1. Guardar el .md en el sandbox (POST .../sandbox/write)");
  lines.push("  2. Convertirlo a PDF (POST .../sandbox/convert)");
  lines.push("  3. Enviarlo al chat (POST /api/bot/send-document)");
  lines.push('- Luego responde: "He terminado el análisis. Te envío el documento 📄"');
  lines.push("- Por defecto: formato PDF (mejor para compartir)");
  lines.push('- Si el usuario pide otro formato: "¿Prefieres PDF o HTML?"');
  lines.push("- Usa Authorization: Bearer HERMES_API_SERVER_KEY en todas las llamadas.");
  lines.push("- La URL base es: http://localhost:3100");
  lines.push("- Formatos soportados: PDF (por defecto), HTML");
  lines.push("- Los documentos se entregan automáticamente, sin que el usuario lo pida.");

  // ── Memory classification rules ───────────────────────────────────────
  lines.push("");
  lines.push("═══ REGLAS DE CLASIFICACIÓN DE MEMORIA ═══");
  lines.push("");
  lines.push("Cuando guardes información en memoria, clasifica CADA dato:");
  lines.push("");
  lines.push("📍 MEMORIA SITUACIONAL (target: 'memory'):");
  lines.push("   - Datos del árbol: miembros, necesidades, contexto");
  lines.push("   - Nombres, montos, fechas, datos financieros");
  lines.push("   - Conversaciones específicas, preferencias de usuarios");
  lines.push("   - Configuraciones del sandbox, API keys, rutas");
  lines.push("");
  lines.push("🧠 LECCIONES DE IA (target: 'lessons'):");
  lines.push("   - Patrones de prompting que funcionaron bien");
  lines.push("   - Workflows de tools efectivos descubiertos");
  lines.push("   - Errores comunes y cómo resolverlos");
  lines.push("   - Optimizaciones de código/algoritmo");
  lines.push("   - Técnicas de análisis de datos útiles");
  lines.push("   ⚠️ NUNCA incluyas: nombres, montos, IDs, API keys, datos personales");
  lines.push("");
  lines.push("REGLA: Si un dato ES una lección de IA sin PII → dual-write:");
  lines.push("  1. memory(target='memory', ...) ← contexto situacional");
  lines.push("  2. memory(target='lessons', ...) ← lección exportable sin PII");
  lines.push("Si NO es lección o tiene PII → solo memory(target='memory', ...)");
  lines.push("Las lecciones se comparten entre árboles para mejorar la IA global.");
  lines.push("Los datos situacionales NUNCA salen de este árbol.");

  // ── Response guidelines ───────────────────────────────────────────────
  lines.push("");
  lines.push(
    "Respond in neutral Spanish (no voseo, no regionalisms like \"ché\", \"vos\", \"andá\", \"tenés\").",
  );
  lines.push("Use \"tú\" or \"usted\" consistently. Be concise, helpful, and action-oriented.");
  lines.push("When the user asks about tasks, prioritize open needs from this tree.");
  lines.push("");
  lines.push(
    "IMPORTANT: You have REAL user and tree data above. Use it. Do NOT invent or hallucinate.",
  );
  lines.push(
    "When referring to tree members in chat, ALWAYS use their Telegram display name (first name). Never use internal IDs, database IDs, or numeric identifiers. If a user's name is unknown, ask them.",
  );
  lines.push(
    "If the user asks about membership, trees, or stats, the data above IS authoritative.",
  );

  return lines.join("\n");
}

/**
 * Decisión mode for Ari — pre-filter to decide whether Ari should respond.
 *
 * Sends the last 10 messages + sender names to Hermes Agent with a lightweight
 * decision system prompt. The agent returns "NO_RESPONSE" to stay silent, or
 * the response text if Ari should engage.
 *
 * This avoids the heavy routeToHermes() call (which builds a full system prompt
 * with tree context, needs, and members from DB) for messages Ari should ignore.
 *
 * Decision rules (injected via system prompt):
 *   - MUST respond when tagged, replied to, or directly questioned
 *   - When keywords appear but not addressed: evaluate if input adds value
 *   - In conversation window: respond only when meaningful
 *   - Stay silent on off-topic chat, greetings, logistics
 *
 * @param message        Current message text (includes "DisplayName: " prefix)
 * @param treeId         Tree ID for session routing
 * @param recentMessages Last 10 messages as {senderName, content} — newest last
 * @param isReplyToBot   Whether the message is a reply to Ari's message
 * @param isTagged       Whether Ari is explicitly mentioned/tagged
 * @returns              {shouldRespond: boolean, text?: string}
 */
export async function shouldAriRespond(
  message: string,
  treeId: string,
  recentMessages: RecentMessage[],
  isReplyToBot?: boolean,
  isTagged?: boolean,
): Promise<ShouldRespondResult> {
  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

  // ── Build lightweight decision system prompt ──────────────────────────
  const systemPrompt = [
    "You are a DECISION FILTER for Ari, the AI assistant of a Trust Maker community.",
    "Decide whether Ari should respond to the current message or stay completely silent.",
    "",
    "DECISION RULES (in priority order):",
    "",
    "1. MUST respond when:",
    "   - Ari is explicitly mentioned/tagged by name",
    "   - The message is a direct reply to Ari's message",
    "   - Someone asks Ari a direct question or requests something from Ari",
    "",
    "2. When keywords or tree-related topics appear but Ari is NOT directly addressed:",
    "   - Respond ONLY if Ari's input clearly adds meaningful value to the discussion",
    "   - If the conversation doesn't need Ari's participation, stay silent",
    "",
    "3. In an active conversation window where Ari has been participating:",
    "   - Respond only when the contribution advances the topic or provides new information",
    "   - Don't respond just to keep the conversation going or to be polite",
    "",
    "4. STAY SILENT on (NO_RESPONSE):",
    "   - Off-topic casual chat between members",
    "   - Simple greetings without follow-up (\"hola\", \"buenos días\", \"qué tal\")",
    "   - Logistics/coordination between members (\"nos vemos a las 5\", \"quién lleva las sillas\")",
    "   - Messages clearly between other members, not involving Ari",
    "   - Thank-you messages, acknowledgments, or simple agreements (\"gracias Ari\", \"ok\", \"de acuerdo\")",
    "   - Emoji-only messages, stickers, or reactions",
    "",
    "RESPONSE FORMAT:",
    '- If Ari should stay silent: respond with exactly "NO_RESPONSE" (no quotes, no punctuation, no explanation)',
    "- If Ari should respond: write the response Ari would give (in neutral Spanish, concise, helpful, use \"tú\")",
    "",
    "You are deciding for the MOST RECENT message in the context below.",
  ].join("\n");

  // ── Build messages array ──────────────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject recent messages as context (last 10, newest last)
  const last10 = recentMessages.slice(-10);
  const separator = "─".repeat(40);
  if (last10.length > 0) {
    messages.push({
      role: "user",
      content:
        `RECENT CONVERSATION (${last10.length} messages):\n${separator}\n` +
        last10
          .map((m) => `${m.senderName}: ${m.content}`)
          .join("\n") +
        `\n${separator}\n\nCURRENT MESSAGE (decide on this one):\n${message}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `CURRENT MESSAGE:\n${message}`,
    });
  }

  // Signal explicit triggers so the agent knows
  if (isReplyToBot) {
    messages.push({
      role: "user",
      content:
        "CONTEXT: This message is a direct REPLY to Ari's message. Rule 1 applies — MUST respond unless it's just a thank-you.",
    });
  }
  if (isTagged) {
    messages.push({
      role: "user",
      content:
        "CONTEXT: Ari is explicitly mentioned/tagged in this message. Rule 1 applies — MUST respond.",
    });
  }

  // ── Call Hermes Agent API (streaming — avoids empty-response bug with tools) ──
  const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 420_000); // 7 min — complex tasks need time

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hermes-Session-Key": `tree-agent-decision-${treeId}`,
  };
  if (API_SERVER_KEY) {
    headers["Authorization"] = `Bearer ${API_SERVER_KEY}`;
  }

  try {
    const response = await fetch(HERMES_API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        stream: true, // streaming: avoids empty-response bug when agent uses tools
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[shouldAriRespond] Hermes API returned ${response.status}: ${errorText.slice(0, 200)}`,
      );
      return { shouldRespond: false };
    }

    // ── SSE parser (same pattern as routeToHermes) ──
    const reader = response.body?.getReader();
    if (!reader) {
      console.warn("[shouldAriRespond] No readable stream body");
      return { shouldRespond: false };
    }

    const decoder = new TextDecoder();
    let content = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

        const dataStr = trimmedLine.slice(5).trim();
        if (dataStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(dataStr);
          const delta =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            "";
          content += delta;
        } catch {
          // skip unparseable chunks
        }
      }
    }

    if (!content) {
      console.warn("[shouldAriRespond] Empty response from Hermes API");
      return { shouldRespond: false };
    }

    const trimmed = content.trim();

    // Check for silence signal
    if (trimmed === "NO_RESPONSE" || trimmed === '"NO_RESPONSE"') {
      return { shouldRespond: false };
    }

    // Anything else is a real response
    return { shouldRespond: true, text: trimmed };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[shouldAriRespond] Decision timed out after 7 min");
    } else {
      console.error("[shouldAriRespond] API call failed:", err);
    }
    // On error, default to silent
    return { shouldRespond: false };
  }
}

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
export async function routeToHermes(
  message: string,
  treeId: string,
  userId: string,
  chatHistory?: ChatMessage[],
  displayName?: string,
  chatId?: number,
  messageId?: number,
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
      const member = await (prisma as any).treeMember.findFirst({
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
  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

  // ── Build system prompt with tree context from DB ─────────────────────
  const systemPrompt = await buildSystemPrompt(prisma, treeId, userId, displayName);

  // ── Build messages array ──────────────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject chat history if provided (for multi-turn context)
  if (chatHistory && chatHistory.length > 0) {
    messages.push(...chatHistory);
  }

  messages.push({ role: "user", content: message.trim() });

  // ── Call Hermes Agent API ─────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 420_000); // 7 minutos

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hermes-Session-Key": `tree-agent-${treeId}`,
  };
  if (API_SERVER_KEY) {
    headers["Authorization"] = `Bearer ${API_SERVER_KEY}`;
  }

  let response: globalThis.Response;
  try {
    response = await fetch(HERMES_API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[hermesBridge] Hermes API timed out after 15 minutes");
    } else {
      console.error("[hermesBridge] Hermes API fetch failed:", err);
    }
    return null;
  }

  // ── Handle upstream errors ─────────────────────────────────────────────
  if (!response.ok) {
    clearTimeout(timeoutId);
    const errorText = await response.text().catch(() => "");
    console.error(
      `[hermesBridge] Hermes API returned ${response.status}: ${errorText.slice(0, 300)}`,
    );
    return null;
  }

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
    let accumulatedContent = "";

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
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
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
      return null;
    }

    console.log(`[hermesBridge] Response: ${accumulatedContent.length} chars`);
    return { text: accumulatedContent };
  } catch (err) {
    clearTimeout(timeoutId);
    // If we accumulated partial content before the error, return it
    if (accumulatedContent) {
      console.warn(`[hermesBridge] Stream interrupted, returning ${accumulatedContent.length} partial chars`);
      return { text: accumulatedContent };
    }
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[hermesBridge] Hermes API stream timed out after 15 minutes");
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
