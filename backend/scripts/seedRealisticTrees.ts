import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADMIN_ID = '0be63ead-acad-4010-8189-ab03a8d44482';
const LEO_ID = 'b611649c-d145-4dca-821e-a1b4523e1365';

const SCENARIOS = {
  'Equipo de Trabajo / Startup': {
    names: ['TechNova Solutions', 'Quantum Leap AI'],
    hashtags: ['#DesarrolloWeb', '#MarketingDigital'],
    tasks: [
      { name: 'Diseñar Landing Page', desc: 'Crear los mockups iniciales para la página principal.', diff: 3 },
      { name: 'Configurar Base de Datos', desc: 'Setear PostgreSQL y conectarlo al backend.', diff: 5 },
      { name: 'Campaña en Redes Sociales', desc: 'Lanzar primera iteración en LinkedIn y Twitter.', diff: 2 },
    ],
    financeRanges: { inc: [5000, 15000], exp: [1000, 4000] }
  },
  'Proyecto Freelance / Cliente': {
    names: ['Rediseño Web Constructora', 'App Móvil de Entregas'],
    hashtags: ['#UX_UI', '#BackendIntegration'],
    tasks: [
      { name: 'Wireframes Baja Fidelidad', desc: 'Bocetar pantallas principales.', diff: 2 },
      { name: 'API REST', desc: 'Crear endpoints necesarios para el cliente.', diff: 4 },
    ],
    financeRanges: { inc: [1000, 3000], exp: [100, 500] }
  },
  'Comunidad Abierta / DAO': {
    names: ['Green Earth DAO', 'CryptoArtists Collective'],
    hashtags: ['#Gobernanza', '#EventosComunitarios'],
    tasks: [
      { name: 'Redactar Propuesta de Votación', desc: 'Definir reglas para la siguiente season.', diff: 3 },
      { name: 'Organizar AMA', desc: 'Contactar speakers y fijar fecha en Discord.', diff: 2 },
    ],
    financeRanges: { inc: [500, 2000], exp: [50, 200] }
  },
  'Evento Social Express': {
    names: ['Fiesta de Fin de Año', 'Boda Ana y Juan'],
    hashtags: ['#Logística', '#Catering'],
    tasks: [
      { name: 'Presupuesto de Bebidas', desc: 'Cotizar en 3 lugares distintos.', diff: 1 },
      { name: 'Alquilar Salón', desc: 'Pagar la seña del lugar para asegurar fecha.', diff: 1 },
    ],
    financeRanges: { inc: [200, 1000], exp: [100, 1500] }
  },
  'Hogar y Convivencia': {
    names: ['Depto 4B', 'Casa Compartida Centro'],
    hashtags: ['#Mantenimiento', '#GastosComunes'],
    tasks: [
      { name: 'Arreglar Canilla', desc: 'Comprar repuesto y cambiar el cuerito de la cocina.', diff: 1 },
      { name: 'Pagar Expensas', desc: 'Transferir dinero a la administración.', diff: 1 },
    ],
    financeRanges: { inc: [1000, 2000], exp: [900, 1800] }
  }
};

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('Iniciando siembra de Árboles Realistas...');
  const plantillas = await prisma.plantillaArbol.findMany();

  if (plantillas.length === 0) {
    console.log('No se encontraron plantillas. Asegúrate de correr la migración / semilla de plantillas.');
    return;
  }

  for (const plantilla of plantillas) {
    const config = Object.entries(SCENARIOS).find(([key]) => plantilla.nombre.includes(key))?.[1];
    if (!config) continue;

    for (let i = 0; i < 2; i++) {
       const treeName = config.names[i];
       const inviteCode = `real-${plantilla.id.substring(0,4)}-${i}`;

       // Create Tree
       const tree = await prisma.tree.create({
          data: {
             name: treeName,
             icono: plantilla.icono || '🌳',
             description: `Árbol generado a partir de la plantilla: ${plantilla.nombre}. Este es un entorno realista para pruebas.`,
             inviteCode,
             creatorId: ADMIN_ID,
             visibility: 'PUBLIC' as any,
             admissionPolicy: 'OPEN' as any,
             settings: plantilla.configuracion
          }
       });

       // Memberships (Admin + Leo)
       await prisma.treeMember.createMany({
         data: [
           { userId: ADMIN_ID, treeId: tree.id, status: 'VERIFIED', role: 'ADMIN' },
           { userId: LEO_ID, treeId: tree.id, status: 'VERIFIED', role: 'MEMBER' }
         ]
       });

       // Create Hashtag Branches
       for (const hashtagName of config.hashtags) {
          const branch = await (prisma as any).branch.create({
             data: {
               treeId: tree.id,
               name: hashtagName,
               isHashtag: true,
               phase: 'DEVELOPMENT',
               activePhasesJson: '["DEVELOPMENT"]'
             }
          });

          // Create Tasks
          const tasksData = config.tasks.map((t, idx) => ({
             branchId: branch.id,
             name: `${t.name} (Variación ${idx+1})`,
             description: t.desc,
             status: idx === 0 ? 'COMPLETED' : 'OPEN',
             phase: 'DEVELOPMENT',
             difficulty: parseFloat((Math.random() * 2 + t.diff).toFixed(1))
          }));

          await (prisma as any).task.createMany({ data: tasksData });
       }

       // Financial Data (Last 90 days)
       const now = new Date();
       const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
       
       for(let tx = 0; tx < 15; tx++) {
         const isIncome = Math.random() > 0.4;
         const baseRange = isIncome ? config.financeRanges.inc : config.financeRanges.exp;
         const amount = baseRange[0] + Math.random() * (baseRange[1] - baseRange[0]);
         
         await (prisma as any).fiatTransaction.create({
           data: {
             treeId: tree.id,
             amount: parseFloat(amount.toFixed(2)),
             type: isIncome ? 'INCOME' : 'EXPENSE',
             category: 'OTHER',
             description: `Transacción autogenerada #${tx}`,
             date: randomDate(ninetyDaysAgo, now)
           }
         });
       }

       console.log(`Creado árbol: ${treeName} - ${config.hashtags.length} ramas, transacciones pobladas.`);
    }
  }

  console.log('Semilla de árboles realistas completada.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
