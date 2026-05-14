import { prisma } from '../index';

/**
 * destroySandbox — cleanup hook called when a tree is deleted.
 *
 * Currently a stub: cleans up the TreeSandbox DB record (the Prisma cascade
 * also handles this, but explicit cleanup allows future expansion — Docker
 * container teardown, filesystem cleanup, port release, etc.).
 *
 * Callers MUST wrap this in try/catch — failures here should never block
 * the tree deletion itself.
 */
export async function destroySandbox(treeId: string): Promise<void> {
  // 1. Delete the TreeSandbox row if it exists (belt-and-suspenders with cascade)
  try {
    await prisma.treeSandbox.delete({ where: { treeId } });
    console.log(`[sandboxService] Sandbox record deleted for tree ${treeId.slice(0, 8)}…`);
  } catch (err: any) {
    // P2025 = record not found — expected if tree had no sandbox
    if (err?.code === 'P2025') {
      console.log(`[sandboxService] No sandbox record for tree ${treeId.slice(0, 8)}…`);
    } else {
      throw err;
    }
  }

  // 2. Future: Docker container teardown, filesystem cleanup, port release
  //    Placeholder for when sandbox runtime is implemented.
}
