// ── ByoBackpressure Service ────────────────────────────────────────────────
// Tracks concurrent requests per user:provider pair.
// On 429 from upstream, halves maxParallel for 5 minutes, then auto-restores.

interface ThrottleEntry {
  reduced: number;      // the throttled maxParallel value
  original: number;     // the original maxParallel to restore
  until: number;        // epoch ms when the throttle expires
}

// In-flight concurrent counter: key = "userId:provider"
const inflight = new Map<string, number>();

// Active throttles: key = "userId:provider"
const throttles = new Map<string, ThrottleEntry>();

/**
 * Returns the currently allowed maxParallel for a user:provider,
 * considering any active throttle.
 */
export function effectiveMaxParallel(userId: string, provider: string, dbMaxParallel: number): number {
  const key = `${userId}:${provider}`;
  const throttle = throttles.get(key);
  if (throttle && Date.now() < throttle.until) {
    return throttle.reduced;
  }
  // Expired throttle — restore
  if (throttle) {
    throttles.delete(key);
  }
  return dbMaxParallel;
}

/**
 * Attempts to acquire a concurrency slot. Returns true if allowed, false if at capacity.
 */
export function tryAcquire(userId: string, provider: string, maxParallel: number): boolean {
  const key = `${userId}:${provider}`;
  const current = inflight.get(key) || 0;
  const effective = effectiveMaxParallel(userId, provider, maxParallel);
  if (current >= effective) {
    return false;
  }
  inflight.set(key, current + 1);
  return true;
}

/**
 * Releases a concurrency slot.
 */
export function release(userId: string, provider: string): void {
  const key = `${userId}:${provider}`;
  const current = inflight.get(key) || 1;
  if (current <= 1) {
    inflight.delete(key);
  } else {
    inflight.set(key, current - 1);
  }
}

/**
 * Called when an upstream provider returns 429.
 * Halves maxParallel (floor, min 1) for 5 minutes.
 * Returns the new (throttled) value.
 */
export function onRateLimited(userId: string, provider: string, originalMaxParallel: number): number {
  const key = `${userId}:${provider}`;
  const existing = throttles.get(key);
  if (existing && Date.now() < existing.until) {
    // Already throttled — halve again
    const newReduced = Math.max(1, Math.floor(existing.reduced / 2));
    existing.reduced = newReduced;
    existing.until = Date.now() + 5 * 60 * 1000;
    return newReduced;
  }
  const reduced = Math.max(1, Math.floor(originalMaxParallel / 2));
  throttles.set(key, {
    reduced,
    original: originalMaxParallel,
    until: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  return reduced;
}

/**
 * Returns current backpressure stats (for debugging/monitoring).
 */
export function getStats(): Record<string, { inflight: number; throttle?: ThrottleEntry }> {
  const stats: Record<string, { inflight: number; throttle?: ThrottleEntry }> = {};
  inflight.forEach((count, key) => {
    stats[key] = { inflight: count };
    const t = throttles.get(key);
    if (t && Date.now() < t.until) {
      stats[key].throttle = t;
    }
  });
  return stats;
}
