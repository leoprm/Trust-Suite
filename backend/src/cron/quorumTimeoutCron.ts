import { prisma } from '../index';
import { createNotification } from '../controllers/notificationController';

/**
 * Daily cron: check needs with relevance met but quorum not met.
 * - 14 days → notify non-voters
 * - 30 days → force quorumMet = true
 */
export async function runQuorumTimeoutCheck() {
  console.log('[QuorumTimeout] Checking quorum timeouts...');

  try {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find needs with relevance met but quorum not met
    const needs = await (prisma as any).need.findMany({
      where: {
        relevanceThresholdMet: true,
        quorumMet: false,
        status: 'ACTIVE',
        relevanceMetAt: { lte: fourteenDaysAgo }, // at least 14 days old
      },
      select: {
        id: true,
        title: true,
        relevanceMetAt: true,
        treeLinks: { select: { treeId: true } },
      },
    });

    let notified = 0;
    let forced = 0;

    for (const need of needs) {
      const ageMs = now.getTime() - new Date(need.relevanceMetAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      // ── 30-day timeout: force quorum ──────────────────────────────────
      if (ageDays >= 30) {
        await prisma.need.update({
          where: { id: need.id },
          data: { status: 'COMPLETED' },
        });
        console.log(`[QuorumTimeout] Need "${need.title}" — ${ageDays}d elapsed, quorum forced.`);
        forced++;
        continue;
      }

      // ── 14-day timeout: notify non-voters ─────────────────────────────
      if (ageDays >= 14 && ageDays < 30) {
        // Find funders who haven't liked any idea
        const fundings = await prisma.needFunding.findMany({
          where: { needId: need.id },
          select: { userId: true },
        });
        const funderIds = [...new Set(fundings.map(f => f.userId))];

        const ideas = await prisma.idea.findMany({
          where: { needId: need.id },
          include: { likes: { select: { userId: true } } },
        });

        const likerIds = new Set<string>();
        for (const idea of ideas) {
          for (const like of idea.likes) {
            likerIds.add(like.userId);
          }
        }

        const nonVoters = funderIds.filter(fid => !likerIds.has(fid));

        for (const userId of nonVoters) {
          await createNotification({
            userId,
            type: 'RECORDATORIO',
            category: 'ARBOL',
            title: '📢 Tu voto es necesario',
            body: `La necesidad "${need.title}" necesita tu voto. Solo el ${Math.round(likerIds.size/funderIds.length*100)}% de los afectados ha votado. Quedan ${30-ageDays} días antes del cierre automático.`,
            entityType: 'NEED',
            entityAction: 'VOTE',
            entityId: need.id,
          });
        }

        if (nonVoters.length > 0) {
          console.log(`[QuorumTimeout] Need "${need.title}" — ${ageDays}d, notified ${nonVoters.length} non-voters.`);
          notified += nonVoters.length;
        }
      }
    }

    console.log(`[QuorumTimeout] Done. Forced: ${forced}, Notified: ${notified}`);

  } catch (err: any) {
    console.error('[QuorumTimeout] Error:', err.message);
  }
}

/**
 * Start the daily quorum timeout cron.
 * Runs at 03:00 UTC every day.
 */
export function startQuorumTimeoutCron() {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setUTCHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);

  const msUntil3am = next3am.getTime() - now.getTime();
  console.log(`[QuorumTimeout] Daily cron scheduled. First run in ${Math.round(msUntil3am / 1000 / 60)} minutes (next 03:00 UTC).`);

  setTimeout(() => {
    runQuorumTimeoutCheck().catch(err =>
      console.error('[QuorumTimeout] Run failed:', err.message)
    );
    setInterval(() => {
      runQuorumTimeoutCheck().catch(err =>
        console.error('[QuorumTimeout] Run failed:', err.message)
      );
    }, 24 * 60 * 60 * 1000);
  }, msUntil3am);
}
