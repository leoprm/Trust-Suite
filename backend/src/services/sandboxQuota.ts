import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../index';

const execAsync = promisify(exec);

// ── Constants ──────────────────────────────────────────────────────────────
const QUOTA_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const THRESHOLD_STEP_BYTES = 100 * 1024 * 1024; // 100 MB per alert threshold
const CACHE_TTL_MS = 60_000; // 60 seconds
const QUOTA_STATE_FILE = '.quota_state';

interface QuotaState {
  notifiedThresholdsMB: number[];
  lastCheck: number; // epoch ms
}

export interface QuotaInfo {
  usedBytes: number;
  limitBytes: number;
  usedMB: number;
  exceeded: boolean;
  thresholdCrossedMB?: number; // the 100MB boundary just crossed (100, 200, ...)
  thresholdsNotified: number[];
}

// ── In-memory du cache ─────────────────────────────────────────────────────
const duCache = new Map<string, { size: number; ts: number }>();

/** Run `du -sb` on the sandbox workspace. Results cached for 60s. */
async function getDiskUsage(workspacePath: string): Promise<number> {
  const cached = duCache.get(workspacePath);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return cached.size;
  }

  try {
    const { stdout } = await execAsync(`du -sb "${workspacePath}"`, { timeout: 10_000 });
    // Output format: "123456\t/path"
    const match = stdout.match(/^(\d+)/);
    const size = match ? parseInt(match[1], 10) : 0;
    duCache.set(workspacePath, { size, ts: Date.now() });
    return size;
  } catch {
    // If du fails (e.g., dir doesn't exist), return 0
    return 0;
  }
}

/** Invalidate cache for a workspace (call after write/exec that may change disk). */
export function invalidateQuotaCache(workspacePath: string): void {
  duCache.delete(workspacePath);
}

/** Read .quota_state from the sandbox workspace. Returns null if not found. */
function readQuotaState(workspacePath: string): QuotaState | null {
  const statePath = path.join(workspacePath, QUOTA_STATE_FILE);
  try {
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(raw) as QuotaState;
    }
  } catch {
    // corrupt file → treat as absent
  }
  return null;
}

/** Write .quota_state to the sandbox workspace. */
function writeQuotaState(workspacePath: string, state: QuotaState): void {
  const statePath = path.join(workspacePath, QUOTA_STATE_FILE);
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state), 'utf-8');
  } catch (err: any) {
    console.error(`[sandboxQuota] Failed to write ${QUOTA_STATE_FILE}:`, err.message);
  }
}

/**
 * Check quota for a sandbox workspace.
 * - Runs `du -sb` with 60s cache
 * - Compares against 1GB limit
 * - Detects 100MB threshold crossings (only fires once per threshold)
 * - Updates `.quota_state` when a new threshold is crossed
 *
 * @returns QuotaInfo with usage, limit, and whether a new threshold was crossed
 */
async function checkQuota(workspacePath: string): Promise<QuotaInfo> {
  const usedBytes = await getDiskUsage(workspacePath);
  const usedMB = Math.floor(usedBytes / (1024 * 1024));
  const exceeded = usedBytes >= QUOTA_LIMIT_BYTES;

  const state = readQuotaState(workspacePath) || {
    notifiedThresholdsMB: [],
    lastCheck: 0,
  };

  // Find which 100MB thresholds have been crossed
  const maxThreshold = Math.floor(QUOTA_LIMIT_BYTES / THRESHOLD_STEP_BYTES); // 10 thresholds (100MB..1000MB)
  const currentThreshold = Math.floor(usedBytes / THRESHOLD_STEP_BYTES); // 0..10

  let thresholdCrossedMB: number | undefined;

  // Check all thresholds up to current
  for (let t = 1; t <= Math.min(currentThreshold, maxThreshold); t++) {
    const thresholdMB = t * 100;
    if (!state.notifiedThresholdsMB.includes(thresholdMB)) {
      thresholdCrossedMB = thresholdMB;
      state.notifiedThresholdsMB.push(thresholdMB);
      state.lastCheck = Date.now();
      writeQuotaState(workspacePath, state);
      break; // Only report the lowest newly-crossed threshold
    }
  }

  // Always update lastCheck
  if (!thresholdCrossedMB) {
    state.lastCheck = Date.now();
    writeQuotaState(workspacePath, state);
  }

  return {
    usedBytes,
    limitBytes: QUOTA_LIMIT_BYTES,
    usedMB,
    exceeded,
    thresholdCrossedMB,
    thresholdsNotified: state.notifiedThresholdsMB,
  };
}

