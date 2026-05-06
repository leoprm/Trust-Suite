import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '0be63ead-acad-4010-8189-ab03a8d44482';

async function main() {
  console.log('Starting seed of 200 trees...');
  
  for (let i = 1; i <= 200; i++) {
    const treeName = `Arbol de Rendimiento #${i}`;
    const inviteCode = `perf-${i.toString().padStart(3, '0')}`;
    
    // Create Tree
    const tree = await prisma.tree.create({
      data: {
        name: treeName,
        icono: i % 2 === 0 ? '🌳' : '🌲',
        description: `Este es un árbol de prueba de rendimiento diseñado para evaluar la velocidad de renderizado en el frontend. 
        Contiene descripciones multilínea para estresar la implementación de Pretext. 
        Métrica de iteración: ${i}.`,
        inviteCode,
        creatorId: ADMIN_ID,
        visibility: 'PUBLIC' as any,
        admissionPolicy: 'OPEN' as any
      }
    });

    // Create Membership for Admin
    await prisma.treeMember.create({
      data: {
        userId: ADMIN_ID,
        treeId: tree.id,
        status: 'VERIFIED'
      }
    });

    // Create 5 Needs for each tree
    for (let j = 1; j <= 5; j++) {
      await prisma.need.create({
        data: {
          creatorId: ADMIN_ID,
          title: `Necesidad ${j} del Arbol ${i}`,
          description: `Esta es una descripción larga y multilínea para la necesidad ${j}. 
          Contiene varias oraciones para asegurar que el cálculo de layout de Pretext se pruebe correctamente.
          Línea 2: Probando la fluidez del scroll en el feed de necesidades.
          Línea 3: Verificando que se evite el layout thrashing (reflow del navegador).
          Línea 4: Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
          Línea 5: Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
          treeLinks: {
            create: { treeId: tree.id }
          }
        }
      });
    }

    if (i % 10 === 0) {
      console.log(`Seeded ${i} trees and associated needs...`);
    }
  }
  
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
