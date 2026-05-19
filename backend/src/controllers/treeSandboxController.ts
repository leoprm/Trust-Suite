import { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import multer from 'multer';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { TreeSandbox } from '../services/treeSandbox';
import { logEvent, getRequestContext } from '../services/eventLogService';
import { prisma } from '../index';

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Tree-specific API key derivation ────────────────────────────────────────

/** Derive a per-tree API key from the master key + treeId. */
export function deriveTreeApiKey(treeId: string): string {
  if (!API_SERVER_KEY || !treeId) return '';
  return crypto.createHmac('sha256', API_SERVER_KEY).update(treeId).digest('hex');
}

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
  
  // Accept global master key
  if (API_SERVER_KEY && token === API_SERVER_KEY) return true;
  
  // Accept tree-specific derived key (matches :id in URL)
  const treeId = req.params.id as string;
  if (treeId && token === deriveTreeApiKey(treeId)) return true;
  
  res.status(403).json({ error: 'Invalid API key' });
  return false;
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

// ── Multer for sandbox file uploads ────────────────────────────────────────────

const SB_UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
export const sandboxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SB_UPLOAD_MAX_BYTES },
});

// ── POST /api/trees/:id/sandbox/upload ────────────────────────────────────────
// Accepts multipart file upload (photos, documents, etc.) — writes to sandbox dir.
// Body: multipart field "file"

export const uploadTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send as multipart field "file".' });
  }

  try {
    const id = req.params.id as string;
    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    const fileName = req.file.originalname || `file_${Date.now()}`;
    const safePath = resolveSafePath(sb.workspacePath, fileName);
    if (!safePath) {
      return res.status(403).json({ error: 'Path escapes sandbox' });
    }

    const dir = path.dirname(safePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(safePath, req.file.buffer);

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_UPLOAD',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'SYSTEM',
      metadataJson: { fileName, size: req.file.size },
    });

    res.status(201).json({ path: fileName, size: req.file.size });
  } catch (error: any) {
    console.error('[uploadTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'File upload failed', detail: error?.message });
  }
};

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

    // Validate command doesn't access paths outside sandbox
    // Split command into tokens and check every path-like argument
    const tokens = command.split(/\s+/);
    const resolvedCwd = path.resolve(cwd);
    for (const token of tokens) {
      // Skip flags/options (start with - or --)
      if (token.startsWith('-')) continue;
      // Check if this token is a path: absolute, contains '/', or is '.' / '..'
      const isPath =
        token.startsWith('/') ||
        token.includes('/') ||
        token === '.' ||
        token === '..';
      if (!isPath) continue;
      const resolved = path.resolve(cwd, token);
      if (!resolved.startsWith(resolvedCwd + path.sep) && resolved !== resolvedCwd) {
        return res.status(403).json({
          error: `Access denied: path '${token}' is outside the sandbox`,
        });
      }
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
// File mode (path does NOT end with '/'):
//   Returns: { content: string, size: number }
// Directory mode (path ends with '/'):
//   Returns: { files: string[] } — .md files in the directory.
//   If directory doesn't exist, returns { files: [] }.

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

    // ── Detect directory mode ──
    const isDir = requestedPath.endsWith('/');
    const cleanPath = isDir ? requestedPath.slice(0, -1) : requestedPath;

    const safePath = resolveSafePath(sb.workspacePath, cleanPath);
    if (!safePath) {
      return res.status(403).json({ error: 'Path escapes sandbox' });
    }

    // ── Directory listing ──
    if (isDir) {
      if (!fs.existsSync(safePath)) {
        return res.json({ files: [] });
      }

      const stat = fs.statSync(safePath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }

      const entries = fs.readdirSync(safePath);
      const mdFiles = entries.filter(f => f.endsWith('.md')).sort();

      void logEvent({
        ...getRequestContext(req),
        treeId: id,
        action: 'SANDBOX_LIST',
        entityType: 'TreeSandbox',
        entityId: id,
        source: 'SYSTEM',
      });

      return res.json({ files: mdFiles });
    }

    // ── File read mode ──
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

    res.status(201).json({
      path: requestedPath,
      size: Buffer.byteLength(content, 'utf-8'),
      ...(requestedPath.startsWith('obsidian/') || requestedPath.endsWith('.rating.json')
        ? {}
        : { _auto_note: 'ESCRIBE_NOTA_OBSIDIAN' }),
    });
  } catch (error: any) {
    console.error('[writeTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'File write failed', detail: error?.message });
  }
};

