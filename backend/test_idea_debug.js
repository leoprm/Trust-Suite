
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const idea = await prisma.idea.create({
      data: {
        content: 'test debug',
        creatorId: '471a81d1-2a9b-4fdf-8f30-116178eaf85b',
        isGlobal: false,
        totalLikes: 0,
      },
    });
    console.log('SUCCESS:', idea.id);
  } catch(e) {
    console.error('ERROR:', e.message, 'CODE:', e.code);
  }
  await prisma.$disconnect();
}
test();
