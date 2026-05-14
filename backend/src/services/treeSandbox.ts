import { prisma } from '../index';
import fs from 'fs';
import path from 'path';

const TREES_BASE = '/home/leo/trees';
const PORT_RANGE = { min: 4100, max: 4999 };

interface SandboxInfo {
  treeId: string;
  port: number;
  workspacePath: string;
  status: 'IDLE' | 'RUNNING' | 'ERROR';
  createdAt: Date;
}

async function findFreePort(): Promise<number> {
  const usedPorts = await prisma.treeSandbox.findMany({
    select: { port: true },
  });
  const used = new Set(usedPorts.map((s) => s.port));
  for (let port = PORT_RANGE.min; port <= PORT_RANGE.max; port++) {
    if (!used.has(port)) return port;
  }
  throw new Error('No free ports in range 4100-4999');
}

export class TreeSandbox {
  static async create(treeId: string): Promise<SandboxInfo> {
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

  static async destroy(treeId: string): Promise<void> {
    const sandbox = await prisma.treeSandbox.findUnique({ where: { treeId } });
    if (!sandbox) return;

    // Remove workspace directory
    const workspacePath = path.join(TREES_BASE, treeId);
    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }

    await prisma.treeSandbox.delete({ where: { treeId } });
    console.log(`[TreeSandbox] Destroyed sandbox for tree ${treeId}`);
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
