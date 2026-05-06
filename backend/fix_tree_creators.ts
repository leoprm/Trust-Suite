
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const trees = await prisma.tree.findMany({
    where: { creatorId: null },
    include: { members: { orderBy: { joinedAt: 'asc' }, take: 1 } }
  });

  console.log(`Found ${trees.length} trees with null creatorId`);

  for (const tree of trees) {
    if (tree.members.length > 0) {
      const firstMemberId = tree.members[0].userId;
      await prisma.tree.update({
        where: { id: tree.id },
        data: { creatorId: firstMemberId }
      });
      console.log(`Updated tree ${tree.id} with creatorId ${firstMemberId}`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
