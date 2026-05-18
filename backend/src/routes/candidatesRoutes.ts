import { Router } from "express";
import { registerCandidate, getCandidates, resolveCandidate } from "../controllers/candidatesController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

// POST /api/candidates — register as candidate (via Ari API key or JWT)
router.post("/", registerCandidate);

// GET /api/candidates — list candidates for a task (Ari API key only)
router.get("/", getCandidates);

// POST /api/candidates/resolve — resolve voting (Ari closes the 4h window)
router.post("/resolve", resolveCandidate);

export default router;
