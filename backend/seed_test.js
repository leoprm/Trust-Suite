const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function seed() {
  try {
    const hash = await bcrypt.hash('demo123', 10);
    const user = await p.user.create({
      data: {
        email: 'test@test.com',
        username: 'testuser',
        password: hash,
        is_onboarded: true,
      }
    });
    console.log('User:', user.id);
    await p.$disconnect();
    console.log('DONE');
  } catch(e) {
    console.error('ERROR:', e.message);
    await p.$disconnect();
    process.exit(1);
  }
}
seed();
