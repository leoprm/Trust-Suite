/**
 * Nightly Research Cron — pipeline R1→R2→R3→R4 por árbol.
 *
 * Cada medianoche:
 *   1. Query trees activos (telegramChatId not null)
 *   2. Por cada árbol: spawnear tarea Kanban con workspace = sandbox
 *   3. El worker asignado ejecuta el pipeline (keyword_extractor →
 *      web_researcher → note_writer → summary_generator)
 *   4. Loggear: árboles procesados, tareas creadas, errores
 *
 * ~50 LOC. El pipeline completo vive en lib/ (Python scripts) +
 * la skill nightly-research cargada por el worker Kanban.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);
const HERMES_BIN = process.env.HERMES_BIN || "hermes";

// ── Activity filter ──────────────────────────────────────────────────────
/** Returns true if the tree has conversation files modified in the last 24h. */
function hasRecentActivity(sandboxDir: string): boolean {
  const convDir = path.join(sandboxDir, "conversations");
  if (!fs.existsSync(convDir)) return false;
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  try {
    return fs.readdirSync(convDir).some((f) => {
      const stat = fs.statSync(path.join(convDir, f));
      return stat.mtimeMs > yesterday;
    });
  } catch {
    return false;
  }
}
// ─────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────

export interface NightlyResearchResult {
  treeName: string;
  treeId: string;
  status: "spawned" | "skipped" | "error";
  kanbanTaskId?: string;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Build the pipeline body for the kanban worker. */
function buildPipelineBody(treeName: string, treeId: string): string {
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
  return [
    `**Pipeline de investigación nocturna — ${treeName}** (treeId: \`${treeId}\`)`,
    ``,
    `Ejecutar el pipeline R1→R2→R3→R4 según la skill \`nightly-research\` cargada.`,
    ``,
    `**Sandbox:** \`${sandboxBase}/${treeId}/\``,
    ``,
    `**R1 — Keyword Extractor:**`,
    `\`\`\`bash`,
    `cd ${sandboxBase}/${treeId} && python3 lib/keyword_extractor.py > /tmp/r1_${treeId}.json`,
    `\`\`\``,
    ``,
    `**R2 — Web Researcher:** usa \`execute_code\` con \`lib/web_researcher.py\``,
    `(necesita hermes_tools.web_search + web_extract).`,
    `Input: R1 output + tree objective del contexto.`,
    `\`\`\`bash`,
    `cat /tmp/r1_${treeId}.json | python3 lib/web_researcher.py > /tmp/r2_${treeId}.json`,
    `\`\`\``,
    ``,
    `**R3 — Note Writer:** escribe notas en obsidian/research/ vía sandbox API.`,
    `\`\`\`bash`,
    `cat /tmp/r2_${treeId}.json | python3 lib/note_writer.py`,
    `\`\`\``,
    ``,
    `**R4 — Summary Generator:** clasifica y escribe resumen en obsidian/decisions/.`,
    `R4 es un formateador puro — la clasificación (oportunidad/riesgo/solucion)`,
    `la hace el LLM entre R3 y R4 analizando los resultados de R2.`,
    `\`\`\`bash`,
    `cat /tmp/classified_${treeId}.json | python3 lib/summary_generator.py`,
    `\`\`\``,
    ``,
    `**Log esperado:** árbol procesado, N notas creadas, resumen generado.`,
    `En caso de error, documentar en el hilo de comentarios.`,
  ].join("\n");
}

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Spawnea una tarea Kanban por árbol activo para ejecutar el pipeline
 * de investigación nocturna.
 */
async function spawnResearchTask(
  treeName: string,
  treeId: string,
): Promise<NightlyResearchResult> {
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
  const title = `Nightly Research — ${treeName}`;
  const body = buildPipelineBody(treeName, treeId);
  const workspace = `dir:${sandboxBase}/${treeId}`;

  const cmd = [
    HERMES_BIN,
    "kanban", "create",
    shellQuote(title),
    "--assignee", "backend-eng",
    "--workspace", shellQuote(workspace),
    "--body", shellQuote(body),
    // idempotency: one task per tree per night
    "--idempotency-key", shellQuote(`nightly-research-${treeId}-${new Date().toISOString().slice(0, 10)}`),
  ].join(" ");

  const { stdout, stderr } = await execFileAsync("bash", ["-c", cmd], {
    timeout: 15_000,
  });

  if (stderr && !stderr.includes("Warning")) {
    console.warn(`[NightlyResearch] stderr for ${treeName}:`, stderr.slice(0, 200));
  }

  const match = stdout.match(/t_[a-f0-9]+/);
  const kanbanTaskId = match?.[0];

  return {
    treeName,
    treeId,
    status: kanbanTaskId ? "spawned" : "error",
    kanbanTaskId,
    error: kanbanTaskId ? undefined : `No task ID in output: ${stdout.slice(0, 100)}`,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Entry point. Called by the scheduler at midnight.
 *
 * Itera árboles con telegramChatId (activos), spawnea una tarea
 * Kanban por árbol, y loggea resultados.
 */
export async function runNightlyResearch(
  prisma: PrismaClient,
): Promise<NightlyResearchResult[]> {
  const trees = await (prisma as any).tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true },
  });

  console.log(
    `[NightlyResearch] 🌙 Pipeline iniciado para ${trees.length} árbol(es)…`,
  );

  const results: NightlyResearchResult[] = [];
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";

  for (const tree of trees) {
    const sandboxDir = path.join(sandboxBase, tree.id);

    // Skip inactive trees — no conversations in the last 24h
    if (!hasRecentActivity(sandboxDir)) {
      console.log(`[NightlyResearch] ⏭️  ${tree.name}: sin actividad reciente — skip`);
      results.push({ treeName: tree.name, treeId: tree.id, status: "skipped" });
      continue;
    }

    try {
      const result = await spawnResearchTask(tree.name, tree.id);
      results.push(result);
      console.log(
        `[NightlyResearch] 🌳 ${result.treeName}: ` +
          `${result.status === "spawned" ? `✅ ${result.kanbanTaskId}` : `❌ ${result.error}`}`,
      );
    } catch (err: any) {
      console.error(`[NightlyResearch] ❌ ${tree.name}:`, err.message);
      results.push({
        treeName: tree.name,
        treeId: tree.id,
        status: "error",
        error: err.message,
      });
    }
  }

  const spawned = results.filter((r) => r.status === "spawned").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  console.log(
    `[NightlyResearch] 🌙 Pipeline completado: ${spawned} tareas, ${skipped} sin actividad, ${errors} errores.`,
  );

  return results;
}
