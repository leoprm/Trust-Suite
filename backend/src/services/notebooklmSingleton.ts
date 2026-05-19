/**
 * NotebookLM Bridge Singleton — lazy-initialized, auto-starting wrapper.
 *
 * Provides fire-and-forget helpers for tree lifecycle hooks.
 * The bridge spawns a Python subprocess on first use and stays alive
 * for the lifetime of the Node.js process.
 *
 * Usage:
 *   import { createNotebook, deleteNotebook } from './notebooklmSingleton';
 *   createNotebook(treeId).catch(log);  // fire-and-forget
 */

import { NotebookLMBridge } from './notebooklmBridge';

let bridge: NotebookLMBridge | null = null;

function getBridge(): NotebookLMBridge {
  if (!bridge) {
    bridge = new NotebookLMBridge();
  }
  return bridge;
}

export async function createNotebook(treeId: string): Promise<void> {
  try {
    const b = getBridge();
    await b.createNotebook(treeId);
    console.log(`[notebooklm] Notebook created for tree ${treeId.slice(0, 8)}…`);
  } catch (err: any) {
    console.error(
      `[notebooklm] createNotebook failed for tree ${treeId.slice(0, 8)}…:`,
      err?.message || err
    );
  }
}

export async function deleteNotebook(treeId: string): Promise<void> {
  try {
    const b = getBridge();
    await b.deleteNotebook(treeId);
    console.log(`[notebooklm] Notebook deleted for tree ${treeId.slice(0, 8)}…`);
  } catch (err: any) {
    console.error(
      `[notebooklm] deleteNotebook failed for tree ${treeId.slice(0, 8)}…:`,
      err?.message || err
    );
  }
}
