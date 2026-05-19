/**
 * NotebookLM Bridge — TypeScript child_process bridge to notebooklm_service.py.
 *
 * Spawns the Python service, communicates via stdin/stdout JSON lines.
 * One request at a time with correlation IDs. Handles startup, shutdown,
 * timeouts, and process recovery.
 *
 * Usage:
 *   const bridge = new NotebookLMBridge();
 *   await bridge.start();
 *   const result = await bridge.createNotebook("abc123");
 *   await bridge.stop();
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";

// ── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_PYTHON = process.env.NOTEBOOKLM_PYTHON || "python3";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.NOTEBOOKLM_TIMEOUT_MS || "60000", 10);
const DEFAULT_STARTUP_TIMEOUT_MS = parseInt(
  process.env.NOTEBOOKLM_STARTUP_TIMEOUT_MS || "30000",
  10
);

// ── Types ──────────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  method: string;
  params: Record<string, unknown>;
  id: string;
}

export interface JsonRpcResponse {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  id?: string;
}

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
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "NotebookLMBridgeError";
  }
}

export class NotebookLMTimeoutError extends NotebookLMBridgeError {
  constructor(method: string, timeoutMs: number) {
    super(`Request "${method}" timed out after ${timeoutMs}ms`, "TIMEOUT");
  }
}

export class NotebookLMNotReadyError extends NotebookLMBridgeError {
  constructor() {
    super("Bridge is not ready — call start() first", "NOT_READY");
  }
}

export class NotebookLMProcessError extends NotebookLMBridgeError {
  constructor(message: string) {
    super(`Python process error: ${message}`, "PROCESS_ERROR");
  }
}

// ── Bridge ─────────────────────────────────────────────────────────────────

type PendingRequest = {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

export class NotebookLMBridge {
  private process: ChildProcess | null = null;
  private stdoutBuffer = "";
  private pending = new Map<string, PendingRequest>();
  private counter = 0;
  private _ready = false;
  private servicePath: string;
  private pythonBin: string;
  private timeoutMs: number;

  constructor(options?: {
    servicePath?: string;
    pythonBin?: string;
    timeoutMs?: number;
  }) {
    this.servicePath =
      options?.servicePath ||
      path.join(__dirname, "..", "..", "services", "notebooklm_service.py");
    this.pythonBin = options?.pythonBin || DEFAULT_PYTHON;
    this.timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  get ready(): boolean {
    return this._ready && this.process !== null && !this.process.killed;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._ready) return;

    this.process = spawn(this.pythonBin, [this.servicePath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      // Forward stderr for debugging (service logs warnings there)
      const text = chunk.toString().trim();
      if (text) {
        console.error(`[notebooklm-py stderr] ${text}`);
      }
    });

    this.process.on("exit", (code, signal) => {
      this._ready = false;
      // Reject all pending requests
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(
          new NotebookLMProcessError(
            `Process exited with code ${code}, signal ${signal}`
          )
        );
      }
      this.pending.clear();
      this.process = null;
    });

    this.process.on("error", (err) => {
      this._ready = false;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(
          new NotebookLMProcessError(`Failed to spawn: ${err.message}`)
        );
      }
      this.pending.clear();
    });

    // Listen for stdout (JSON lines)
    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      this.drainBuffer();
    });

    // Wait for ready signal
    const response = await this.waitForReady();
    if (!response.ok || !response.data?.ready) {
      this.kill();
      throw new NotebookLMBridgeError(
        `Service failed to start: ${response.error || "no ready signal"}`,
        "STARTUP_FAILED"
      );
    }

    this._ready = true;
  }

  private drainBuffer(): void {
    while (true) {
      const idx = this.stdoutBuffer.indexOf("\n");
      if (idx === -1) return;

      const line = this.stdoutBuffer.slice(0, idx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);

      if (!line) continue;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        const id = response.id;
        if (id && this.pending.has(id)) {
          const pending = this.pending.get(id)!;
          clearTimeout(pending.timer);
          this.pending.delete(id);
          pending.resolve(response);
        }
      } catch {
        console.error(`[notebooklm-bridge] Invalid JSON line: ${line}`);
      }
    }
  }

  private waitForReady(): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new NotebookLMBridgeError(
            "Timed out waiting for service ready signal",
            "STARTUP_TIMEOUT"
          )
        );
      }, DEFAULT_STARTUP_TIMEOUT_MS);

      const onData = (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString();
        const idx = this.stdoutBuffer.indexOf("\n");
        if (idx !== -1) {
          const line = this.stdoutBuffer.slice(0, idx).trim();
          this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
          clearTimeout(timeout);
          this.process?.stdout?.removeListener("data", onData);
          try {
            resolve(JSON.parse(line) as JsonRpcResponse);
          } catch {
            reject(
              new NotebookLMBridgeError(
                "Invalid JSON in ready signal",
                "STARTUP_FAILED"
              )
            );
          }
        }
      };
      this.process?.stdout?.on("data", onData);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    try {
      // Try graceful shutdown first
      await this.send("shutdown", {}, 5000);
    } catch {
      // Ignore — will kill anyway
    }

    this.kill();
  }

  private kill(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    this._ready = false;
  }

  // ── Request dispatch ─────────────────────────────────────────────────

  private send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number
  ): Promise<JsonRpcResponse> {
    if (!this.ready || !this.process?.stdin) {
      return Promise.reject(new NotebookLMNotReadyError());
    }

    const id = String(++this.counter);
    const effectiveTimeout = timeoutMs ?? this.timeoutMs;

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new NotebookLMTimeoutError(method, effectiveTimeout));
      }, effectiveTimeout);

      this.pending.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = { method, params, id };
      this.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  // ── Public API ───────────────────────────────────────────────────────

  async createNotebook(treeId: string): Promise<CreateNotebookResult> {
    const resp = await this.send("create_notebook", { treeId });
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as CreateNotebookResult;
  }

  async deleteNotebook(treeId: string): Promise<DeleteNotebookResult> {
    const resp = await this.send("delete_notebook", { treeId });
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as DeleteNotebookResult;
  }

  async ask(treeId: string, question: string): Promise<AskResult> {
    const resp = await this.send("ask", { treeId, question });
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as AskResult;
  }

  async addSource(
    treeId: string,
    input: string,
    title?: string
  ): Promise<AddSourceResult> {
    const params: Record<string, unknown> = { treeId, input };
    if (title) params.title = title;
    const resp = await this.send("add_source", params);
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as AddSourceResult;
  }

  async generatePodcast(treeId: string): Promise<GeneratePodcastResult> {
    const resp = await this.send("generate_podcast", { treeId });
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as GeneratePodcastResult;
  }

  async pollPodcast(treeId: string, taskId: string): Promise<PollPodcastResult> {
    const resp = await this.send("poll_podcast", { treeId, taskId });
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as PollPodcastResult;
  }

  async downloadPodcast(treeId: string, taskId?: string, outputPath?: string): Promise<DownloadPodcastResult> {
    const params: Record<string, unknown> = { treeId };
    if (taskId) params.taskId = taskId;
    if (outputPath) params.outputPath = outputPath;
    const resp = await this.send("download_podcast", params);
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as DownloadPodcastResult;
  }

  async listSources(treeId: string): Promise<ListSourcesResult> {
    const resp = await this.send("list_sources", { treeId });
    if (!resp.ok) throw new NotebookLMBridgeError(resp.error || "unknown", "RPC_ERROR");
    return resp.data as unknown as ListSourcesResult;
  }
}

export default NotebookLMBridge;
