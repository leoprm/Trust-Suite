import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findMany({ where: { username: 'Leo' } });
  console.log('Existing Leo:', existing.length);
  
  try {
    const created = await prisma.user.create({ 
      data: { username: 'Leo', email: 'leo@demo.com', password: 'test', role: 'USER' as any } 
    });
    console.log('Created:', created.username);
    await prisma.user.delete({ where: { id: created.id } });
    console.log('Deleted');
  } catch (e: any) {
    console.error('Error:', e.code, e.meta, e.message?.slice(0, 200));
  }
  await prisma.$disconnect();
}
main();
