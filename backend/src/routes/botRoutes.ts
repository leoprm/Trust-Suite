import { Router } from "express";
import { sendDocument } from "../controllers/botController";

const router = Router();

// POST /api/bot/send-document — send a sandbox file to the tree's Telegram chat
router.post("/send-document", sendDocument);

export default router;
