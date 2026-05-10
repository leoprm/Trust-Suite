import { processDailySubscriptionCheck } from '../services/subscriptionService';

/**
 * Daily cron: check subscription states for all members.
 * - ACTIVE members with expired paymentDueDate → GRACE
 * - GRACE members past 7-day grace → SUSPENDED
 * Runs at 02:00 UTC every day.
 */
export async function runSubscriptionCron() {
  console.log('[SubscriptionCron] Daily subscription check started.');
  try {
    const result = await processDailySubscriptionCheck();
    console.log(`[SubscriptionCron] Done. Grace: ${result.enteredGrace}, Suspended: ${result.suspended}, Errors: ${result.errors}`);
  } catch (err: any) {
    console.error('[SubscriptionCron] Cron failed:', err.message);
  }
}

/**
 * Start the daily cron job.
 * Called from index.ts on server start.
 */
export function startSubscriptionCron() {
  // Run immediately on startup
  runSubscriptionCron().catch(err =>
    console.error('[SubscriptionCron] Initial run failed:', err.message)
  );

  // Schedule daily at 02:00 UTC
  const now = new Date();
  const next2am = new Date(now);
  next2am.setUTCHours(2, 0, 0, 0);
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1);

  const msUntil2am = next2am.getTime() - now.getTime();
  console.log(`[SubscriptionCron] Daily cron scheduled. First run in ${Math.round(msUntil2am / 1000 / 60)} minutes (next 02:00 UTC).`);

  setTimeout(() => {
    runSubscriptionCron().catch(err =>
      console.error('[SubscriptionCron] Cron run failed:', err.message)
    );
    // Then repeat every 24h
    setInterval(() => {
      runSubscriptionCron().catch(err =>
        console.error('[SubscriptionCron] Cron run failed:', err.message)
      );
    }, 24 * 60 * 60 * 1000);
  }, msUntil2am);
}
