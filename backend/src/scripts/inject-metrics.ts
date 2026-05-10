import { prisma } from '../index';

async function main() {
  const trees = await (prisma as any).tree.findMany();
  console.log(`Found ${trees.length} trees`);
  
  const userId = '4b9a8ce2-76b0-42e9-be80-4b37059d30d5';
  
  for (const tree of trees) {
    console.log(`
=== ${tree.name} (${tree.id.slice(0,8)}) ===`);
    
    const branches = await (prisma as any).branch.findMany({
      where: { treeId: tree.id },
      include: { 
        tasks: {
          include: { deliverables: true }
        }
      }
    });
    
    console.log(`  Branches: ${branches.length}`);
    for (const branch of branches) {
      console.log(`    ${branch.name || branch.title} (${branch.id.slice(0,8)}) - tasks: ${branch.tasks?.length || 0}`);
      for (const task of branch.tasks || []) {
        console.log(`      Task: ${task.title} (${task.id.slice(0,8)}) - deliverables: ${task.deliverables?.length || 0}`);
      }
    }
    
    const promises = await (prisma as any).promiseP2P.count({
      where: {
        currencyType: 'FIAT',
        status: { in: ['PENDING', 'PAYMENT_SENT'] },
        task: { branch: { treeId: tree.id } }
      }
    });
    console.log(`  FIAT promises: ${promises}`);
    
    const ratings = await (prisma as any).satisfactionRating.count({
      where: { deliverable: { branch: { treeId: tree.id } } }
    });
    console.log(`  Satisfaction ratings: ${ratings}`);
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
