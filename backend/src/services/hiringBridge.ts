/**
 * Hiring Bridge — detects hiring-request-*.json files in tree sandboxes,
 * forwards the 3 minimum requirements to the support Hermes Agent,
 * and saves the result as hiring-result-*.json in the same sandbox.
 *
 * NUNCA expone la lista de candidatos al árbol. Solo envía los 3 mínimos
 * y guarda el resultado agregado.
 */

import fs from "fs";
import path from "path";

// ── Configuration ──────────────────────────────────────────────────────────

const SANDBOX_BASE =
  process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
const SUPPORT_HERMES_GATEWAY =
  process.env.HERMES_SUPPORT_GATEWAY || "http://127.0.0.1:8646";
const SUPPORT_HERMES_API_URL =
  process.env.SUPPORT_HERMES_API_URL ||
  `${SUPPORT_HERMES_GATEWAY}/v1/chat/completions`;
const SUPPORT_HERMES_API_KEY =
  process.env.HERMES_SUPPORT_API_KEY ||
  process.env.SUPPORT_HERMES_API_KEY ||
  "";
const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY || "";

const POLL_INTERVAL_MS = 60_000; // Scan every 60 seconds
const SUPPORT_TIMEOUT_MS = 300_000; // 5 minutes for support agent

// ── Types ───────────────────────────────────────────────────────────────────

export interface HiringRequest {
  minSkillLevel: number;
  minSatisfactionPersonal: number;
  minSatisfactionGrupal: number;
}

export interface HiringResult {
  status: "fulfilled" | "no_candidates" | "error";
  candidateCount: number;
  message: string;
}

interface HiringBridgeResult {
  treeId: string;
  taskId: string;
  status: "processed" | "error";
  result?: HiringResult;
  error?: string;
}

// ── State ───────────────────────────────────────────────────────────────────

/** Set of "treeId/taskId" keys already processed to avoid re-processing. */
const processedRequests = new Set<string>();

let watcherInterval: NodeJS.Timeout | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan all tree sandbox directories for hiring-request-*.json files.
 * Returns array of {treeId, taskId, filePath}.
 */
function scanSandboxes(): { treeId: string; taskId: string; filePath: string }[] {
  const found: { treeId: string; taskId: string; filePath: string }[] = [];

  if (!fs.existsSync(SANDBOX_BASE)) {
    return found;
  }

  const entries = fs.readdirSync(SANDBOX_BASE, { withFileTypes: true });
  for (const entry of entries) {
    // Skip hidden/system dirs
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const treeId = entry.name;
    const treeDir = path.join(SANDBOX_BASE, treeId);

    // Scan for hiring-request-*.json in the tree sandbox root
    let files: string[];
    try {
      files = fs.readdirSync(treeDir);
    } catch {
      continue; // Skip inaccessible dirs
    }

    for (const file of files) {
      const match = file.match(/^hiring-request-(.+)\.json$/);
      if (!match) continue;

      const taskId = match[1];
      const key = `${treeId}/${taskId}`;
      if (processedRequests.has(key)) continue;

      found.push({
        treeId,
        taskId,
        filePath: path.join(treeDir, file),
      });
    }
  }

  return found;
}

/**
 * Read and validate a hiring-request JSON file.
 * Returns the HiringRequest or null if invalid.
 */
