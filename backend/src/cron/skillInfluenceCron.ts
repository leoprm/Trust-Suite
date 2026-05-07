import { prisma } from '../index';
import { calculateSkillInfluence } from '../services/skillInfluenceService';

/**
 * Daily cron: recalculate influence weights for all active skills across all trees.
 * Runs at 02:00 UTC every day.
 */
export async function runDailyInfluenceCron() {
  console.log('[SkillInfluence] Daily influence recalculation started.');

  try {
    // 1. Get all active trees
    const trees = await prisma.tree.findMany({
      select: { id: true, name: true },
    });

    // 2. Get all distinct skill tags from completed tasks
    const allTags = await (prisma as any).task.findMany({
      where: { status: 'COMPLETED' },
      select: { tags: { select: { skillName: true } } },
    });

    const uniqueSkills = new Set<string>();
    for (const t of allTags) {
      for (const tag of t.tags) {
        if (tag.skillName) uniqueSkills.add(tag.skillName);
      }
    }

    // Also include skills from tree members
    const memberSkills = await prisma.treeMember.findMany({
      where: { status: 'VERIFIED' },
      select: { skills: true },
    });

    for (const m of memberSkills) {
      try {
        const parsed: string[] = JSON.parse(m.skills || '[]');
        for (const s of parsed) uniqueSkills.add(s);
      } catch {}
    }

    const skills = [...uniqueSkills];
    console.log(`[SkillInfluence] Processing ${trees.length} trees × ${skills.length} skills`);

    let processed = 0;
    let errors = 0;

    for (const tree of trees) {
      for (const skill of skills) {
        try {
          await calculateSkillInfluence(tree.id, skill);
          processed++;
        } catch (err: any) {
          console.error(`[SkillInfluence] Error for tree=${tree.id} skill=${skill}:`, err.message);
          errors++;
        }
      }
    }

    console.log(`[SkillInfluence] Done. Processed: ${processed}, Errors: ${errors}`);

    // 3. Cleanup: remove influence records for skills that no longer exist
    // (Keep them — they become stale but safe. They'll be recalculated if the skill reappears.)

  } catch (err: any) {
    console.error('[SkillInfluence] Cron failed:', err.message);
  }
}

/**
 * Start the daily cron job.
 * Called from index.ts on server start.
 */
export function startSkillInfluenceCron() {
  // Run immediately on startup
  runDailyInfluenceCron().catch(err =>
    console.error('[SkillInfluence] Initial run failed:', err.message)
  );

  // Schedule daily at 02:00 UTC
  const now = new Date();
  const next2am = new Date(now);
  next2am.setUTCHours(2, 0, 0, 0);
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1);

  const msUntil2am = next2am.getTime() - now.getTime();
  console.log(`[SkillInfluence] Daily cron scheduled. First run in ${Math.round(msUntil2am / 1000 / 60)} minutes (next 02:00 UTC).`);

  setTimeout(() => {
    runDailyInfluenceCron().catch(err =>
      console.error('[SkillInfluence] Cron run failed:', err.message)
    );
    // Then repeat every 24h
    setInterval(() => {
      runDailyInfluenceCron().catch(err =>
        console.error('[SkillInfluence] Cron run failed:', err.message)
      );
    }, 24 * 60 * 60 * 1000);
  }, msUntil2am);
}