/**
 * Send a quota alert to the tree's Telegram chat.
 * Looks up tree.telegramChatId and sends message via the bot.
 * Non-blocking — errors are logged but never thrown.
 */
async function sendQuotaAlert(
  treeId: string,
  usedMB: number,
  thresholdMB: number,
  exceeded: boolean,
): Promise<void> {
  try {
    // Look up tree chat
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { telegramChatId: true, name: true },
    });

    if (!tree?.telegramChatId) {
      console.warn(`[sandboxQuota] Tree ${treeId} has no telegramChatId — cannot send quota alert`);
      return;
    }

    // Lazy-import bot to avoid circular dependency issues
    const { telegramBot } = await import('../index');
    if (!telegramBot) {
      console.warn('[sandboxQuota] telegramBot not initialized — skipping quota alert');
      return;
    }

    const emoji = exceeded ? '🚫' : '⚠️';
    const pct = Math.round((usedMB / 1024) * 100);
    const msg = [
      `${emoji} *Quota de sandbox: ${usedMB} MB / 1 GB (${pct}%)*`,
      '',
      `Árbol: ${tree.name}`,
      exceeded
        ? '❌ *Límite excedido.* Escrituras bloqueadas hasta liberar espacio.'
        : `📊 Alerta: se alcanzaron los ${thresholdMB} MB. Quedan ${1024 - usedMB} MB disponibles.`,
      '',
      '💡 Liberá espacio eliminando archivos grandes del sandbox.',
    ].join('\n');

    await telegramBot.api.sendMessage(tree.telegramChatId, msg, { parse_mode: 'Markdown' });
    console.log(`[sandboxQuota] Alert sent to tree ${treeId}: ${usedMB}MB (threshold ${thresholdMB}MB)`);
  } catch (err: any) {
    console.error(`[sandboxQuota] Failed to send quota alert for tree ${treeId}:`, err.message);
  }
}

/**
 * Full check + alert pipeline. Call after write/exec operations.
 * - Invalidates du cache to get fresh reading
 * - Checks quota
 * - If threshold crossed, sends alert (non-blocking)
 * - Returns whether quota is exceeded (caller should block writes if true)
 */
export async function checkQuotaAfterOp(
  workspacePath: string,
  treeId: string,
): Promise<{ exceeded: boolean; thresholdCrossedMB?: number }> {
  invalidateQuotaCache(workspacePath);
  const result = await checkQuota(workspacePath);

  if (result.thresholdCrossedMB) {
    // Fire alert in background — don't block the response
    sendQuotaAlert(treeId, result.usedMB, result.thresholdCrossedMB, result.exceeded)
      .catch(err => console.error('[sandboxQuota] Alert error:', err.message));
  }

  return {
    exceeded: result.exceeded,
    thresholdCrossedMB: result.thresholdCrossedMB,
  };
}

/**
 * Get quota info for the GET endpoint (no side effects, no alerts).
 */
export async function getQuotaInfo(workspacePath: string): Promise<QuotaInfo> {
  // Use cache if available, but still read state
  const usedBytes = await getDiskUsage(workspacePath);
  const usedMB = Math.floor(usedBytes / (1024 * 1024));
  const exceeded = usedBytes >= QUOTA_LIMIT_BYTES;

  const state = readQuotaState(workspacePath);

  return {
    usedBytes,
    limitBytes: QUOTA_LIMIT_BYTES,
    usedMB,
    exceeded,
    thresholdsNotified: state?.notifiedThresholdsMB ?? [],
  };
}
