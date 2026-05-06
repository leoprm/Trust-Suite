import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fix() {
  const tasks = await prisma.task.findMany({
    where: { 
      status: 'COMPLETED',
      difficulty: null
    },
    include: {
      difficultyVotes: true
    }
  });

  console.log(`Found ${tasks.length} completed tasks with null difficulty.`);

  for (const t of tasks) {
    let avg = 5; // default
    if (t.difficultyVotes && t.difficultyVotes.length > 0) {
      const sum = t.difficultyVotes.reduce((acc, v: any) => acc + (v.value || v.score || 0), 0);
      avg = Math.round(sum / t.difficultyVotes.length);
    }
    
    await prisma.task.update({
      where: { id: t.id },
      data: { difficulty: avg }
    });
    console.log(`Fixed task: "${t.name}" (ID: ${t.id}) set difficulty to ${avg}`);
  }
}

fix()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
