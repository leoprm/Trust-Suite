import { Router } from "express";
import { listModels, downloadModel } from "../controllers/modelController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

// POST /api/models — listar modelos
router.post("/", authenticateJWT, listModels);
router.post("", authenticateJWT, listModels);

// POST /api/models/download — iniciar descarga
router.post("/download", authenticateJWT, downloadModel);

export default router;