// ── POST /api/trees/:id/sandbox/convert ──────────────────────────────────────
// Body: { content: string, format?: "pdf"|"docx"|"html" }
// Converts Markdown content to the requested format via Python (markdown + weasyprint).
// Returns: { path: string, format: string, size: number }

export const convertTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { content, format = "pdf" } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "content is required (string)" });
    }
    if (!["pdf", "html"].includes(format)) {
      return res.status(400).json({ error: 'format must be "pdf" or "html"' });
    }

    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: "Sandbox not found for this tree" });
    }

    const cwd = sb.workspacePath;
    if (!fs.existsSync(cwd)) {
      return res.status(500).json({ error: "Sandbox workspace directory not found" });
    }

    // Ensure documents directory exists
    const docsDir = path.join(cwd, "documents");
    fs.mkdirSync(docsDir, { recursive: true });

    // Generate unique filename
    const ts = Date.now();
    const mdPath = path.join(docsDir, `analysis_${ts}.md`);

    // Write MD file
    fs.writeFileSync(mdPath, content, "utf-8");

    if (format === "html") {
      // ── HTML via Python markdown ──────────────────────────────────────
      const pyScript = `
import sys, json, markdown

input_path = sys.argv[1]
output_path = sys.argv[2]

with open(input_path, 'r') as f:
    md = f.read()

html_body = markdown.markdown(md, extensions=['extra', 'codehilite', 'tables'])
html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Análisis</title>
<style>body{{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a}}h1,h2,h3{{color:#2c3e50}}code{{background:#f4f4f4;padding:2px 6px;border-radius:4px}}pre{{background:#f4f4f4;padding:1rem;border-radius:8px;overflow-x:auto}}blockquote{{border-left:4px solid #3498db;margin:1rem 0;padding:0.5rem 1rem;color:#555}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ddd;padding:8px;text-align:left}}th{{background:#f8f9fa}}</style></head>
<body>{html_body}</body>
</html>"""

with open(output_path, 'w') as f:
    f.write(html)
print(json.dumps({"ok": True, "size": len(html)}))
`.trim();

      const pyPath = path.join(cwd, "_convert_to_html.py");
      fs.writeFileSync(pyPath, pyScript, "utf-8");
      const htmlPath = path.join(docsDir, `analysis_${ts}.html`);

      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
        (resolve, reject) => {
          const { exec } = require("child_process");
          const child = exec(
            `/home/leo/.hermes/hermes-agent/venv/bin/python3 "${pyPath}" "${mdPath}" "${htmlPath}"`,
            { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 },
          );
          let stdout = ""; let stderr = "";
          child.stdout?.on("data", (d: string) => { stdout += d; });
          child.stderr?.on("data", (d: string) => { stderr += d; });
          child.on("close", (exitCode: number) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
          child.on("error", (err: Error) => reject(err));
        },
      );

      try { fs.unlinkSync(pyPath); } catch {}

      if (result.exitCode !== 0 || !fs.existsSync(htmlPath)) {
        return res.status(500).json({ error: "HTML conversion failed", detail: result.stderr.slice(0, 500) });
      }

      const htmlSize = fs.statSync(htmlPath).size;

      void logEvent({
        ...getRequestContext(req),
        treeId: id,
        action: "SANDBOX_CONVERT",
        entityType: "TreeSandbox",
        entityId: id,
        source: "SYSTEM",
        metadataJson: { format: "html", size: htmlSize },
      });

      return res.json({ path: `documents/analysis_${ts}.html`, format: "html", size: htmlSize });
    }

    // ── PDF via Python markdown + weasyprint ──────────────────────────────
    const pythonScript = `
import sys, json, markdown, weasyprint

input_path = sys.argv[1]
output_path = sys.argv[2]

with open(input_path, 'r') as f:
    md = f.read()

html_body = markdown.markdown(md, extensions=['extra', 'codehilite', 'tables', 'toc'])
html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Análisis</title>
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: system-ui, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; }}
  h1 {{ font-size: 18pt; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 4px; }}
  h2 {{ font-size: 14pt; color: #2c3e50; margin-top: 1.5em; }}
  h3 {{ font-size: 12pt; color: #34495e; }}
  code {{ background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-size: 9pt; }}
  pre {{ background: #f4f4f4; padding: 10px; border-radius: 6px; font-size: 9pt; overflow-x: auto; white-space: pre-wrap; }}
  blockquote {{ border-left: 4px solid #3498db; margin: 1em 0; padding: 0.5em 1em; color: #555; background: #f8f9fa; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
  th, td {{ border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 10pt; }}
  th {{ background: #f8f9fa; font-weight: 600; }}
  ul, ol {{ margin: 0.5em 0; padding-left: 1.5em; }}
  p {{ margin: 0.5em 0; }}
</style></head>
<body>{html_body}</body>
</html>"""

weasyprint.HTML(string=html).write_pdf(output_path)
print(json.dumps({"ok": True, "size": __import__('os').path.getsize(output_path)}))
`.trim();

    const pyScriptPath = path.join(cwd, "_convert_to_pdf.py");
    fs.writeFileSync(pyScriptPath, pythonScript, "utf-8");

    const pdfPath = path.join(docsDir, `analysis_${ts}.pdf`);

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve, reject) => {
        const { exec } = require("child_process");
        const child = exec(
          `/home/leo/.hermes/hermes-agent/venv/bin/python3 "${pyScriptPath}" "${mdPath}" "${pdfPath}"`,
          { cwd, timeout: 60_000, maxBuffer: 1024 * 1024 },
        );

        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d: string) => { stdout += d; });
        child.stderr?.on("data", (d: string) => { stderr += d; });

        child.on("close", (exitCode: number) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
        child.on("error", (err: Error) => reject(err));
      },
    );

    // Clean up temp script
    try { fs.unlinkSync(pyScriptPath); } catch {}

    if (result.exitCode !== 0 || !fs.existsSync(pdfPath)) {
      console.error("[convertTreeSandbox] Python error:", result.stderr);
      return res.status(500).json({
        error: "PDF conversion failed",
        detail: result.stderr.slice(0, 500),
      });
    }

    const pdfSize = fs.statSync(pdfPath).size;

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: "SANDBOX_CONVERT",
      entityType: "TreeSandbox",
      entityId: id,
      source: "SYSTEM",
      metadataJson: { format: "pdf", size: pdfSize, exitCode: result.exitCode },
    });

    res.json({ path: `documents/analysis_${ts}.pdf`, format: "pdf", size: pdfSize });
  } catch (error: any) {
    console.error("[convertTreeSandbox] ERROR:", error?.message || error);
    res.status(500).json({ error: "Conversion failed", detail: error?.message });
  }
};

