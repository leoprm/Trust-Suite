import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function main() {
  const userId = '4b9a8ce2-76b0-42e9-be80-4b37059d30d5';
  const allUsers = await (prisma as any).user.findMany({ select: { id: true } });
  const userIds = allUsers.map((u: any) => u.id);
  console.log('Using', userIds.length, 'users for ratings');

  const trees = await (prisma as any).tree.findMany();
  
  for (const tree of trees) {
    const branches = await (prisma as any).branch.findMany({ where: { treeId: tree.id } });
    if (branches.length === 0) { console.log('Tree', tree.name, ': no branches, skipping'); continue; }

    console.log('\n===', tree.name, '(' + branches.length + ' branches) ===');

    for (const branch of branches) {
      let tasks = await (prisma as any).task.findMany({ where: { branchId: branch.id } });
      if (tasks.length === 0) {
        await (prisma as any).task.createMany({
          data: [
            { name: 'Diseno ' + (branch.name || '').slice(0, 30), description: 'Tarea demo de diseno', branchId: branch.id, status: 'OPEN', creatorId: userId, phase: 'INVESTIGATION' },
            { name: 'Implementacion ' + (branch.name || '').slice(0, 25), description: 'Tarea demo de implementacion', branchId: branch.id, status: 'OPEN', creatorId: userId, phase: 'DEVELOPMENT' },
          ]
        });
        tasks = await (prisma as any).task.findMany({ where: { branchId: branch.id } });
        console.log('  Created', tasks.length, 'tasks');
      }

      const existingDels = await (prisma as any).phaseDeliverable.count({ where: { branchId: branch.id } });
      if (existingDels === 0) {
        await (prisma as any).phaseDeliverable.createMany({
          data: [
            { branchId: branch.id, phase: 'INVESTIGATION', deliverableUrl: 'https://demo.trust/doc/investigacion.pdf', status: 'COMPLETED' },
            { branchId: branch.id, phase: 'DEVELOPMENT', deliverableUrl: 'https://demo.trust/doc/desarrollo.pdf', status: 'COMPLETED' },
          ]
        });
        console.log('  Created 2 deliverables');
      }

      const deliverables = await (prisma as any).phaseDeliverable.findMany({ where: { branchId: branch.id } });
      for (const del of deliverables) {
        const existingRatings = await (prisma as any).satisfactionRating.count({ where: { deliverableId: del.id } });
        if (existingRatings === 0) {
          const evaluators = pick(userIds, rand(3, 5));
          await (prisma as any).satisfactionRating.createMany({
            data: evaluators.map((uid: string) => ({
              deliverableId: del.id,
              userId: uid,
              rating: rand(65, 95),
            }))
          });
          console.log('   ', evaluators.length, 'ratings');
        }
      }
    }

    const existingPromises = await (prisma as any).promiseP2P.count({
      where: { currencyType: 'FIAT', task: { branch: { treeId: tree.id } } }
    });
    if (existingPromises === 0) {
      const incomeAgg = await (prisma as any).fiatTransaction.aggregate({
        where: { treeId: tree.id, type: 'INCOME' },
        _sum: { amount: true }
      });
      const totalIncome = incomeAgg._sum?.amount || 0;
      const targetInversion = totalIncome * (rand(25, 45) / 100);

      const treeTasks = await (prisma as any).task.findMany({
        where: { branch: { treeId: tree.id } }
      });

      if (treeTasks.length > 0 && targetInversion > 0) {
        const selectedTasks = pick(treeTasks, Math.min(3, treeTasks.length));
        const amountPerTask = Math.round(targetInversion / selectedTasks.length);
        
        await (prisma as any).promiseP2P.createMany({
          data: selectedTasks.map((t: any) => ({
            taskId: t.id,
            sponsorId: userId,
            amount: amountPerTask,
            currencyType: 'FIAT',
            status: 'PENDING',
          }))
        });
        console.log('  Created', selectedTasks.length, 'FIAT promises, total: $' + (amountPerTask * selectedTasks.length).toLocaleString());
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const tree of trees) {
    const [dels, rats, proms] = await Promise.all([
      (prisma as any).phaseDeliverable.count({ where: { branch: { treeId: tree.id } } }),
      (prisma as any).satisfactionRating.count({ where: { deliverable: { branch: { treeId: tree.id } } } }),
      (prisma as any).promiseP2P.count({ where: { currencyType: 'FIAT', status: 'PENDING', task: { branch: { treeId: tree.id } } } }),
    ]);
    console.log(tree.name + ':', dels, 'deliverables,', rats, 'ratings,', proms, 'FIAT promises');
  }

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
