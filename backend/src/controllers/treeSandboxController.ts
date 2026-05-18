import { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
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

    res.status(201).json({ path: requestedPath, size: Buffer.byteLength(content, 'utf-8') });
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
