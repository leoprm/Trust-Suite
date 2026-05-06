import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe(`SHOW TABLES`);
    console.log('Tables:', tables);
    
    // Check indexes for DifficultyVote
    try {
      const indexes = await prisma.$queryRawUnsafe(`SHOW INDEX FROM DifficultyVote`);
      console.log('Indexes for DifficultyVote:', indexes);
    } catch (e) {
      console.log('DifficultyVote table might not exist or error showing indexes');
    }
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
