import { Router } from "express";
import { createCancelledPlan, getCancelledPlans } from "../controllers/cancelledPlansController";

const router = Router();

// POST /api/cancelled-plans — Ari saves a cancelled task plan
router.post("/", createCancelledPlan);

// GET /api/cancelled-plans — list cancelled plans for a tree
router.get("/", getCancelledPlans);

export default router;
