import cron from 'node-cron';
import { prisma } from '../index';

export const startCronJobs = () => {
  // Weekly Job: Every Sunday at Midnight
  // (Note: point renewal is now monthly — see monthlyNeedPointsCron)
  cron.schedule('0 0 * * 0', async () => {
    console.log('Running Weekly Loop...');
    try {
      // Resolve active needs (exclude SEDIMENTED — handled by monthly sedimentation)
      const activeNeeds = await prisma.need.findMany({
        where: { status: 'ACTIVE' },
        include: {
          ideas: { orderBy: { likesCount: 'desc' } },
          treeLinks: { select: { treeId: true } }
        }
      });

      for (const need of activeNeeds) {
        if (need.ideas.length === 0) {
          // Failed attempt: no ideas
          await prisma.need.update({
            where: { id: need.id },
            data: { failedAttempts: { increment: 1 } }
          });
          continue;
        }

        const topIdeas = need.ideas.slice(0, 3);
        const multiplier = Math.max(1, need.failedAttempts);
        const xpReward = need.totalPointsAssigned * multiplier;
        const treeId = need.treeLinks?.[0]?.treeId;

        // Reward the creators of the top 3 ideas in the tree they earned it
        for (const idea of topIdeas) {
          if (treeId) {
            await prisma.treeMember.updateMany({
              where: { userId: idea.creatorId, treeId },
              data: { xp: { increment: xpReward } }
            });
          }
        }

        // The BEST idea becomes a Branch
        const winningIdea = topIdeas[0];
        
        // Ensure no branch already exists for this idea (safety check)
        const existingBranch = await prisma.branch.findUnique({ where: { ideaId: winningIdea.id } });
        if (!existingBranch) {
          const branch = await prisma.branch.create({
            data: {
              ideaId: winningIdea.id,
              xpPool: xpReward, // Passing the initial pool for monthly payout
              activePhasesJson: winningIdea.proposedPhasesJson
            }
          });
          
          // The creator joins the branch automatically
          await prisma.branchMember.create({
            data: {
              userId: winningIdea.creatorId,
              branchId: branch.id
            }
          });
        }

        // Mark Need as resolved — releases points via pointsAllocated reset
        await prisma.need.update({
          where: { id: need.id },
          data: { status: 'RESOLVED', pointsAllocated: 0 }
        });
      }

      console.log('Weekly Loop Finished.');
    } catch (err) {
      console.error('Error running weekly loop:', err);
    }
  });
};
