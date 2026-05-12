/**
 * Seed TrustCore test data — for multi-TrustCore fee testing
 * Run: node ./node_modules/tsx/dist/cli.js src/scripts/seed-trustcore-fee.ts
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const uuid = () => crypto.randomUUID();

async function main() {
  console.log('🌱 Seeding TrustCore fee test data...\n');

  // 1. Seed GlobalFeeConfig (default if missing)
  let gfee = await (prisma as any).globalFeeConfig.findFirst();
  if (!gfee) {
    gfee = await (prisma as any).globalFeeConfig.create({
      data: {
        id: 'default',
        currentFeePercent: 5.0,
        maintenanceComponent: 3.0,
        growthComponent: 2.0,
        lastRecalculated: new Date(),
        recalculatedTxCount: 50,
        recalculatedVolumeSum: 500000,
      },
    });
    console.log('   ✅ GlobalFeeConfig created (5%, maint=3, growth=2)');
  } else {
    console.log(`   ℹ️ GlobalFeeConfig exists: ${gfee.currentFeePercent}%`);
  }

  // 2. Find existing trees from seed
  const trees = await prisma.tree.findMany({ take: 3 });
  if (trees.length < 2) {
    console.error('   ❌ Need at least 2 trees. Run seed-demo.ts first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  // 3. Create TrustCoreConfig for trees (multi-TrustCore scenario)
  for (let i = 0; i < Math.min(trees.length, 3); i++) {
    const tree = trees[i];
    const existing = await (prisma as any).trustCoreConfig.findUnique({ where: { treeId: tree.id } });
    if (existing) {
      console.log(`   ℹ️ TrustCoreConfig exists for ${tree.name} (isActive=${existing.isActive})`);
      continue;
    }
    const costs = [50000, 30000, 20000]; // different monthly costs
    await (prisma as any).trustCoreConfig.create({
      data: {
        id: uuid(),
        treeId: tree.id,
        isActive: true,
        monthlyMaintenanceCost: costs[i],
        totalFeesCollected: 0,
        totalFeesDistributed: 0,
      },
    });
    // Set isTrustCore flag
    await prisma.tree.update({
      where: { id: tree.id },
      data: { isTrustCore: true, trustCoreBalanceClp: 0 },
    });
    console.log(`   ✅ TrustCoreConfig: ${tree.name} (cost=${costs[i]}, active=true)`);
  }

  // 4. Verify wallets exist for transfers
  const wallets = await (prisma as any).userWallet.findMany({
    take: 2,
    include: { user: { select: { email: true, id: true } } },
  });
  console.log(`\n   🔑 Test users for transfers:`);
  for (const w of wallets) {
    console.log(`      ${w.user.email} — id=${w.user.id} — CLP=${w.balanceClp}`);
  }

  console.log('\n✅ TrustCore fee test data seeded.\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
