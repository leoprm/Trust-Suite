import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      }
    });
    console.log('--- Database User Check ---');
    console.log(`Total users found: ${users.length}`);
    if (users.length > 0) {
      console.log('Users:');
      console.table(users);
    } else {
      console.log('No users found in the database.');
    }
  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
