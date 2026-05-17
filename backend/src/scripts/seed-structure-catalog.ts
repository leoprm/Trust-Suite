import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATALOG: Record<string, {
  typicalSubTrees: Array<{ name: string; budgetPct: number; members?: number; goals: string }>;
  budgetAllocation: Record<string, number>;
  capitalInicial?: number;
  roiMonth?: number;
  milestones: Array<{
    phase: number;
    phaseName: string;
    objectives: string[];
    expectedMonths: number;
    targetKPIs: Record<string, any>;
  }>;
}> = {
  construction: {
    typicalSubTrees: [
      { name: 'Obra Gruesa', budgetPct: 40, members: 4, goals: 'Ejecución de estructura, cimientos y obra gruesa' },
      { name: 'Terminaciones', budgetPct: 25, members: 3, goals: 'Pintura, revestimientos y acabados finales' },
      { name: 'Administración', budgetPct: 15, members: 2, goals: 'Presupuestos, permisos y gestión de clientes' },
      { name: 'Adquisiciones', budgetPct: 15, members: 2, goals: 'Compra de materiales y subcontratación de especialistas' },
      { name: 'Reserva', budgetPct: 5, members: 0, goals: 'Fondo de contingencia para imprevistos de obra' },
    ],
    budgetAllocation: { tools: 25, personnel: 45, services: 15, contingency: 15 },
    capitalInicial: 5000000,
    roiMonth: 12,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo base', 'Instalar herramientas', 'Primera cotización aceptada'], expectedMonths: 2, targetKPIs: { membersOnboarded: 4, quoteAccepted: 1 } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['Primera obra iniciada', '5 tareas completadas', '80% asistencia'], expectedMonths: 4, targetKPIs: { tasksCompleted: 5, worksStarted: 1 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Primera obra entregada', 'Cliente satisfecho', 'Ajuste de presupuesto'], expectedMonths: 6, targetKPIs: { worksDelivered: 1, clientSatisfaction: 80 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', '2 obras simultáneas', 'Exportar know-how'], expectedMonths: 12, targetKPIs: { financialAutonomy: true, simultaneousWorks: 2 } },
    ],
  },
  programadores: {
    typicalSubTrees: [
      { name: 'Desarrollo', budgetPct: 45, members: 3, goals: 'Desarrollo de software: frontend, backend y mobile' },
      { name: 'Diseño UX/UI', budgetPct: 15, members: 1, goals: 'Diseño de interfaces y experiencia de usuario' },
      { name: 'QA / Testing', budgetPct: 15, members: 1, goals: 'Control de calidad, testing automatizado y manual' },
      { name: 'Administración', budgetPct: 15, members: 2, goals: 'Gestión de proyectos, clientes y finanzas' },
      { name: 'Reserva', budgetPct: 10, members: 0, goals: 'Fondo para servidores, herramientas SaaS y emergencias' },
    ],
    budgetAllocation: { tools: 20, personnel: 55, services: 15, contingency: 10 },
    capitalInicial: 3000000,
    roiMonth: 8,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo dev', 'Configurar repositorio', 'Elegir stack tecnológico'], expectedMonths: 2, targetKPIs: { membersOnboarded: 3, repoSetup: true } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['MVP entregado', '5 features completadas', 'Code review activo'], expectedMonths: 4, targetKPIs: { featuresCompleted: 5, mvpDelivered: 1 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Primer cliente recurrente', 'Pipeline CI/CD', 'Métricas de calidad'], expectedMonths: 6, targetKPIs: { recurringClients: 1, ciCdSetup: true } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Producto propio', 'Open source contribution'], expectedMonths: 10, targetKPIs: { financialAutonomy: true, openSourceRepos: 1 } },
    ],
  },
  medicos: {
    typicalSubTrees: [
      { name: 'Consultas', budgetPct: 40, members: 3, goals: 'Atención de pacientes y consultas médicas' },
      { name: 'Especialidades', budgetPct: 25, members: 2, goals: 'Derivaciones y atención especializada' },
      { name: 'Administración', budgetPct: 20, members: 2, goals: 'Agenda, facturación y gestión de historiales' },
      { name: 'Reserva', budgetPct: 15, members: 0, goals: 'Equipamiento médico, insumos y emergencias' },
    ],
    budgetAllocation: { tools: 15, personnel: 55, services: 15, contingency: 15 },
    capitalInicial: 8000000,
    roiMonth: 12,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo médico', 'Habilitar consultorio', 'Registros sanitarios'], expectedMonths: 2, targetKPIs: { membersOnboarded: 3, consultorioHabilitado: true } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['50 pacientes atendidos', 'Sistema de turnos', 'Historias clínicas digitalizadas'], expectedMonths: 4, targetKPIs: { patientsAttended: 50 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Convenio con obra social', 'Pacientes recurrentes', 'Ajuste de honorarios'], expectedMonths: 6, targetKPIs: { obraSocialConvenio: 1, recurringPatients: 20 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Atención multidisciplinaria', 'Exportar modelo'], expectedMonths: 12, targetKPIs: { financialAutonomy: true, disciplinesCount: 3 } },
    ],
  },
  abogados: {
    typicalSubTrees: [
      { name: 'Litigios', budgetPct: 35, members: 2, goals: 'Representación legal en juicios y mediaciones' },
      { name: 'Consultoría', budgetPct: 25, members: 2, goals: 'Asesoría legal preventiva y contratos' },
      { name: 'Corporativo', budgetPct: 20, members: 1, goals: 'Constitución de empresas y compliance' },
      { name: 'Administración', budgetPct: 20, members: 2, goals: 'Gestión de expedientes, cobranza y agenda' },
    ],
    budgetAllocation: { tools: 10, personnel: 60, services: 15, contingency: 15 },
    capitalInicial: 4000000,
    roiMonth: 12,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo legal', 'Habilitar estudio', 'Inscripción en colegio'], expectedMonths: 2, targetKPIs: { membersOnboarded: 3, estudioHabilitado: true } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['5 causas iniciadas', 'Sistema de gestión', 'Primeros honorarios'], expectedMonths: 4, targetKPIs: { casesOpened: 5 } },
      { phase: 3, phaseName: 'Validación', objectives: ['2 causas ganadas', 'Clientes corporativos', 'Ajuste de honorarios'], expectedMonths: 6, targetKPIs: { casesWon: 2, corporativeClients: 1 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Especialización por rama', 'Exportar modelo'], expectedMonths: 12, targetKPIs: { financialAutonomy: true, specialtyBranches: 2 } },
    ],
  },
  contadores: {
    typicalSubTrees: [
      { name: 'Contabilidad', budgetPct: 40, members: 2, goals: 'Registros contables, balances y estados financieros' },
      { name: 'Impuestos', budgetPct: 25, members: 2, goals: 'Declaraciones juradas, IVA y planificación fiscal' },
      { name: 'Auditoría', budgetPct: 15, members: 1, goals: 'Auditorías internas y externas' },
      { name: 'Administración', budgetPct: 20, members: 2, goals: 'Atención a clientes, cobranza y gestión' },
    ],
    budgetAllocation: { tools: 10, personnel: 60, services: 15, contingency: 15 },
    capitalInicial: 2500000,
    roiMonth: 10,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo contable', 'Software de gestión', 'Registro profesional'], expectedMonths: 2, targetKPIs: { membersOnboarded: 2, softwareSetup: true } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['10 clientes activos', 'Primeras declaraciones', 'Sistema de cobranza'], expectedMonths: 4, targetKPIs: { activeClients: 10 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Clientes recurrentes', 'Auditorías completadas', 'Ajuste de tarifas'], expectedMonths: 6, targetKPIs: { auditsCompleted: 2, recurringClients: 5 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Consultoría fiscal avanzada', 'Exportar modelo'], expectedMonths: 10, targetKPIs: { financialAutonomy: true, fiscalConsulting: true } },
    ],
  },
  profesores: {
    typicalSubTrees: [
      { name: 'Cátedras', budgetPct: 40, members: 3, goals: 'Dictado de clases y preparación de material' },
      { name: 'Tutorías', budgetPct: 25, members: 2, goals: 'Apoyo personalizado y refuerzo académico' },
      { name: 'Investigación', budgetPct: 15, members: 1, goals: 'Desarrollo de contenido y publicaciones' },
      { name: 'Administración', budgetPct: 20, members: 2, goals: 'Gestión de alumnos, cobranza y agenda' },
    ],
    budgetAllocation: { tools: 10, personnel: 60, services: 15, contingency: 15 },
    capitalInicial: 2000000,
    roiMonth: 8,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo docente', 'Definir programas', 'Inscripción de alumnos'], expectedMonths: 2, targetKPIs: { membersOnboarded: 3, programsDefined: 3 } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['20 alumnos activos', 'Primeras evaluaciones', 'Material didáctico'], expectedMonths: 4, targetKPIs: { activeStudents: 20 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Alumnos recurrentes', 'Resultados de aprendizaje', 'Ajuste de programas'], expectedMonths: 6, targetKPIs: { recurringStudents: 10, avgSatisfaction: 80 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Programas propios', 'Exportar metodología'], expectedMonths: 8, targetKPIs: { financialAutonomy: true, proprietaryPrograms: 2 } },
    ],
  },
  fotografos: {
    typicalSubTrees: [
      { name: 'Producción', budgetPct: 40, members: 2, goals: 'Sesiones fotográficas, edición y post-producción' },
      { name: 'Comercial', budgetPct: 25, members: 2, goals: 'Ventas, marketing y captación de clientes' },
      { name: 'Equipamiento', budgetPct: 15, members: 1, goals: 'Mantenimiento y actualización de equipos' },
      { name: 'Administración', budgetPct: 20, members: 1, goals: 'Contratos, agenda y facturación' },
    ],
    budgetAllocation: { tools: 30, personnel: 40, services: 15, contingency: 15 },
    capitalInicial: 3500000,
    roiMonth: 8,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo', 'Adquirir equipo base', 'Portfolio inicial'], expectedMonths: 2, targetKPIs: { membersOnboarded: 2, portfolioPieces: 10 } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['5 clientes atendidos', 'Presencia online', 'Primeros ingresos'], expectedMonths: 4, targetKPIs: { clientsServed: 5 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Clientes recurrentes', 'Especialización', 'Ajuste de tarifas'], expectedMonths: 6, targetKPIs: { recurringClients: 3, specialtyDefined: true } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Estudio propio', 'Exportar estilo'], expectedMonths: 8, targetKPIs: { financialAutonomy: true, studioEstablished: true } },
    ],
  },
  restaurantes: {
    typicalSubTrees: [
      { name: 'Cocina', budgetPct: 35, members: 3, goals: 'Preparación de platos, menú y control de calidad' },
      { name: 'Salón', budgetPct: 20, members: 2, goals: 'Atención al cliente y servicio de mesa' },
      { name: 'Administración', budgetPct: 20, members: 2, goals: 'Compras, proveedores y finanzas' },
      { name: 'Marketing', budgetPct: 15, members: 1, goals: 'Redes sociales, promociones y delivery' },
      { name: 'Reserva', budgetPct: 10, members: 0, goals: 'Mantenimiento de equipos y emergencias' },
    ],
    budgetAllocation: { tools: 20, personnel: 45, services: 20, contingency: 15 },
    capitalInicial: 10000000,
    roiMonth: 12,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo', 'Habilitar cocina', 'Permisos sanitarios'], expectedMonths: 2, targetKPIs: { membersOnboarded: 5, cocinaHabilitada: true } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['Apertura al público', 'Menú estable', '50 cubiertos/día'], expectedMonths: 4, targetKPIs: { dailyCovers: 50 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Clientes recurrentes', 'Reseñas positivas', 'Ajuste de menú'], expectedMonths: 6, targetKPIs: { recurringCustomers: 30, avgRating: 4 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Carta de vinos', 'Exportar concepto'], expectedMonths: 12, targetKPIs: { financialAutonomy: true, expandedMenu: true } },
    ],
  },
  albañiles: {
    typicalSubTrees: [
      { name: 'Obra', budgetPct: 45, members: 3, goals: 'Albañilería, hormigón y estructura' },
      { name: 'Terminaciones', budgetPct: 25, members: 2, goals: 'Yeso, pintura y revestimientos' },
      { name: 'Administración', budgetPct: 15, members: 1, goals: 'Presupuestos y gestión de trabajos' },
      { name: 'Reserva', budgetPct: 15, members: 0, goals: 'Herramientas y materiales de emergencia' },
    ],
    budgetAllocation: { tools: 20, personnel: 50, services: 15, contingency: 15 },
    capitalInicial: 3000000,
    roiMonth: 10,
    milestones: [
      { phase: 1, phaseName: 'Constitución', objectives: ['Formar equipo', 'Adquirir herramientas', 'Primer trabajo'], expectedMonths: 2, targetKPIs: { membersOnboarded: 3, toolsReady: true } },
      { phase: 2, phaseName: 'Operación inicial', objectives: ['3 obras pequeñas', 'Calidad consistente', '80% puntualidad'], expectedMonths: 4, targetKPIs: { jobsCompleted: 3 } },
      { phase: 3, phaseName: 'Validación', objectives: ['Clientes satisfechos', 'Obras medianas', 'Ajuste de tarifas'], expectedMonths: 6, targetKPIs: { clientSatisfaction: 85, mediumJobs: 1 } },
      { phase: 4, phaseName: 'Autonomía', objectives: ['Autonomía financiera', 'Especialización', 'Exportar oficio'], expectedMonths: 10, targetKPIs: { financialAutonomy: true, specialtyWorkers: 2 } },
    ],
  },
  lawyers: {
    typicalSubTrees: [
      { name: 'Litigation', budgetPct: 35, members: 2, goals: 'Legal representation in court and mediation' },
      { name: 'Consulting', budgetPct: 25, members: 2, goals: 'Preventive legal advice and contracts' },
      { name: 'Corporate', budgetPct: 20, members: 1, goals: 'Company incorporation and compliance' },
      { name: 'Administration', budgetPct: 20, members: 2, goals: 'Case management, billing and scheduling' },
    ],
    budgetAllocation: { tools: 10, personnel: 60, services: 15, contingency: 15 },
    capitalInicial: 5000000,
    roiMonth: 12,
    milestones: [
      { phase: 1, phaseName: 'Setup', objectives: ['Form legal team', 'Setup office', 'Bar registration'], expectedMonths: 2, targetKPIs: { membersOnboarded: 3, officeReady: true } },
      { phase: 2, phaseName: 'Initial ops', objectives: ['5 cases opened', 'Case management system', 'First fees collected'], expectedMonths: 4, targetKPIs: { casesOpened: 5 } },
      { phase: 3, phaseName: 'Validation', objectives: ['2 cases won', 'Corporate clients', 'Fee adjustment'], expectedMonths: 6, targetKPIs: { casesWon: 2, corporateClients: 1 } },
      { phase: 4, phaseName: 'Autonomy', objectives: ['Financial autonomy', 'Specialization by branch', 'Export model'], expectedMonths: 12, targetKPIs: { financialAutonomy: true, specialtyBranches: 2 } },
    ],
  },
};

