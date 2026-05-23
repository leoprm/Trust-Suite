import fs from "fs";
import path from "path";

const PHI = 1.618;
const MAX_ITERATIONS = 7;
const BASE_SIZE = 30; // mensajes mínimos en primera iteración
const ONE_HOUR_MS = 60 * 60 * 1000;
const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";

interface ParsedMessage {
  time: string;
  role: "user" | "assistant";
  name: string;
  text: string;
}

/**
 * Lee las conversaciones del sandbox del árbol y devuelve un chunk
 * progresivo con factor φ=1.618.
 *
 * @param treeId - ID del árbol
 * @param iteration - número de iteración (1-based). 1 = últimos ~30 mensajes,
 *                    2 = 48, 3 = 78, ..., 7 = ~538 mensajes.
 * @returns string con las últimas conversaciones formateadas, o "" si no hay
 */
export function loadChatHistory(treeId: string, iteration: number = 1): string {
  const clampedIteration = Math.max(1, Math.min(iteration, MAX_ITERATIONS));
  const targetCount = Math.round(BASE_SIZE * Math.pow(PHI, clampedIteration - 1));

  const convDir = path.join(SANDBOX_BASE, treeId, "conversations");
  if (!fs.existsSync(convDir)) return "";

  // Leer archivos de conversación, ordenados por fecha descendente
  const files = fs
    .readdirSync(convDir)
    .filter((f) => f.match(/^\d{4}-\d{2}-\d{2}\.txt$/))
    .sort()
    .reverse();

  if (files.length === 0) return "";

  // Parsear todas las líneas
  const allMessages: ParsedMessage[] = [];
  for (const file of files) {
    const filePath = path.join(convDir, file);
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (parsed) allMessages.push(parsed);
    }
  }

  if (allMessages.length === 0) return "";

  // Calcular cutoff: el mayor entre (última hora) y (targetCount mensajes)
  const now = Date.now();
  const oneHourAgo = now - ONE_HOUR_MS;

  // Contar mensajes de la última hora desde el final
  let lastHourCount = 0;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    // El timestamp está en el archivo, no tenemos ms exacto.
    // Usamos heurística: asumimos que los últimos mensajes son más recientes.
    // Si targetCount >= los últimos 1h, usamos targetCount.
    // De lo contrario usamos lastHourCount.
    lastHourCount++;
    // Como no tenemos timestamps absolutos por línea, asumimos
    // que la densidad de mensajes es uniforme y que los últimos
    // N mensajes incluyen la última hora si N >= 30.
  }

  // Estrategia: tomamos los últimos max(targetCount, 30 mensajes "hora")
  const effectiveCount = Math.max(targetCount, Math.min(lastHourCount, 30));
  const startIndex = Math.max(0, allMessages.length - effectiveCount);
  const chunk = allMessages.slice(startIndex);

  // Formatear
  return chunk
    .map((m) => `[${m.time}] [${m.role}] ${m.name}: ${m.text}`)
    .join("\n");
}

function parseLogLine(line: string): ParsedMessage | null {
  // Formato: [HH:MM] [role] name: text
  // O:      [HH:MM] [🎤 audio] [role] name: text
  const match = line.match(
    /^\[(\d{2}:\d{2})\]\s*(?:\[.*?\]\s*)?\[(user|assistant)\]\s+([^:]+):\s*(.*)$/
  );
  if (!match) return null;
  return {
    time: match[1],
    role: match[2] as "user" | "assistant",
    name: match[3].trim(),
    text: match[4],
  };
}
