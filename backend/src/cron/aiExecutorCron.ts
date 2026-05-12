import { prisma } from '../index';
import { executeAITask } from '../services/aiExecutor';
import { releaseTask } from '../services/taskMatcher';
import { logEvent } from '../services/eventLogService';

const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Main AI Executor cycle: find WORKING AIs with claimed tasks,
 * execute or poll for completion.
 */
export async function runAIExecutor() {
  const startedAt = Date.now();
  console.log('[AIExecutor] Execution cycle started.');

  try {
    // 1. Release RATE_LIMITED AIs whose cooldown expired
    await releaseExpiredRateLimits();

    // 2. Find all WORKING AIs with claimed tasks
    const workingAIs = await prisma.treeMember.findMany({
      where: {
        isAI: true,
        aiStatus: 'WORKING',
      },
      include: {
        aiConfig: true,
        claimedTasks: {
          where: {
            status: { not: 'COMPLETED' },
            claimedByAI: { not: null },
          },
          include: {
            branch: { select: { treeId: true, name: true } },
            tags: { select: { skillName: true } },
            executions: {
              where: { status: { in: ['PENDING', 'RUNNING'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (workingAIs.length === 0) {
      console.log('[AIExecutor] No WORKING AIs with claimed tasks.');
      return;
    }

    console.log(`[AIExecutor] Found ${workingAIs.length} WORKING AI(s).`);

    let totalDispatched = 0;
    let totalPolled = 0;
    let totalDelivered = 0;
    let totalTimedOut = 0;
    let totalErrors = 0;

    for (const ai of workingAIs) {
      // Check if this AI has exceeded quota
      const quotaExceeded = (ai.aiConfig?.quotaUsed ?? 0) >= (ai.aiConfig?.quotaLimit ?? 100);
      if (quotaExceeded) {
        console.log(`[AIExecutor] AI ${ai.aiProfile || ai.id} has exceeded quota (${ai.aiConfig?.quotaUsed}/${ai.aiConfig?.quotaLimit})`);
        continue;
      }

      for (const task of ai.claimedTasks) {
        try {
          const result = await executeAITask(ai.id, task);

          switch (result.action) {
            case 'dispatched':
              totalDispatched++;
              break;
            case 'polling':
              totalPolled++;
              break;
            case 'delivered':
              totalDelivered++;
              break;
            case 'timed_out':
              totalTimedOut++;
              break;
            default:
              totalErrors++;
              console.warn(`[AIExecutor] Unexpected result for AI ${ai.id}, task ${task.id}: ${result.action}`);
          }
        } catch (err: any) {
          console.error(`[AIExecutor] Error processing AI ${ai.id}, task ${task.id}:`, err.message);
          totalErrors++;
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[AIExecutor] Cycle done in ${elapsed}ms. ` +
      `Dispatched: ${totalDispatched}, Polled: ${totalPolled}, ` +
      `Delivered: ${totalDelivered}, TimedOut: ${totalTimedOut}, Errors: ${totalErrors}`,
    );

    // Log summary
    void logEvent({
      actorId: null,
      action: 'AI_EXECUTOR_CYCLE_COMPLETED',
      entityType: 'System',
      metadataJson: {
        aisScanned: workingAIs.length,
        tasksDispatched: totalDispatched,
        tasksPolled: totalPolled,
        tasksDelivered: totalDelivered,
        tasksTimedOut: totalTimedOut,
        tasksErrored: totalErrors,
        elapsedMs: elapsed,
      },
      severity: 'INFO',
      source: 'AUTOMATION',
    });
  } catch (err: any) {
    console.error('[AIExecutor] Cron failed:', err.message);
  }
}

/**
 * Releases RATE_LIMITED AIs, resetting their quota and status to IDLE.
 */
async function releaseExpiredRateLimits() {
  try {
    const expiredAIs = await prisma.treeMember.findMany({
      where: {
        isAI: true,
        aiStatus: 'RATE_LIMITED',
      },
      select: { id: true, aiProfile: true },
    });

    for (const ai of expiredAIs) {
      await prisma.$transaction(async (tx) => {
        await tx.aIMemberConfig.update({
          where: { treeMemberId: ai.id },
          data: {
            quotaUsed: 0,
          },
        });
        await tx.treeMember.update({
          where: { id: ai.id },
          data: { aiStatus: 'IDLE' },
        });
      });

      console.log(`[AIExecutor] Released RATE_LIMITED AI ${ai.aiProfile || ai.id}`);

      void logEvent({
        actorId: null,
        action: 'AI_RATE_LIMIT_EXPIRED',
        entityType: 'TreeMember',
        entityId: ai.id,
        metadataJson: { reason: 'quota reset' },
        severity: 'INFO',
        source: 'AUTOMATION',
      });
    }
  } catch (err: any) {
    console.error('[AIExecutor] releaseExpiredRateLimits error:', err.message);
  }
}

/**
 * Start the 2-minute cron. Called from index.ts on server start.
 */
export function startAIExecutorCron() {
  console.log('[AIExecutor] Cron scheduled — every 2 minutes.');

  // Run on startup after a short delay (let other crons settle)
  setTimeout(() => {
    runAIExecutor().catch((err) =>
      console.error('[AIExecutor] Initial run failed:', err.message),
    );
  }, 10_000);

  // Then every 2 minutes
  setInterval(() => {
    runAIExecutor().catch((err) =>
      console.error('[AIExecutor] Cron run failed:', err.message),
    );
  }, INTERVAL_MS);
}
