import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { TreeSandbox, PortPoolExhaustedError } from '../services/treeSandbox';
import { logEvent, getRequestContext } from '../services/eventLogService';
import { prisma } from '../index';

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';
const MEDIA_SEARCH_TIMEOUT_MS = 90_000;

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

/**
 * POST /api/trees/:id/sandbox
 * Creates a sandbox for the given tree: directories + port + DB record.
 * JWT required.
 */
export const createTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Verify tree exists (TreeSandbox.create does this too, but we want a friendly 404)
    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const sb = await TreeSandbox.create(id);

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_CREATED',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'USER',
    });

    res.status(201).json(sb);
  } catch (error: any) {
    if (error instanceof PortPoolExhaustedError) {
      return res.status(507).json({ error: error.message });
    }
    console.error('[createTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create sandbox' });
  }
};

/**
 * GET /api/trees/:id/sandbox/health
 * Returns whether the sandbox's app is responding at localhost:{port}/health.
 * Public (no JWT required).
 */
export const healthCheckTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const healthy = await TreeSandbox.health(id);
    res.json({ treeId: id, healthy });
  } catch (error: any) {
    console.error('[healthCheckTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Health check failed' });
  }
};

/**
 * GET /api/trees/:id/sandbox
 * Returns sandbox info: port, status, workspacePath.
 */
export const getTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const sb = await TreeSandbox.get(id);

    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    res.json(sb);
  } catch (error: any) {
    console.error('[getTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get sandbox' });
  }
};

/**
 * DELETE /api/trees/:id/sandbox
 * Removes sandbox workspace directory and DB record.
 * Only tree creator can delete.
 */
export const removeTreeSandbox = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Authority check: only tree creator
    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the tree creator can delete the sandbox' });
    }

    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found' });
    }

    await TreeSandbox.destroy(id);

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_DELETED',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'USER',
    });

    res.json({ message: 'Sandbox deleted', workspacePath: sb.workspacePath });
  } catch (error: any) {
    console.error('[removeTreeSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to delete sandbox' });
  }
};

// ── POST /api/trees/:id/sandbox/media-search ────────────────────────────
// Body: { query: string, limit?: number, senderFilter?: string }
// Calls clip_index.py to search media files in the sandbox workspace.
// Returns: [{ path, senderName, date, score }]

interface MediaSearchResult {
  path: string;
  senderName: string;
  date: string;
  score: number;
}

export const searchMediaInSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { query, limit, senderFilter } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'query is required (non-empty string)' });
    }

    const resultLimit = typeof limit === 'number' && limit > 0 && limit <= 100
      ? Math.floor(limit)
      : 5;

    // Validate tree + sandbox exist
    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    const fs = await import('fs');
    if (!fs.existsSync(sb.workspacePath)) {
      return res.status(500).json({ error: 'Sandbox workspace directory not found' });
    }

    // Resolve clip_index.py relative to this source file (backend/src/controllers → ../../lib)
    const libDir = path.resolve(__dirname, '../../lib');
    const clipIndexPy = path.join(libDir, 'clip_index.py');
    const pythonBin = process.env.HERMES_PYTHON_BIN || 'python3';

    const cmd = `${pythonBin} "${clipIndexPy}" search "${id}" "${query.trim()}" --limit ${resultLimit}`;

    // Use SANDBOX_BASE_DIR so clip_index.py looks where silentSaveMedia actually writes
    const sandboxDir = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
    const cmdWithRoot = `${cmd} --media-root "${sandboxDir}"`;

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve, reject) => {
        const child = exec(cmdWithRoot, {
          cwd: sb.workspacePath,
          timeout: MEDIA_SEARCH_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => { stdout += data; });
        child.stderr?.on('data', (data) => { stderr += data; });

        child.on('close', (exitCode) => {
          resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
        });

        child.on('error', (err: NodeJS.ErrnoException) => {
          if ((err as any).killed) {
            resolve({
              stdout,
              stderr: stderr + `\n[Timeout after ${MEDIA_SEARCH_TIMEOUT_MS / 1000}s]`,
              exitCode: 124,
            });
          } else {
            reject(err);
          }
        });
      },
    );

    if (result.exitCode !== 0) {
      console.error('[searchMediaInSandbox] clip_index.py error:', result.stderr);
      return res.status(500).json({
        error: 'Media search failed',
        detail: result.stderr.slice(0, 500),
      });
    }

    let results: MediaSearchResult[] = [];
    try {
      results = JSON.parse(result.stdout);
    } catch {
      console.error('[searchMediaInSandbox] Failed to parse clip_index.py output:', result.stdout.slice(0, 300));
      return res.status(500).json({ error: 'Invalid search results from indexer' });
    }

    // Apply sender filter if requested
    if (senderFilter && typeof senderFilter === 'string') {
      const filter = senderFilter.trim().toLowerCase();
      results = results.filter(
        (r) => r.senderName.toLowerCase().includes(filter),
      );
    }

    // Return results (clip_index.py already returns sandbox-relative paths)
    const clean = results.map(({ path: p, senderName, date, score }) => ({
      path: p,
      senderName,
      date,
      score,
    }));

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_MEDIA_SEARCH',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'SYSTEM',
      metadataJson: { query, resultCount: clean.length, senderFilter: senderFilter || null },
    });

    res.json(clean);
  } catch (error: any) {
    console.error('[searchMediaInSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Media search failed', detail: error?.message });
  }
};

