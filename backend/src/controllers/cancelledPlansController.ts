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
// POST /api/cancelled-plans — Guardar un plan cancelado (llamado por Ari)
// ═══════════════════════════════════════════════════════════════════════════════
// Body: { title, description, skills, budget, motivo, treeId, taskId?, alternativas? }
export const createCancelledPlan = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { title, description, skills, budget, motivo, treeId, taskId, alternativas } = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title (string) is required" });
    }
    if (!motivo || typeof motivo !== "string") {
      return res.status(400).json({ error: "motivo (string) is required" });
    }
    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId (string) is required" });
    }

    // Normalize skills
    let skillsArr: string[] = [];
    if (Array.isArray(skills)) {
      skillsArr = skills.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof skills === "string") {
      try {
        skillsArr = JSON.parse(skills);
      } catch {
        skillsArr = skills.split(",").map((s: string) => s.trim()).filter(Boolean);
      }
    }

    // Normalize budget
    const budgetNum = typeof budget === "number" ? budget : parseInt(String(budget), 10) || 0;

    // Build description with alternativas if provided
    let fullDescription = description || "";
    if (alternativas && Array.isArray(alternativas) && alternativas.length > 0) {
      fullDescription += "\n\n--- Alternativas propuestas ---\n";
      alternativas.forEach((alt: string, i: number) => {
        fullDescription += `\n${i + 1}. ${alt}`;
      });
    }

    const plan = await (prisma as any).cancelledPlan.create({
      data: {
        title: title.trim(),
        description: fullDescription.trim(),
        skills: skillsArr,
        budget: budgetNum,
        motivo: motivo.trim(),
        treeId,
      },
    });

    res.status(201).json({
      id: plan.id,
      title: plan.title,
      treeId: plan.treeId,
      motivo: plan.motivo,
      createdAt: plan.createdAt,
    });
  } catch (error: any) {
    console.error("[cancelledPlans] createCancelledPlan error:", error.message);
    res.status(500).json({ error: "Failed to create cancelled plan" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cancelled-plans?treeId=X — Listar planes cancelados de un árbol
// ═══════════════════════════════════════════════════════════════════════════════
export const getCancelledPlans = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const { treeId } = req.query;
    if (!treeId || typeof treeId !== "string") {
      return res.status(400).json({ error: "treeId (query param) is required" });
    }

    const plans = await (prisma as any).cancelledPlan.findMany({
      where: { treeId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ plans, count: plans.length });
  } catch (error: any) {
    console.error("[cancelledPlans] getCancelledPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch cancelled plans" });
  }
};
