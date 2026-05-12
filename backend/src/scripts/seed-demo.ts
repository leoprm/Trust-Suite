/**
 * Seed script — Demo data for Trust Suite
 * Run: npx tsx src/scripts/seed-demo.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const uuid = () => crypto.randomUUID();
const now = () => new Date();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

// ── Existing user IDs ──
const LEO_ID    = '4b9a8ce2-76b0-42e9-be80-4b37059d30d5';
const TEST1_ID  = '0a5d3289-cfdc-4cf9-aae7-c1f1c8e10671';
const TEST2_ID  = '85970724-84f8-4434-a0be-24951d0a50e6';

async function main() {
  console.log('🌱 Seeding demo data...\n');

  const existingTrees = await prisma.tree.count();
  if (existingTrees > 0) {
    console.log(`🧹 Cleaning ${existingTrees} existing trees and related data...`);
    // Delete in order: tasks → branch members → branches → tree members → needs → ideas → trees
    await prisma.task.deleteMany();
    await (prisma as any).memberPayment.deleteMany();
    await (prisma as any).treeExpense.deleteMany();
    await prisma.branchMember.deleteMany();
    await prisma.branch.deleteMany();
    await (prisma as any).expertEndorsement.deleteMany();
    await (prisma as any).insightInternalMatch.deleteMany();
    await (prisma as any).insightExternalOpening.deleteMany();
    await (prisma as any).insightCorporateReferral.deleteMany();
    await (prisma as any).insightSignal.deleteMany();
    await prisma.treeMember.deleteMany();
    await prisma.needTree.deleteMany();
    await prisma.idea.deleteMany();
    await prisma.need.deleteMany();
    // External needs cascade: delete children first
    await (prisma as any).budgetLine.deleteMany();
    await (prisma as any).solutionProposal.deleteMany();
    await (prisma as any).scopePreference.deleteMany();
    await (prisma as any).externalAgent.deleteMany();
    await prisma.externalNeed.deleteMany();
    await prisma.tree.deleteMany();
    // Delete demo users (keep originals: Leo, testuser123, usuariotest999)
    await prisma.user.deleteMany({ where: { id: { notIn: [LEO_ID, TEST1_ID, TEST2_ID] } } });
    console.log('   ✅ Cleaned. Starting fresh.\n');
  }

  // ══════════════════════════════════════════
  // 1. USERS
  // ══════════════════════════════════════════
  console.log('📝 Creating users...');
  const hash = await bcrypt.hash('demo123', 10);

  const userDefs = [
    { username: 'María García',   email: 'maria@demo.com',   role: 'PERSON' as const },
    { username: 'Pedro Rodríguez', email: 'pedro@demo.com',   role: 'PERSON' as const },
    { username: 'Ana Martínez',   email: 'ana@demo.com',     role: 'PERSON' as const },
    { username: 'Carlos López',   email: 'carlos@demo.com',  role: 'PERSON' as const },
    { username: 'Elena Vargas',   email: 'elena@demo.com',   role: 'PERSON' as const },
    { username: 'Diego Morales',  email: 'diego@demo.com',   role: 'PERSON' as const },
    { username: 'Valentina Ruiz', email: 'vale@demo.com',    role: 'PERSON' as const },
  ];

  const newUsers: Record<string, string> = {};
  for (const u of userDefs) {
    const existing = await prisma.user.findFirst({ where: { email: u.email } });
    if (existing) { newUsers[u.username] = existing.id; continue; }
    const user = await prisma.user.create({
      data: {
        id: uuid(), username: u.username, email: u.email, password: hash,
        role: u.role, is_onboarded: true, sharingCode: crypto.randomBytes(6).toString('hex'),
        publicProfileEnabled: true, is_guest: false,
      },
    });
    newUsers[u.username] = user.id;
  }

  // Use existing test users too
  const allUserIds = [
    { name: 'Leo',             id: LEO_ID },
    { name: 'María García',   id: newUsers['María García'] },
    { name: 'Pedro Rodríguez', id: newUsers['Pedro Rodríguez'] },
    { name: 'Ana Martínez',   id: newUsers['Ana Martínez'] },
    { name: 'Carlos López',   id: newUsers['Carlos López'] },
    { name: 'Elena Vargas',   id: newUsers['Elena Vargas'] },
    { name: 'Diego Morales',  id: newUsers['Diego Morales'] },
    { name: 'Valentina Ruiz', id: newUsers['Valentina Ruiz'] },
    { name: 'testuser123',    id: TEST1_ID },
    { name: 'usuariotest999', id: TEST2_ID },
  ];
  const uid = (name: string) => allUserIds.find(u => u.name === name)!.id;
  console.log(`   ✅ ${userDefs.length} users created (10 total with existing)`);

  // ══════════════════════════════════════════
  // 2. TREES
  // ══════════════════════════════════════════
  console.log('🌳 Creating trees...');

  const tree1Id = uuid(), tree2Id = uuid(), tree3Id = uuid();

  await prisma.tree.createMany({
    data: [
      {
        id: tree1Id, name: 'EcoAldea Santiago', icono: '🌿', country: 'Chile',
        city: 'Santiago', sector: 'Centro', visibility: 'PUBLIC', admissionPolicy: 'OPEN',
        allowHashtags: true, allowTraditionalBranches: true, hashtagCreationPolicy: 'ADMIN_AND_USERS',
        economyMode: 'BERRIES_ACTIVE', presupuestoTotal: 500, modoGobierno: 'DEMOCRATICO',
        creatorId: LEO_ID, capacidades: 'Agricultura urbana, Compostaje, Energía solar, Reciclaje, Educación ambiental',
        description: 'Comunidad autosustentable enfocada en ecología urbana y producción local de alimentos',
        inviteCode: 'ECO-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
      {
        id: tree2Id, name: 'TechBuilders Valparaíso', icono: '💻', country: 'Chile',
        city: 'Valparaíso', sector: 'Cerro Alegre', visibility: 'PUBLIC', admissionPolicy: 'INVITE_ONLY',
        allowHashtags: true, allowTraditionalBranches: true, hashtagCreationPolicy: 'ADMIN_ONLY',
        economyMode: 'LEGACY_FIAT', presupuestoTotal: 1000, modoGobierno: 'DEMOCRATICO',
        creatorId: LEO_ID, capacidades: 'Desarrollo web, Diseño UX/UI, DevOps, Data Science, Marketing digital',
        description: 'Cooperativa tecnológica para proyectos digitales con impacto social',
        inviteCode: 'TECH-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
      {
        id: tree3Id, name: 'Manos Solidarias Concepción', icono: '🤝', country: 'Chile',
        city: 'Concepción', sector: 'Barrio Universitario', visibility: 'PRIVATE', admissionPolicy: 'OPEN',
        allowHashtags: false, allowTraditionalBranches: true,
        economyMode: 'NO_ECONOMY', presupuestoTotal: 200, modoGobierno: 'DEMOCRATICO',
        creatorId: LEO_ID, capacidades: 'Voluntariado, Cocina comunitaria, Apoyo escolar, Huertos urbanos',
        description: 'Red de apoyo mutuo y voluntariado para la comunidad penquista',
        inviteCode: 'MANOS-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
    ],
  });

  // Tree members: all 10 users in all 3 trees
  const skillsMap: Record<string, string> = {
    'Leo':             '["liderazgo","gestión","tecnología"]',
    'María García':   '["huerta","compostaje","educación ambiental"]',
    'Pedro Rodríguez': '["plomería","construcción","energía solar"]',
    'Ana Martínez':    '["react","diseño UX","frontend"]',
    'Carlos López':    '["devops","linux","postgresql"]',
    'Elena Vargas':    '["cocina","organización","voluntariado"]',
    'Diego Morales':   '["backend","nodejs","api"]',
    'Valentina Ruiz':  '["marketing","redes sociales","eventos"]',
    'testuser123':     '["testing","qa"]',
    'usuariotest999':  '["datos","excel"]',
  };

  const memberData: any[] = [];
  for (const u of allUserIds) {
    for (const treeId of [tree1Id, tree2Id, tree3Id]) {
      memberData.push({
        id: uuid(), userId: u.id, treeId,
        status: 'VERIFIED' as const,
        role: u.name === 'Leo' ? 'ADMIN' as const : 'MEMBER' as const,
        xp: Math.floor(Math.random() * 500),
        level: Math.floor(Math.random() * 5) + 1,
        needPointsPool: 1000,
        availableNeedPoints: 1000,
        skills: skillsMap[u.name] || '[]',
        strikesEconomicos: '[]', goldenTickets: '[]',
        bayasBalance: Math.random() * 200,
      });
    }
  }
  await prisma.treeMember.createMany({ data: memberData });
  console.log('   ✅ 3 trees, 30 memberships');

  // ══════════════════════════════════════════
  // 3. NEEDS + NeedTree
  // ══════════════════════════════════════════
  console.log('📋 Creating needs...');

  const needs = [
    // Tree 1
    { id: uuid(), creatorId: uid('María García'), title: 'Falta sistema de riego para huerta principal', description: 'La huerta principal de 200m² necesita riego automatizado. Actualmente se riega a mano con manguera, lo que consume 2 horas diarias.', status: 'ACTIVE', treeId: tree1Id },
    { id: uuid(), creatorId: uid('Pedro Rodríguez'), title: 'Organizar taller de compostaje para vecinos', description: 'Capacitar a 30 vecinos en técnicas de compostaje doméstico y comunitario. Se necesita preparar material didáctico y coordinar espacio.', status: 'IN_PROGRESS', treeId: tree1Id },
    { id: uuid(), creatorId: uid('Carlos López'), title: 'Instalar paneles solares en sede comunitaria', description: 'Reducir dependencia de red eléctrica. La sede gasta $80.000/mes en electricidad. Evaluar viabilidad de 6 paneles.', status: 'ACTIVE', proposesHashtag: true, treeId: tree1Id },
    // Tree 2
    { id: uuid(), creatorId: uid('Ana Martínez'), title: 'Diseñar landing page para ONG Esperanza', description: 'ONG Esperanza necesita presencia web moderna. Landing page informativa con formulario de donaciones y blog.', status: 'ACTIVE', treeId: tree2Id },
    { id: uuid(), creatorId: uid('Diego Morales'), title: 'Migrar base de datos legacy a PostgreSQL', description: 'Base de datos actual corre en MySQL 5.6 sin soporte. Migrar 15GB de datos manteniendo integridad referencial.', status: 'IN_PROGRESS', treeId: tree2Id },
    // Tree 3
    { id: uuid(), creatorId: uid('Elena Vargas'), title: 'Faltan voluntarios para cocina comunitaria sabatina', description: 'Cada sábado se sirven 80 almuerzos. Se necesitan 4 voluntarios por turno, actualmente solo hay 2.', status: 'ACTIVE', treeId: tree3Id },
    { id: uuid(), creatorId: uid('Valentina Ruiz'), title: 'Conseguir donaciones de útiles escolares', description: 'Meta: 100 kits escolares para niños de escuelas rurales. Campaña de marzo.', status: 'RESOLVED', treeId: tree3Id },
    { id: uuid(), creatorId: uid('María García'), title: 'Organizar ciclo de cine comunitario', description: 'Ciclo mensual de documentales ambientales con foro de discusión en la plaza del barrio. Proyector y sillas necesarios.', status: 'ACTIVE', treeId: tree3Id },
  ];

  for (const n of needs) {
    const treeId = (n as any).treeId; delete (n as any).treeId;
    await prisma.need.create({ data: n as any });
    await prisma.needTree.create({ data: { id: uuid(), needId: n.id, treeId } });
  }
  console.log(`   ✅ ${needs.length} needs`);

  // ══════════════════════════════════════════
  // 4. EXTERNAL NEEDS (Tree 2)
  // ══════════════════════════════════════════
  console.log('🌐 Creating external needs...');

  const extNeed1Id = uuid(), extNeed2Id = uuid();
  await prisma.externalNeed.createMany({
    data: [
      {
        id: extNeed1Id, treeId: tree2Id, createdById: uid('Ana Martínez'),
        title: 'Cliente externo: TiendaLocal necesita app móvil de delivery',
        description: 'Tienda de barrio con 5 sucursales quiere app propia para delivery. Incluye tracking en tiempo real, catálogo de productos y pasarela de pago.',
        status: 'OPEN', budgetMinFiat: 2000000, budgetMaxFiat: 5000000, currency: 'CLP',
        visibility: 'TREE_ONLY', deadline: new Date(Date.now() + 30*86400000),
      },
      {
        id: extNeed2Id, treeId: tree2Id, createdById: uid('Pedro Rodríguez'),
        title: 'Colegio Municipal busca plataforma de gestión de notas',
        description: 'Sistema web con roles profesor/alumno/apoderado, generación de reportes PDF y notificaciones por email.',
        status: 'UNDER_REVIEW', budgetMinFiat: 1500000, budgetMaxFiat: 3500000, currency: 'CLP',
        visibility: 'TREE_ONLY',
      },
    ],
  });
  console.log('   ✅ 2 external needs');

  // External agents
  console.log('👤 Creating external agents...');
  const agent1Id = uuid(), agent2Id = uuid(), agent3Id = uuid();
  await (prisma as any).externalAgent.createMany({
    data: [
      { id: agent1Id, externalNeedId: extNeed1Id, name: 'Laura Mendoza', email: 'laura@tiendalocal.cl', organization: 'TiendaLocal SpA', role: 'CLIENT', consentAccepted: true },
      { id: agent2Id, externalNeedId: extNeed2Id, name: 'Roberto Fuentes', email: 'rfuentes@colegio.cl', organization: 'Colegio Municipal Los Álamos', role: 'CLIENT', consentAccepted: true },
      { id: agent3Id, externalNeedId: extNeed2Id, name: 'Carolina Pizarro', email: 'cpizarro@colegio.cl', organization: 'Colegio Municipal Los Álamos', role: 'APPROVER', consentAccepted: true },
    ],
  });
  console.log('   ✅ 3 external agents');

  // Scope preferences (Puntos de Alcance)
  console.log('🎯 Creating scope preferences...');
  await (prisma as any).scopePreference.createMany({
    data: [
      // TiendaLocal app
      { id: uuid(), externalNeedId: extNeed1Id, label: 'Rapidez de entrega', score: 9, description: 'El delivery debe ser rápido, con tracking en tiempo real', agentId: agent1Id, labelKey: 'rapidez de entrega', createdById: uid('Ana Martínez') },
      { id: uuid(), externalNeedId: extNeed1Id, label: 'Bajo costo', score: 7, description: 'Presupuesto ajustado a pequeña empresa', agentId: agent1Id, labelKey: 'bajo costo', createdById: uid('Ana Martínez') },
      { id: uuid(), externalNeedId: extNeed1Id, label: 'Facilidad de uso', score: 10, description: 'Interfaz simple para vendedores no técnicos', agentId: agent1Id, labelKey: 'facilidad de uso', createdById: uid('Ana Martínez') },
      { id: uuid(), externalNeedId: extNeed1Id, label: 'Escalabilidad', score: 5, description: 'Solo 5 sucursales por ahora', agentId: agent1Id, labelKey: 'escalabilidad', createdById: uid('Ana Martínez') },
      // Colegio Municipal
      { id: uuid(), externalNeedId: extNeed2Id, label: 'Seguridad de datos', score: 10, description: 'Datos de menores — máxima protección legal', agentId: agent2Id, labelKey: 'seguridad de datos', createdById: uid('Pedro Rodríguez') },
      { id: uuid(), externalNeedId: extNeed2Id, label: 'Facilidad de uso', score: 9, description: 'Profesores mayores deben poder usarlo sin capacitación', agentId: agent2Id, labelKey: 'facilidad de uso', createdById: uid('Pedro Rodríguez') },
      { id: uuid(), externalNeedId: extNeed2Id, label: 'Soporte posterior', score: 8, description: 'Mantención durante año escolar', agentId: agent2Id, labelKey: 'soporte posterior', createdById: uid('Pedro Rodríguez') },
      { id: uuid(), externalNeedId: extNeed2Id, label: 'Bajo costo', score: 6, description: 'Presupuesto municipal limitado', agentId: agent2Id, labelKey: 'bajo costo', createdById: uid('Pedro Rodríguez') },
    ],
  });
  console.log('   ✅ 8 scope preferences');

  // Solution proposals with budgets
  console.log('📋 Creating solution proposals...');
  const sol1Id = uuid(), sol2Id = uuid(), sol3Id = uuid();
  await (prisma as any).solutionProposal.createMany({
    data: [
      {
        id: sol1Id, externalNeedId: extNeed1Id, createdById: uid('Diego Morales'),
        title: 'App React Native + Firebase', description: 'App móvil nativa con backend Firebase. Tracking GPS, catálogo con imágenes, pasarela WebPay.', status: 'SUBMITTED',
        estimatedFiatMin: 2500000, estimatedFiatExpected: 3400000, estimatedFiatMax: 4500000, currency: 'CLP', estimatedDurationDays: 60, riskLevel: 'MEDIUM',
        assumptions: 'Cliente proporciona imágenes de productos y logo', included: 'Desarrollo app iOS/Android, panel admin web, Firebase hosting 1 año, capacitación 4h',
        excluded: 'Campaña de marketing, contenido de productos, hardware', deliverables: 'APK + IPA publicables, panel admin, documentación técnica',
        acceptanceCriteria: 'App funcional en 5 sucursales, tracking GPS < 30s de延迟, pasarela de pago operativa', maintenanceNotes: 'Firebase ~$30 USD/mes, actualizaciones OS anuales',
      },
      {
        id: sol2Id, externalNeedId: extNeed1Id, createdById: uid('Carlos López'),
        title: 'PWA económica con Supabase', description: 'Progressive Web App con Supabase. Más económica, funciona offline, sin necesidad de tiendas.', status: 'SUBMITTED',
        estimatedFiatMin: 1200000, estimatedFiatExpected: 1800000, estimatedFiatMax: 2200000, currency: 'CLP', estimatedDurationDays: 45, riskLevel: 'LOW',
        assumptions: 'Clientes usan Chrome/Safari moderno', included: 'PWA responsive, panel admin, Supabase hosting 1 año, capacitación 2h',
        excluded: 'App nativa, notificaciones push en iOS', deliverables: 'URL de PWA, panel admin, documentación',
        acceptanceCriteria: 'PWA instalable en 5 dispositivos, pedidos offline sincronizan al conectar', maintenanceNotes: 'Supabase ~$25 USD/mes, actualizaciones trimestrales',
      },
      {
        id: sol3Id, externalNeedId: extNeed2Id, createdById: uid('Diego Morales'),
        title: 'Sistema web Full-Stack Node.js + PostgreSQL', description: 'Aplicación web responsive con roles, generación PDF, notificaciones email. Deploy en VPS.', status: 'SUBMITTED',
        estimatedFiatMin: 2000000, estimatedFiatExpected: 2800000, estimatedFiatMax: 3200000, currency: 'CLP', estimatedDurationDays: 75, riskLevel: 'MEDIUM',
        assumptions: 'Colegio proporciona formato de notas actual', included: 'Sistema web, 3 roles, reportes PDF, notificaciones, VPS 1 año, capacitación 8h, migración de datos históricos',
        excluded: 'App móvil nativa, integración con Mineduc', deliverables: 'URL del sistema, manuales por rol, backup automático configurado',
        acceptanceCriteria: '1000 alumnos cargados, reportes PDF < 5s, email notificaciones < 2min', maintenanceNotes: 'VPS ~$40 USD/mes, backups diarios, soporte 6 meses incluido',
      },
    ],
  });
  console.log('   ✅ 3 solution proposals');

  // Budget lines for each solution
  console.log('💰 Creating budget lines...');
  await (prisma as any).budgetLine.createMany({
    data: [
      // Sol1: React Native + Firebase
      { id: uuid(), solutionProposalId: sol1Id, label: 'Desarrollo frontend (React Native)', type: 'LABOR', estimatedFiat: 1200000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol1Id, label: 'Desarrollo backend (Firebase)', type: 'LABOR', estimatedFiat: 800000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol1Id, label: 'Diseño UI/UX', type: 'LABOR', estimatedFiat: 500000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol1Id, label: 'Testing y QA', type: 'LABOR', estimatedFiat: 400000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol1Id, label: 'Hosting Firebase 1 año', type: 'INFRASTRUCTURE', estimatedFiat: 360000, estimatedBerries: 0, currency: 'CLP', quantity: 12, unit: 'meses', unitCostFiat: 30000 },
      { id: uuid(), solutionProposalId: sol1Id, label: 'Reserva de contingencia (15%)', type: 'RESERVE', estimatedFiat: 489000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'global' },
      // Sol2: PWA + Supabase
      { id: uuid(), solutionProposalId: sol2Id, label: 'Desarrollo PWA', type: 'LABOR', estimatedFiat: 800000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol2Id, label: 'Configuración Supabase', type: 'LABOR', estimatedFiat: 300000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol2Id, label: 'Diseño UI', type: 'LABOR', estimatedFiat: 250000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol2Id, label: 'Hosting Supabase 1 año', type: 'INFRASTRUCTURE', estimatedFiat: 300000, estimatedBerries: 0, currency: 'CLP', quantity: 12, unit: 'meses', unitCostFiat: 25000 },
      { id: uuid(), solutionProposalId: sol2Id, label: 'Reserva (10%)', type: 'RESERVE', estimatedFiat: 165000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'global' },
      // Sol3: Full-Stack Node.js
      { id: uuid(), solutionProposalId: sol3Id, label: 'Desarrollo backend (Node.js + PostgreSQL)', type: 'LABOR', estimatedFiat: 900000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol3Id, label: 'Desarrollo frontend (React)', type: 'LABOR', estimatedFiat: 600000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol3Id, label: 'Migración de datos históricos', type: 'LABOR', estimatedFiat: 400000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol3Id, label: 'Diseño UI/UX', type: 'LABOR', estimatedFiat: 350000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'proyecto' },
      { id: uuid(), solutionProposalId: sol3Id, label: 'VPS + dominio 1 año', type: 'INFRASTRUCTURE', estimatedFiat: 480000, estimatedBerries: 0, currency: 'CLP', quantity: 12, unit: 'meses', unitCostFiat: 40000 },
      { id: uuid(), solutionProposalId: sol3Id, label: 'Capacitación (8h)', type: 'EXTERNAL_SERVICE', estimatedFiat: 200000, estimatedBerries: 0, currency: 'CLP', quantity: 8, unit: 'horas', unitCostFiat: 25000 },
      { id: uuid(), solutionProposalId: sol3Id, label: 'Reserva (10%)', type: 'RESERVE', estimatedFiat: 293000, estimatedBerries: 0, currency: 'CLP', quantity: 1, unit: 'global' },
    ],
  });
  console.log('   ✅ 18 budget lines');

  // ══════════════════════════════════════════
  // 5. IDEAS (1-2 per need)
  // ══════════════════════════════════════════
  console.log('💡 Creating ideas...');

  const ideaDefs = [
    { needIdx: 0, creator: 'Carlos López', title: 'Sistema de riego por goteo con timer automático', desc: 'Instalación de tuberías de goteo con programador digital y sensor de humedad. Incluye recolección de agua lluvia con estanque de 500L.', likes: 12 },
    { needIdx: 1, creator: 'María García', title: 'Programa educativo de compostaje en 4 sesiones', desc: 'Talleres prácticos: fundamentos, técnicas, manejo de residuos y certificación. Material didáctico impreso y digital incluido.', likes: 8 },
    { needIdx: 2, creator: 'Pedro Rodríguez', title: 'Kit solar comunitario 2.4kW con baterías', desc: '6 paneles monocristalinos 400W, inversor híbrido 5kW, 4 baterías de litio 48V 100Ah. Instalación incluida.', likes: 15, proposesHashtag: true },
    { needIdx: 3, creator: 'Ana Martínez', title: 'Landing page Next.js con diseño premium', desc: 'Sitio estático generado con Next.js, animaciones Framer Motion, formulario de donaciones Stripe, blog con MDX. Tiempo estimado: 3 semanas.', likes: 10 },
    { needIdx: 3, creator: 'Diego Morales', title: 'Sitio WordPress rápido con tema personalizado', desc: 'WordPress con tema a medida, optimizado para Core Web Vitals. Más rápido de implementar pero menos flexible.', likes: 3 },
    { needIdx: 4, creator: 'Diego Morales', title: 'Migración gradual con réplicas sincronizadas', desc: 'Crear réplicas PostgreSQL sincronizadas, migrar por tablas con período de prueba de 2 semanas, rollback instantáneo.', likes: 7 },
    { needIdx: 5, creator: 'Elena Vargas', title: 'Sistema de turnos rotativos con app simple', desc: 'App web progresiva para registro de voluntarios, turnos automáticos y notificaciones WhatsApp.', likes: 6 },
    { needIdx: 6, creator: 'Valentina Ruiz', title: 'Campaña de recolección en colegios y empresas', desc: 'Alianzas con 5 colegios y 3 empresas para puntos de recolección. Marketing en redes sociales y volantes.', likes: 9 },
    { needIdx: 7, creator: 'María García', title: 'Ciclo de cine documental con foro abierto', desc: '6 documentales en 6 meses, pantalla inflable, sonido básico. Foro moderado por expertos locales después de cada función.', likes: 11 },
  ];

  const ideaIds: string[] = [];
  for (const idef of ideaDefs) {
    const ideaId = uuid();
    await prisma.idea.create({
      data: {
        id: ideaId, needId: needs[idef.needIdx].id, creatorId: uid(idef.creator),
        title: idef.title, description: idef.desc, likesCount: idef.likes,
        proposedPhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE']),
      },
    });
    ideaIds.push(ideaId);
  }
  console.log(`   ✅ ${ideaDefs.length} ideas`);

  // ══════════════════════════════════════════
  // 6. BRANCHES
  // ══════════════════════════════════════════
  console.log('🌿 Creating branches...');

  // EcoAldea: NORMAL + HASHTAG
  const branch1Id = uuid(); // Sistema Riego (NORMAL)
  const branch2Id = uuid(); // #CompostajeUrbano (HASHTAG)
  const branch3Id = uuid(); // #EnergíaSolar (HASHTAG)

  // TechBuilders: NORMAL + HASHTAG
  const branch4Id = uuid(); // Landing ONG (NORMAL)
  const branch5Id = uuid(); // #DataMigration (HASHTAG)

  // Manos Solidarias: solo NORMAL (allowHashtags=false)
  const branch6Id = uuid(); // Cocina Comunitaria (NORMAL)
  const branch7Id = uuid(); // Útiles para Todos (NORMAL)
  const branch8Id = uuid(); // Cine Comunitario (NORMAL)

  await prisma.branch.createMany({
    data: [
      { id: branch1Id, ideaId: ideaIds[0], treeId: tree1Id, name: 'Sistema de Riego Inteligente', type: 'NORMAL', phase: 'DEVELOPMENT', xpPool: 150, currentPhaseIndex: 1, activePhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION']), bayasFund: 0, valorOficial: 0, createdAt: daysAgo(14), userId: uid('Carlos López') },
      { id: branch2Id, treeId: tree1Id, name: '#CompostajeUrbano', type: 'HASHTAG', isHashtag: true, phase: 'PRODUCTION', xpPool: 80, currentPhaseIndex: 2, activePhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION']), bayasFund: 50, valorOficial: 30, createdAt: daysAgo(21), ideaId: ideaIds[1], userId: uid('María García') },
      { id: branch3Id, treeId: tree1Id, name: '#EnergíaSolar', type: 'HASHTAG', isHashtag: true, phase: 'INVESTIGATION', xpPool: 0, currentPhaseIndex: 0, activePhasesJson: JSON.stringify(['INVESTIGATION']), bayasFund: 0, valorOficial: 0, createdAt: daysAgo(3), ideaId: ideaIds[2], userId: uid('Pedro Rodríguez') },
      { id: branch4Id, ideaId: ideaIds[3], treeId: tree2Id, name: 'Landing ONG Esperanza', type: 'NORMAL', phase: 'PRODUCTION', xpPool: 300, currentPhaseIndex: 2, activePhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION']), bayasFund: 200, valorOficial: 150, createdAt: daysAgo(28), userId: uid('Ana Martínez') },
      { id: branch5Id, treeId: tree2Id, name: '#DataMigration', type: 'HASHTAG', isHashtag: true, phase: 'DEVELOPMENT', xpPool: 200, currentPhaseIndex: 1, activePhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT']), bayasFund: 100, valorOficial: 80, createdAt: daysAgo(10), ideaId: ideaIds[5], userId: uid('Diego Morales') },
      { id: branch6Id, treeId: tree3Id, name: 'Cocina Comunitaria Sábados', type: 'NORMAL', phase: 'MAINTENANCE', xpPool: 100, currentPhaseIndex: 4, activePhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE']), bayasFund: 0, valorOficial: 0, createdAt: daysAgo(60), ideaId: ideaIds[6], userId: uid('Elena Vargas') },
      { id: branch7Id, treeId: tree3Id, name: 'Útiles para Todos', type: 'NORMAL', phase: 'DISTRIBUTION', xpPool: 50, currentPhaseIndex: 3, activePhasesJson: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION']), bayasFund: 0, valorOficial: 0, createdAt: daysAgo(45), ideaId: ideaIds[7], userId: uid('Valentina Ruiz') },
      { id: branch8Id, treeId: tree3Id, name: 'Cine Comunitario', type: 'NORMAL', phase: 'INVESTIGATION', xpPool: 0, currentPhaseIndex: 0, activePhasesJson: JSON.stringify(['INVESTIGATION']), bayasFund: 0, valorOficial: 0, createdAt: daysAgo(5), ideaId: ideaIds[8], userId: uid('María García') },
    ],
  });

  // Branch members — 2-4 per branch
  const branchMembershipDefs: [string, string[]][] = [
    [branch1Id, ['Carlos López','Pedro Rodríguez','María García']],
    [branch2Id, ['María García','Elena Vargas','Leo','testuser123']],
    [branch3Id, ['Pedro Rodríguez','Carlos López']],
    [branch4Id, ['Ana Martínez','Diego Morales','Carlos López','Valentina Ruiz']],
    [branch5Id, ['Diego Morales','Carlos López','Ana Martínez']],
    [branch6Id, ['Elena Vargas','María García','Valentina Ruiz']],
    [branch7Id, ['Valentina Ruiz','Elena Vargas']],
    [branch8Id, ['María García','Valentina Ruiz','Leo','Elena Vargas']],
  ];
  const branchMemberInserts: any[] = [];
  for (const [bid, members] of branchMembershipDefs) {
    for (const m of members) {
      branchMemberInserts.push({
        id: uuid(), userId: uid(m), branchId: bid,
        joinedPhases: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE']),
        joinedAt: daysAgo(Math.floor(Math.random()*30)),
      });
    }
  }
  await prisma.branchMember.createMany({ data: branchMemberInserts });
  console.log(`   ✅ 8 branches, ${branchMemberInserts.length} branch members`);

  // ══════════════════════════════════════════
  // 7. TASKS
  // ══════════════════════════════════════════
  console.log('✅ Creating tasks...');

  const taskDefs = [
    // Branch 1: Sistema de Riego
    { branchId: branch1Id, name: 'Mapear terreno y calcular caudal', desc: 'Levantamiento topográfico del terreno, medición de presión de agua y cálculo de caudal necesario para 200m².', status: 'COMPLETED', assignedTo: uid('Carlos López'), creatorId: uid('María García'), phase: 'INVESTIGATION', difficulty: 3, hours: 8, completedAt: daysAgo(10), tags: ['riego','cálculo','topografía'] },
    { branchId: branch1Id, name: 'Instalar tuberías principales', desc: 'Tendido de 80m de tubería PVC 25mm con conexiones a cada sector de cultivo.', status: 'IN_PROGRESS', assignedTo: uid('Pedro Rodríguez'), creatorId: uid('Carlos López'), phase: 'DEVELOPMENT', difficulty: 5, hours: 20, tags: ['plomería','instalación'] },
    { branchId: branch1Id, name: 'Programar controlador de riego', desc: 'Configurar timer digital con 4 zonas, horarios diferenciados y sensor de humedad.', status: 'OPEN', creatorId: uid('Carlos López'), phase: 'DEVELOPMENT', difficulty: 4, hours: 6, requiresVoting: true, tags: ['programación','iot','automatización'] },

    // Branch 2: #CompostajeUrbano
    { branchId: branch2Id, name: 'Preparar material didáctico', desc: 'Diseñar e imprimir cuadernillos para 30 participantes con ilustraciones y ejercicios prácticos.', status: 'COMPLETED', assignedTo: uid('María García'), creatorId: uid('María García'), phase: 'INVESTIGATION', difficulty: 2, hours: 4, completedAt: daysAgo(18), tags: ['diseño','educación','compostaje'] },
    { branchId: branch2Id, name: 'Coordinar espacio con municipalidad', desc: 'Gestionar permiso de uso de sede vecinal por 4 sábados consecutivos.', status: 'IN_PROGRESS', assignedTo: uid('Elena Vargas'), creatorId: uid('María García'), phase: 'DEVELOPMENT', difficulty: 3, hours: 3, tags: ['gestión','coordinación','trámites'] },
    { branchId: branch2Id, name: 'Ejecutar taller sesión 3', desc: 'Sesión práctica: construcción de compostera doméstica con materiales reciclados.', status: 'OPEN', creatorId: uid('María García'), phase: 'PRODUCTION', difficulty: 3, hours: 4, isAnonymous: true, tags: ['compostaje','taller','práctico'] },

    // Branch 3: #EnergíaSolar
    { branchId: branch3Id, name: 'Auditar consumo eléctrico de la sede', desc: 'Registrar consumo durante 2 semanas, identificar picos y calcular ahorro potencial.', status: 'COMPLETED', assignedTo: uid('Carlos López'), creatorId: uid('Pedro Rodríguez'), phase: 'INVESTIGATION', difficulty: 2, hours: 5, completedAt: daysAgo(2), tags: ['energía','auditoría'] },
    { branchId: branch3Id, name: 'Cotizar proveedores de paneles', desc: 'Solicitar cotizaciones a 3 proveedores, comparar precios, garantías y servicio post-venta.', status: 'IN_PROGRESS', assignedTo: uid('Pedro Rodríguez'), creatorId: uid('Pedro Rodríguez'), phase: 'INVESTIGATION', difficulty: 2, hours: 4, tags: ['compras','evaluación'] },

    // Branch 4: Landing ONG Esperanza
    { branchId: branch4Id, name: 'Wireframes y mockups en Figma', desc: 'Diseñar 5 pantallas principales: home, sobre nosotros, proyectos, donar, contacto.', status: 'COMPLETED', assignedTo: uid('Ana Martínez'), creatorId: uid('Ana Martínez'), phase: 'INVESTIGATION', difficulty: 4, hours: 12, completedAt: daysAgo(25), tags: ['diseño','figma','ux'] },
    { branchId: branch4Id, name: 'Implementar diseño responsive', desc: 'Convertir mockups a código con Tailwind CSS, probar en 5 breakpoints.', status: 'COMPLETED', assignedTo: uid('Diego Morales'), creatorId: uid('Ana Martínez'), phase: 'DEVELOPMENT', difficulty: 5, hours: 16, completedAt: daysAgo(15), tags: ['frontend','tailwind','responsive'] },
    { branchId: branch4Id, name: 'Integrar pasarela de donaciones Stripe', desc: 'Configurar Stripe Checkout, webhooks para confirmación, página de agradecimiento.', status: 'IN_PROGRESS', assignedTo: uid('Carlos López'), creatorId: uid('Ana Martínez'), phase: 'DEVELOPMENT', difficulty: 6, hours: 10, requiresVoting: true, tags: ['stripe','backend','pagos'] },
    { branchId: branch4Id, name: 'SEO y optimización de carga', desc: 'Meta tags, sitemap, Schema.org, lazy loading, optimizar imágenes WebP, Lighthouse > 90.', status: 'OPEN', creatorId: uid('Diego Morales'), phase: 'PRODUCTION', difficulty: 3, hours: 8, tags: ['seo','optimización','performance'] },

    // Branch 5: #DataMigration
    { branchId: branch5Id, name: 'Análisis de esquema actual', desc: 'Documentar todas las tablas, relaciones, stored procedures y triggers del sistema legacy.', status: 'COMPLETED', assignedTo: uid('Carlos López'), creatorId: uid('Diego Morales'), phase: 'INVESTIGATION', difficulty: 4, hours: 10, completedAt: daysAgo(8), tags: ['análisis','documentación','mysql'] },
    { branchId: branch5Id, name: 'Escribir scripts de migración', desc: 'Desarrollar scripts Python con SQLAlchemy para transformar y migrar datos tabla por tabla.', status: 'IN_PROGRESS', assignedTo: uid('Diego Morales'), creatorId: uid('Diego Morales'), phase: 'DEVELOPMENT', difficulty: 7, hours: 25, tags: ['python','postgresql','migración'] },

    // Branch 6: Cocina Comunitaria
    { branchId: branch6Id, name: 'Planificar menú mensual balanceado', desc: 'Diseñar menú de 4 sábados con opciones vegetarianas, calcular porciones y costo por plato.', status: 'COMPLETED', assignedTo: uid('Elena Vargas'), creatorId: uid('Elena Vargas'), phase: 'INVESTIGATION', difficulty: 2, hours: 3, completedAt: daysAgo(55), tags: ['cocina','nutrición','planificación'] },
    { branchId: branch6Id, name: 'Conseguir donaciones de alimentos', desc: 'Contactar ferias libres y supermercados para donaciones regulares de verduras y abarrotes.', status: 'COMPLETED', assignedTo: uid('María García'), creatorId: uid('Elena Vargas'), phase: 'DEVELOPMENT', difficulty: 3, hours: 6, completedAt: daysAgo(40), tags: ['gestión','donaciones','alimentos'] },
    { branchId: branch6Id, name: 'Reclutar 2 voluntarios adicionales', desc: 'Publicar en redes sociales y universidad local. Entrevistar y capacitar.', status: 'OPEN', creatorId: uid('Elena Vargas'), phase: 'MAINTENANCE', difficulty: 3, hours: 5, isAnonymous: true, tags: ['reclutamiento','voluntariado'] },

    // Branch 7: Útiles para Todos
    { branchId: branch7Id, name: 'Contactar colegios para alianza', desc: 'Visitar 5 colegios del sector, presentar proyecto y firmar cartas de compromiso.', status: 'COMPLETED', assignedTo: uid('Valentina Ruiz'), creatorId: uid('Valentina Ruiz'), phase: 'INVESTIGATION', difficulty: 2, hours: 8, completedAt: daysAgo(35), tags: ['gestión','educación'] },
    { branchId: branch7Id, name: 'Diseñar afiches para campaña', desc: 'Crear 3 diseños para redes sociales y versión imprimible para puntos de recolección.', status: 'COMPLETED', assignedTo: uid('Valentina Ruiz'), creatorId: uid('Valentina Ruiz'), phase: 'DEVELOPMENT', difficulty: 2, hours: 4, completedAt: daysAgo(25), tags: ['diseño','marketing'] },

    // Branch 8: Cine Comunitario
    { branchId: branch8Id, name: 'Seleccionar documentales y conseguir derechos', desc: 'Curar 6 documentales ambientales con licencia Creative Commons o permisos de exhibición gratuita.', status: 'IN_PROGRESS', assignedTo: uid('María García'), creatorId: uid('María García'), phase: 'INVESTIGATION', difficulty: 3, hours: 6, tags: ['cine','gestión cultural'] },
    { branchId: branch8Id, name: 'Cotizar equipo de proyección', desc: 'Proyector 5000 lúmenes, pantalla inflable 4m, sistema de sonido básico.', status: 'OPEN', creatorId: uid('María García'), phase: 'INVESTIGATION', difficulty: 1, hours: 2, tags: ['compras','audiovisual'] },
  ];

  const taskIds: string[] = [];
  for (const t of taskDefs) {
    const tid = uuid();
    await prisma.task.create({
      data: {
        id: tid, branchId: t.branchId, name: t.name, description: t.desc,
        status: t.status as any, assignedTo: t.assignedTo || null, creatorId: t.creatorId,
        phase: t.phase as any, difficulty: t.difficulty, requiredHours: t.hours,
        requiresVoting: (t as any).requiresVoting || false,
        isAnonymous: (t as any).isAnonymous || false,
        completedAt: t.completedAt || null,
        completionComment: t.completedAt ? `Tarea completada satisfactoriamente por ${allUserIds.find(u => u.id === t.assignedTo)?.name || 'usuario'}.` : null,
      },
    });
    // Task tags
    for (const tag of t.tags) {
      await prisma.taskTag.create({ data: { id: uuid(), taskId: tid, skillName: tag } });
    }
    taskIds.push(tid);
  }
  console.log(`   ✅ ${taskDefs.length} tasks`);

  // ══════════════════════════════════════════
  // 8. USER SKILL XP
  // ══════════════════════════════════════════
  console.log('📊 Creating skill XP...');
  const completedTasks = taskDefs.filter(t => t.status === 'COMPLETED');
  for (const t of completedTasks) {
    if (!t.assignedTo) continue;
    for (const tag of t.tags) {
      // Find the tree for this task's branch
      const branch = [branch1Id, branch2Id, branch3Id, branch4Id, branch5Id, branch6Id, branch7Id, branch8Id]
        .indexOf(t.branchId);
      const treeMap = [tree1Id, tree1Id, tree1Id, tree2Id, tree2Id, tree3Id, tree3Id, tree3Id];
      const treeId = treeMap[branch];
      
      await prisma.userSkillXP.upsert({
        where: { userId_skillTag_treeId: { userId: t.assignedTo, skillTag: tag, treeId } },
        update: { accumulatedPoints: { increment: Math.floor((t.difficulty || 1) * 10) }, completedTasks: { increment: 1 }, updatedAt: now() },
        create: { id: uuid(), userId: t.assignedTo, skillTag: tag, treeId, accumulatedPoints: Math.floor((t.difficulty || 1) * 10), completedTasks: 1, updatedAt: now() },
      });
    }
  }
  console.log('   ✅ skill XP entries created');

  // ══════════════════════════════════════════
  // 9. INSIGHT SIGNALS (Cross-tree)
  // ══════════════════════════════════════════
  console.log('🔍 Creating insight signals...');

  const insightDefs = [
    // Tree 1 — EcoAldea Santiago
    { treeId: tree1Id, title: 'Falta experto en paneles solares para instalación', description: 'Necesitamos alguien con experiencia práctica en instalación de sistemas fotovoltaicos off-grid. La sede comunitaria requiere 2.4kW con baterías.', createdById: uid('María García'), status: 'INTERNAL_SEARCH', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['energía solar','instalación eléctrica','paneles']), persistenceScore: 75, capacityGapScore: 60, urgencyScore: 70 },
    { treeId: tree1Id, title: 'Diseñador de material educativo para taller de compostaje', description: 'Crear cuadernillos y presentaciones visuales para el programa de compostaje comunitario. 4 sesiones, 30 participantes.', createdById: uid('María García'), status: 'ACTIVE', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['diseño gráfico','educación','compostaje']), persistenceScore: 40, capacityGapScore: 30, urgencyScore: 45 },
    { treeId: tree1Id, title: 'Reparación de sistema de riego existente', description: 'El sistema de riego del sector norte tiene fugas. Se necesita plomero con experiencia en sistemas de goteo.', createdById: uid('Pedro Rodríguez'), status: 'INTERNAL_SOLUTION_FOUND', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['plomería','riego','mantenimiento']), internalSearchStartedAt: daysAgo(5), persistenceScore: 85, capacityGapScore: 20, urgencyScore: 80 },
    { treeId: tree1Id, title: 'Evaluación de impacto ambiental comunitario', description: 'Estudio de biodiversidad local y propuesta de corredor ecológico entre huertas vecinas. Requiere biólogo o ecólogo.', createdById: uid('Carlos López'), status: 'RESOLVED', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['biología','ecología','investigación']), resolutionNotes: 'Encontramos a una bióloga dentro de la red Trust que hizo el estudio pro bono.', persistenceScore: 60, capacityGapScore: 90, urgencyScore: 30 },
    // Tree 2 — TechBuilders Valparaíso
    { treeId: tree2Id, title: 'DevOps para migración de base de datos', description: 'Necesitamos alguien que configure CI/CD y monitoreo para la migración MySQL→PostgreSQL en curso.', createdById: uid('Diego Morales'), status: 'INTERNAL_SEARCH', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['devops','postgresql','CI/CD','docker']), persistenceScore: 80, capacityGapScore: 55, urgencyScore: 65 },
    { treeId: tree2Id, title: 'Especialista UX para app de delivery', description: 'Cliente externo (TiendaLocal) necesita app móvil. Buscamos UX researcher para tests de usabilidad con usuarios reales.', createdById: uid('Ana Martínez'), status: 'EXTERNAL_PEOPLE_OPEN', escalationLevel: 'EXTERNAL_PEOPLE', requiredSkillTags: JSON.stringify(['ux research','mobile','testing']), remoteAllowed: true, budgetFiatMin: 300000, budgetFiatMax: 800000, currency: 'CLP', persistenceScore: 70, capacityGapScore: 65, urgencyScore: 55, externalPeopleOpenedAt: daysAgo(3) },
    { treeId: tree2Id, title: 'Redactor técnico para documentación de API', description: 'Documentar endpoints REST y GraphQL del backend de la plataforma de gestión escolar.', createdById: uid('Diego Morales'), status: 'ACTIVE', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['documentación','api','redacción técnica']), persistenceScore: 45, capacityGapScore: 40, urgencyScore: 35 },
    // Tree 3 — Manos Solidarias Concepción
    { treeId: tree3Id, title: 'Chef o cocinero profesional para capacitación', description: 'Capacitar a voluntarios de cocina comunitaria en técnicas de cocina para grandes volúmenes y normas sanitarias.', createdById: uid('Elena Vargas'), status: 'ACTIVE', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['cocina','gastronomía','sanidad']), persistenceScore: 50, capacityGapScore: 45, urgencyScore: 40 },
    { treeId: tree3Id, title: 'Proyector y equipo audiovisual para cine comunitario', description: 'Necesitamos proyector 5000+ lúmenes para ciclo de cine al aire libre. Puede ser préstamo, donación o compra.', createdById: uid('María García'), status: 'INTERNAL_SOLUTION_FOUND', escalationLevel: 'INTERNAL_TRUST', requiredSkillTags: JSON.stringify(['audiovisual','gestión cultural']), internalSearchStartedAt: daysAgo(2), persistenceScore: 55, capacityGapScore: 35, urgencyScore: 60 },
    { treeId: tree3Id, title: 'Psicólogo infantil para apoyo escolar', description: 'Varios niños del programa de apoyo escolar muestran señales de necesitar contención emocional profesional.', createdById: uid('Elena Vargas'), status: 'EXTERNAL_PEOPLE_OPEN', escalationLevel: 'EXTERNAL_PEOPLE', requiredSkillTags: JSON.stringify(['psicología','infantil','educación']), remoteAllowed: false, locationText: 'Concepción', budgetFiatMin: 50000, budgetFiatMax: 150000, currency: 'CLP', persistenceScore: 90, capacityGapScore: 85, urgencyScore: 75, externalPeopleOpenedAt: daysAgo(7) },
  ];

  const insightIds: string[] = [];
  for (const idef of insightDefs) {
    const iid = uuid();
    await (prisma as any).insightSignal.create({
      data: { id: iid, ...idef, sourceType: 'MANUAL', visibility: 'TREE_ONLY' },
    });
    insightIds.push(iid);
  }

  // ── Internal Matches (for INTERNAL_SEARCH and INTERNAL_SOLUTION_FOUND) ──
  const matchDefs = [
    { insightIdx: 0, userId: uid('Pedro Rodríguez'), matchType: 'USER', matchScore: 0.85, skillTags: JSON.stringify(['energía solar','instalación']), status: 'SUGGESTED' },
    { insightIdx: 0, userId: uid('Carlos López'), matchType: 'USER', matchScore: 0.72, skillTags: JSON.stringify(['eléctrico','paneles']), status: 'SUGGESTED' },
    { insightIdx: 2, userId: uid('Pedro Rodríguez'), matchType: 'USER', matchScore: 0.95, skillTags: JSON.stringify(['plomería','riego']), status: 'SELECTED' },
    { insightIdx: 4, userId: uid('Carlos López'), matchType: 'USER', matchScore: 0.92, skillTags: JSON.stringify(['devops','docker','CI/CD']), status: 'SUGGESTED' },
    { insightIdx: 4, userId: uid('Diego Morales'), matchType: 'USER', matchScore: 0.78, skillTags: JSON.stringify(['postgresql','migración']), status: 'DECLINED' },
    { insightIdx: 8, userId: uid('Leo'), matchType: 'USER', matchScore: 0.88, skillTags: JSON.stringify(['audiovisual','gestión']), status: 'SELECTED' },
  ];
  for (const md of matchDefs) {
    await (prisma as any).insightInternalMatch.create({
      data: { id: uuid(), insightSignalId: insightIds[md.insightIdx], userId: md.userId, matchType: md.matchType, matchScore: md.matchScore, skillTags: md.skillTags, status: md.status },
    });
  }

  // ── External Openings (for EXTERNAL_PEOPLE_OPEN) ──
  const openingDefs = [
    { insightIdx: 5, title: 'UX Researcher — App TiendaLocal', description: 'Buscamos UX researcher con experiencia en apps móviles para tests de usabilidad con 15 usuarios. Entregable: informe con hallazgos y recomendaciones.', summary: 'Investigación de usabilidad para app de delivery en desarrollo.', requiredSkillTags: JSON.stringify(['ux research','usabilidad','mobile']), workMode: 'REMOTE_ALLOWED', remoteAllowed: true, paymentMode: 'FIAT', paymentFiatMin: 300000, paymentFiatMax: 800000, currency: 'CLP', status: 'OPEN' },
    { insightIdx: 9, title: 'Psicólogo/a infantil — Voluntariado con honorarios', description: 'Apoyo emocional para niños del programa de apoyo escolar. 2 sesiones semanales de 2 horas en sede de Concepción.', summary: 'Apoyo psicológico para niños en situación de vulnerabilidad.', requiredSkillTags: JSON.stringify(['psicología','infantil','contención']), workMode: 'ON_SITE_ONLY', remoteAllowed: false, locationText: 'Concepción, Barrio Universitario', paymentMode: 'FIAT', paymentFiatMin: 50000, paymentFiatMax: 150000, currency: 'CLP', status: 'OPEN' },
  ];
  for (const od of openingDefs) {
    const { insightIdx: oi, ...openingFields } = od as any;
    await (prisma as any).insightExternalOpening.create({
      data: { id: uuid(), insightSignalId: insightIds[oi], treeId: insightDefs[oi].treeId, createdById: insightDefs[oi].createdById, ...openingFields },
    });
  }

  // ── Corporate Referral (for one insight) ──
  await (prisma as any).insightCorporateReferral.create({
    data: {
      id: uuid(), insightSignalId: insightIds[5], // UX researcher one
      providerName: 'UX Studio Chile', providerContact: 'contacto@uxstudio.cl', providerWebsite: 'https://uxstudio.cl',
      status: 'DRAFT', reasonForEscalation: 'No encontramos UX researcher interno ni en la red. Evaluando contratar estudio externo.',
      estimatedFiatMin: 500000, estimatedFiatMax: 1200000, currency: 'CLP',
    },
  });

  const insightCount = await (prisma as any).insightSignal.count();
  console.log(`   ✅ ${insightCount} insight signals`);

  // ══════════════════════════════════════════
  // 10. EXPERT ENDORSEMENTS
  // ══════════════════════════════════════════
  console.log('🤝 Creating expert endorsements...');

  // Get TreeMember IDs for specific users in specific trees
  const memberId = async (userName: string, treeId: string) => {
    const m = await prisma.treeMember.findFirst({ where: { userId: uid(userName), treeId } });
    return m?.id;
  };

  // EcoAldea Santiago — endorsements
  const ecoPedro = await memberId('Pedro Rodríguez', tree1Id);
  const ecoMaria = await memberId('María García', tree1Id);
  const ecoCarlos = await memberId('Carlos López', tree1Id);

  // TechBuilders — endorsements
  const techAna = await memberId('Ana Martínez', tree2Id);
  const techDiego = await memberId('Diego Morales', tree2Id);
  const techCarlos = await memberId('Carlos López', tree2Id);

  // Manos Solidarias — endorsements
  const manosElena = await memberId('Elena Vargas', tree3Id);
  const manosMaria = await memberId('María García', tree3Id);
  const manosVale = await memberId('Valentina Ruiz', tree3Id);

  // Create endorsements with varied statuses
  const endorsementData: any[] = [];
  if (ecoPedro && ecoCarlos) {
    // María endorses Carlos in @energía solar (SUCCESS — completed)
    endorsementData.push({
      treeId: tree1Id, endorserId: ecoMaria!, endorsedId: ecoCarlos!, expertise: '@energía solar',
      status: 'SUCCESS', boostApplied: true, requiredTasks: 3, completedTasks: 3,
      avgSatisfaction: 92, evidenceTaskIds: '["task-1","task-2","task-3"]',
      resolvedAt: daysAgo(5), resolvedById: uid('Leo'),
      resolutionNote: 'Carlos completó las 3 tareas de instalación con alta satisfacción. Aval exitoso.',
    });
  }
  if (ecoPedro && ecoMaria) {
    // Pedro endorses María in @compostaje (ACTIVE — in progress)
    endorsementData.push({
      treeId: tree1Id, endorserId: ecoPedro!, endorsedId: ecoMaria!, expertise: '@compostaje',
      status: 'ACTIVE', boostApplied: true, requiredTasks: 3, completedTasks: 1,
    });
  }
  if (ecoMaria && ecoCarlos) {
    // María endorses Carlos in @riego (ACTIVE — just started)
    endorsementData.push({
      treeId: tree1Id, endorserId: ecoMaria!, endorsedId: ecoCarlos!, expertise: '@riego',
      status: 'ACTIVE', boostApplied: true, requiredTasks: 3, completedTasks: 0,
    });
  }

  // TechBuilders
  if (techAna && techCarlos) {
    // Ana endorses Carlos in @devops (SUCCESS)
    endorsementData.push({
      treeId: tree2Id, endorserId: techAna!, endorsedId: techCarlos!, expertise: '@devops',
      status: 'SUCCESS', boostApplied: true, requiredTasks: 4, completedTasks: 4,
      avgSatisfaction: 88, evidenceTaskIds: '["task-migration-1","task-migration-2","task-migration-3","task-migration-4"]',
      resolvedAt: daysAgo(10), resolvedById: uid('Leo'),
      resolutionNote: 'Migración completada sin incidentes. Todas las réplicas sincronizadas.',
    });
  }
  if (techCarlos && techDiego) {
    // Carlos endorses Diego in @backend (ACTIVE)
    endorsementData.push({
      treeId: tree2Id, endorserId: techCarlos!, endorsedId: techDiego!, expertise: '@backend',
      status: 'ACTIVE', boostApplied: true, requiredTasks: 3, completedTasks: 2,
    });
  }

  // Manos Solidarias — FAILED_PERFORMANCE example
  if (manosElena && manosVale) {
    // Elena endorsed Valentina in @cocina but she failed
    endorsementData.push({
      treeId: tree3Id, endorserId: manosElena!, endorsedId: manosVale!, expertise: '@cocina',
      status: 'FAILED_PERFORMANCE', boostApplied: false, requiredTasks: 3, completedTasks: 1,
      avgSatisfaction: 45, evidenceTaskIds: '["task-cocina-1"]',
      resolvedAt: daysAgo(2), resolvedById: uid('Leo'),
      resolutionNote: 'Valentina solo completó 1/3 tareas y con baja satisfacción. Se retira @cocina.',
    });
  }
  if (manosMaria && manosElena) {
    // María endorses Elena in @voluntariado (ACTIVE)
    endorsementData.push({
      treeId: tree3Id, endorserId: manosMaria!, endorsedId: manosElena!, expertise: '@voluntariado',
      status: 'ACTIVE', boostApplied: true, requiredTasks: 3, completedTasks: 1,
    });
  }

  for (const ed of endorsementData) {
    await (prisma as any).expertEndorsement.create({ data: { id: uuid(), ...ed } });
  }
  console.log(`   ✅ ${endorsementData.length} expert endorsements`);

  // ══════════════════════════════════════════
  // 11. SUBSCRIPTION TREE — PROPORTIONAL BILLING
  // ══════════════════════════════════════════
  console.log('💳 Creating subscription tree with proportional billing...');

  const subTreeId = uuid();

  await prisma.tree.create({
    data: {
      id: subTreeId,
      name: 'Cooperativa Digital Pro',
      icono: '🏢',
      country: 'Chile',
      city: 'Santiago',
      sector: 'Providencia',
      visibility: 'PRIVATE',
      admissionPolicy: 'INVITE_ONLY',
      allowHashtags: true,
      allowTraditionalBranches: true,
      hashtagCreationPolicy: 'ADMIN_AND_USERS',
      economyMode: 'LEGACY_FIAT',
      presupuestoTotal: 1000,
      modoGobierno: 'DEMOCRATICO',
      creatorId: LEO_ID,
      capacidades: 'Desarrollo software, Diseño, Marketing, Finanzas, Legal',
      description: 'Cooperativa digital con modelo de suscripción mensual proporcional a gastos',
      inviteCode: 'SUB-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      crisisSubjects: '',
      financingMode: 'SUBSCRIPCION',
      subscriptionAmount: 50000,
      subscriptionCurrency: 'CLP',
      subscriptionDayOfMonth: 5,
      subscriptionBillingMode: 'PROPORTIONAL',
    },
  });

  // Add members (Leo + 5 demo users)
  const subMembers = [
    'Leo', 'María García', 'Pedro Rodríguez', 'Ana Martínez', 'Carlos López', 'Diego Morales',
  ];

  const currentMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;

  for (const name of subMembers) {
    const memberId = uuid();
    await prisma.treeMember.create({
      data: {
        id: memberId,
        userId: uid(name),
        treeId: subTreeId,
        status: 'VERIFIED',
        role: name === 'Leo' ? 'ADMIN' : 'MEMBER',
        xp: Math.floor(Math.random() * 500),
        level: Math.floor(Math.random() * 5) + 1,
        needPointsPool: 1000,
        availableNeedPoints: 1000,
        skills: skillsMap[name] || '[]',
        strikesEconomicos: '[]',
        goldenTickets: '[]',
        bayasBalance: Math.random() * 200,
        isPayingMember: true,
        subscriptionStatus: 'ACTIVE',
        paymentDueDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 5)),
      },
    });
  }

  // Add TreeExpenses for current month
  const expenseDefs = [
    { description: 'Servidor VPS — Hetzner CX41', amount: 32000, category: 'EQUIPMENT' as const, isRecurring: true, dueDayOfMonth: 1 },
    { description: 'Dominio y DNS — Cloudflare Pro', amount: 18000, category: 'OTHER' as const, isRecurring: true, dueDayOfMonth: 15 },
    { description: 'Licencia Figma Team (5 seats)', amount: 45000, category: 'EQUIPMENT' as const, isRecurring: true, dueDayOfMonth: 1 },
    { description: 'Licencia GitHub Team', amount: 28000, category: 'EQUIPMENT' as const, isRecurring: true, dueDayOfMonth: 1 },
    { description: 'Asesoría legal mensual', amount: 80000, category: 'OTHER' as const, isRecurring: true, dueDayOfMonth: 20 },
    { description: 'Café y snacks oficina', amount: 15000, category: 'SHOPPING' as const, isRecurring: false },
  ];

  for (const exp of expenseDefs) {
    await prisma.treeExpense.create({
      data: {
        id: uuid(),
        treeId: subTreeId,
        description: exp.description,
        amount: exp.amount,
        currency: 'CLP',
        category: exp.category,
        isRecurring: exp.isRecurring,
        dueDayOfMonth: exp.dueDayOfMonth || null,
        addedById: LEO_ID,
        month: currentMonth,
      },
    });
  }

  const subMemberCount = await prisma.treeMember.count({ where: { treeId: subTreeId } });
  const subExpenseSum = expenseDefs.reduce((sum, e) => sum + e.amount, 0);
  console.log(`   ✅ Subscription tree "${'Cooperativa Digital Pro'}" — ${subMemberCount} members, ${subExpenseSum} CLP expenses, ${(subExpenseSum / subMemberCount).toFixed(0)} CLP/member`);

  // ══════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════
  const [userCount, treeCount, needCount, extNeedCount, ideaCount, branchCount, taskCount, memberCount, bmemberCount, xpCount] = await Promise.all([
    prisma.user.count(), prisma.tree.count(), prisma.need.count(), prisma.externalNeed.count(),
    prisma.idea.count(), prisma.branch.count(), prisma.task.count(), prisma.treeMember.count(),
    prisma.branchMember.count(), prisma.userSkillXP.count(),
  ]);

  console.log('\n═══════════════════════════════');
  console.log('  🌟 SEED COMPLETE');
  console.log('═══════════════════════════════');
  console.log(`  Users:              ${userCount}`);
  console.log(`  Trees:              ${treeCount}`);
  console.log(`  Tree Members:       ${memberCount}`);
  console.log(`  Needs:              ${needCount}`);
  console.log(`  External Needs:     ${extNeedCount}`);
  console.log(`  Ideas:              ${ideaCount}`);
  console.log(`  Branches:           ${branchCount}`);
  console.log(`  Branch Members:     ${bmemberCount}`);
  console.log(`  Tasks:              ${taskCount}`);
  console.log(`  Skill XP entries:   ${xpCount}`);
  console.log('═══════════════════════════════');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Seed failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
