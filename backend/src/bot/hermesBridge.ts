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
import fs from "fs";
import path from "path";
import { incrementUsage } from "../lib/skillUsage";
import { messageQueue } from "./messageQueue";
import { deriveTreeApiKey } from "../controllers/treeSandboxController";

const HERMES_API = "http://127.0.0.1:8644/v1/chat/completions";
const SUPPORT_HERMES_GATEWAY = process.env.HERMES_SUPPORT_GATEWAY || "http://127.0.0.1:8646";
const SUPPORT_HERMES_API_URL = process.env.SUPPORT_HERMES_API_URL || `${SUPPORT_HERMES_GATEWAY}/v1/chat/completions`;
const SUPPORT_HERMES_API_KEY = process.env.HERMES_SUPPORT_API_KEY || process.env.SUPPORT_HERMES_API_KEY || "";

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

// ── Task counter for skill auto-evaluation (every 20 tasks) ─────────────
const taskCounters = new Map<string, number>();

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
  const treeApiKey = deriveTreeApiKey(treeId);

  // ── Tree info ─────────────────────────────────────────────────────────
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      name: true,
      icono: true,
      description: true,
      objectives: true,
      admissionPolicy: true,
      parentTreeId: true,
      interactionMode: true,
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

  // ── Interaction Mode ────────────────────────────────────────────────────
  if (tree.interactionMode && tree.interactionMode !== "MAXIMUM") {
    lines.push("");
    lines.push("═══ INTERACTION MODE ═══");
    lines.push("");
    if (tree.interactionMode === "MEDIUM") {
      lines.push(
        "Only respond when directly mentioned, replied to, or named. Do not proactively join.",
      );
    } else if (tree.interactionMode === "MINIMUM") {
      lines.push(
        "Only respond when tagged (@TrustMakerBot) or replied to. Stay silent otherwise.",
      );
    }
  }

  // ── Interaction Mode Skill ─────────────────────────────────────────────
  lines.push("");
  lines.push("═══ SKILL: CHANGE INTERACTION MODE ═══");
  lines.push("");
  lines.push("Tienes una skill local `change-interaction-mode` en skills/change-interaction-mode.md (leída del sandbox).");
  lines.push("Te permite ajustar autónomamente tu nivel de interacción en el grupo vía el siguiente endpoint:");
  lines.push("");
  lines.push(`  PATCH http://localhost:3100/api/trees/${treeId}/interaction-mode`);
  lines.push('  Body: { "mode": "MAXIMUM"|"MEDIUM"|"MINIMUM" }');
  lines.push("  Authorization: Bearer HERMES_API_SERVER_KEY");
  lines.push("");
  lines.push("Evalúa la actividad del grupo y ajusta el modo cuando sea necesario:");
  lines.push("- Grupo muy activo (muchos mensajes/min) → MEDIUM para no saturar");
  lines.push("- Grupo callado (poca actividad) → MAXIMUM para mantener engagement");
  lines.push("- Debate intenso entre miembros → MINIMUM para no interrumpir");
  lines.push("- Te piden más/menos participación → Ajusta en consecuencia");
  lines.push("");
  lines.push("REGLAS:");
  lines.push("- Anuncia el cambio brevemente antes de hacerlo: 'Ajustando mi nivel de interacción a [MODO] por [razón].'");
  lines.push("- No cambies el modo más de una vez cada 30 minutos.");
  lines.push("- Si no estás segura, mantén el modo actual.");

  // ── Related Trees ──────────────────────────────────────────────────────
  const parentTreeId = tree.parentTreeId;
  let parentTreeName: string | null = null;

  const childTrees = await (prisma as any).tree.findMany({
    where: { parentTreeId: treeId },
    select: { id: true, name: true },
  });

  let parentDisplayName: string | null = null;

  if (parentTreeId) {
    const parent = await (prisma as any).tree.findUnique({
      where: { id: parentTreeId },
      select: { name: true, icono: true },
    });
    if (parent) {
      parentTreeName = parent.name;
      parentDisplayName = `${parent.icono || "🌳"} ${parent.name}`;
    }
  }

  const isSubTree = !!parentTreeName;
  const hasChildren = childTrees.length > 0;

  if (isSubTree || hasChildren) {
    lines.push("");
    lines.push("═══════ ÁRBOLES RELACIONADOS ═══════");
    lines.push("");

    if (isSubTree) {
      lines.push("═══ PARENT TREE CONTEXT ═══");
      lines.push("");
      lines.push(`Eres un SUB-ÁRBOL de ${parentDisplayName || parentTreeName} (id: ${parentTreeId}).`);
      lines.push(`Debes presentarte SIEMPRE como parte de la comunidad "${parentTreeName}".`);
      lines.push("");
      lines.push("Como sub-árbol, DEBES:");
      lines.push("- Reconocer al árbol padre como autoridad estratégica del ecosistema");
      lines.push("- Leer el sandbox del padre antes de decisiones que afecten a todo el ecosistema");
      lines.push("- No hablar en nombre del árbol padre ni tomar decisiones que le competan");
      lines.push("");
      lines.push("SANDBOX PADRE (solo lectura):");
      lines.push(`  POST http://localhost:3100/api/trees/${treeId}/sandbox/parent/read`);
      lines.push('  Body: { "path": "obsidian/decisiones/ejemplo.md" }');
      lines.push("  Authorization: Bearer HERMES_API_SERVER_KEY");
      lines.push("");
      lines.push("⚠️  SOLO LECTURA. No puedes escribir, modificar ni borrar en el sandbox padre.");
      lines.push("");
      lines.push(`En grupos multi-IA, tu prefijo obligatorio es: 🌿 ${tree.name} (sub):`);
    } else {
      lines.push(`Eres un ÁRBOL RAÍZ. En grupos multi-IA, tu prefijo es: 🌳 ${tree.name}:`);
    }

    lines.push("");

    if (hasChildren) {
      lines.push(`Sub-árboles vinculados (${childTrees.length}):`);
      for (const child of childTrees) {
        lines.push(`  - 🌿 ${child.name} (id: ${child.id})`);
      }
      lines.push("");
    }

    lines.push("═══ REGLAS DE COMUNICACIÓN MULTI-IA (grupos Telegram) ═══");
    lines.push("");
    lines.push("1. PREFIJO OBLIGATORIO:");
    lines.push(`   ${isSubTree ? `🌿 ${tree.name} (sub):` : `🌳 ${tree.name}:`} → TODA respuesta en grupo empieza con esto.`);
    lines.push("   No es opcional. Si lo olvidas, el bridge lo agrega, pero hazlo siempre.");
    lines.push("");
    lines.push("2. CUÁNDO RESPONDER:");
    lines.push("   - @TuNombre → mención directa. Responder SIEMPRE.");
    lines.push("   - El mensaje contiene keywords de tu objetivo (ver 'Objectives' arriba).");
    lines.push("   - 'todos:' → broadcast a todos los árboles.");
    lines.push("   - Un árbol padre menciona algo relevante para tu sub-árbol.");
    lines.push("");
    lines.push("3. CUÁNDO CALLAR (NO_RESPONSE):");
    lines.push("   - El mensaje es para otro árbol (contiene @OtroArbol).");
    lines.push("   - No tiene keywords de tu objetivo ni te menciona.");
    lines.push("   - No tienes nada útil que agregar. El silencio es correcto.");
    lines.push("   - El grupo no es un chatbot — es un puente de coordinación.");
    lines.push("");
    lines.push("4. RESPUESTAS CRUZADAS (cross-tree):");
    lines.push("   - Si un árbol padre responde con algo relevante para ti, puedes complementar.");
    lines.push("   - Respuestas breves (1-3 líneas), con tu prefijo, complementarias no repetitivas.");
    lines.push("");
    lines.push("5. SANDBOX PADRE (solo sub-árboles):");
    if (isSubTree) {
      lines.push("   - POST .../sandbox/parent/read → contexto del padre.");
      lines.push("   - NUNCA intentes escribir en el sandbox del padre.");
    } else {
      lines.push("   - No aplica (eres árbol raíz).");
    }
  }

  // ── Global skills ──────────────────────────────────────────────────────
  const skillsDir = path.join(
    process.env.HOME || "/home/leo",
    ".hermes/skills/trustmaker",
  );
  lines.push("");
  lines.push("═══ SKILLS GLOBALES CARGADAS ═══");
  lines.push("");

  if (fs.existsSync(skillsDir)) {
    const skillFiles = fs
      .readdirSync(skillsDir)
      .filter((f) => f.endsWith(".usos.json"));
    const skillNames = fs
      .readdirSync(skillsDir)
      .filter((f) => f.endsWith(".py") || f.endsWith(".md"));

    const uniqueSkills = new Set<string>();
    // Skills ya trackeadas (con .usos.json)
    for (const f of skillFiles) {
      uniqueSkills.add(f.replace(".usos.json", ""));
    }
    // Skills detectadas por archivos fuente (.py/.md), excluyendo helpers
    for (const f of skillNames) {
      const base = f.replace(/\.(py|md)$/, "");
      if (base !== "tools" && base !== "init_sqlite" &&
          base !== "verify_vote" && base !== "debug_propose" &&
          base !== "test_all_ops") {
        uniqueSkills.add(base);
      }
    }
    // Fallback: si no se detectó ninguna, trust-maker es la skill principal
    if (uniqueSkills.size === 0 && fs.existsSync(path.join(skillsDir, "tools.py"))) {
      uniqueSkills.add("trust-maker");
    }

    for (const skill of uniqueSkills) {
      lines.push(`  - ${skill}`);
      try {
        incrementUsage(skill, treeId, skillsDir);
      } catch {
        // non-blocking: usage tracking should never break the prompt
      }
    }
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
      user: { select: { id: true, username: true, firstName: true } },
    },
    take: 20,
  });

  // Batch-fetch WorkerSkills for all members
  const memberIds = members.map((m: any) => m.userId).filter(Boolean);
  const allWorkerSkills: any[] = memberIds.length > 0
    ? await (prisma as any).workerSkill.findMany({
        where: { userId: { in: memberIds } },
        orderBy: { xp: "desc" as const },
      })
    : [];
  const skillsByUserId: Record<string, any[]> = {};
  for (const ws of allWorkerSkills) {
    if (!skillsByUserId[ws.userId]) skillsByUserId[ws.userId] = [];
    skillsByUserId[ws.userId].push(ws);
  }

  const memberCount = members.length;
  lines.push("");
  lines.push(`Members (${memberCount} active):`);

  if (members.length === 0) {
    lines.push("  (no active members)");
  } else {
    for (const m of members) {
      const displayName = m.user?.firstName || m.user?.username || "(anónimo)";
      let skillsStr = "";
      const wsList = skillsByUserId[m.userId];
      if (wsList && wsList.length > 0) {
        skillsStr = " [" + wsList.slice(0, 5).map((ws: any) => `${ws.skill}(${ws.xp})`).join(", ") + "]";
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
    "Formato de solicitud HTTP — usa fetch con tu TREE_API_KEY (específica de este árbol):",
  );
  lines.push("");
  lines.push("```javascript");
  lines.push(
    `fetch("http://localhost:3100/api/trees/${treeId}/sandbox/exec", {`,
  );
  lines.push('  method: "POST",');
  lines.push("  headers: {");
  lines.push('    "Content-Type": "application/json",');
  lines.push(`    "Authorization": "Bearer ${treeApiKey}"`);
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

  // ── Security restrictions ─────────────────────────────────────────────
  lines.push("");
  lines.push("═══ RESTRICCIONES DE SEGURIDAD ═══");
  lines.push("");
  lines.push("1. PROHIBICIÓN EXPLÍCITA:");
  lines.push("   - NUNCA uses mysql, mysqldump, ni ningún cliente MySQL/MariaDB directamente desde la terminal.");
  lines.push("   - No tienes permitido conectarte a bases de datos externas.");
  lines.push("");
  lines.push("2. ÚNICA VÍA AUTORIZADA:");
  lines.push("   Para consultas SQL, usa EXCLUSIVAMENTE:");
  lines.push(`     POST http://localhost:3100/api/trees/${treeId}/sandbox/query`);
  lines.push('     Body: { "sql": "SELECT ... FROM ... WHERE ..." }');
  lines.push("   El endpoint inyecta automáticamente el filtro treeId — solo verás datos de este árbol.");
  lines.push("   Authorization: Bearer HERMES_API_SERVER_KEY");
  lines.push("");
  lines.push("3. ADVERTENCIA:");
  lines.push("   ⚠️ Intentar acceder a MySQL directamente es una VIOLACIÓN DE SEGURIDAD cross-tree y será reportado.");

  // ── Parent sandbox read ────────────────────────────────────────────────
  if (tree.parentTreeId) {
    let parentName = "padre";
    try {
      const parent = await (prisma as any).tree.findUnique({
        where: { id: tree.parentTreeId },
        select: { name: true, icono: true },
      });
      if (parent) parentName = `"${parent.name}" ${parent.icono}`;
    } catch { /* non-blocking */ }

    lines.push("");
    lines.push("═══ LECTURA DEL SANDBOX DEL ÁRBOL PADRE ═══");
    lines.push("");
    lines.push(`Tu árbol es un sub-árbol de ${parentName}. Tienes acceso de SOLO LECTURA al sandbox del árbol padre.`);
    lines.push("");
    lines.push("5. LEER ARCHIVOS DEL ÁRBOL PADRE:");
    lines.push(`   POST /api/trees/${treeId}/sandbox/parent/read`);
    lines.push('   Body: { "path": "obsidian/..." }');
    lines.push('   Response: { "content": "...", "size": N }');
    lines.push("");
    lines.push("Úsalo para obtener contexto adicional antes de responder:");
    lines.push("   - Decisiones del árbol padre que puedan afectar a tu sub-árbol.");
    lines.push("   - Investigación o notas relacionadas en el vault del padre (obsidian/...).");
    lines.push("   - Estrategia general o directrices del árbol raíz.");
    lines.push("");
    lines.push("Ejemplo de uso:");
    lines.push("```javascript");
    lines.push(`fetch("http://localhost:3100/api/trees/${treeId}/sandbox/parent/read", {`);
    lines.push('  method: "POST",');
    lines.push("  headers: {");
    lines.push('    "Content-Type": "application/json",');
    lines.push('    "Authorization": "Bearer HERMES_API_SERVER_KEY"');
    lines.push("  },");
    lines.push('  body: JSON.stringify({ path: "obsidian/decisions/estrategia-2026.md" })');
    lines.push("});");
    lines.push("```");
    lines.push("");
    lines.push("⚠️  SOLO LECTURA. No puedes escribir, modificar ni eliminar archivos del sandbox padre.");
  }

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

  // ── Obsidian Vault search ──────────────────────────────────────────────
  lines.push("");
  lines.push("═══ BÚSQUEDA EN OBSIDIAN VAULT ═══");
  lines.push("");
  lines.push("Tienes un vault Obsidian en obsidian/ dentro de tu sandbox. Úsalo como memoria.");
  lines.push("");
  lines.push("ANTES de responder, busca en el vault cuando el mensaje:");
  lines.push('  - Menciona archivos, decisiones pasadas, o personas ("el documento de...", "la decisión sobre...")');
  lines.push('  - Contiene "qué era", "recuerdas", "cuándo", "quién hizo", "dónde está", "cómo se llamaba"');
  lines.push('  - Pregunta por algo que pasó antes en el árbol');
  lines.push("");
  lines.push("Cómo buscar:");
  lines.push("  POST .../sandbox/exec → { \"command\": \"grep -ril 'término' obsidian/\" }");
  lines.push("  POST .../sandbox/exec → { \"command\": \"find obsidian/ -name '*keyword*'\" }");
  lines.push("  POST .../sandbox/read  → { \"path\": \"obsidian/...\" } (para leer la nota encontrada)");
  lines.push("");
  lines.push("⚠️  NUNCA respondas de memoria si el vault puede tener la respuesta. Busca primero.");

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

  // ── Obsidian note-taking rules ─────────────────────────────────────────
  lines.push("");
  lines.push("═══ REGLAS DE DOCUMENTACIÓN EN OBSIDIAN ═══");
  lines.push("");
  lines.push("Después de escribir CUALQUIER archivo en el sandbox (via sandbox/write),");
  lines.push("DEBES crear una nota reflexiva en obsidian/assets/<filename>.md con:");
  lines.push("");
  lines.push("1. Frontmatter YAML obligatorio:");
  lines.push("   ---");
  lines.push("   type: asset");
  lines.push("   path: /home/trustmaker/trees/${treeId}/<ruta-relativa-del-archivo>");
  lines.push("   created: YYYY-MM-DD");
  lines.push("   createdBy: <nombre de quien lo pidió>");
  lines.push("   ---");
  lines.push("");
  lines.push("2. Cuerpo de la nota:");
  lines.push("   - Qué es el archivo (descripción clara en 1-2 líneas)");
  lines.push("   - Quién lo solicitó");
  lines.push("   - Por qué se creó (contexto, tarea relacionada)");
  lines.push("   - [[wikilinks]] a notas relacionadas (ej: [[people/Leo]], [[decisions/analisis-inicial]])");
  lines.push("");
  lines.push("3. La nota se crea con:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/write`);
  lines.push(`   Body: { "path": "obsidian/assets/<filename>.md", "content": "<nota completa>" }`);
  lines.push("");
  lines.push("EXCEPCIÓN: No crear nota si el archivo ya está dentro de obsidian/ o es un .rating.json.");

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

  // ── Tree-first Hiring Pipeline (V3) ────────────────────────────────────
  lines.push("");
  lines.push("═══ TREE-FIRST HIRING PIPELINE ═══");
  lines.push("");
  lines.push("Cuando detectes (o te asignen) una tarea human-worker (ExternalTask):");
  lines.push("");
  lines.push("1. NO crees ExternalTask inmediatamente.");
  lines.push("");
  lines.push("2. PRIMERO publica en el grupo del árbol un anuncio con:");
  lines.push("   - Título de la tarea");
  lines.push("   - Skills requeridas");
  lines.push("   - Budget (CLP)");
  lines.push("   - Deadline (si existe)");
  lines.push('   - Botón \"Yo puedo\"');
  lines.push("");
  lines.push("   Para publicar, usa este endpoint:");
  lines.push("   POST http://localhost:3100/api/bot/send-message");
  lines.push(`   Body: { "treeId": "${treeId}", "text": "<mensaje en Markdown>", "inlineKeyboard": [[{"text": "💪 Yo puedo", "callback_data": "candidate:apply:${treeId}:TASK_ID"}]], "kanbanTaskId": "<TASK_ID>" }`);
  lines.push("   Authorization: Bearer HERMES_API_SERVER_KEY");
  lines.push("");
  lines.push("3. El bot automaticamente:");
  lines.push("   - Abre una ventana de 4 horas para candidatos.");
  lines.push('   - A las 3h40m envia un recordatorio al grupo: "Quedan 20 min. Nadie mas?"');
  lines.push("   - A las 4h cierra la ventana y crea una encuesta ANONIMA con los candidatos.");
  lines.push('   - La encuesta incluye: candidatos + "Contratar externo" + "Cancelar tarea"');
  lines.push("   - Tu (Ari) NO necesitas manejar el timer — el bot lo hace.");
  lines.push("");
  lines.push('4. Cuando un miembro presiona "Yo puedo", el bot registra al candidato.');
  lines.push('   Y notifica al grupo: "@user se postulo (N candidatos)"');
  lines.push("   Consulta los candidatos con:");
  lines.push("     GET http://localhost:3100/api/candidates?taskId=<TASK_ID>");
  lines.push("     Authorization: Bearer HERMES_API_SERVER_KEY");
  lines.push("");
  lines.push("5. AL CERRAR LA ENCUESTA, el resultado determina automaticamente que hacer.");
  lines.push("   Usa SIEMPRE el endpoint de resolución ANTES de notificar:");
  lines.push("");
  lines.push("   POST http://localhost:3100/api/candidates/resolve");
  lines.push("   Authorization: Bearer HERMES_API_SERVER_KEY");
  lines.push("");
  lines.push("   ┌─ ACCIÓN 1: GANA CANDIDATO INTERNO ─────────────────────────────┐");
  lines.push("   │ Body: { \"taskId\": \"...\", \"treeId\": \"${treeId}\",              │");
  lines.push("   │         \"action\": \"internal\", \"winnerId\": \"<userId>\" }        │");
  lines.push("   │                                                                  │");
  lines.push("   │ El endpoint:                                                     │");
  lines.push("   │ - Marca al ganador ACCEPTED y al resto REJECTED                  │");
  lines.push("   │ - Devuelve nextSteps con instrucciones para notificar            │");
  lines.push("   │                                                                  │");
  lines.push("   │ DESPUÉS de recibir la respuesta, DEBES:                          │");
  lines.push("   │ a) Notificar en el grupo: \"@nombre fue elegido para la tarea\"   │");
  lines.push("   │    (usa POST /api/bot/send-message)                              │");
  lines.push("   │ b) Notificar al ganador por DM (si tiene telegramUserId):        │");
  lines.push("   │    Usa el bot para enviar DM.                                    │");
  lines.push("   │ c) Asignar la tarea Kanban:                                      │");
  lines.push("   │    hermes kanban reassign <taskId> <winnerId>                    │");
  lines.push("   └──────────────────────────────────────────────────────────────────┘");
  lines.push("");
  lines.push("   ┌─ ACCIÓN 2: CONTRATAR EXTERNO ──────────────────────────────────┐");
  lines.push("   │ Body: { \"taskId\": \"...\", \"treeId\": \"${treeId}\",              │");
  lines.push("   │         \"action\": \"external\" }                                  │");
  lines.push("   │                                                                  │");
  lines.push("   │ El endpoint rechaza todos los candidatos pendientes.             │");
  lines.push("   │                                                                  │");
  lines.push("   │ DESPUÉS:                                                         │");
  lines.push("   │ a) Notificar en el grupo: \"Se contrata externo para esta tarea\" │");
  lines.push("   │ b) Crear ExternalTask via:                                       │");
  lines.push("   │    POST http://localhost:3100/api/external-tasks                │");
  lines.push("   │    Authorization: Bearer HERMES_API_SERVER_KEY (usa role=SYSTEM)│");
  lines.push("   │    Body: { \"treeId\": \"${treeId}\", \"title\": \"...\",            │");
  lines.push("   │     \"description\": \"...\", \"skills\": [...], \"budget\": N,       │");
  lines.push("   │     \"kanbanTaskId\": \"...\" }                                     │");
  lines.push("   └──────────────────────────────────────────────────────────────────┘");
  lines.push("");
  lines.push("   ┌─ ACCIÓN 3: CANCELAR TAREA ─────────────────────────────────────┐");
  lines.push("   │ Body: { \"taskId\": \"...\", \"treeId\": \"${treeId}\",              │");
  lines.push("   │         \"action\": \"cancel\", \"motivo\": \"razón en español\",     │");
  lines.push("   │         \"alternativas\": [\"Opción 1\", \"Opción 2\", \"Opción 3\"] }│");
  lines.push("   │                                                                  │");
  lines.push("   │ El endpoint rechaza todos los candidatos y devuelve cancelData. │");
  lines.push("   │                                                                  │");
  lines.push("   │ DESPUÉS:                                                         │");
  lines.push("   │ a) PROPONER 2-3 alternativas en el grupo (mensaje claro):       │");
  lines.push("   │    1. Reducir scope/budget                                      │");
  lines.push("   │    2. Dividir en sub-tareas más simples                         │");
  lines.push("   │    3. Posponer para después                                     │");
  lines.push("   │ b) Guardar CancelledPlan:                                       │");
  lines.push("   │    POST http://localhost:3100/api/cancelled-plans               │");
  lines.push("   │    Authorization: Bearer HERMES_API_SERVER_KEY                  │");
  lines.push("   │    Body: { \"title\": \"...\", \"description\": \"...\",              │");
  lines.push("   │     \"skills\": [...], \"budget\": N, \"motivo\": \"...\",           │");
  lines.push("   │     \"treeId\": \"${treeId}\", \"alternativas\": [...] }            │");
  lines.push("   │ c) Bloquear tarea Kanban:                                        │");
  lines.push("   │    hermes kanban block <taskId> \"Cancelada: <motivo>\"           │");
  lines.push("   │ d) Si el proyecto es esencial y la tarea bloquea todo:          │");
  lines.push("   │    escala al admin (busca miembros con role=ADMIN del árbol).   │");
  lines.push("   └──────────────────────────────────────────────────────────────────┘");
  lines.push("");
  lines.push("6. REFERENCIA FUTURA: Si surge una necesidad similar, consulta:");
  lines.push("     GET http://localhost:3100/api/cancelled-plans?treeId=${treeId}");
  lines.push("     Authorization: Bearer HERMES_API_SERVER_KEY");
  lines.push("   Sugiere: \"Ya hubo un plan para esto en el pasado. ¿Quieres revisarlo?\"");

  // ── Skills ─────────────────────────────────────────────────────────────
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
  const localSkillsDir = path.join(sandboxBase, treeId, "skills");
  const adminId = process.env.TRUSTMAKER_ADMIN_TELEGRAM_ID || "";

  lines.push("");
  lines.push("═══ REGLAS DE SKILLS ═══");
  lines.push("");
  lines.push("1. PERMISOS:");
  if (adminId) {
    lines.push(
      `   - SOLO el usuario con Telegram ID ${adminId} puede usar skill_manage para crear/modificar skills GLOBALES.`,
    );
  } else {
    lines.push(
      "   - SOLO el admin (TRUSTMAKER_ADMIN_TELEGRAM_ID) puede usar skill_manage para crear/modificar skills GLOBALES.",
    );
  }
  lines.push(
    "   - Cualquier usuario puede pedir crear skills LOCALES para este árbol.",
  );
  lines.push("");
  lines.push("2. SKILLS LOCALES (este árbol):");
  lines.push(
    `   - Ari usa POST /api/trees/${treeId}/sandbox/write -> skills/<nombre>.md + skills/<nombre>.rating.json`,
  );
  lines.push("");
  lines.push("3. SKILLS GLOBALES:");
  lines.push(
    "   - Están en ~/.hermes/skills/trustmaker/ y se cargan automáticamente.",
  );
  lines.push("");
  lines.push("4. FORMATO DE SKILL (.md):");
  lines.push(
    "   - Frontmatter YAML con: name, description, version, createdBy, createdAt, treeId.",
  );
  lines.push("");
  lines.push("5. CADA 20 TAREAS COMPLETADAS:");
  lines.push(
    "   - Evalúa si crear una skill a partir de patrones detectados y proponla al usuario.",
  );

  // ── Read local skills from sandbox ─────────────────────────────────────
  try {
    if (fs.existsSync(localSkillsDir)) {
      const skillFiles = fs
        .readdirSync(localSkillsDir)
        .filter((f) => f.endsWith(".md"));
      if (skillFiles.length > 0) {
        lines.push("");
        lines.push("6. SKILLS LOCALES DISPONIBLES EN ESTE ÁRBOL:");
        for (const file of skillFiles) {
          try {
            const raw = fs.readFileSync(path.join(localSkillsDir, file), "utf-8");
            // Extract frontmatter name and description
            const nameMatch = raw.match(/^---\s*\nname:\s*(.+)$/m);
            const descMatch = raw.match(/^description:\s*(.+)$/m);
            const name = nameMatch
              ? nameMatch[1].trim()
              : file.replace(/\.md$/, "");
            const desc = descMatch ? ` — ${descMatch[1].trim()}` : "";
            lines.push(`   - ${name}${desc}`);
          } catch {
            lines.push(`   - ${file.replace(/\.md$/, "")}`);
          }
        }
      }
    }
  } catch {
    // Silently skip if skills directory can't be read
  }

  // ── Skill auto-evaluation trigger (every 20 tasks) ────────────────────
  const taskCount = taskCounters.get(treeId) ?? 0;
  if (taskCount >= 20) {
    lines.push("");
    lines.push("═══ AUTOEVALUACIÓN DE SKILLS ═══");
    lines.push("");
    lines.push("Has completado 20 tareas en este árbol. Revisa las últimas interacciones.");
    lines.push("Si detectas un patrón, workflow o solución recurrente que merezca ser skill,");
    lines.push("pregúntale al usuario si quiere guardarlo. Si acepta, crea la skill en el sandbox.");
    lines.push("");
    lines.push("Para crear una skill local:");
    lines.push(`  POST /api/trees/${treeId}/sandbox/write`);
    lines.push(`  Body: { "path": "skills/<nombre>.md", "content": "<skill en markdown>" }`);
    lines.push(`  Luego: { "path": "skills/<nombre>.rating.json", "content": "{\\"rating\\": 0}" }`);
    taskCounters.set(treeId, 0); // reset after trigger
  }

  // ── Invitation link ────────────────────────────────────────────────────
  lines.push("");
  lines.push("═══ REGLAS DE REGISTRO ═══");
  lines.push("");
  lines.push("Cuando un nuevo usuario pregunte cómo unirse al árbol o participar:");
  lines.push("- NO manejes el registro tú.");
  lines.push(`- Responde: "Para unirte, usa este enlace: https://t.me/AriTrustManagerBot?start=${treeId}"`);
  lines.push("- No recopiles datos personales ni método de pago — eso lo maneja @AriTrustManagerBot.");

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
      const prefix = treeInfo.parentTreeId
        ? `🌿 ${treeInfo.name} (sub): `
        : `🌳 ${treeInfo.name}: `;
      console.log(`[hermesBridge] Prefix enforced: ${treeInfo.parentTreeId ? "🌿 sub" : "🌳 root"}`);
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

    // ── Prefix Enforcement ──────────────────────────────────────────────
    accumulatedContent = await enforcePrefix(accumulatedContent, treeId, prisma);

    // ── Multi-tree name prefix ──────────────────────────────────────────
    if (chatId !== undefined && treeId) {
      try {
        const treeCount = await (prisma as any).tree.count({
          where: { telegramChatId: String(chatId) },
        });
        if (treeCount > 1) {
          const tree = await (prisma as any).tree.findUnique({
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
          const treeCount = await (prisma as any).tree.count({
            where: { telegramChatId: String(chatId) },
          });
          if (treeCount > 1) {
            const tree = await (prisma as any).tree.findUnique({
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
