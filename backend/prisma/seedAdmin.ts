import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin';
  const adminUsername = 'admin';
  const adminPassword = 'N0Olv1D4R21@';

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      email: 'admin@admin',
      password: hashedPassword,
      role: 'ADMINISTRATOR',
    },
    create: {
      email: 'admin@admin',
      username: adminUsername,
      password: hashedPassword,
      role: 'ADMINISTRATOR',
    },
  });

  console.log('Seeded admin user:', adminUser.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
