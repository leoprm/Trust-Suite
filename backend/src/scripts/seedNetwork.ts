import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Network Graph seed...');

  // 1. Find or create user "Leo"
  let leo = await prisma.user.findFirst({
    where: { username: { contains: 'leo' } }
  });

  if (!leo) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    leo = await prisma.user.create({
      data: {
        username: 'Leo',
        email: 'leo@example.com',
        password: hashedPassword,
      }
    });
    console.log('Created user Leo');
  } else {
    console.log(`Found existing user Leo: ${leo.id}`);
  }

  // 2. Create 100 test users
  console.log('Creating 100 test users...');
  const testUsers = [];
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  for (let i = 0; i < 100; i++) {
    const username = `TestNode_${i}`;
    let user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: username,
          email: `testnode_${i}@ecosystem.net`,
          password: hashedPassword,
        }
      });
    }
    testUsers.push(user);
  }

  // 3. Create 20 public trees
  console.log('Creating 20 public ecosystems...');
  const publicSettings = JSON.stringify({
    governance: { isPublic: true }
  });

  const testTrees = [];
  for (let i = 0; i < 20; i++) {
    const inviteCode = `ECO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const tree = await prisma.tree.create({
      data: {
        name: `Ecosistema Público ${i + 1}`,
        description: `Entorno de prueba generado automáticamente #${i + 1}`,
        inviteCode,
        creatorId: leo.id,
        settings: publicSettings,
      }
    });
    testTrees.push(tree);
  }

  // 4. Distribute users across trees to create a network
  console.log('Distributing users to create connections...');
  
  // Guarantee Leo is in at least 3 trees so the network branches out from him
  for (let i = 0; i < 3; i++) {
    await prisma.treeMember.create({
      data: {
        userId: leo.id,
        treeId: testTrees[i].id,
      }
    });
  }

  // Connect test users randomly
  let connectionsCount = 0;
  for (const user of testUsers) {
    // Each user joins 1 to 4 random trees
    const numTrees = Math.floor(Math.random() * 4) + 1;
    // Shuffle trees and pick first N
    const shuffledTrees = [...testTrees].sort(() => 0.5 - Math.random());
    const selectedTrees = shuffledTrees.slice(0, numTrees);

    for (const tree of selectedTrees) {
       await prisma.treeMember.create({
         data: {
           userId: user.id,
           treeId: tree.id
         }
       });
       connectionsCount++;
    }
  }

  console.log(`Seed complete!`);
  console.log(`Created 20 public trees and established ${connectionsCount} connections across 100 users.`);
  console.log(`User Leo was explicitly added to 3 trees to ensure visibility.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
