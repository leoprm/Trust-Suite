import { prisma } from '../index';
import { reviewBaseNeeds } from '../services/baseNeedService';

/**
 * Cron trimestral: revisa todas las necesidades Base.
 * Corre cada 90 días, alineado al primer día del trimestre
 * (1 enero, 1 abril, 1 julio, 1 octubre) a las 04:00 UTC.
 *
 * Usa setTimeout recursivo en lugar de setInterval porque 90 días (7.7B ms)
 * excede el límite de 32-bit signed integer (~2.14B ms) de Node.js.
 *
 * Lógica de degradación:
 *   - Cuenta usuarios VERIFIED actuales por árbol
 *   - Compara con threshold = 66% × baselineUserCount
 *   - Si 2 ciclos consecutivos por debajo → degrada a ACTIVE
 */
export async function runBaseNeedReview() {
  console.log('[BaseNeedReview] Starting quarterly review...');
  try {
    const result = await reviewBaseNeeds();
    console.log(
      `[BaseNeedReview] Done. Reviewed: ${result.reviewed}, Degraded: ${result.degraded}`
    );
  } catch (err: any) {
    console.error('[BaseNeedReview] Error:', err.message);
  }
}

/**
 * Schedule the next run and recursively re-schedule.
 * Uses a safe max delay of 20 days per setTimeout tick
 * to stay well under the 32-bit signed integer limit (~24.8 days).
 * On each tick, if the remaining wait exceeds 20 days, wait 20 days
 * and re-calculate; otherwise run and schedule next quarter.
 */
function scheduleNextRun() {
  // 20 days in ms — safely under 2^31-1 (~24.8 days)
  const MAX_TICK_MS = 20 * 24 * 60 * 60 * 1000;

  const now = new Date();
  const nextRun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 4, 0, 0)
  );

  // Avanzar hasta que sea un mes de trimestre (0, 3, 6, 9)
  while (nextRun.getUTCMonth() % 3 !== 0) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
  }
  if (nextRun <= now) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 3);
  }

  const msUntil = nextRun.getTime() - now.getTime();

  if (msUntil > MAX_TICK_MS) {
    // Too far ahead — wait 20 days and recalculate
    console.log(
      `[BaseNeedReview] Next run at ${nextRun.toISOString()} (${Math.round(msUntil / 1000 / 3600)}h away). Waiting 20 days to recalc.`
    );
    setTimeout(scheduleNextRun, MAX_TICK_MS);
  } else {
    console.log(
      `[BaseNeedReview] Scheduling next run at ${nextRun.toISOString()} (in ${Math.round(msUntil / 1000 / 3600)} hours).`
    );
    setTimeout(() => {
      runBaseNeedReview()
        .then(() => scheduleNextRun())
        .catch(err => {
          console.error('[BaseNeedReview] Run failed:', err.message);
          // Still schedule next attempt
          scheduleNextRun();
        });
    }, msUntil);
  }
}

export function startBaseNeedReviewCron() {
  scheduleNextRun();
}
