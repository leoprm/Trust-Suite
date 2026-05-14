import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const tgId = BigInt('7516190425');

  const user = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
  if (!user) {
    console.log('Usuario no encontrado. Se creará al primer uso del bot.');
    await prisma.$disconnect();
    process.exit(0);
  }

  await prisma.user.update({
    where: { telegramUserId: tgId },
    data: { isPlatformAdmin: true },
  });

  console.log('✓ Leo marcado como Platform Admin (exento de cobro)');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
