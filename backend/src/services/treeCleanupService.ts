import { PrismaClient } from "@prisma/client";

export async function processExpiredDeletions(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  let deleted = 0;

  const expired = await (prisma as any).tree.findMany({
    where: { pendingDeletionAt: { lte: now } },
    select: {
      id: true,
      name: true,
      parentTreeId: true,
      _count: { select: { childTrees: true } },
    },
  });

  for (const tree of expired) {
    try {
      const childrenCount = tree._count?.childTrees ?? 0;

      if (childrenCount > 0) {
        if (tree.parentTreeId) {
          await (prisma as any).tree.updateMany({
            where: { parentTreeId: tree.id },
            data: { parentTreeId: tree.parentTreeId },
          });
          console.log(
            `[TreeCleanup] ${childrenCount} hijos de "${tree.name}" → conectados al abuelo`
          );
        } else {
          await (prisma as any).tree.updateMany({
            where: { parentTreeId: tree.id },
            data: { parentTreeId: null },
          });
          console.log(
            `[TreeCleanup] ${childrenCount} hijos de "${tree.name}" → promovidos a raíz`
          );
        }
      }

      await (prisma as any).tree.delete({ where: { id: tree.id } });
      deleted++;
      console.log(`[TreeCleanup] Árbol eliminado: "${tree.name}" (${tree.id})`);
    } catch (err: any) {
      if (err?.code === "P2025") continue;
      console.error(`[TreeCleanup] Error eliminando "${tree.name}":`, err.message);
    }
  }

  return deleted;
}

export function startTreeCleanupCron(prisma: PrismaClient): void {
  processExpiredDeletions(prisma).then((count) => {
    if (count > 0) console.log(`[TreeCleanup] Inicial: ${count} árbol(es) eliminado(s)`);
  });

  setInterval(() => {
    processExpiredDeletions(prisma).then((count) => {
      if (count > 0) console.log(`[TreeCleanup] Periódica: ${count} árbol(es) eliminado(s)`);
    });
  }, 5 * 60 * 1000);

  console.log("[TreeCleanup] Cron iniciado (cada 5 min)");
}
