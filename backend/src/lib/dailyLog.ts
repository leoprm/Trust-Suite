import fs from "fs";
import path from "path";

export function appendToDailyLog(
  treeId: string,
  timestamp: Date,
  username: string,
  text: string,
  isAudio: boolean = false,
  role: "user" | "assistant" = "user",
): void {
  const dateStr = timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = timestamp.toTimeString().slice(0, 5); // HH:MM
  const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
  const dir = path.join(sandboxBase, treeId, "conversations");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${dateStr}.txt`);
  const prefix = isAudio ? "[🎤 audio]" : "";
  const roleTag = role === "assistant" ? "[assistant]" : "[user]";
  const line = `[${timeStr}] ${prefix} ${roleTag} ${username}: ${text}\n`;
  fs.appendFileSync(filePath, line, "utf-8");
}
