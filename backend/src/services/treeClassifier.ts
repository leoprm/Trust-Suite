import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";

interface TreeClassification {
  type?: string;
  skills?: string[];
  classifiedAt?: string; // ISO timestamp
  [key: string]: unknown;
}

/**
 * Lee tree-classification.json de cada sandbox y, si el archivo es más reciente
 * que classificationUpdatedAt en DB, sincroniza el JSON a Tree.classification.
 */
async function syncAllTreeClassifications(
  prisma: PrismaClient
): Promise<number> {
  let synced = 0;

  // 1. Listar sandboxes
  let dirs: string[];
  try {
    dirs = fs.readdirSync(SANDBOX_BASE);
  } catch {
    console.log(`[TreeClassifier] Sandbox base not found: ${SANDBOX_BASE}`);
    return 0;
  }

  for (const dir of dirs) {
    const treeId = dir;
    const filePath = path.join(SANDBOX_BASE, treeId, "tree-classification.json");

    // 2. Leer archivo si existe
    let fileStat: fs.Stats;
    try {
      fileStat = fs.statSync(filePath);
      if (!fileStat.isFile()) continue;
    } catch {
      continue; // no file for this tree
    }

    // 3. Buscar el árbol en DB
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, classificationUpdatedAt: true },
    });

    if (!tree) continue;

    // 4. Comparar timestamps: mtime del archivo vs classificationUpdatedAt
    if (
      tree.classificationUpdatedAt &&
      fileStat.mtime <= tree.classificationUpdatedAt
    ) {
      continue; // ya está sincronizado
    }

    // 5. Leer y validar JSON
    let classification: TreeClassification;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      classification = JSON.parse(raw);
    } catch (err: any) {
      console.error(
        `[TreeClassifier] Invalid JSON for tree ${treeId}: ${err.message}`
      );
      continue;
    }

    // 6. Escribir a DB
    await prisma.tree.update({
      where: { id: treeId },
      data: {
        classification: classification as any,
        classificationUpdatedAt: new Date(),
      },
    });

    synced++;
    console.log(`[TreeClassifier] Synced classification for tree ${treeId}`);
  }

  return synced;
}

/**
 * Cron diario a medianoche.
 * Llama syncAllTreeClassifications y también se ejecuta inmediatamente al iniciar.
 */
export function startTreeClassifierCron(prisma: PrismaClient): void {
  // Ejecución inmediata al arrancar
  syncAllTreeClassifications(prisma)
    .then((count) => {
      if (count > 0)
        console.log(`[TreeClassifier] Startup: ${count} classification(s) synced`);
    })
    .catch((err) => {
      console.error("[TreeClassifier] Startup error:", err?.stack || err?.message || err);
    });

  // Calcular ms hasta medianoche
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msToMidnight = midnight.getTime() - now.getTime();

  // Primer tick a medianoche, luego cada 24h
  setTimeout(() => {
    syncAllTreeClassifications(prisma)
      .then((count) => {
        if (count > 0)
          console.log(
            `[TreeClassifier] Daily: ${count} classification(s) synced`
          );
      })
      .catch((err) => {
        console.error("[TreeClassifier] Daily error:", err?.stack || err?.message || err);
      });

    // Repetir cada 24h
    setInterval(() => {
      syncAllTreeClassifications(prisma)
        .then((count) => {
          if (count > 0)
            console.log(
              `[TreeClassifier] Daily: ${count} classification(s) synced`
            );
        })
        .catch((err) => {
          console.error("[TreeClassifier] Daily error:", err?.stack || err?.message || err);
        });
    }, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  console.log(
    `[TreeClassifier] Cron iniciado (próxima ejecución en ${Math.round(
      msToMidnight / 1000 / 60
    )} min, luego diario a medianoche)`
  );
}