const GROUP_TYPES = Object.keys(CATALOG);

async function main() {
  console.log('Seeding GroupStructure + GroupMilestone catalog...');

  // Delete existing data
  await prisma.groupMilestone.deleteMany();
  console.log('Deleted GroupMilestone rows.');

  await prisma.groupStructure.deleteMany();
  console.log('Deleted GroupStructure rows.');

  let structureCount = 0;
  let milestoneCount = 0;

  for (const groupType of GROUP_TYPES) {
    const def = CATALOG[groupType];
    if (!def) continue;

    // Insert GroupStructure
    await prisma.groupStructure.create({
      data: {
        groupType,
        typicalSubTrees: def.typicalSubTrees as any,
        budgetAllocation: def.budgetAllocation as any,
        capitalInicial: def.capitalInicial || null,
        roiMonth: def.roiMonth || null,
        source: 'seed',
        usageCount: 1,
      },
    });
    structureCount++;

    // Insert GroupMilestones
    for (const m of def.milestones) {
      await prisma.groupMilestone.create({
        data: {
          groupType,
          phase: m.phase,
          phaseName: m.phaseName,
          objectives: m.objectives as any,
          expectedMonths: m.expectedMonths,
          targetKPIs: m.targetKPIs as any,
        },
      });
      milestoneCount++;
    }
  }

  console.log(`Done. ${structureCount} GroupStructures + ${milestoneCount} GroupMilestones seeded.`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
