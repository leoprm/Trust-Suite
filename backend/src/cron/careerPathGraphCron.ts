import cron from 'node-cron';
import { prisma } from '../index';
import { buildGraph, invalidateCache } from '../services/careerPathService';

/**
 * Hourly cron: rebuild career path graphs for ALL trees.
 * Runs at minute 30 of every hour — does NOT collide with
 * skillPercentile (:15) or skillInfluence (02:00 UTC daily).
 */
export async function runCareerPathGraphCron() {
  console.log('[CareerPathGraph] Hourly graph rebuild started.');

  try {
    const trees = await prisma.tree.findMany({
      select: { id: true, name: true },
    });

    let processed = 0;
    let errors = 0;

    for (const tree of trees) {
      try {
        // Force rebuild by invalidating cache first, then building fresh
        invalidateCache(tree.id);
        const graph = await buildGraph(tree.id, true);

        const nodeCount = graph.nodes.size;
        let edgeCount = 0;
        for (const [, targets] of graph.edges) {
          edgeCount += targets.size;
        }

        console.log(
          `[CareerPathGraph] tree=${tree.id} name="${tree.name}" ` +
          `skills=${nodeCount} edges=${edgeCount} coldStart=${graph.isColdStart}`,
        );
        processed++;
      } catch (err: any) {
        console.error(
          `[CareerPathGraph] Error for tree=${tree.id} name="${tree.name}":`,
          err.message,
        );
        errors++;
      }
    }

    console.log(
      `[CareerPathGraph] Done. Processed: ${processed}/${trees.length}, Errors: ${errors}`,
    );
  } catch (err: any) {
    console.error('[CareerPathGraph] Cron failed:', err.message);
  }
}

/**
 * Start the hourly cron job + run once immediately on startup.
 * Called from index.ts on server start.
 */
export function startCareerPathGraphCron() {
  // Initial run at startup — don't wait a full hour
  runCareerPathGraphCron().catch(err =>
    console.error('[CareerPathGraph] Initial run failed:', err.message),
  );

  // Schedule hourly at minute 30
  cron.schedule('30 * * * *', async () => {
    await runCareerPathGraphCron();
  });

  console.log('[CareerPathGraph] Hourly cron registered (every hour at :30).');
}
