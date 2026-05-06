import cron from 'node-cron';
import { prisma } from '../index';

export const startMaterialFallbackJob = () => {
  // Runs every hour
  cron.schedule('0 * * * *', async () => {
    console.log('Running Material Fallback Check...');
    try {
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const staleMaterialNeeds = await prisma.need.findMany({
        where: {
          taskId: { not: null },
          status: 'ACTIVE',
          createdAt: { lt: yesterday }
        },
        include: { treeLinks: true }
      });

      for (const need of staleMaterialNeeds) {
        // If it's linked to multiple trees, we just pick the first one's FIAT fund for simplicity
        const firstTreeLink = need.treeLinks[0];
        if (!firstTreeLink) continue;

        const assetFund = await prisma.assetFund.findFirst({
          where: { treeId: firstTreeLink.treeId, type: 'FIAT' }
        });

        if (assetFund && assetFund.balance > 0) {
          // Assume cost is 100 FIAT for material standard. We'd deduct the exact cost if provided.
          const deduction = Math.min(assetFund.balance, 100);

          await prisma.assetFund.update({
            where: { id: assetFund.id },
            data: { balance: { decrement: deduction } }
          });

          await prisma.need.update({
            where: { id: need.id },
            data: { status: 'RESOLVED' }
          });
          console.log(`Resolved material need ${need.id} via FIAT fallback.`);
        }
      }

    } catch (err) {
      console.error('Error running material fallback loop:', err);
    }
  });
};
