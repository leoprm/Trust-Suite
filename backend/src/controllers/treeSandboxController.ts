import { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { TreeSandbox } from '../services/treeSandbox';
import { logEvent, getRequestContext } from '../services/eventLogService';

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Auth helper ─────────────────────────────────────────────────────────────

function checkApiKey(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header missing' });
    return false;
  }
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  if (!API_SERVER_KEY || token !== API_SERVER_KEY) {
    res.status(403).json({ error: 'Invalid API key' });
    return false;
  }
  return true;
}

// ── Sandbox env whitelist ────────────────────────────────────────────────────

function buildSandboxEnv(cwd: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    HOME: cwd,
    PATH: process.env.PATH,
    NODE_ENV: process.env.NODE_ENV,
  };

  // Pass through SANDBOX_ and HERMES_ prefixed vars (compat with Hermes Agent)
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('SANDBOX_') || key.startsWith('HERMES_')) {
      env[key] = value;
    }
  }

  return env;
}

// ── Path validation ─────────────────────────────────────────────────────────

function resolveSafePath(
  workspacePath: string,
  requestedPath: string,
): string | null {
  // Reject absolute paths
  if (path.isAbsolute(requestedPath)) return null;

  // Reject path traversal
  const normalized = path.normalize(requestedPath);
  if (normalized.startsWith('..') || normalized.includes('..')) return null;

  // Resolve relative to workspace and verify it stays inside
  const resolved = path.resolve(workspacePath, normalized);
  const realWorkspace = path.resolve(workspacePath);
  if (!resolved.startsWith(realWorkspace + path.sep) && resolved !== realWorkspace) {
    return null;
  }

  return resolved;
}

// ── POST /api/trees/:id/sandbox/exec ────────────────────────────────────────
// Body: { command: string, timeout?: number }
// Returns: { stdout, stderr, exitCode }

export const execTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { command, timeout } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'command is required (string)' });
    }

    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    const cwd = sb.workspacePath;
    if (!fs.existsSync(cwd)) {
      return res.status(500).json({ error: 'Sandbox workspace directory not found' });
    }

    const timeoutMs = typeof timeout === 'number' && timeout > 0
      ? Math.min(timeout, 300_000) // cap at 5 min
      : DEFAULT_TIMEOUT_MS;

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number; killed: boolean }>(
      (resolve, reject) => {
        const child = exec(command, {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024, // 1 MB
          env: buildSandboxEnv(cwd),
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => { stdout += data; });
        child.stderr?.on('data', (data) => { stderr += data; });

        child.on('close', (exitCode, signal) => {
          resolve({
            stdout: stdout.slice(0, 50_000),
            stderr: stderr.slice(0, 50_000),
            exitCode: exitCode ?? (signal ? 128 : 1),
            killed: signal !== null,
          });
        });

        child.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ETIMEDOUT' || (err as any).killed) {
            resolve({
              stdout: stdout.slice(0, 50_000),
              stderr: (stderr + `\n[Timeout after ${timeoutMs}ms]`).slice(0, 50_000),
              exitCode: 124,
              killed: true,
            });
          } else {
            reject(err);
          }
        });
      },
    );

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_EXEC',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'SYSTEM',
      metadataJson: { exitCode: result.exitCode, timeoutMs },
    });

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (error: any) {
    console.error('[execTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Command execution failed', detail: error?.message });
  }
};

// ── POST /api/trees/:id/sandbox/read ────────────────────────────────────────
// Body: { path: string }
// Returns: { content: string, size: number }

export const readTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { path: requestedPath } = req.body;

    if (!requestedPath || typeof requestedPath !== 'string') {
      return res.status(400).json({ error: 'path is required (string)' });
    }

    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    const safePath = resolveSafePath(sb.workspacePath, requestedPath);
    if (!safePath) {
      return res.status(403).json({ error: 'Path escapes sandbox' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found', path: requestedPath });
    }

    const stat = fs.statSync(safePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // 100 KB limit for reads
    if (stat.size > 100_000) {
      return res.status(413).json({ error: 'File too large (max 100 KB)', size: stat.size });
    }

    const content = fs.readFileSync(safePath, 'utf-8');

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_READ',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'SYSTEM',
    });

    res.json({ content, size: stat.size });
  } catch (error: any) {
    console.error('[readTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'File read failed', detail: error?.message });
  }
};

// ── POST /api/trees/:id/sandbox/write ───────────────────────────────────────
// Body: { path: string, content: string }
// Returns: { path: string, size: number }

export const writeTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { path: requestedPath, content } = req.body;

    if (!requestedPath || typeof requestedPath !== 'string') {
      return res.status(400).json({ error: 'path is required (string)' });
    }
    if (content === undefined || content === null || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required (string)' });
    }

    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    const safePath = resolveSafePath(sb.workspacePath, requestedPath);
    if (!safePath) {
      return res.status(403).json({ error: 'Path escapes sandbox' });
    }

    // Ensure parent directories exist
    const dir = path.dirname(safePath);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(safePath, content, 'utf-8');

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_WRITE',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'SYSTEM',
    });

    res.status(201).json({ path: requestedPath, size: Buffer.byteLength(content, 'utf-8') });
  } catch (error: any) {
    console.error('[writeTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'File write failed', detail: error?.message });
  }
};
