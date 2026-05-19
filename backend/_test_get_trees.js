const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const trees = await prisma.tree.findMany({ take: 3, select: { id: true, name: true } });
  console.log(JSON.stringify(trees));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