// ── NotebookLM Bridge Singleton ───────────────────────────────────────────────

import { NotebookLMBridge } from '../services/notebooklmBridge';

let notebooklmBridge: NotebookLMBridge | null = null;

async function getNotebookLMBridge(): Promise<NotebookLMBridge> {
  if (!notebooklmBridge) {
    notebooklmBridge = new NotebookLMBridge();
  }
  return notebooklmBridge;
}

// ── POST /api/trees/:id/notebooklm/ask ────────────────────────────────────────
// Body: { question: string }
// Returns: { answer: string, sources: [{ title, url }] }

export const notebooklmAsk = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'question is required (non-empty string)' });
    }

    const bridge = await getNotebookLMBridge();
    const result = await bridge.ask(id, question.trim());

    const sources = (result.citations || []).map((c) => ({
      title: c.sourceId,
      url: c.text || '',
    }));

    res.json({ answer: result.answer, sources });
  } catch (error: any) {
    console.error('[notebooklmAsk] ERROR:', error?.message || error);
    const status = error.code === 'TIMEOUT' ? 504 : 500;
    res.status(status).json({ error: error.message || 'NotebookLM ask failed' });
  }
};

// ── POST /api/trees/:id/notebooklm/podcast ────────────────────────────────────
// Body: {} (empty)
// Returns: { taskId: string, status: "generating" }

export const notebooklmPodcast = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;

    const bridge = await getNotebookLMBridge();
    const result = await bridge.generatePodcast(id);

    res.json({ taskId: result.taskId, status: result.status });
  } catch (error: any) {
    console.error('[notebooklmPodcast] ERROR:', error?.message || error);
    const status = error.code === 'TIMEOUT' ? 504 : 500;
    res.status(status).json({ error: error.message || 'NotebookLM podcast failed' });
  }
};

// ── POST /api/trees/:id/notebooklm/source ─────────────────────────────────────
// Body: { url?: string, text?: string, filePath?: string }
// Returns: { sourceId: string, status: string }

export const notebooklmAddSource = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { url, text, filePath } = req.body;

    // Determine input from the provided field
    const input = url || text || filePath;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({
        error: 'One of url, text, or filePath is required (non-empty string)',
      });
    }

    const bridge = await getNotebookLMBridge();
    const result = await bridge.addSource(id, input.trim());

    res.json({ sourceId: result.sourceId, status: 'created' });
  } catch (error: any) {
    console.error('[notebooklmAddSource] ERROR:', error?.message || error);
    const status = error.code === 'TIMEOUT' ? 504 : 500;
    res.status(status).json({ error: error.message || 'NotebookLM add source failed' });
  }
};

// ── GET /api/trees/:id/notebooklm/sources ─────────────────────────────────────
// Returns: { sources: [{ id, title, type, status }] }

export const notebooklmListSources = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;

    const bridge = await getNotebookLMBridge();
    const result = await bridge.listSources(id);

    const sources = (result.sources || []).map((s) => ({
      id: s.sourceId,
      title: s.title,
      type: s.kind,
      status: s.status,
    }));

    res.json({ sources });
  } catch (error: any) {
    console.error('[notebooklmListSources] ERROR:', error?.message || error);
    const status = error.code === 'TIMEOUT' ? 504 : 500;
    res.status(status).json({ error: error.message || 'NotebookLM list sources failed' });
  }
};
