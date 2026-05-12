import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Restoring environment...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Create Leo
  const leo = await prisma.user.upsert({
    where: { username: 'Leo' },
    update: { password: hashedPassword },
    create: {
      username: 'Leo',
      email: 'leo@trust.lite',
      password: hashedPassword,
      role: 'ADMINISTRATOR'
    }
  });
  console.log('User Leo restored.');

  // 2. Create the specific trees requested by the user
  const treeData = [
    { name: 'Junta de Vecinos Los Álamos', description: 'Comunidad local, enfocado en seguridad y limpieza.' },
    { name: 'InnovaTech SpA', description: 'Startup de tecnología, enfocado en desarrollo de software y ventas.' },
    { name: 'Comunidad Huerto Urbano', description: 'Organización sin fines de lucro, ecología y sustentabilidad.' },
    { name: 'Club Deportivo Los Leones', description: 'Club amateur de fútbol y eventos para recaudar fondos.' },
    { name: 'Condominio Vista Hermosa', description: 'Administración de edificio, gastos comunes y reparaciones.' }
  ];

  for (const data of treeData) {
    const inviteCode = `TRUST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const tree = await prisma.tree.create({
      data: {
        ...data,
        inviteCode,
        creatorId: leo.id,
        visibility: 'PUBLIC'
      }
    });

    // Add Leo as admin member
    await prisma.treeMember.create({
      data: {
        userId: leo.id,
        treeId: tree.id,
        role: 'ADMIN',
        status: 'VERIFIED',
        availableNeedPoints: 100,
        skills: JSON.stringify(['Gestión', 'Liderazgo', 'Organización'])
      }
    });
    console.log(`Tree "${data.name}" created and Leo added as admin.`);
  }

  console.log('Restoration complete. User Leo can now login with username "Leo" and password "password123".');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
