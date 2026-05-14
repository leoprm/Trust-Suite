/**
 * cron/disputeResolutionCron.ts
 *
 * Delegates to the bot-based dispute resolution cron.
 * The actual cron schedule is registered in bot/scheduler.ts.
 * This file exists so index.ts can call a one-shot or manual trigger.
 */

import { prisma } from "../index";

// bot instance is not available here — the scheduler already runs this.
// For manual triggers, the bot version in bot/disputeResolutionCron.ts
// is the canonical implementation.

export function startDisputeResolutionCron(): void {
  console.log(
    "[DisputeCron] Dispute resolution is handled by bot/scheduler.ts (every 15 min).",
  );
}
