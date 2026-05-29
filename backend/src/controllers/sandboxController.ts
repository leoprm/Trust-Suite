import { Request, Response } from 'express';
import { exec } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import mysql from 'mysql2/promise';
import { TreeSandbox, PortPoolExhaustedError } from '../services/treeSandbox';
import { logEvent, getRequestContext } from '../services/eventLogService';
import { prisma } from '../index';

const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? '';
const MEDIA_SEARCH_TIMEOUT_MS = 90_000;
const WEB_SEARCH_TIMEOUT_MS = 15_000;

// ── Tree-specific API key derivation ────────────────────────────────────────

/** Derive a per-tree API key from the master key + treeId. */
function deriveTreeApiKey(treeId: string): string {
  if (!API_SERVER_KEY || !treeId) return '';
  return crypto.createHmac('sha256', API_SERVER_KEY).update(treeId).digest('hex');
}

function checkApiKey(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header missing' });
    return false;
  }
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  // ONLY accept tree-specific derived key (matches :id in URL)
  // Global master key is deliberately NOT accepted — prevents cross-tree access
  const treeId = req.params.id as string;
  if (treeId && token === deriveTreeApiKey(treeId)) return true;

  res.status(403).json({ error: 'Invalid API key' });
  return false;
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

// ── POST /api/trees/:treeId/surveys ────────────────────────────────────────────
// Body: { targetUserId, skill, closesAt }
// Creates a SatisfactionSurvey with announcedAt=now. Returns { surveyId }.
// JWT required — creator must be a tree member.

import { createHash } from 'crypto';

function voterHash(userId: string, surveyId: string): string {
  return createHash('sha256').update(userId + surveyId).digest('hex');
}

export const createSurvey = async (req: Request, res: Response) => {
  try {
    const treeId = (req.params.treeId ?? req.params.id) as string;
    const { targetUserId, skill, closesAt } = req.body;
    const userId = (req as any).user!.id;

    if (!targetUserId || !skill || !closesAt) {
      return res.status(400).json({ error: 'targetUserId, skill, and closesAt are required' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Verify creator is a tree member
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'You must be a tree member to create surveys' });
    }

    // Verify target user exists
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return res.status(404).json({ error: 'Target user not found' });

    const survey = await prisma.satisfactionSurvey.create({
      data: {
        treeId,
        targetUserId,
        skill,
        createdBy: userId,
        closesAt: new Date(closesAt),
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'SURVEY_CREATED',
      entityType: 'SatisfactionSurvey',
      entityId: survey.id,
      actorId: userId,
      source: 'USER',
      metadataJson: { targetUserId, skill },
    });

    res.status(201).json({ surveyId: survey.id });
  } catch (error: any) {
    console.error('[createSurvey] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create survey' });
  }
};

// ── POST /api/trees/:treeId/surveys/:surveyId/vote ─────────────────────────────
// Body: { score (1-10) }
// voterId = SHA256(userId + surveyId) — anonymous, idempotent (@unique surveyId+voterId).
// Only allowed while survey is still open AND not closed.
// JWT required.

export const voteOnSurvey = async (req: Request, res: Response) => {
  try {
    const surveyId = req.params.surveyId as string;
    const userId = (req as any).user!.id;
    const { score } = req.body;

    if (typeof score !== 'number' || score < 1 || score > 10) {
      return res.status(400).json({ error: 'score must be an integer 1-10' });
    }

    // Verify survey exists
    const survey = await prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
    });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Block votes after closesAt
    if (new Date() > survey.closesAt) {
      return res.status(410).json({ error: 'Survey has closed' });
    }

    const hash = voterHash(userId, surveyId);

    // Idempotent upsert
    const vote = await prisma.surveyVote.upsert({
      where: { surveyId_voterId: { surveyId, voterId: hash } },
      update: { score: Math.floor(score) },
      create: {
        surveyId,
        voterId: hash,
        score: Math.floor(score),
      },
    });

    // Update SatisfactionScore aggregate
    const allVotes = await prisma.surveyVote.findMany({
      where: { surveyId },
      select: { score: true },
    });
    const avg =
      allVotes.reduce((sum, v) => sum + v.score, 0) / allVotes.length;

    await prisma.satisfactionScore.upsert({
      where: { userId_skill: { userId: survey.targetUserId, skill: survey.skill } },
      update: {
        avgScore: avg,
        totalSurveys: allVotes.length,
      },
      create: {
        userId: survey.targetUserId,
        skill: survey.skill,
        avgScore: avg,
        totalSurveys: allVotes.length,
      },
    });

    res.json({ message: 'Vote recorded', voterId: hash });
  } catch (error: any) {
    console.error('[voteOnSurvey] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to record vote' });
  }
};

// ── GET /api/trees/:treeId/surveys/:surveyId/results ───────────────────────────
// Only if survey.closesAt < now AND survey.visible = true.
// Returns: { avgScore, totalVotes, scores: [{ voterHash, score }] }

