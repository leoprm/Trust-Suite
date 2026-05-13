import { Router } from "express";
import { runInference, getJobStatus } from "../controllers/inferenceController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

// POST /api/inference/run — encolar inferencia
router.post("/run", authenticateJWT, runInference);

// GET /api/inference/jobs/:id — estado del job
router.get("/jobs/:id", authenticateJWT, getJobStatus);

export default router;
