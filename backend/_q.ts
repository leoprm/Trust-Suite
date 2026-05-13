import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const m = await p.agentMembership.findMany({select:{agentId:true,treeId:true,level:true,xp:true},take:2});
  console.log(JSON.stringify(m));
  await p.$disconnect();
}
main();