// ── POST /api/trees/:id/sandbox/save-skill ─────────────────────────────────
// Body: { userId: string, skill: string, xp?: number, level?: number }
// Saves or updates a TreeSkill record for a user in a tree.
// Idempotent: INSERT … ON DUPLICATE KEY UPDATE via Prisma upsert.
// Returns: { status: "saved", skill: { id, treeId, userId, skill, xp, level } }

export const saveTreeSkill = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const treeId = req.params.id as string;
    const { userId, skill, xp = 1, level = 1 } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required (string)' });
    }
    if (!skill || typeof skill !== 'string') {
      return res.status(400).json({ error: 'skill is required (string)' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Upsert TreeSkill (idempotent)
    const result = await (prisma as any).treeSkill.upsert({
      where: {
        userId_treeId_skill: { userId, treeId, skill },
      },
      update: { xp, level, updatedAt: new Date() },
      create: { userId, treeId, skill, xp, level },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TREE_SKILL_SAVED',
      entityType: 'TreeSkill',
      entityId: result.id,
      source: 'SYSTEM',
      metadataJson: { userId, skill, xp, level },
    });

    res.status(201).json({ status: 'saved', skill: result });
  } catch (error: any) {
    console.error('[saveTreeSkill] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to save tree skill', detail: error?.message });
  }
};

// ── POST /api/trees/:id/sandbox/tm-call ──────────────────────────────────────
// Body: { action: string, args: object }
// Proxies 15+ Trust Maker SQLite functions via tools.py --json-rpc.
// Returns: the JSON output from tools.py (the function's return value).
//
// Rate limit: 10 calls/min per tree (in-memory, resets on restart).

