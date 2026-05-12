const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ take: 3, select: { id: true, username: true, email: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
  const members = await p.treeMember.findMany({ take: 2, select: { availableNeedPoints: true, needPointsPool: true, userId: true } });
  console.log('Members:', JSON.stringify(members, null, 2));
  await p.$disconnect();
})();
