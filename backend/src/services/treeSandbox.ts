import { prisma } from '../index';
import fs from 'fs';
import path from 'path';

const TREES_BASE = process.env.SANDBOX_BASE_DIR || '/home/leo/trees';
const WORKERS_BASE = process.env.WORKERS_BASE_DIR || '/home/trustmaker/workers';
const PORT_RANGE = { min: 4100, max: 4999 };

const OBSIDIAN_APP_JSON = JSON.stringify({
  newLinkFormat: 'shortest',
  useMarkdownLinks: true,
  showUnsupportedFiles: false,
  attachmentFolderPath: 'assets',
  promptDelete: false,
  livePreview: true,
});

const INDEX_MD = [
  '# 🌳 Tree Vault',
  '',
  '- [[assets/|Assets]]',
  '- [[decisions/|Decisions]]',
  '- [[people/|People]]',
  '',
].join('\n');

const WORKER_INDEX_MD = [
  '# 🧠 Worker Vault',
  '',
  '- [[tasks/|Tasks]]',
  '- [[evaluations/|Evaluations]]',
  '- [[skills/|Skills]]',
  '',
].join('\n');

interface SandboxInfo {
  treeId: string;
  port: number;
  workspacePath: string;
  status: 'IDLE' | 'RUNNING' | 'ERROR';
  createdAt: Date;
}

/** Thrown when the port pool 4100-4999 is exhausted. Route handlers map this to 507. */
export class PortPoolExhaustedError extends Error {
  constructor() {
    super('No free ports in range 4100-4999');
    this.name = 'PortPoolExhaustedError';
  }
}

async function findFreePort(): Promise<number> {
  const usedPorts = await prisma.treeSandbox.findMany({
    select: { port: true },
  });
  const used = new Set(usedPorts.map((s) => s.port));
  for (let port = PORT_RANGE.min; port <= PORT_RANGE.max; port++) {
    if (!used.has(port)) return port;
  }
  throw new PortPoolExhaustedError();
}

/** Creates the obsidian vault scaffold inside a workspace directory.
 *  Idempotent — skips directories that already exist. */
function scaffoldObsidianVault(workspacePath: string) {
  const obsidianDir = path.join(workspacePath, 'obsidian');
  fs.mkdirSync(path.join(obsidianDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(obsidianDir, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(obsidianDir, 'people'), { recursive: true });

  const appDir = path.join(obsidianDir, '.obsidian');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'app.json'), OBSIDIAN_APP_JSON, 'utf-8');

  const indexPath = path.join(obsidianDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, INDEX_MD, 'utf-8');
  }

  console.log(`[TreeSandbox] Obsidian vault scaffolded at ${obsidianDir}`);
}

/** Worker obsidian vault scaffold — /home/trustmaker/workers/:userId/obsidian/ */
function scaffoldWorkerObsidian(userId: string) {
  const obsidianDir = path.join(WORKERS_BASE, userId, 'obsidian');
  fs.mkdirSync(path.join(obsidianDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(obsidianDir, 'evaluations'), { recursive: true });
  fs.mkdirSync(path.join(obsidianDir, 'skills'), { recursive: true });

  const appDir = path.join(obsidianDir, '.obsidian');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'app.json'), OBSIDIAN_APP_JSON, 'utf-8');

  const indexPath = path.join(obsidianDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, WORKER_INDEX_MD, 'utf-8');
  }

  console.log(`[TreeSandbox] Worker obsidian vault scaffolded for ${userId}`);
}

export class TreeSandbox {
  static async create(treeId: string): Promise<SandboxInfo> {
    // 0. Verify the tree exists
    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
      throw new Error(`Tree ${treeId} not found`);
    }

    // 1. Check if sandbox already exists
    const existing = await prisma.treeSandbox.findUnique({ where: { treeId } });
    if (existing) {
      return {
        treeId: existing.treeId,
        port: existing.port,
        workspacePath: `${TREES_BASE}/${treeId}`,
        status: existing.status as 'IDLE' | 'RUNNING' | 'ERROR',
        createdAt: existing.createdAt,
      };
    }

    // 2. Create workspace directories
    const workspacePath = path.join(TREES_BASE, treeId);
    fs.mkdirSync(path.join(workspacePath, 'apps'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'data'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'context'), { recursive: true });

    // 2b. Scaffold obsidian vault
    scaffoldObsidianVault(workspacePath);

    // 2c. Deploy keyword extractor into sandbox apps/
    const extractorSrc = path.resolve(__dirname, '../../lib/keyword_extractor.py');
    if (fs.existsSync(extractorSrc)) {
      fs.copyFileSync(extractorSrc, path.join(workspacePath, 'apps', 'keyword_extractor.py'));
      console.log('[TreeSandbox] keyword_extractor.py deployed');
    }

