/**
 * Hermes API key resolver.
 *
 * Unified accessor for the Hermes Agent API key across the bridge module.
 * Replaces scattered inline process.env.HERMES_API_SERVER_KEY reads.
 */

const SUPPORT_HERMES_API_KEY =
  process.env.HERMES_SUPPORT_API_KEY ||
  process.env.SUPPORT_HERMES_API_KEY ||
  "";

/**
 * Returns the appropriate Hermes API key for the given context.
 *
 * With a treeId → HERMES_API_SERVER_KEY (tree-scoped Hermes Agent).
 * Without a treeId → SUPPORT_HERMES_API_KEY (support/global Hermes Agent).
 */
export function getHermesApiKey(treeId: string | null): string {
  if (treeId) {
    return process.env.HERMES_API_SERVER_KEY ?? "";
  }
  return SUPPORT_HERMES_API_KEY;
}
