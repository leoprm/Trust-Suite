import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '0be63ead-acad-4010-8189-ab03a8d44482';

async function main() {
  console.log('Buscando árboles de rendimiento para sembrar ramas hashtag y tareas...');
  
  // Fetch performance trees
  const trees = await prisma.tree.findMany({
    where: { name: { startsWith: 'Arbol de Rendimiento' } }
  });

  if (trees.length === 0) {
    console.log('No se encontraron árboles de rendimiento. Corre primero el script original.');
    return;
  }

  console.log(`Encontrados ${trees.length} árboles. Iniciando generación de datos...`);

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    
    // Create Hashtag Branch
    const branch = await (prisma as any).branch.create({
      data: {
        treeId: tree.id,
        name: `#Rendimiento_${i + 1}`,
        isHashtag: true,
        phase: 'DEVELOPMENT',
        activePhasesJson: '["DEVELOPMENT"]',
      }
    });

    // Create 10 Tasks for each branch
    const tasksData = Array.from({ length: 10 }).map((_, j) => ({
      branchId: branch.id,
      name: `Tarea de Rendimiento #${j + 1} en el Arbol #${i + 1}`,
      description: `Esta es una descripción larga y multilínea para la tarea ${j + 1}. 
      Contiene varias oraciones para asegurar que el cálculo de layout de Pretext se pruebe correctamente.
      Línea 2: Probando la fluidez del scroll en las tareas de rama.
      Línea 3: Verificando que se evite el layout thrashing (reflow del navegador).
      Línea 4: Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
      Línea 5: Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      status: 'OPEN',
      phase: 'DEVELOPMENT'
    }));

    // Using createMany for performance
    await (prisma as any).task.createMany({
      data: tasksData
    });

    if ((i + 1) % 10 === 0) {
      console.log(`Procesados ${i + 1} árboles... Creadas ${i + 1} ramas y ${(i + 1) * 10} tareas.`);
    }
  }
  
  console.log('¡Siembra avanzada completada!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
