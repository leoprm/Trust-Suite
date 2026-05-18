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

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/candidates/resolve — Resolver votación (Ari cierra la ventana de 4h)
// ═══════════════════════════════════════════════════════════════════════════════
// Body: {
//   taskId: string, treeId: string,
//   action: "internal" | "external" | "cancel",
//   winnerId?: string,       // required if action=internal
//   motivo?: string,         // required if action=cancel
//   alternativas?: string[]  // optional, 2-3 alternativas for cancel
// }
// Returns structured result so Ari knows what to do next.
export const resolveCandidate = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { taskId, treeId, action, winnerId, motivo, alternativas } = req.body;

    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId (string) is required" });
    }
    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId (string) is required" });
    }
    if (!["internal", "external", "cancel"].includes(action)) {
      return res.status(400).json({ error: "action must be: internal | external | cancel" });
    }

    // Fetch all PENDING candidates for this task
    const candidates = await (prisma as any).candidate.findMany({
      where: { taskId, status: "PENDING" },
      include: {
        // Prisma doesn't auto-join; we fetch user data separately
      },
    });

    if (candidates.length === 0) {
      return res.status(404).json({ error: "No pending candidates found for this task" });
    }

    const result: any = {
      taskId,
      treeId,
      action,
      accepted: null as any,
      rejected: [] as string[],
      nextSteps: [] as string[],
    };

    if (action === "internal") {
      // ── Internal winner ──────────────────────────────────────────────
      if (!winnerId || typeof winnerId !== "string") {
        return res.status(400).json({ error: "winnerId (string) is required for internal action" });
      }

      const winner = candidates.find((c: any) => c.userId === winnerId);
      if (!winner) {
        return res.status(404).json({ error: "Winner not found among pending candidates" });
      }

      // Fetch winner's user info for notification
      const winnerUser = await (prisma as any).user.findUnique({
        where: { id: winnerId },
        select: { id: true, firstName: true, username: true, telegramUserId: true },
      });

      // Accept winner
      await (prisma as any).candidate.update({
        where: { id: winner.id },
        data: { status: "ACCEPTED" },
      });
      result.accepted = { userId: winnerId, candidateId: winner.id };

      // Reject all others
      for (const c of candidates) {
        if (c.userId !== winnerId) {
          await (prisma as any).candidate.update({
            where: { id: c.id },
            data: { status: "REJECTED" },
          });
          result.rejected.push(c.userId);
        }
      }

      // Get the ExternalTask info for the task
      const extTask = await (prisma as any).externalTask.findFirst({
        where: { kanbanTaskId: taskId },
        select: { id: true, title: true, kanbanTaskId: true, kanbanBoard: true },
      });

      // Determine display name for notification
      const displayName = winnerUser?.firstName || winnerUser?.username || winnerId;

      result.nextSteps = [
        `NOTIFY_GROUP: @${displayName} fue elegido para la tarea "${extTask?.title || taskId}"`,
        `NOTIFY_WINNER_DM: userId=${winnerId}, telegramUserId=${winnerUser?.telegramUserId || "desconocido"}`,
        `KANBAN_REASSIGN: hermes kanban reassign ${taskId} ${winnerId}`,
      ];
      result.kanbanTaskId = taskId;
      result.kanbanBoard = extTask?.kanbanBoard || null;
      result.winnerDisplayName = displayName;
      result.winnerTelegramId = winnerUser?.telegramUserId?.toString() || null;

    } else if (action === "external") {
      // ── External hire ────────────────────────────────────────────────
      // Reject all pending candidates (no internal winner)
      for (const c of candidates) {
        await (prisma as any).candidate.update({
          where: { id: c.id },
          data: { status: "REJECTED" },
        });
        result.rejected.push(c.userId);
      }

      // Get ExternalTask info for context
      const extTask = await (prisma as any).externalTask.findFirst({
        where: { kanbanTaskId: taskId },
        select: { id: true, title: true, kanbanTaskId: true, treeId: true },
      });

      result.nextSteps = [
        "NOTIFY_GROUP: Se contrata externo para esta tarea",
        `CREATE_EXTERNAL_TASK: POST /api/external-tasks with treeId=${treeId}, kanbanTaskId=${taskId}`,
      ];
      result.kanbanTaskId = taskId;
      result.externalTaskRef = extTask?.id || null;

    } else if (action === "cancel") {
      // ── Cancel task ──────────────────────────────────────────────────
      if (!motivo || typeof motivo !== "string") {
        return res.status(400).json({ error: "motivo (string) is required for cancel action" });
      }

      // Reject all pending candidates
      for (const c of candidates) {
        await (prisma as any).candidate.update({
          where: { id: c.id },
          data: { status: "REJECTED" },
        });
        result.rejected.push(c.userId);
      }

      // Get task info for CancelledPlan
      const extTask = await (prisma as any).externalTask.findFirst({
        where: { kanbanTaskId: taskId },
        select: { title: true, description: true, skills: true, budget: true },
      });

      // Build alternativas text
      const altText = alternativas && Array.isArray(alternativas)
        ? alternativas.join(" | ")
        : "";

      result.nextSteps = [
        "NOTIFY_GROUP: Tarea cancelada. Alternativas propuestas por Ari.",
        `SAVE_CANCELLED_PLAN: POST /api/cancelled-plans with treeId=${treeId}`,
        `KANBAN_BLOCK: hermes kanban block ${taskId} "Cancelada: ${motivo.slice(0, 80)}"`,
      ];
      result.kanbanTaskId = taskId;
      result.cancelData = {
        title: extTask?.title || taskId,
        description: extTask?.description || "",
        skills: extTask?.skills || [],
        budget: extTask?.budget || 0,
        motivo,
        treeId,
        alternativas: alternativas || [],
        altText,
      };
    }

    res.json(result);
  } catch (error: any) {
    console.error("[candidates] resolveCandidate error:", error.message);
    res.status(500).json({ error: "Failed to resolve candidates" });
  }
};
