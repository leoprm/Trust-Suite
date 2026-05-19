import { Request, Response } from "express";
import fs from "fs";
import path from "path";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
const SANDBOX_BASE =
  process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";

/**
 * POST /api/internal/hiring-result
 *
 * Called by the support Hermes Agent after finding candidates.
 * Saves hiring-result-{taskId}.json in the tree's sandbox.
 *
 * Body: { treeId, taskId, status, candidateCount, message }
 * Auth: x-api-key header must match INTERNAL_API_KEY env var.
 * Security: NUNCA acepta lista de candidatos — solo resultado agregado.
 */
export const receiveHiringResult = async (req: Request, res: Response) => {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const apiKey = req.headers["x-api-key"];
    if (!INTERNAL_API_KEY || apiKey !== INTERNAL_API_KEY) {
      return res.status(401).json({ error: "Unauthorized: invalid API key" });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    const { treeId, taskId, status, candidateCount, message } = req.body;

    if (!treeId || !taskId || !status) {
      return res.status(400).json({
        error: "treeId, taskId, and status are required",
      });
    }

    if (!["fulfilled", "no_candidates", "error"].includes(status)) {
      return res.status(400).json({
        error: "status must be: fulfilled, no_candidates, or error",
      });
    }

    // ── Validate treeId (prevent path traversal) ──────────────────────────
    if (typeof treeId !== "string" || treeId.includes("..") || treeId.includes("/")) {
      return res.status(400).json({ error: "Invalid treeId" });
    }

    // ── Build and save the result ─────────────────────────────────────────
    const result = {
      status: status as "fulfilled" | "no_candidates" | "error",
      candidateCount: typeof candidateCount === "number" ? candidateCount : 0,
      message:
        typeof message === "string"
          ? message.slice(0, 500)
          : "Resultado recibido del agente de soporte",
    };

    const treeDir = path.join(SANDBOX_BASE, treeId);

    // Ensure sandbox dir exists
    if (!fs.existsSync(treeDir)) {
      fs.mkdirSync(treeDir, { recursive: true });
    }

    const resultPath = path.join(treeDir, `hiring-result-${taskId}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");

    console.log(
      `[hiringResult] Saved ${treeId}/${taskId}: ${status} (${result.candidateCount} candidates)`
    );

    return res.json({
      ok: true,
      message: `Hiring result saved for ${treeId}/${taskId}`,
      path: resultPath,
    });
  } catch (err: any) {
    console.error("[hiringResult] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
};
