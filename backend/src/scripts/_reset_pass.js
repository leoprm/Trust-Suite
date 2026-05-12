const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
(async () => {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash('demo123', 10);
  await prisma.user.update({ where: { email: 'leo@leo' }, data: { password: hash } });
  console.log('OK');
  await prisma.$disconnect();
})();
