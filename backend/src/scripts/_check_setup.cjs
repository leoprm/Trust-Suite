// Quick check admin + fix
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Find admin
  const admin = await p.user.findFirst({ where: { role: 'ADMINISTRATOR' }, select: { email: true, username: true, id: true } });
  console.log('Admin user:', JSON.stringify(admin));
  
  // Make Leo admin too (temp for testing)
  const leo = await p.user.findFirst({ where: { email: 'leo@leo' } });
  if (leo && leo.role !== 'ADMINISTRATOR') {
    await p.user.update({ where: { id: leo.id }, data: { role: 'ADMINISTRATOR' } });
    console.log('Promoted Leo to ADMINISTRATOR');
  }
  
  // List needs
  const needs = await p.need.findMany({ take: 5, select: { id: true, title: true, status: true, isBase: true, createdAt: true, relevanceThresholdMet: true } });
  console.log('Needs:', JSON.stringify(needs, null, 2));
  
  await p.$disconnect();
})();