    // 2d. Write tree metadata for sandbox tools (keyword extractor, etc.)
    const treeMeta = {
      description: tree.description || '',
      objectives: tree.objectives || '',
    };
    fs.writeFileSync(
      path.join(workspacePath, 'context', 'tree_meta.json'),
      JSON.stringify(treeMeta, null, 2),
      'utf-8',
    );

    // 3. Assign a free port
    const port = await findFreePort();

    // 4. Persist to DB
    const sandbox = await prisma.treeSandbox.create({
      data: {
        treeId,
        port,
        status: 'IDLE',
      },
    });

    console.log(`[TreeSandbox] Created sandbox for tree ${treeId} on port ${port}`);
    return {
      treeId: sandbox.treeId,
      port: sandbox.port,
      workspacePath,
      status: sandbox.status as 'IDLE' | 'RUNNING' | 'ERROR',
      createdAt: sandbox.createdAt,
    };
  }

  /** Archive lecciones.md before destroying the tree. Dedup: skips if identical
   *  content already exists in the global archive. Fails silently — never blocks
   *  deletion. */
  private static async archiveLecciones(treeId: string): Promise<void> {
    try {
      const leccionesPath = path.join(TREES_BASE, treeId, 'memory', 'LECCIONES.md');
      if (!fs.existsSync(leccionesPath)) return;

      const content = fs.readFileSync(leccionesPath, 'utf-8').trim();
      if (!content) return;

      const archiveDir = path.join(TREES_BASE, '.archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      const archivePath = path.join(archiveDir, 'lecciones.md');
      let archiveContent = '';
      if (fs.existsSync(archivePath)) {
        archiveContent = fs.readFileSync(archivePath, 'utf-8');
      }

      // Dedup: skip if this exact content block already exists in the archive
      if (archiveContent.includes(content)) {
        console.log(`[TreeSandbox] lecciones.md for tree ${treeId.slice(0, 8)}… already archived — skipping`);
        return;
      }

      // Append with a tree header for traceability
      const header = `## 🌳 ${treeId}\n_Archivado: ${new Date().toISOString()}_\n\n`;
      const separator = archiveContent ? '\n\n' : '';
      const append = separator + header + content;
      fs.appendFileSync(archivePath, append, 'utf-8');
      console.log(`[TreeSandbox] Archived lecciones.md for tree ${treeId.slice(0, 8)}…`);
    } catch (err: any) {
      console.warn(`[TreeSandbox] archiveLecciones failed for tree ${treeId.slice(0, 8)}…:`, err?.message || err);
    }
  }

  static async destroy(treeId: string): Promise<void> {
    const sandbox = await prisma.treeSandbox.findUnique({ where: { treeId } });
    if (!sandbox) return;

    // Archive lecciones.md before wiping the workspace
    await TreeSandbox.archiveLecciones(treeId);

    // Remove workspace directory
    const workspacePath = path.join(TREES_BASE, treeId);
    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }

    await prisma.treeSandbox.delete({ where: { treeId } });
    console.log(`[TreeSandbox] Destroyed sandbox for tree ${treeId}`);
  }

  /** Create or ensure the obsidian vault for a worker without a tree.
   *  Idempotent — safe to call repeatedly. */
  static ensureWorkerObsidian(userId: string): string {
    scaffoldWorkerObsidian(userId);
    return path.join(WORKERS_BASE, userId, 'obsidian');
  }

  static async get(treeId: string): Promise<SandboxInfo | null> {
    const sandbox = await prisma.treeSandbox.findUnique({ where: { treeId } });
    if (!sandbox) return null;
    return {
      treeId: sandbox.treeId,
      port: sandbox.port,
      workspacePath: `${TREES_BASE}/${treeId}`,
      status: sandbox.status as 'IDLE' | 'RUNNING' | 'ERROR',
      createdAt: sandbox.createdAt,
    };
  }

  static async list(): Promise<SandboxInfo[]> {
    const sandboxes = await prisma.treeSandbox.findMany({ orderBy: { createdAt: 'desc' } });
    return sandboxes.map((s) => ({
      treeId: s.treeId,
      port: s.port,
      workspacePath: `${TREES_BASE}/${s.treeId}`,
      status: s.status as 'IDLE' | 'RUNNING' | 'ERROR',
      createdAt: s.createdAt,
    }));
  }

  static async health(treeId: string): Promise<boolean> {
    const sandbox = await prisma.treeSandbox.findUnique({ where: { treeId } });
    if (!sandbox) return false;
    try {
      const resp = await fetch(`http://localhost:${sandbox.port}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
