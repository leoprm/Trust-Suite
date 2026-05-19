import { Router } from "express";
import { receiveHiringResult } from "../controllers/hiringController";

const router = Router();

// POST /api/internal/hiring-result
router.post("/hiring-result", receiveHiringResult);

export default router;