export const getSurveyResults = async (req: Request, res: Response) => {
  try {
    const surveyId = req.params.surveyId as string;

    const survey = await prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
    });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    if (new Date() < survey.closesAt) {
      return res.status(403).json({ error: 'Survey is still open' });
    }
    if (!survey.visible) {
      return res.status(403).json({ error: 'Results are not yet visible' });
    }

    const votes = await prisma.surveyVote.findMany({
      where: { surveyId },
      select: { voterId: true, score: true },
    });

    const avgScore =
      votes.length > 0
        ? votes.reduce((sum, v) => sum + v.score, 0) / votes.length
        : 0;

    res.json({
      avgScore: Math.round(avgScore * 100) / 100,
      totalVotes: votes.length,
      scores: votes.map((v) => ({ voterHash: v.voterId, score: v.score })),
    });
  } catch (error: any) {
    console.error('[getSurveyResults] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get survey results' });
  }
};

// ── In-Memory Rate Limiter ────────────────────────────────────────────────────
// Shared across all trees. 10 queries per minute per treeId.

class SimpleRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  allowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= limit) return false;

    entry.count++;
    return true;
  }
}

const sqlRateLimiter = new SimpleRateLimiter();
const webSearchRateLimiter = new SimpleRateLimiter();

// ── Sandbox Read-Only Pool ─────────────────────────────────────────────────────
// Lazy singleton — reuses connection for all querySql calls.

let sandboxPool: mysql.Pool | null = null;

async function getSandboxPool(): Promise<mysql.Pool> {
  if (sandboxPool) return sandboxPool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');

  // Parse DATABASE_URL to extract host/port/database
  const parsed = new URL(dbUrl);
  const host = parsed.hostname;
  const port = parseInt(parsed.port || '3306', 10);
  const database = parsed.pathname.slice(1); // strip leading /
  const sslEnabled = parsed.searchParams.get('ssl') !== 'false';

  const password =
    process.env.TRUST_SANDBOX_RO_PASSWORD ??
    (() => {
      try {
        const credsPath = '/home/trustmaker/.sandbox_db_creds';
        if (fs.existsSync(credsPath)) {
          const content = fs.readFileSync(credsPath, 'utf-8').trim();
          // File may be "user:password" or just "password"
          const colonIdx = content.indexOf(':');
          return colonIdx >= 0 ? content.slice(colonIdx + 1) : content;
        }
      } catch {
        // ignore — file read failures are non-fatal
      }
      return null;
    })();

  if (!password) {
    throw new Error(
      'Sandbox read-only credentials not configured. ' +
      'Set TRUST_SANDBOX_RO_PASSWORD or create /home/trustmaker/.sandbox_db_creds',
    );
  }

  sandboxPool = mysql.createPool({
    host,
    port,
    user: 'trust_sandbox_ro',
    password,
    database,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 3,
    maxIdle: 3,
    idleTimeout: 60_000,
    queueLimit: 10,
  });

  return sandboxPool;
}

// ── SQL Injection Parser ───────────────────────────────────────────────────────
// Only SELECT allowed. Injects treeId filter into WHERE clause.

interface ParsedQuery {
  sql: string;
  params: any[];
}

const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE|EXECUTE|EXEC)\b/i;
const TAIL_CLAUSE = /\b(GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING|INTO\s+OUTFILE|INTO\s+DUMPFILE|PROCEDURE|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE)\b/i;

function injectTreeIdFilter(sql: string, treeId: string): ParsedQuery {
  const trimmed = sql.trim();

  // Only SELECT
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }

  // No forbidden keywords anywhere in the query
  if (FORBIDDEN_SQL.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Duplicate semicolons are suspicious
  if ((trimmed.match(/;/g) || []).length > 1) {
    throw new Error('Multiple statements are not allowed');
  }

  // Find the injection point: before GROUP BY / ORDER BY / LIMIT / HAVING
  // or at end of query. Strip trailing semicolon for injection.
  const noSemi = trimmed.replace(/;\s*$/, '');
  const tailMatch = noSemi.match(TAIL_CLAUSE);
  const injectionIdx = tailMatch?.index ?? noSemi.length;

  // Check if WHERE exists before the injection point
  const whereMatch = noSemi.substring(0, injectionIdx).match(/\bWHERE\b/i);

  const prefix = noSemi.substring(0, injectionIdx);
  const suffix = noSemi.substring(injectionIdx);

  if (whereMatch) {
    return {
      sql: `${prefix} AND treeId = ? ${suffix}`,
      params: [treeId],
    };
  }

  return {
    sql: `${prefix} WHERE treeId = ? ${suffix}`,
    params: [treeId],
  };
}

