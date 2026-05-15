// Quick test: run skill pricing cron and test endpoint
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find a tree
  const trees = await prisma.tree.findMany({ take: 2, select: { id: true, name: true } });
  if (trees.length === 0) { console.log('No trees'); return; }
  
  const tree = trees[0];
  console.log('Tree:', tree.name, tree.id);
  
  // Count members with skills
  const members = await prisma.treeMember.findMany({
    where: { treeId: tree.id, status: 'ACTIVE' },
    include: { user: { select: { skills: true } } },
  });
  console.log('Members:', members.length);
  for (const m of members) {
    console.log('  user', m.userId?.slice(0,12), 'skills:', m.user?.skills);
  }
  
  // Count open tasks with skills
  const tasks = await prisma.task.findMany({
    where: { treeId: tree.id, status: { in: ['PENDING', 'ASSIGNED'] } },
    select: { skills: true, title: true },
  });
  console.log('Open tasks:', tasks.length);
  for (const t of tasks) {
    console.log(' ', t.title, 'skills:', t.skills);
  }
  
  // Run pricing
  const { updateSkillPricing } = require('./src/cron/skillPricingCron');
  await updateSkillPricing(prisma);
  
  // Query result
  const pricing = await prisma.skillPricing.findMany({ where: { treeId: tree.id } });
  console.log('\nPricing result:');
  for (const p of pricing) {
    console.log(`  ${p.skillTag}: $${p.ratePerHour}/hr (demand=${p.demandLevel}, supply=${p.supplyCount})`);
  }
  
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