const TM_RATE_LIMIT = 10;
const TM_RATE_WINDOW_MS = 60_000;
const TM_TIMEOUT_MS = 30_000;
const tmRateBuckets = new Map<string, { count: number; windowStart: number }>();

const VALID_ACTIONS = new Set([
  "list_trees", "get_needs", "get_ideas", "get_pending_ideas",
  "propose_idea", "vote_on_idea", "register_result", "create_need",
  "get_ideas_by_creator", "search_ideas", "get_task_assignments",
  "get_user_stats", "get_global_stats", "get_vote_results", "get_tree_members",
]);

const ACTION_TO_FUNCTION: Record<string, string> = {
  list_trees: "get_all_trees",
  get_needs: "get_tree_needs",
  get_ideas: "get_tree_ideas",
  get_pending_ideas: "get_pending_ideas",
  propose_idea: "propose_idea",
  vote_on_idea: "vote_on_idea",
  register_result: "register_idea_result",
  create_need: "create_need",
  get_ideas_by_creator: "get_ideas_by_creator",
  search_ideas: "search_ideas",
  get_task_assignments: "get_task_assignments",
  get_user_stats: "get_user_stats",
  get_global_stats: "get_global_stats",
  get_vote_results: "get_vote_results",
  get_tree_members: "get_tree_members",
};

export const tmCall = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const treeId = req.params.id as string;
    const { action, args = {} } = req.body;

    if (!action || typeof action !== "string" || !VALID_ACTIONS.has(action)) {
      return res.status(400).json({
        error: `Invalid or missing action. Valid: ${Array.from(VALID_ACTIONS).join(", ")}`,
      });
    }

    // ── Rate limit per tree ──────────────────────────────────────────────
    const now = Date.now();
    let bucket = tmRateBuckets.get(treeId);
    if (!bucket || now - bucket.windowStart > TM_RATE_WINDOW_MS) {
      bucket = { count: 0, windowStart: now };
      tmRateBuckets.set(treeId, bucket);
    }
    if (bucket.count >= TM_RATE_LIMIT) {
      return res.status(429).json({
        error: `Rate limit exceeded: max ${TM_RATE_LIMIT} calls/min per tree`,
        retryAfterMs: TM_RATE_WINDOW_MS - (now - bucket.windowStart),
      });
    }
    bucket.count++;

    // ── Resolve Python + tools.py path ────────────────────────────────────
    const pythonBin = process.env.HERMES_PYTHON_BIN || "/home/leo/.hermes/hermes-agent/venv/bin/python3";
    const toolsPy = "/home/leo/.hermes/skills/trust-maker/tools.py";

    // ── Build JSON-RPC payload ────────────────────────────────────────────
    const functionName = ACTION_TO_FUNCTION[action];

    // Inject treeId into args where applicable (most functions need it)
    const rpcArgs: Record<string, any> = { ...args };

    // Actions that need tree_id injected from URL param
    const treeActions = new Set([
      "get_needs", "get_ideas", "get_pending_ideas",
      "propose_idea", "create_need", "get_ideas_by_creator",
      "search_ideas", "get_task_assignments", "get_tree_members",
    ]);
    if (treeActions.has(action) && !rpcArgs.tree_id) {
      rpcArgs.tree_id = treeId;
    }

    // vote_on_idea: map voter_id → user_id
    if (action === "vote_on_idea") {
      if (rpcArgs.voter_id && !rpcArgs.user_id) rpcArgs.user_id = rpcArgs.voter_id;
      if (rpcArgs.vote_value && !rpcArgs.weight) rpcArgs.weight = rpcArgs.vote_value;
    }

    // propose_idea: map proposer_id → creator_id, title+description → content
    if (action === "propose_idea") {
      if (rpcArgs.proposer_id && !rpcArgs.creator_id) rpcArgs.creator_id = rpcArgs.proposer_id;
      if (rpcArgs.title || rpcArgs.description) {
        const parts = [rpcArgs.title, rpcArgs.description].filter(Boolean);
        rpcArgs.content = parts.join("\n\n");
      }
    }

    // register_result: map result+notes → summary, idea_id stays
    if (action === "register_result") {
      if (rpcArgs.result && !rpcArgs.summary) rpcArgs.summary = rpcArgs.result;
    }

    const payload = JSON.stringify({ function: functionName, kwargs: rpcArgs });

    // ── Execute tools.py ──────────────────────────────────────────────────
    const sandboxDir = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
    const env: Record<string, string | undefined> = {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      SANDBOX_BASE_DIR: sandboxDir,
      TRUST_MAKER_DB_PATH: process.env.TRUST_MAKER_DB_PATH || "",
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => k.startsWith("SANDBOX_") || k.startsWith("HERMES_")
        )
      ),
    };

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve, reject) => {
        const { spawn } = require("child_process");
        const child = spawn(pythonBin, [toolsPy, "--json-rpc"], {
          timeout: TM_TIMEOUT_MS,
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

        child.on("close", (code: number) =>
          resolve({ stdout, stderr, exitCode: code ?? 1 })
        );
        child.on("error", (err: NodeJS.ErrnoException) => {
          reject(err);
        });

        // Write JSON payload to stdin and close
        child.stdin?.write(payload);
        child.stdin?.end();
      },
    );

    if (result.exitCode !== 0) {
      console.error("[tmCall] tools.py error | exitCode:", result.exitCode, "| stderr:", result.stderr, "| stdout:", result.stdout.slice(0, 200));
      return res.status(500).json({
        error: "tm-call failed",
        detail: result.stderr.slice(0, 500) || result.stdout.slice(0, 500),
        exitCode: result.exitCode,
      });
    }

    // Parse JSON output from tools.py
    let data: any;
    try {
      data = JSON.parse(result.stdout);
    } catch {
      return res.status(500).json({
        error: "Invalid JSON from tools.py",
        raw: result.stdout.slice(0, 500),
      });
    }

    if (data.error) {
      return res.status(400).json({ error: data.error });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: "SANDBOX_TM_CALL",
      entityType: "TreeSandbox",
      entityId: treeId,
      source: "SYSTEM",
      metadataJson: { action, functionName },
    });

    res.json(data);
  } catch (error: any) {
    console.error("[tmCall] ERROR:", error?.message || error);
    res.status(500).json({ error: "tm-call failed", detail: error?.message });
  }
};
// Body: { path: string }
// Reads a file from the parent tree's sandbox. No write, no delete.
// Returns: { content: string, size: number }

