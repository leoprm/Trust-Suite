import { Router } from "express";
import { authenticateJWT, requireAdmin } from "../middleware/authMiddleware";
import { getWaitlist } from "../controllers/adminController";

const router = Router();

// Admin-only: waitlist access
router.get("/waitlist", authenticateJWT, requireAdmin, getWaitlist);

export default router;