// ── POST /api/trees/:treeId/sandbox/query-sql ──────────────────────────────────
// Body: { sql: string }
// JWT required — caller must be a tree member.
// Rate limited: 10 queries/minute per tree.
// Returns: { rows: [...], count: N }

export const querySql = async (req: Request, res: Response) => {
  try {
    const treeId = (req.params.treeId ?? req.params.id) as string;
    const userId = (req as any).user!.id;
    const { sql } = req.body;

    // Validate body
    if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
      return res.status(400).json({ error: 'sql is required (non-empty string)' });
    }

    // Verify tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    // Verify caller is a tree member
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'You must be a tree member to query the sandbox database' });
    }

    // Rate limit: 10 queries/minute per tree
    if (!sqlRateLimiter.allowed(`sql:${treeId}`, 10, 60_000)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Max 10 queries per minute per tree.' });
    }

    // Parse and inject treeId filter
    let parsed: ParsedQuery;
    try {
      parsed = injectTreeIdFilter(sql.trim(), treeId);
    } catch (parseErr: any) {
      return res.status(400).json({ error: parseErr.message });
    }

    // Execute via sandbox read-only pool
    const pool = await getSandboxPool();
    const [rows] = await pool.execute(parsed.sql, parsed.params);

    res.json({ rows: rows as any[], count: Array.isArray(rows) ? rows.length : 0 });
  } catch (error: any) {
    console.error('[querySql] ERROR:', error?.message || error);
    if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ER_DBACCESS_DENIED_ERROR') {
      return res.status(500).json({ error: 'Sandbox database access denied' });
    }
    if (error.code === 'ER_PARSE_ERROR' || error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(400).json({ error: `SQL error: ${error.message}` });
    }
    res.status(500).json({ error: 'Query execution failed' });
  }
};

// ── DuckDuckGo HTML search parser ───────────────────────────────────────────

interface WebSearchResult {
  title: string;
  url: string;
  description: string;
}

/**
 * Fetch and parse DuckDuckGo HTML search results.
 * Returns up to `limit` results with title, url, description.
 */
function searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        },
        timeout: WEB_SEARCH_TIMEOUT_MS,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          const results: WebSearchResult[] = [];
          // Extract result blocks: each result has result__title > result__a (with href) + result__snippet
          const blockRegex = /<h2 class="result__title">\s*<a rel="nofollow" class="result__a" href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)[^"]*">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;
          while ((match = blockRegex.exec(body)) !== null && results.length < limit) {
            try {
              const rawUrl = decodeURIComponent(match[1]);
              const title = match[2].replace(/<[^>]*>/g, '').trim();
              const description = match[3]
                .replace(/<b>/g, '')
                .replace(/<\/b>/g, '')
                .replace(/&#x27;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/<[^>]*>/g, '')
                .trim();
              if (title && rawUrl && description) {
                results.push({ title, url: rawUrl, description });
              }
            } catch {
              // skip malformed entries
            }
          }
          resolve(results);
        });
        res.on('error', reject);
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Web search timeout'));
    });

    req.on('error', reject);
  });
}

// ── POST /api/trees/:id/sandbox/web-search ─────────────────────────────────
// Body: { query: string, limit?: number }
// Auth: Bearer <tree_api_key> (or global HERMES_API_SERVER_KEY)
// Rate limit: 5 calls/minute per tree
// Timeout: 15s
// Returns: { results: [{ title, url, description }, ...] }

export const webSearchInSandbox = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const id = req.params.id as string;
    const { query, limit } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'query is required (non-empty string)' });
    }

    const resultLimit =
      typeof limit === 'number' && limit > 0 && limit <= 20
        ? Math.floor(limit)
        : 5;

    // Verify tree + sandbox exist
    const sb = await TreeSandbox.get(id);
    if (!sb) {
      return res.status(404).json({ error: 'Sandbox not found for this tree' });
    }

    // Rate limit: 5 calls/minute per tree
    if (!webSearchRateLimiter.allowed(`ws:${id}`, 5, 60_000)) {
      return res
        .status(429)
        .json({ error: 'Rate limit exceeded. Max 5 calls per minute per tree.' });
    }

    let results: WebSearchResult[];
    try {
      results = await searchDuckDuckGo(query.trim(), resultLimit);
    } catch (searchErr: any) {
      console.error('[webSearchInSandbox] Search error:', searchErr?.message || searchErr);
      return res
        .status(searchErr.message === 'Web search timeout' ? 504 : 502)
        .json({ error: 'Web search failed', detail: searchErr?.message });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'SANDBOX_WEB_SEARCH',
      entityType: 'TreeSandbox',
      entityId: id,
      source: 'SYSTEM',
      metadataJson: { query: query.trim(), resultCount: results.length },
    });

    res.json({ results, count: results.length });
  } catch (error: any) {
    console.error('[webSearchInSandbox] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Web search failed', detail: error?.message });
  }
};
