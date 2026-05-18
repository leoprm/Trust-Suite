import fs from "fs";
import path from "path";

export function appendToDailyLog(
  treeId: string,
  timestamp: Date,
  username: string,
  text: string,
  isAudio: boolean = false,
): void {
  const dateStr = timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = timestamp.toTimeString().slice(0, 5); // HH:MM
  const dir = path.join("conversations", treeId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${dateStr}.txt`);
  const prefix = isAudio ? "[🎤 audio]" : "";
  const line = `[${timeStr}] ${prefix} ${username}: ${text}\n`;
  fs.appendFileSync(filePath, line, "utf-8");
}