export const readParentTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { path: requestedPath } = req.body;

    if (!requestedPath || typeof requestedPath !== 'string') {
      return res.status(400).json({ error: 'path is required (string)' });
    }

    // Verify tree has a parent
    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }
    if (!tree.parentTreeId) {
      return res.status(400).json({ error: 'Tree has no parent' });
    }

    // Build parent sandbox path
    const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || '/home/trustmaker/trees';
    const parentWorkspace = path.join(SANDBOX_BASE, tree.parentTreeId);

    // Path traversal protection — MUST start with parent workspace
    const safePath = resolveSafePath(parentWorkspace, requestedPath);
    if (!safePath) {
      return res.status(403).json({ error: 'Path escapes parent sandbox' });
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
      action: 'SANDBOX_PARENT_READ',
      entityType: 'TreeSandbox',
      entityId: tree.parentTreeId,
      source: 'SYSTEM',
    });

    res.json({ content, size: stat.size });
  } catch (error: any) {
    console.error('[readParentTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'File read failed', detail: error?.message });
  }
};

// ── Rate limiter for web-extract (5 calls/min per tree) ─────────────────────

const webExtractWindowMs = 60_000; // 1 minute
const webExtractMaxCalls = 5;
const webExtractCounters = new Map<string, { count: number; resetAt: number }>();

function checkWebExtractRate(treeId: string): boolean {
  const now = Date.now();
  let entry = webExtractCounters.get(treeId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + webExtractWindowMs };
    webExtractCounters.set(treeId, entry);
  }

  if (entry.count >= webExtractMaxCalls) return false;
  entry.count++;
  return true;
}

// ── Helper: fetch URL with timeout ─────────────────────────────────────────

