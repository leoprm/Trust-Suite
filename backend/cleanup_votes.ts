import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Disabling foreign key checks...');
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');
    
    console.log('Dropping DifficultyVoteLike...');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS DifficultyVoteLike;');
    
    console.log('Dropping DifficultyVote...');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS DifficultyVote;');
    
    console.log('Re-enabling foreign key checks...');
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
    
    console.log('Cleanup complete.');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
