import { Router } from "express";
import { sendDocument, sendMessage } from "../controllers/botController";

const router = Router();

// POST /api/bot/send-document — send a sandbox file to the tree's Telegram chat
router.post("/send-document", sendDocument);

// POST /api/bot/send-message — send a text message (optionally with inline keyboard)
router.post("/send-message", sendMessage);

export default router;
