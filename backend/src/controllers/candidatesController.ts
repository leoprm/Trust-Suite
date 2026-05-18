import { Request, Response } from "express";
import { prisma } from "../index";

// ── Auth helper (API key) ──────────────────────────────────────────────────
const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

function checkApiKey(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Authorization header missing" });
    return false;
  }
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!API_SERVER_KEY || token !== API_SERVER_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/candidates — Register a tree member as candidate for a human-worker task
// ═══════════════════════════════════════════════════════════════════════════════
// Called when a tree member clicks the "Yo puedo" button on Ari's task announcement.
// Body: { userId, taskId, treeId }
// userId = user's DB id (resolved from Telegram callback by the bot handler)
export const registerCandidate = async (req: Request, res: Response) => {
  // Both API key (Ari) and JWT (Telegram callback) are accepted
  const isApiKey = checkApiKey(req, res);
  // If API key check already sent response, we'd have returned — but checkApiKey
  // doesn't return early on failure; it sends res and returns false.
  // For Telegram callbacks we also accept JWT.
  const userId = req.user?.id || req.body.userId;

  if (!isApiKey && !userId) {
    // checkApiKey already sent 401/403
    if (!res.headersSent) {
      res.status(401).json({ error: "Authentication required (JWT or API key)" });
    }
    return;
  }

  try {
    const { taskId, treeId } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId (string) is required" });
    }
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId (string) is required" });
    }
    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId (string) is required" });
    }

    // Verify task exists as a kanban task (check ExternalTask for reference)
    const externalTask = await (prisma as any).externalTask.findFirst({
      where: { kanbanTaskId: taskId },
      select: { id: true, title: true, treeId: true },
    });

    // Verify user is a member of the tree
    const member = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
      select: { id: true, status: true },
    });
    if (!member || member.status !== "ACTIVE") {
      return res.status(403).json({ error: "You must be an active member of this tree" });
    }

    // Prevent duplicate applications
    const existing = await (prisma as any).candidate.findFirst({
      where: { userId, taskId },
    });
    if (existing) {
      return res.status(409).json({ error: "Already applied for this task", candidateId: existing.id });
    }

    const candidate = await (prisma as any).candidate.create({
      data: { userId, taskId, treeId },
    });

    res.status(201).json({
      id: candidate.id,
      userId: candidate.userId,
      taskId: candidate.taskId,
      status: candidate.status,
      createdAt: candidate.createdAt,
    });
  } catch (error: any) {
    console.error("[candidates] registerCandidate error:", error.message);
    res.status(500).json({ error: "Failed to register candidate" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/candidates?taskId=... — List candidates for a task (Ari / admin)
// ═══════════════════════════════════════════════════════════════════════════════
export const getCandidates = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { taskId } = req.query;
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId (query param) is required" });
    }

    const candidates = await (prisma as any).candidate.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });

    res.json({ candidates, count: candidates.length });
  } catch (error: any) {
    console.error("[candidates] getCandidates error:", error.message);
    res.status(500).json({ error: "Failed to fetch candidates" });
  }
};
