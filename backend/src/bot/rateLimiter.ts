/**
 * In-memory rate limiter per user.
 *
 * Rules:
 *   - 3 messages allowed per 60-second window
 *   - Exceeding → 5-minute cooldown
 *   - Cleanup: stale entries (window + cooldown elapsed) pruned on each check
 */

interface RateLimitEntry {
  count: number;
  windowStart: number; // ms timestamp
  cooldownUntil: number; // ms timestamp, 0 = no active cooldown
}

const limits = new Map<number, RateLimitEntry>();

const MAX_MESSAGES = 3;
const WINDOW_MS = 60_000; // 60 seconds
const COOLDOWN_MS = 5 * 60_000; // 5 minutes

const BLOCK_MESSAGE = "⏳ Estás enviando muchos mensajes. Espera 5 minutos.";

export function checkRateLimit(
  userId: number,
): { allowed: boolean; message?: string } {
  const now = Date.now();
  let entry = limits.get(userId);

  // ── Cleanup: drop stale entries ──────────────────────────────────────
  if (entry) {
    const cooldownExpired = entry.cooldownUntil > 0 && now >= entry.cooldownUntil;
    const windowExpired = now - entry.windowStart > WINDOW_MS;

    if (cooldownExpired && windowExpired) {
      // Entry is fully stale — reset
      limits.delete(userId);
      entry = undefined;
    } else if (cooldownExpired && !windowExpired) {
      // Cooldown finished but window still active → reset cooldown, keep window
      entry.cooldownUntil = 0;
    }
  }

  // ── Active cooldown ──────────────────────────────────────────────────
  if (entry && entry.cooldownUntil > 0 && now < entry.cooldownUntil) {
    const remaining = Math.ceil((entry.cooldownUntil - now) / 60_000);
    return {
      allowed: false,
      message: `⏳ Estás enviando muchos mensajes. Espera ${remaining} ${remaining === 1 ? "minuto" : "minutos"}.`,
    };
  }

  // ── Fresh window ─────────────────────────────────────────────────────
  if (!entry) {
    limits.set(userId, { count: 1, windowStart: now, cooldownUntil: 0 });
    return { allowed: true };
  }

  // ── Window expired → reset ───────────────────────────────────────────
  if (now - entry.windowStart > WINDOW_MS) {
    limits.set(userId, { count: 1, windowStart: now, cooldownUntil: 0 });
    return { allowed: true };
  }

  // ── Within window ────────────────────────────────────────────────────
  entry.count += 1;

  if (entry.count > MAX_MESSAGES) {
    entry.cooldownUntil = now + COOLDOWN_MS;
    return { allowed: false, message: BLOCK_MESSAGE };
  }

  return { allowed: true };
}

/** Return number of entries currently tracked (for monitoring). */
export function getRateLimitStats(): { trackedUsers: number } {
  return { trackedUsers: limits.size };
}
