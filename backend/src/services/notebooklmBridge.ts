/**
 * NotebookLM Bridge — CLI-based bridge to notebooklm-py.
 *
 * Calls the `notebooklm` CLI for each operation instead of a persistent
 * Python process. The CLI uses Playwright auth (persistent browser profile)
 * which doesn't expire like raw HTTP cookies.
 *
 * Each method spawns a short-lived CLI command, parses JSON output,
 * and returns typed results. Interface is identical to the Python version.
 */

import { exec, ExecException } from "child_process";
import path from "path";

// ── Configuration ──────────────────────────────────────────────────────────

const NOTEBOOKLM_BIN = "notebooklm"; // Use from PATH — trust-maker profile has it in venv/bin
// Use --profile default (browser profile with auto-refreshing cookies)
// instead of --storage (stale storage_state.json that expires).
const NOTEBOOKLM_PROFILE = process.env.NOTEBOOKLM_PROFILE || "default";
const DEFAULT_TIMEOUT_MS = parseInt(
  process.env.NOTEBOOKLM_TIMEOUT_MS || "60000",
  10
);

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreateNotebookResult {
  notebookId: string;
  name: string;
  existed: boolean;
}

export interface DeleteNotebookResult {
  deleted: boolean;
  reason?: string;
  notebookId?: string;
}

export interface Citation {
  sourceId: string;
  number: number | null;
  text: string | null;
}

export interface AskResult {
  answer: string;
  conversationId: string;
  turnNumber: number;
  citations: Citation[];
}

export interface AddSourceResult {
  sourceId: string;
  title: string;
  kind: "url" | "text" | "file";
  url?: string;
  filePath?: string;
}

export interface GeneratePodcastResult {
  taskId: string;
  status: string;
}

export interface PollPodcastResult {
  taskId: string;
  status: string;
  isComplete: boolean;
  isFailed: boolean;
  url: string | null;
}

export interface DownloadPodcastResult {
  path: string;
  downloaded: boolean;
}

export interface SourceInfo {
  sourceId: string;
  title: string;
  kind: string;
  url: string | null;
  status: string;
}

export interface ListSourcesResult {
  sources: SourceInfo[];
  count: number;
}

// ── Errors ─────────────────────────────────────────────────────────────────

export class NotebookLMBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "NotebookLMBridgeError";
  }
}

export class NotebookLMTimeoutError extends NotebookLMBridgeError {
  constructor(method: string, timeoutMs: number) {
    super(`Request "${method}" timed out after ${timeoutMs}ms`, "TIMEOUT");
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function notebookName(treeId: string): string {
  return `tm-${treeId}`;
}

/**
 * Execute a notebooklm CLI command and return {stdout, stderr}.
 * Rejects on non-zero exit or timeout.
 */
function execCLI(
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  // Build args with --profile if configured
  const profileArgs = NOTEBOOKLM_PROFILE ? ["--profile", NOTEBOOKLM_PROFILE] : [];
  const allArgs = [...profileArgs, ...args];
  const quoted = allArgs.map((a) => (/\s/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a));
  const cmd = `${NOTEBOOKLM_BIN} ${quoted.join(" ")}`;
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          const killed = error.killed;
          const msg = killed
            ? `Command timed out after ${timeoutMs}ms: ${cmd}`
            : `CLI error (${error.code}): ${stderr || error.message}`;
          reject(new NotebookLMBridgeError(msg, killed ? "TIMEOUT" : "CLI_ERROR"));
          return;
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    );
  });
}

/**
 * Parse JSON from CLI output. Handles both top-level JSON and nested
 * JSON in lines from CLI commands.
 */
function parseJson(stdout: string): any {
  try {
    return JSON.parse(stdout);
  } catch {
    // Some CLI commands output JSON on a specific line
    for (const line of stdout.split("\n")) {
      try {
        return JSON.parse(line.trim());
      } catch {
        continue;
      }
    }
    throw new NotebookLMBridgeError(
      `Failed to parse JSON from CLI output: ${stdout.slice(0, 200)}`,
      "PARSE_ERROR"
    );
  }
}

/**
 * Find a notebook by its tree-id naming convention.
 * Returns notebook ID or null.
 */
async function findNotebookId(treeId: string): Promise<string | null> {
  const name = notebookName(treeId);
  try {
    const { stdout } = await execCLI(["list", "--json"], 15000);
    const data = parseJson(stdout);
    const notebooks: any[] = data?.notebooks || [];
    for (const nb of notebooks) {
      if (nb.title === name) {
        return nb.id;
      }
    }
  } catch (err) {
    if (err instanceof NotebookLMBridgeError) {
      console.error(`[notebooklm-bridge] list failed: ${err.message}`);
    }
  }
  return null;
}

/**
 * Find notebook ID, or create it if it doesn't exist.
 */
async function getOrCreateNotebook(treeId: string): Promise<string> {
  let nbId = await findNotebookId(treeId);
  if (nbId) return nbId;

  // Create it
  const name = notebookName(treeId);
  const { stdout } = await execCLI(["create", name, "--json"], 15000);
  const data = parseJson(stdout);
  nbId = data?.notebook?.id;
  if (!nbId) {
    throw new NotebookLMBridgeError(
      `Failed to create notebook: ${stdout.slice(0, 200)}`,
      "CREATE_FAILED"
    );
  }
  return nbId;
}

// ── Bridge ─────────────────────────────────────────────────────────────────

export class NotebookLMBridge {
  // No persistent process — each call is a standalone CLI invocation.

