import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const memberships = await p.agentMembership.findMany({
    select: { agentId: true, treeId: true, level: true, xp: true, agent: { select: { name: true } }, tree: { select: { name: true } } },
    take: 2
  });
  console.log(JSON.stringify(memberships, null, 2));
  await p.$disconnect();
}
main();