function fetchUrl(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? https : http;
    const req = transport.get(url, { timeout: timeoutMs }, (res) => {
      // Follow redirects (up to 3)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        resolve(fetchUrl(redirectUrl, timeoutMs));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf-8');
        resolve({ html, finalUrl: res.headers.location ? new URL(res.headers.location, url).toString() : url });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

// ── POST /api/trees/:id/sandbox/web-extract ────────────────────────────────
// Body: { urls: string[] }
// Fetches each URL, converts HTML to Markdown (via turndown).
// Rate limit: 5 calls/min per tree. Timeout: 20s per URL.
// Returns: { results: [{ url, title, content }, ...] }

export const webExtractTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const treeId = req.params.id as string;
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls is required (non-empty array of strings)' });
    }
    if (!urls.every((u: any) => typeof u === 'string')) {
      return res.status(400).json({ error: 'Each url must be a string' });
    }
    if (urls.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 URLs per request' });
    }

    // Rate limit
    if (!checkWebExtractRate(treeId)) {
      return res.status(429).json({
        error: 'Rate limit exceeded — 5 calls/min per tree',
        retryAfterSec: Math.ceil(
          ((webExtractCounters.get(treeId)?.resetAt ?? Date.now() + webExtractWindowMs) - Date.now()) / 1000
        ),
      });
    }

    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });

    const timeoutMs = 20_000;
    const results: Array<{ url: string; title: string; content: string; error?: string }> = [];

    for (const url of urls) {
      try {
        const { html, finalUrl } = await fetchUrl(url, timeoutMs);

        const dom = new JSDOM(html, { url: finalUrl });
        const title = dom.window.document.title || finalUrl;

        // Remove script/style/noscript tags before converting
        for (const el of dom.window.document.querySelectorAll('script, style, noscript, nav, footer, header')) {
          el.remove();
        }

        const bodyHtml = dom.window.document.body?.innerHTML || html;
        const content = turndown.turndown(bodyHtml).slice(0, 100_000); // cap at 100 KB

        results.push({ url: finalUrl, title, content });
      } catch (err: any) {
        results.push({ url, title: '', content: '', error: err?.message || 'Unknown error' });
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'SANDBOX_WEB_EXTRACT',
      entityType: 'TreeSandbox',
      entityId: treeId,
      source: 'SYSTEM',
      metadataJson: { urlCount: urls.length, resultsCount: results.length },
    });

    res.json({ results });
  } catch (error: any) {
    console.error('[webExtractTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Web extract failed', detail: error?.message });
  }
};

// ── POST /api/trees/:id/sandbox/memory ─────────────────────────────────────
// Body: { action: "write"|"read"|"list", key?: string, value?: string }
// Flat key-value JSON store at <sandbox>/memory/memory.json.
// Returns write: { ok: true }, read: { key, value }, list: { keys: string[] }

export const memoryTreeSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const treeId = req.params.id as string;
    const { action, key, value } = req.body;

    if (!['write', 'read', 'list'].includes(action)) {
      return res.status(400).json({ error: 'action must be "write", "read", or "list"' });
    }

    if ((action === 'write' || action === 'read') && (!key || typeof key !== 'string')) {
      return res.status(400).json({ error: 'key is required (string) for write/read' });
    }

    if (action === 'write' && (value === undefined || typeof value !== 'string')) {
      return res.status(400).json({ error: 'value is required (string) for write' });
    }

    const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || '/home/trustmaker/trees';
    const memoryDir = path.join(SANDBOX_BASE, treeId, 'memory');
    const memoryFile = path.join(memoryDir, 'memory.json');

    // ── Read existing data ──
    let data: Record<string, string> = {};
    if (fs.existsSync(memoryFile)) {
      try {
        const raw = fs.readFileSync(memoryFile, 'utf-8');
        data = JSON.parse(raw);
      } catch {
        data = {};
      }
    }

    if (action === 'read') {
      if (!(key! in data)) {
        return res.status(404).json({ error: 'Key not found', key });
      }
      return res.json({ key, value: data[key!] });
    }

    if (action === 'list') {
      return res.json({ keys: Object.keys(data).sort() });
    }

    // action === 'write'
    data[key!] = value!;

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(memoryFile, JSON.stringify(data, null, 2), 'utf-8');

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'SANDBOX_MEMORY_WRITE',
      entityType: 'TreeSandbox',
      entityId: treeId,
      source: 'SYSTEM',
      metadataJson: { action: 'write', key },
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error('[memoryTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Memory operation failed', detail: error?.message });
  }
};
