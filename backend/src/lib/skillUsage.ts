import fs from "fs";
import path from "path";

const DEFAULT_SKILLS_DIR = path.join(
  process.env.HOME || "/home/leo",
  ".hermes/skills/trustmaker",
);

interface UsageData {
  usos: number;
  treeIds: string[];
  lastUsed: string;
}

/**
 * Incrementa el contador de uso de una skill global.
 * Crea ~/.hermes/skills/trustmaker/<skillName>.usos.json si no existe.
 */
export function incrementUsage(
  skillName: string,
  treeId: string,
  skillsDir?: string,
): void {
  const dir = skillsDir || DEFAULT_SKILLS_DIR;
  const filePath = path.join(dir, `${skillName}.usos.json`);

  let data: UsageData;

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      data = JSON.parse(raw);
    } catch {
      data = { usos: 1, treeIds: [treeId], lastUsed: new Date().toISOString() };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      return;
    }

    data.usos += 1;
    if (!data.treeIds.includes(treeId)) {
      data.treeIds.push(treeId);
    }
    data.lastUsed = new Date().toISOString();
  } else {
    data = { usos: 1, treeIds: [treeId], lastUsed: new Date().toISOString() };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Retorna el contenido de <skillName>.usos.json o null si no existe.
 */
export function getUsage(
  skillName: string,
  skillsDir?: string,
): UsageData | null {
  const dir = skillsDir || DEFAULT_SKILLS_DIR;
  const filePath = path.join(dir, `${skillName}.usos.json`);

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as UsageData;
  } catch {
    return null;
  }
}
