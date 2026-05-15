// Seed test data for skill pricing verification
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create a test tree
  const tree = await prisma.tree.create({
    data: { name: 'PricingTest', icono: '💰', admissionPolicy: 'OPEN' },
  });
  console.log('Tree:', tree.id, tree.name);

  // Create 3 users with skills
  const u1 = await prisma.user.create({
    data: { username: 'dev_back_1', email: 'dev1@test.com', password: 'x', skills: JSON.stringify({ backend: 80, python: 70 }) },
  });
  const u2 = await prisma.user.create({
    data: { username: 'dev_back_2', email: 'dev2@test.com', password: 'x', skills: JSON.stringify({ backend: 60, java: 55 }) },
  });
  const u3 = await prisma.user.create({
    data: { username: 'dev_front_1', email: 'front1@test.com', password: 'x', skills: JSON.stringify({ frontend: 90, design: 40 }) },
  });
  const u4 = await prisma.user.create({
    data: { username: 'dev_front_2', email: 'front2@test.com', password: 'x', skills: JSON.stringify({ frontend: 75, react: 80 }) },
  });
  const u5 = await prisma.user.create({
    data: { username: 'dev_front_3', email: 'front3@test.com', password: 'x', skills: JSON.stringify({ frontend: 60, css: 90 }) },
  });
  const u6 = await prisma.user.create({
    data: { username: 'dev_design_1', email: 'design1@test.com', password: 'x', skills: JSON.stringify({ design: 95, figma: 85 }) },
  });

  // Add all as members
  for (const u of [u1, u2, u3, u4, u5, u6]) {
    await prisma.treeMember.create({
      data: { userId: u.id, treeId: tree.id, status: 'ACTIVE' },
    });
  }
  console.log('Added 6 members');

  // Create tasks:
  // 5 backend tasks -> high demand for backend
  for (let i = 1; i <= 5; i++) {
    await prisma.task.create({
      data: {
        treeId: tree.id,
        creatorId: u1.id,
        title: `Backend task ${i}`,
        budget: 10000,
        status: 'PENDING',
        skills: JSON.stringify(['backend']),
      },
    });
  }
  // 1 frontend task -> low demand for frontend
  await prisma.task.create({
    data: {
      treeId: tree.id,
      creatorId: u3.id,
      title: 'Frontend task 1',
      budget: 5000,
      status: 'PENDING',
      skills: JSON.stringify(['frontend']),
    },
  });
  console.log('Created 6 tasks (5 backend + 1 frontend)');

  // Run pricing cron
  const { updateSkillPricing } = require('./src/cron/skillPricingCron');
  await updateSkillPricing(prisma);
  console.log('Cron executed');

  // Query pricing
  const pricing = await prisma.skillPricing.findMany({
    where: { treeId: tree.id },
    orderBy: { ratePerHour: 'desc' },
  });
  console.log('\n=== SKILL PRICING RESULTS ===');
  for (const p of pricing) {
    console.log(`  ${p.skillTag}: $${p.ratePerHour}/hr (demand=${p.demandLevel}, supply=${p.supplyCount})`);
  }

  // Expected: backend = high demand (5 tasks) / low supply (2 devs) = ~$20+/hr
  //           frontend = low demand (1 task) / high supply (3 devs) = ~$10/hr
  //           design = no demand / 1 supply = base $8/hr

  console.log('\nTree ID for endpoint test:', tree.id);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