  /**
   * Create a notebook for a tree (idempotent — returns existing if found).
   */
  async createNotebook(treeId: string): Promise<CreateNotebookResult> {
    const name = notebookName(treeId);
    const existing = await findNotebookId(treeId);
    if (existing) {
      return { notebookId: existing, name, existed: true };
    }

    const { stdout } = await execCLI(["create", name, "--json"], 15000);
    const data = parseJson(stdout);
    const nb = data?.notebook;
    if (!nb?.id) {
      throw new NotebookLMBridgeError(
        `Failed to create notebook: ${stdout.slice(0, 200)}`,
        "CREATE_FAILED"
      );
    }
    return { notebookId: nb.id, name, existed: false };
  }

  /**
   * Delete a tree's notebook. Graceful if not found.
   */
  async deleteNotebook(treeId: string): Promise<DeleteNotebookResult> {
    const nbId = await findNotebookId(treeId);
    if (!nbId) {
      return { deleted: false, reason: "not_found" };
    }
    await execCLI(["delete", "--notebook", nbId, "--yes"], 15000);
    return { deleted: true, notebookId: nbId };
  }

  /**
   * Ask a question against the tree's notebook.
   * Returns the answer with cited sources.
   */
  async ask(treeId: string, question: string): Promise<AskResult> {
    const nbId = await getOrCreateNotebook(treeId);

    // notebooklm ask --notebook <id> "question" --json
    const { stdout } = await execCLI(
      ["ask", "--notebook", nbId, "--json", question],
      DEFAULT_TIMEOUT_MS
    );
    const data = parseJson(stdout);

    // Parse citations: the ask --json response has references array with source_id, citation_number, cited_text
    const references: any[] = data?.references || [];
    const citations: Citation[] = references.map((ref: any) => ({
      sourceId: ref.source_id || "",
      number: ref.citation_number ?? null,
      text: ref.cited_text ?? null,
    }));

    return {
      answer: data?.answer || "(sin respuesta)",
      conversationId: data?.conversation_id || "",
      turnNumber: data?.turn_number || 1,
      citations,
    };
  }

  /**
   * Add a source (URL, text, or file path) to the tree's notebook.
   */
  async addSource(
    treeId: string,
    input: string,
    title?: string
  ): Promise<AddSourceResult> {
    const nbId = await getOrCreateNotebook(treeId);

    // notebooklm source add --notebook <id> --json <input>
    const args = ["source", "add", "--notebook", nbId, "--json"];
    if (title) {
      args.push("--title", title);
    }
    args.push(input);

    const { stdout } = await execCLI(args, 30000);
    // CLI outputs human-readable on success, try to extract source ID
    const data = parseJson(stdout);
    const source = data?.source || data || {};

    // Detect kind from input
    let kind: "url" | "text" | "file" = "text";
    if (input.startsWith("http://") || input.startsWith("https://")) {
      kind = "url";
    } else {
      try {
        const fs = require("fs");
        if (fs.existsSync(input)) {
          kind = "file";
        }
      } catch {
        // ignore
      }
    }

    return {
      sourceId: source.id || source.source_id || "",
      title: source.title || title || input.slice(0, 50),
      kind,
      url: kind === "url" ? input : undefined,
      filePath: kind === "file" ? input : undefined,
    };
  }

  /**
   * Generate a podcast (audio overview) for the tree's notebook.
   * Returns a task ID for polling.
   */
  async generatePodcast(treeId: string): Promise<GeneratePodcastResult> {
    const nbId = await getOrCreateNotebook(treeId);
    const { stdout } = await execCLI(
      ["generate", "audio", "--notebook", nbId, "--no-wait", "--json"],
      30000
    );
    const data = parseJson(stdout);
    return {
      taskId: data?.task_id || data?.taskId || "",
      status: data?.status || "generating",
    };
  }

  /**
   * Poll podcast generation status.
   */
  async pollPodcast(
    treeId: string,
    taskId: string
  ): Promise<PollPodcastResult> {
    // notebooklm doesn't have a direct poll command — we'd use notebooklm-py's
    // artifact status check. For now, assume the generate audio --wait would work.
    // This is a placeholder that returns the last known state.
    return {
      taskId,
      status: "unknown",
      isComplete: false,
      isFailed: false,
      url: null,
    };
  }

  /**
   * Download a generated podcast.
   */
  async downloadPodcast(
    treeId: string,
    taskId?: string,
    outputPath?: string
  ): Promise<DownloadPodcastResult> {
    const nbId = await getOrCreateNotebook(treeId);
    const dest = outputPath || `/tmp/tm-podcast-${treeId}.mp3`;
    // The CLI doesn't have direct download yet — use notebooklm download if available
    try {
      await execCLI(
        ["download", "--notebook", nbId, taskId || "", "--output", dest],
        60000
      );
      return { path: dest, downloaded: true };
    } catch {
      return { path: dest, downloaded: false };
    }
  }

  /**
   * List all sources in the tree's notebook.
   */
  async listSources(treeId: string): Promise<ListSourcesResult> {
    const nbId = await getOrCreateNotebook(treeId);
    const { stdout } = await execCLI(
      ["source", "list", "--notebook", nbId, "--json"],
      15000
    );
    const data = parseJson(stdout);
    const rawSources: any[] = data?.sources || [];
    const sources: SourceInfo[] = rawSources.map((src: any) => ({
      sourceId: src.id || src.source_id || "",
      title: src.title || "(untitled)",
      kind: src.kind || src.type || "unknown",
      url: src.url || null,
      status: src.status || "unknown",
    }));
    return { sources, count: sources.length };
  }
}

export default NotebookLMBridge;
