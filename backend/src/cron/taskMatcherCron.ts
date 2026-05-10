import { prisma } from '../index';
import { findMatchingTasks, claimTask } from '../services/taskMatcher';
import { logEvent } from '../services/eventLogService';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CLAIMS_PER_RUN = 10; // safety cap — avoid runaway claiming

/**
 * Main matching cycle: find all IDLE AIs with autoClaimEnabled,
 * find their best matching tasks, and claim top-ranked tasks.
 */
export async function runTaskMatcher() {
  const startedAt = Date.now();
  console.log('[TaskMatcher] Matching cycle started.');

  try {
    // 1. Find all AI members with autoClaimEnabled=true and IDLE status
    const aiMembers = await prisma.treeMember.findMany({
      where: {
        isAI: true,
        aiStatus: 'IDLE',
        aiConfig: { autoClaimEnabled: true },
      },
      include: { aiConfig: true },
    });

    if (aiMembers.length === 0) {
      console.log('[TaskMatcher] No IDLE AI members with autoClaim enabled.');
      return;
    }

    console.log(`[TaskMatcher] Found ${aiMembers.length} IDLE AI(s) with autoClaim.`);

    let totalClaimed = 0;
    let totalSkipped = 0;

    for (const ai of aiMembers) {
      if (totalClaimed >= MAX_CLAIMS_PER_RUN) {
        console.log(`[TaskMatcher] Safety cap reached (${MAX_CLAIMS_PER_RUN} claims). Stopping.`);
        break;
      }

      try {
        const matches = await findMatchingTasks(ai.id);

        if (matches.length === 0) {
          totalSkipped++;
          continue;
        }

        // Claim the best match
        const best = matches[0];
        const result = await claimTask(ai.id, best.task.id);

        if (result.success) {
          totalClaimed++;
          console.log(
            `[TaskMatcher] ${ai.aiProfile || ai.id} claimed task ` +
            `"${best.task.name}" (skill match: ${best.score}%, phase: ${best.task.phase})`,
          );
        } else {
          totalSkipped++;
          console.warn(
            `[TaskMatcher] ${ai.aiProfile || ai.id} failed to claim ` +
            `"${best.task.name}": ${result.error}`,
          );
        }
      } catch (err: any) {
        console.error(`[TaskMatcher] Error processing AI ${ai.id}:`, err.message);
        totalSkipped++;
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[TaskMatcher] Cycle done in ${elapsed}ms. ` +
      `Claimed: ${totalClaimed}, Skipped: ${totalSkipped}, ` +
      `AIs processed: ${aiMembers.length}`,
    );

    // Log summary
    void logEvent({
      actorId: null,
      action: 'TASK_MATCHER_CYCLE_COMPLETED',
      entityType: 'System',
      metadataJson: {
        aiMembersScanned: aiMembers.length,
        tasksClaimed: totalClaimed,
        tasksSkipped: totalSkipped,
        elapsedMs: elapsed,
      },
      severity: 'INFO',
      source: 'AUTOMATION',
    });
  } catch (err: any) {
    console.error('[TaskMatcher] Cron failed:', err.message);
  }
}

/**
 * Start the 5-minute cron. Called from index.ts on server start.
 */
export function startTaskMatcherCron() {
  console.log('[TaskMatcher] Cron scheduled — every 5 minutes.');

  // Run immediately on startup
  runTaskMatcher().catch((err) =>
    console.error('[TaskMatcher] Initial run failed:', err.message),
  );

  // Then every 5 minutes
  setInterval(() => {
    runTaskMatcher().catch((err) =>
      console.error('[TaskMatcher] Cron run failed:', err.message),
    );
  }, INTERVAL_MS);
}
