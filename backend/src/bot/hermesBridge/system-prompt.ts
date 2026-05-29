/**
 * System prompt builder — constructs the tree-specific system prompt for Ari.
 *
 * Extracted from hermesBridge.ts (Phase 1 Task 1.5).
 * Exports: buildSystemPrompt, checkKanbanCompletions, spawnHermesShow, taskCounters.
 */

import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { getAgentsMd } from "./history";
import { AGENTS_MD_MAX_CHARS } from "./constants";
import { writeDlqEntry, buildDlqWarning } from "./kanban-dlq";

// ── UUID validation ───────────────────────────────────────────────────────
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function validateTreeId(treeId: string): void {
  if (!UUID_RE.test(treeId)) {
    throw new Error(`Invalid treeId format: ${treeId}`);
  }
}

// ── Task counter for skill auto-evaluation (every 20 tasks) ───────────────
export const taskCounters = new Map<string, number>();

/**
 * Revisa si hay tareas Kanban completadas que Ari delegó.
 * Lee <sandboxDir>/kanban_pending.json (JSONL),
 * ejecuta `hermes kanban show --json` para cada tarea,
 * quita las completadas y retorna los resultados formateados.
 *
 * @returns String con resultados formateados, o null si no hay.
 */
export async function checkKanbanCompletions(
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

  const hermesBin = process.env.HERMES_BIN || "hermes";
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
    } catch (err: any) {
      writeDlqEntry({
        timestamp: new Date().toISOString(),
        operation: "kanban show",
        task_id: entry.task_id,
        tree_id: treeId,
        error: (err?.message || String(err)).slice(0, 500),
      });
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

/** Ejecuta `hermes kanban show <id> --json` directamente y retorna stdout. */
function spawnHermesShow(bin: string, taskId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [
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

export async function buildSystemPrompt(
  prisma: PrismaClient,
  treeId: string,
  userId: string,
  displayName?: string,
): Promise<string> {
  const lines: string[] = [];

  // ── Query 1: Tree info (must run first — early exit if null) ──────────
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

  // ── Query 2: Batch all remaining reads into one transaction ───────────
  // Uses recursive CTE for ancestor chain instead of while-loop (N→1 query).
  const [childTrees, needs, members, todos, tgUser, ancestorRows] =
    await prisma.$transaction([
      // Sub-trees
      prisma.tree.findMany({
        where: { parentTreeId: treeId },
        select: { id: true, name: true },
      }),
      // Active needs
      prisma.need.findMany({
        where: { treeId, status: "OPEN" },
        select: { title: true, description: true, importance: true },
        orderBy: { importance: "desc" },
        take: 10,
      }),
      // Members
      prisma.treeMember.findMany({
        where: { treeId, status: "ACTIVE" },
        include: {
          user: { select: { id: true, username: true, firstName: true } },
        },
        take: 20,
      }),
      // Community TODOs
      prisma.todo.findMany({
        where: { treeId, status: "PENDING" },
        orderBy: { likeCount: "desc" },
        take: 10,
      }),
      // User context
      prisma.user.findFirst({
        where: { telegramUserId: BigInt(userId) },
        select: { username: true, firstName: true, id: true },
      }),
      // Ancestor chain via recursive CTE (replaces while-loop)
      prisma.$queryRaw<Array<{ id: string; name: string; icono: string }>>`
        WITH RECURSIVE ancestors AS (
          SELECT id, name, icono, parentTreeId FROM Tree WHERE id = ${treeId}
          UNION ALL
          SELECT t.id, t.name, t.icono, t.parentTreeId
          FROM Tree t
          INNER JOIN ancestors a ON t.id = a.parentTreeId
        )
        SELECT id, name, icono FROM ancestors WHERE id != ${treeId}
      `,
    ]);

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
    const truncated = agentsMdContent.length > AGENTS_MD_MAX_CHARS
      ? agentsMdContent.slice(0, AGENTS_MD_MAX_CHARS - 3) + "..."
      : agentsMdContent;
    lines.push("");
    lines.push("═══ AGENTS.md (project rules) ═══");
    for (const line of truncated.split("\n")) lines.push(line);
    lines.push("Follow these project-level rules above default behavior.");
  }

  // ── DLQ warning (inject if failed kanban operations exist) ─────────────
  const dlqWarning = buildDlqWarning(treeId);
  if (dlqWarning) {
    for (const line of dlqWarning.split("\n")) lines.push(line);
  }

  // ── Sandbox memory (tree-level memory.json) ───────────────────────────
  const memoryPath = path.join(sandboxDir, "memory", "memory.json");

  // Derive per-tree API key — Ari should NEVER receive the global master key.
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
  lines.push(`This tree-scoped key works for all sandbox operations (read, write, exec, search, patch, memory, etc.).`);
  lines.push(`The HERMES_API_SERVER_KEY master key is also accepted for ALL endpoints (sandbox + API).`);
  lines.push(`Prefer the sandbox key for sandbox ops (better scoping), master key for Needs/Ideas/Global trees/NotebookLM.`);

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

  // ── Ancestor chain (from recursive CTE) ───────────────────────────────
  // Order: parent first → root last (CTE returns root→leaf, so we don't reverse)
  const ancestorChain = ancestorRows.map((a) => ({
    id: a.id,
    name: a.name,
    icono: a.icono || "🌳",
  }));

  // ── Root with children: multi-IA coordination ─────────────────────────
  const hasChildren = childTrees.length > 0;

  if (ancestorChain.length > 0) {
    lines.push("");
    lines.push("═══ ANCESTOR CHAIN ═══");
    lines.push(`You are a sub-tree. Ancestors (parent→root): ${ancestorChain.map(a => `${a.icono} ${a.name}`).join(" → ")}`);
    lines.push("Sandbox parent read: POST /api/trees/<id>/sandbox/parent/read (read-only)");
    lines.push("Sandbox ancestors read: POST /api/trees/<id>/sandbox/ancestors/read");
    lines.push("⚠️ READ-ONLY on ancestors. Use skill_view('trust-maker') for full API docs.");
    
    // ── Parent Graphify access (Option C) ────────────────────────────────
    const parentId = ancestorChain[ancestorChain.length - 1]?.id;
    if (parentId) {
      lines.push("");
      lines.push("═══ PARENT KNOWLEDGE GRAPH (Graphify) ═══");
      lines.push(`Your parent has a code knowledge graph. To search it:`);
      lines.push(`1. Read the graph file: POST /api/trees/<yourId>/sandbox/parent/read`);
      lines.push(`   Body: {"path": "graphify-out/graph.json"}`);
      lines.push(`2. Query it: graphify query "your question" --graph <saved_path>`);
      lines.push(`   The parent's graph maps its entire codebase — functions, classes, data flow.`);
      lines.push(`   Use this to understand the parent's architecture before proposing changes.`);
    }
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
