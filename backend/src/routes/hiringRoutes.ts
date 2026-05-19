import { Router } from "express";
import { receiveHiringResult, triggerHiringScan } from "../controllers/hiringController";

const router = Router();

// POST /api/internal/hiring-result
router.post("/hiring-result", receiveHiringResult);

// POST /api/internal/hiring-scan (debug: manual trigger)
router.post("/hiring-scan", triggerHiringScan);

export default router;
