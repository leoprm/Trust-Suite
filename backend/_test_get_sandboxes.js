const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sandboxes = await prisma.treeSandbox.findMany({ take: 3, select: { treeId: true } });
  console.log(JSON.stringify(sandboxes));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