function readRequest(filePath: string): HiringRequest | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    const minSkillLevel = Number(data.minSkillLevel);
    const minSatisfactionPersonal = Number(data.minSatisfactionPersonal);
    const minSatisfactionGrupal = Number(data.minSatisfactionGrupal);

    if (
      isNaN(minSkillLevel) ||
      isNaN(minSatisfactionPersonal) ||
      isNaN(minSatisfactionGrupal)
    ) {
      console.error(
        `[hiringBridge] Invalid request values in ${filePath}: ${raw.slice(0, 200)}`
      );
      return null;
    }

    // Clamp to 1-5 range
    return {
      minSkillLevel: Math.max(1, Math.min(5, Math.round(minSkillLevel))),
      minSatisfactionPersonal: Math.max(1, Math.min(5, Math.round(minSatisfactionPersonal))),
      minSatisfactionGrupal: Math.max(1, Math.min(5, Math.round(minSatisfactionGrupal))),
    };
  } catch (err: any) {
    console.error(`[hiringBridge] Failed to read ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Save a hiring result JSON to the sandbox.
 */
function saveResult(treeId: string, taskId: string, result: HiringResult): void {
  const treeDir = path.join(SANDBOX_BASE, treeId);
  const resultPath = path.join(treeDir, `hiring-result-${taskId}.json`);

  try {
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(
      `[hiringBridge] Result saved for ${treeId}/${taskId}: ${result.status} (${result.candidateCount} candidates)`
    );
  } catch (err: any) {
    console.error(
      `[hiringBridge] Failed to save result ${resultPath}:`, err.message
    );
  }
}

// ── Support Agent Call ──────────────────────────────────────────────────────

/**
 * POST the 3 minimum requirements to the support Hermes Agent.
 * Returns a parsed HiringResult.
 * NUNCA envía lista de candidatos — solo los 3 mínimos.
 */
async function askSupportAgent(
  request: HiringRequest,
  treeId: string,
  taskId: string,
): Promise<HiringResult> {
  const systemPrompt = [
    "Eres el agente de soporte de Trust Maker. Buscas candidatos para árboles.",
    "",
    "Te envían 3 requisitos mínimos. DEBES buscar candidatos que cumplan TODOS.",
    "NUNCA devuelvas la lista de candidatos. Solo responde con el resultado agregado.",
    "",
    "RESPONDE EXACTAMENTE con este JSON (sin markdown, sin texto adicional):",
    "{",
    '  "status": "fulfilled" | "no_candidates" | "error",',
    '  "candidateCount": <número>,',
    '  "message": "<resumen corto en español>"',
    "}",
    "",
    "REGLAS:",
    '- "fulfilled": encontraste al menos 1 candidato que cumple.',
    '- "no_candidates": ningún candidato cumple los mínimos.',
    '- "error": hubo un problema técnico.',
    '- candidateCount: número real de candidatos encontrados que cumplen.',
    "- message: 1-2 frases explicando el resultado.",
    "",
    "IMPORTANTE: NO incluyas nombres, emails, ni detalles de candidatos en message.",
    "Solo di cosas como: 'Se encontraron 3 candidatos que cumplen los requisitos.'",
  ].join("\n");

  const userMessage = [
    `Busca candidatos para el árbol ${treeId} con estos mínimos:`,
    `- Nivel de habilidad mínimo: ${request.minSkillLevel}/5`,
    `- Satisfacción personal mínima: ${request.minSatisfactionPersonal}/5`,
    `- Satisfacción grupal mínima: ${request.minSatisfactionGrupal}/5`,
    "",
    `ID de tracking: ${taskId}`,
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPPORT_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (SUPPORT_HERMES_API_KEY) {
      headers["Authorization"] = `Bearer ${SUPPORT_HERMES_API_KEY}`;
    }

    const response = await fetch(SUPPORT_HERMES_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: false,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        status: "error",
        candidateCount: 0,
        message: `Support agent returned ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const content: string =
      data?.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    try {
      // Strip markdown code fences if present
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(cleaned);

      return {
        status: ["fulfilled", "no_candidates", "error"].includes(parsed.status)
          ? parsed.status
          : "error",
        candidateCount: typeof parsed.candidateCount === "number"
          ? parsed.candidateCount
          : 0,
        message: typeof parsed.message === "string"
          ? parsed.message.slice(0, 500)
          : "Respuesta no parseable del agente de soporte",
      };
    } catch {
      // Fallback: try to infer from raw text
      const lower = content.toLowerCase();
      if (lower.includes("fulfilled") || lower.includes("candidato")) {
        const numMatch = content.match(/\d+/);
        return {
          status: "fulfilled",
          candidateCount: numMatch ? parseInt(numMatch[0], 10) : 1,
          message: content.slice(0, 500),
        };
      }
      if (lower.includes("no_candidates") || lower.includes("ningún")) {
        return {
          status: "no_candidates",
          candidateCount: 0,
          message: content.slice(0, 500),
        };
      }
      return {
        status: "error",
        candidateCount: 0,
        message: `Respuesta no parseable: ${content.slice(0, 300)}`,
      };
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        status: "error",
        candidateCount: 0,
        message: `Timeout after ${SUPPORT_TIMEOUT_MS / 1000}s`,
      };
    }
    return {
      status: "error",
      candidateCount: 0,
      message: `Error: ${err.message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main Polling Logic ──────────────────────────────────────────────────────

/**
 * Single scan + process cycle. Called by the interval timer.
 */
async function scanAndProcess(): Promise<HiringBridgeResult[]> {
  const requests = scanSandboxes();
  const results: HiringBridgeResult[] = [];

  for (const req of requests) {
    const key = `${req.treeId}/${req.taskId}`;
    console.log(
      `[hiringBridge] Processing ${key}...`
    );

    const hiringReq = readRequest(req.filePath);
    if (!hiringReq) {
      processedRequests.add(key); // Mark invalid as processed to skip
      results.push({
        treeId: req.treeId,
        taskId: req.taskId,
        status: "error",
        error: "Invalid request JSON",
      });
      continue;
    }

    try {
      const result = await askSupportAgent(hiringReq, req.treeId, req.taskId);
      saveResult(req.treeId, req.taskId, result);
      processedRequests.add(key);
      results.push({
        treeId: req.treeId,
        taskId: req.taskId,
        status: "processed",
        result,
      });
    } catch (err: any) {
      console.error(
        `[hiringBridge] Error processing ${key}:`, err.message
      );
      results.push({
        treeId: req.treeId,
        taskId: req.taskId,
        status: "error",
        error: err.message,
      });
    }
  }

  return results;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function startHiringBridge(): void {
  if (watcherInterval) {
    console.warn("[hiringBridge] Already running — skipping start");
    return;
  }

  console.log(
    `[hiringBridge] Starting watcher (interval: ${POLL_INTERVAL_MS / 1000}s, sandbox: ${SANDBOX_BASE})`
  );

  // Run immediately on start, then on interval
  scanAndProcess().then((results) => {
    if (results.length > 0) {
      console.log(
        `[hiringBridge] Initial scan: ${results.length} requests processed`
      );
    }
  });

  watcherInterval = setInterval(async () => {
    try {
      const results = await scanAndProcess();
      if (results.length > 0) {
        const processed = results.filter((r) => r.status === "processed").length;
        const errors = results.filter((r) => r.status === "error").length;
        console.log(
          `[hiringBridge] Cycle: ${processed} processed, ${errors} errors`
        );
      }
    } catch (err: any) {
      console.error("[hiringBridge] Cycle error:", err.message);
    }
  }, POLL_INTERVAL_MS);
}

export function stopHiringBridge(): void {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
    console.log("[hiringBridge] Watcher stopped");
  }
}
