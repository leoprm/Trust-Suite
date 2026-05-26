/**
 * ConversationTreeController — Tree-structured conversation history (Pi branching feature).
 *
 * POST /api/trees/:treeId/sandbox/branch   — create a branch from an existing node
 * GET  /api/trees/:treeId/sandbox/tree     — get full conversation tree structure
 * POST /api/trees/:treeId/sandbox/checkout — switch current branch/node
 */

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// ── POST /branch ──────────────────────────────────────────────────────────
export const createBranch = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { parentId, branchName, messages } = req.body;

    if (!treeId) return res.status(400).json({ error: "treeId is required" });

    const prisma = getPrisma();

    // Verify parent exists if provided
    if (parentId) {
      const parent = await (prisma as any).conversationNode.findUnique({
        where: { id: parentId },
      });
      if (!parent) return res.status(404).json({ error: "Parent node not found" });
    }

    const node = await (prisma as any).conversationNode.create({
      data: {
        treeId,
        parentId: parentId || null,
        branchName: branchName || null,
        messages: messages || [],
      },
    });

    res.json(node);
  } catch (err: any) {
    console.error("[createBranch]", err?.message || err);
    res.status(500).json({ error: "Failed to create branch" });
  }
};

// ── GET /tree ─────────────────────────────────────────────────────────────
export const getConversationTree = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    if (!treeId) return res.status(400).json({ error: "treeId is required" });

    const prisma = getPrisma();

    const nodes = await (prisma as any).conversationNode.findMany({
      where: { treeId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        parentId: true,
        branchName: true,
        summary: true,
        createdAt: true,
        _count: { select: { children: true } },
      },
    });

    // Build tree structure
    const nodeMap = new Map<string, any>();
    const roots: any[] = [];

    for (const n of nodes) {
      nodeMap.set(n.id, { ...n, children: [] });
    }
    for (const n of nodes) {
      const node = nodeMap.get(n.id)!;
      if (n.parentId && nodeMap.has(n.parentId)) {
        nodeMap.get(n.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json({ treeId, nodeCount: nodes.length, roots });
  } catch (err: any) {
    console.error("[getConversationTree]", err?.message || err);
    res.status(500).json({ error: "Failed to get tree" });
  }
};

// ── POST /checkout ────────────────────────────────────────────────────────
export const checkoutBranch = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { nodeId } = req.body;

    if (!treeId || !nodeId) {
      return res.status(400).json({ error: "treeId and nodeId are required" });
    }

    const prisma = getPrisma();

    const node = await (prisma as any).conversationNode.findUnique({
      where: { id: nodeId },
    });

    if (!node || node.treeId !== treeId) {
      return res.status(404).json({ error: "Node not found in this tree" });
    }

    // Return the full messages from this node (to inject as context)
    res.json({
      node,
      messages: node.messages || [],
      path: await getPathToRoot(prisma, nodeId),
    });
  } catch (err: any) {
    console.error("[checkoutBranch]", err?.message || err);
    res.status(500).json({ error: "Failed to checkout" });
  }
};

// Helper: get path from root to this node
async function getPathToRoot(prisma: any, nodeId: string): Promise<string[]> {
  const path: string[] = [];
  let current = nodeId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = await prisma.conversationNode.findUnique({
      where: { id: current },
      select: { id: true, branchName: true, parentId: true },
    });
    if (!node) break;
    path.unshift(node.branchName || node.id.slice(0, 8));
    current = node.parentId;
  }

  return path;
}

// ── POST /summarize-node ──────────────────────────────────────────────────
export const summarizeNode = async (req: Request, res: Response) => {
  try {
    const { nodeId, summary } = req.body;
    if (!nodeId || !summary) {
      return res.status(400).json({ error: "nodeId and summary are required" });
    }

    const prisma = getPrisma();
    await (prisma as any).conversationNode.update({
      where: { id: nodeId },
      data: { summary },
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[summarizeNode]", err?.message || err);
    res.status(500).json({ error: "Failed to summarize" });
  }
};
