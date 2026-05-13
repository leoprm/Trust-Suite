/**
 * Seed Trust Maker — Demo realista con datos creíbles
 * Run: npx tsx src/scripts/seed-trust-maker.ts
 *
 * Crea 3 árboles, 18 usuarios, IAs, modelos, tareas, transacciones FIAT,
 * necesidades, suscripciones Paddle, Stripe Connect y fine-tune jobs.
 *
 * Re-runnable: limpia datos demo existentes antes de crear.
 * Admin: leo@demo.com / demo123
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const uuid = () => crypto.randomUUID();
const now = () => new Date();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);

// ── Helper: find or create user ──
let _userCache: Record<string, string> = {};
let _userList: { name: string; id: string }[] = [];

async function ensureUsers(
  hash: string,
  defs: { username: string; email: string; role: 'PERSON' | 'ADMINISTRATOR'; subscriptionActive?: boolean; publicProfileEnabled?: boolean; visibleForRecruitment?: boolean }[]
) {
  for (const u of defs) {
    const existing = await prisma.user.findFirst({ where: { email: u.email } });
    if (existing) {
      _userCache[u.username] = existing.id;
      continue;
    }
    const user = await prisma.user.create({
      data: {
        id: uuid(),
        username: u.username,
        email: u.email,
        password: hash,
        role: u.role,
        is_onboarded: true,
        sharingCode: crypto.randomBytes(6).toString('hex'),
        publicProfileEnabled: u.publicProfileEnabled ?? true,
        subscriptionActive: u.subscriptionActive ?? false,
        visibleForRecruitment: u.visibleForRecruitment ?? false,
        is_guest: false,
      },
    });
    _userCache[u.username] = user.id;
  }
  _userList = defs.map(u => ({ name: u.username, id: _userCache[u.username] }));
}

function uid(name: string) { return _userList.find(u => u.name === name)!.id; }

// ════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 Seeding Trust Maker demo data...\n');

  // ── CLEAN ───────────────────────────────────────────────────────────
  console.log('🧹 Cleaning existing demo data...');
  // Clean ALL demo-related data
  const demoEmailPatterns = ['@demo.com', '@demo.trust', '@trustmaker.demo'];

  // Delete in dependency order (children first)
  await prisma.taskTag.deleteMany({ where: { task: { branch: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } } } });
  await (prisma as any).aiExecution?.deleteMany({ where: { task: { branch: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } } } }).catch(() => {});
  await prisma.task.deleteMany({ where: { branch: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } } });
  await (prisma as any).satisfaccionEvaluador?.deleteMany().catch(() => {});
  await (prisma as any).satisfactionRating?.deleteMany().catch(() => {});
  await (prisma as any).phaseDeliverable?.deleteMany().catch(() => {});
  await prisma.branch.deleteMany({ where: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } });
  await prisma.idea.deleteMany();
  await (prisma as any).ideaLike?.deleteMany().catch(() => {});
  await (prisma as any).needFunding?.deleteMany().catch(() => {});
  await (prisma as any).needTree?.deleteMany({ where: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } }).catch(() => {});
  await prisma.need.deleteMany({ where: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } });
  await (prisma as any).expertEndorsement?.deleteMany().catch(() => {});
  await prisma.treeMember.deleteMany({ where: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } });
  await (prisma as any).userSkillXP?.deleteMany().catch(() => {});
  await (prisma as any).insightInternalMatch?.deleteMany().catch(() => {});
  await (prisma as any).insightExternalOpening?.deleteMany().catch(() => {});
  await (prisma as any).insightCorporateReferral?.deleteMany().catch(() => {});
  await (prisma as any).insightSignal?.deleteMany().catch(() => {});
  await (prisma as any).treeExpense?.deleteMany({ where: { tree: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } } }).catch(() => {});
  await (prisma as any).auditoria?.deleteMany().catch(() => {});
  await (prisma as any).difficultyVote?.deleteMany().catch(() => {});
  await (prisma as any).tokenInvitacion?.deleteMany().catch(() => {});
  await (prisma as any).bonusPool?.deleteMany().catch(() => {});
  await (prisma as any).treeRelation?.deleteMany().catch(() => {});
  await (prisma as any).notification?.deleteMany().catch(() => {});
  await (prisma as any).eventLog?.deleteMany().catch(() => {});
  await (prisma as any).externalCandidate?.deleteMany().catch(() => {});
  await (prisma as any).searchPass?.deleteMany().catch(() => {});

  // Clean Trust Maker specific models
  await (prisma as any).inferenceJob?.deleteMany().catch(() => {});
  await prisma.modelRegistry?.deleteMany().catch(() => {});
  await (prisma as any).userSubscription?.deleteMany().catch(() => {});
  await (prisma as any).stripeConnectAccount?.deleteMany().catch(() => {});
  await prisma.userAI?.deleteMany().catch(() => {});
  await prisma.fineTuneJob?.deleteMany().catch(() => {});
  await (prisma as any).skillInfluence?.deleteMany().catch(() => {});
  await (prisma as any).subscriptionPlan?.deleteMany().catch(() => {});

  // Delete demo trees
  await prisma.tree.deleteMany({ where: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } });

  // Delete demo users
  for (const p of demoEmailPatterns) {
    await prisma.user.deleteMany({ where: { email: { contains: p } } });
  }
  console.log('   ✅ Cleaned. Starting fresh.\n');

  // ════════════════════════════════════════════════════════════════════
  // 1. USERS (18 users)
  // ════════════════════════════════════════════════════════════════════
  console.log('👥 Creating 18 users...');
  const hash = await bcrypt.hash('demo123', 10);

  await ensureUsers(hash, [
    { username: 'Leo',                email: 'leo@demo.com',               role: 'ADMINISTRATOR', subscriptionActive: true,  visibleForRecruitment: true },
    { username: 'María García',       email: 'maria@demo.com',             role: 'PERSON',        subscriptionActive: true,  publicProfileEnabled: true },
    { username: 'Pedro Rodríguez',    email: 'pedro@demo.com',             role: 'PERSON',        subscriptionActive: true },
    { username: 'Ana Martínez',       email: 'ana@demo.com',               role: 'PERSON',        subscriptionActive: false },
    { username: 'Carlos López',       email: 'carlos@demo.com',            role: 'PERSON',        subscriptionActive: true,  visibleForRecruitment: true },
    { username: 'Elena Vargas',       email: 'elena@demo.com',             role: 'PERSON',        subscriptionActive: false },
    { username: 'Diego Morales',      email: 'diego@demo.com',             role: 'PERSON',        subscriptionActive: true },
    { username: 'Valentina Ruiz',     email: 'vale@demo.com',              role: 'PERSON',        subscriptionActive: false },
    { username: 'Javier Herrera',     email: 'javier@demo.com',            role: 'PERSON',        subscriptionActive: true,  visibleForRecruitment: true },
    { username: 'Camila Torres',      email: 'camila@demo.com',            role: 'PERSON',        subscriptionActive: true },
    { username: 'Roberto Fuentes',    email: 'roberto@demo.com',           role: 'PERSON',        subscriptionActive: false },
    { username: 'Sofía Paredes',      email: 'sofia@demo.com',             role: 'PERSON',        subscriptionActive: true,  publicProfileEnabled: true },
    { username: 'Tomás Núñez',        email: 'tomas@demo.com',             role: 'PERSON',        subscriptionActive: false },
    { username: 'Isabel Mena',        email: 'isabel@demo.com',            role: 'PERSON',        subscriptionActive: true,  visibleForRecruitment: true },
    { username: 'Andrés Rivas',       email: 'andres@demo.com',            role: 'PERSON',        subscriptionActive: false },
    { username: 'Natalia Campos',     email: 'natalia@demo.com',           role: 'PERSON',        subscriptionActive: true },
    { username: 'Luis Santander',     email: 'luis@demo.com',              role: 'PERSON',        subscriptionActive: false },
    { username: 'Paz Montenegro',     email: 'paz@demo.com',               role: 'PERSON',        subscriptionActive: true,  publicProfileEnabled: true },
  ]);

  const allUsers = [..._userList];
  const userCount = allUsers.length;
  console.log(`   ✅ ${userCount} users created`);

  // ════════════════════════════════════════════════════════════════════
  // 1.5. USER SUBSCRIPTIONS (Paddle sandbox)
  // ════════════════════════════════════════════════════════════════════
  console.log('💳 Creating Paddle sandbox subscriptions...');
  const subscribedUsers = ['Leo', 'María García', 'Pedro Rodríguez', 'Carlos López',
                           'Diego Morales', 'Javier Herrera', 'Camila Torres',
                           'Sofía Paredes', 'Isabel Mena', 'Natalia Campos', 'Paz Montenegro'];

  const pastDueUsers = ['Javier Herrera', 'Camila Torres'];

  let subIdx = 1001;
  for (const userName of subscribedUsers) {
    const isPastDue = pastDueUsers.includes(userName);
    await (prisma as any).userSubscription.create({
      data: {
        id: uuid(),
        userId: uid(userName),
        paddleSubscriptionId: `paddle_sub_sandbox_${subIdx++}`,
        status: isPastDue ? 'PAST_DUE' : 'ACTIVE',
        currentPeriodStart: daysAgo(isPastDue ? 35 : 5),
        currentPeriodEnd: daysFromNow(isPastDue ? 5 : 25),
        monthlyCost: 12500,
        createdAt: daysAgo(60),
      },
    });
  }
  console.log(`   ✅ ${subscribedUsers.length} subscriptions (${pastDueUsers.length} PAST_DUE)`);

  // ════════════════════════════════════════════════════════════════════
  // 1.6. STRIPE CONNECT ACCOUNTS (simulated)
  // ════════════════════════════════════════════════════════════════════
  console.log('💸 Creating Stripe Connect accounts...');
  const stripeUsers = ['Carlos López', 'Diego Morales', 'Javier Herrera', 'Sofía Paredes', 'Luis Santander'];
  const stripeIds = ['acct_1Q2X3Y4Z5A6B7C8D', 'acct_1R3Y4Z5A6B7C8D9E', 'acct_1S4Z5A6B7C8D9E0F', 'acct_1T5A6B7C8D9E0F1G', 'acct_1U6B7C8D9E0F1G2H'];

  for (let i = 0; i < stripeUsers.length; i++) {
    await (prisma as any).stripeConnectAccount.create({
      data: {
        id: uuid(),
        userId: uid(stripeUsers[i]),
        stripeAccountId: stripeIds[i],
        chargesEnabled: true,
        payoutsEnabled: i < 3, // First 3 can receive payouts
        createdAt: daysAgo(30 + i * 5),
      },
    });
  }
  console.log(`   ✅ ${stripeUsers.length} Stripe Connect accounts`);

  // ════════════════════════════════════════════════════════════════════
  // 2. TREES
  // ════════════════════════════════════════════════════════════════════
  console.log('🌳 Creating 3 trees...');
  const techId = uuid(), ecoId = uuid(), saludId = uuid();

  await prisma.tree.createMany({
    data: [
      {
        id: techId, name: 'TechMakers', icono: '💻',
        description: 'Cooperativa tecnológica multidisciplinaria: desarrollo, IA, diseño, DevOps. Modelo de suscripción dinámico con costos compartidos.',
        country: 'Chile', city: 'Santiago', sector: 'Providencia',
        visibility: 'PUBLIC', admissionPolicy: 'INVITE_ONLY',
        allowHashtags: true, allowTraditionalBranches: true,
        hashtagCreationPolicy: 'ADMIN_AND_USERS',
        economyMode: 'LEGACY_FIAT', presupuestoTotal: 2000000,
        modoGobierno: 'DEMOCRATICO', treeType: 'NORMAL',
        financingMode: 'GRATUITO',
        creatorId: uid('Leo'),
        capacidades: 'Desarrollo Full-Stack, Machine Learning, DevOps, Diseño UX/UI, Data Engineering, Cloud Architecture, Mobile, Ciberseguridad',
        inviteCode: 'TM-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
      {
        id: ecoId, name: 'EcoLabs', icono: '🌿',
        description: 'Laboratorio de innovación ecológica: agricultura regenerativa, energías renovables, biomateriales y economía circular.',
        country: 'Chile', city: 'Valdivia', sector: 'Isla Teja',
        visibility: 'PUBLIC', admissionPolicy: 'OPEN',
        allowHashtags: true, allowTraditionalBranches: true,
        hashtagCreationPolicy: 'ADMIN_AND_USERS',
        economyMode: 'BERRIES_LATENT', presupuestoTotal: 500000,
        modoGobierno: 'DEMOCRATICO', treeType: 'NORMAL',
        financingMode: 'GRATUITO',
        creatorId: uid('María García'),
        capacidades: 'Agricultura Regenerativa, Energía Solar, Bioconstrucción, Compostaje Industrial, Hidroponía, Biotecnología Ambiental',
        inviteCode: 'ECO-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
      {
        id: saludId, name: 'SaludDigital', icono: '🏥',
        description: 'Red de profesionales de salud y tecnología para telemedicina, salud mental, datos clínicos y dispositivos médicos IoT.',
        country: 'Chile', city: 'Concepción', sector: 'Barrio Universitario',
        visibility: 'PRIVATE', admissionPolicy: 'INVITE_ONLY',
        allowHashtags: true, allowTraditionalBranches: true,
        hashtagCreationPolicy: 'ADMIN_ONLY',
        economyMode: 'LEGACY_FIAT', presupuestoTotal: 800000,
        modoGobierno: 'DEMOCRATICO', treeType: 'AI_COUNCIL',
        financingMode: 'GRATUITO',
        creatorId: uid('Elena Vargas'),
        capacidades: 'Telemedicina, Salud Mental, Bioinformática, Dispositivos IoT Médicos, Epidemiología, Nutrición Clínica, Farmacología',
        inviteCode: 'SALUD-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
    ],
  });

  // ── Tree Members ────────────────────────────────────────────────────
  console.log('   Assigning members to trees...');

  const skillsMap: Record<string, string> = {
    'Leo':              '["liderazgo","gestión de proyectos","arquitectura de software"]',
    'María García':    '["agricultura regenerativa","compostaje","energía solar"]',
    'Pedro Rodríguez':  '["instalación eléctrica","IoT","mantenimiento"]',
    'Ana Martínez':     '["react","typescript","diseño UX","frontend"]',
    'Carlos López':     '["devops","docker","kubernetes","AWS","CI/CD"]',
    'Elena Vargas':     '["enfermería","salud pública","gestión hospitalaria"]',
    'Diego Morales':    '["backend","nodejs","python","API","bases de datos"]',
    'Valentina Ruiz':   '["marketing digital","redes sociales","branding"]',
    'Javier Herrera':   '["machine learning","deep learning","computer vision","pytorch"]',
    'Camila Torres':    '["telemedicina","salud mental","psicología clínica"]',
    'Roberto Fuentes':  '["hidroponía","biotecnología","biomateriales"]',
    'Sofía Paredes':    '["cloud architecture","terraform","GCP","seguridad"]',
    'Tomás Núñez':      '["data engineering","ETL","spark","databricks"]',
    'Isabel Mena':      '["bioinformática","genómica","R","python científico"]',
    'Andrés Rivas':     '["mobile","react native","flutter","iOS","android"]',
    'Natalia Campos':   '["diseño UX","UI","figma","design systems"]',
    'Luis Santander':   '["ciberseguridad","pentesting","compliance","ISO 27001"]',
    'Paz Montenegro':   '["nutrición","epidemiología","análisis de datos de salud"]',
  };

  // Tree assignments: which users are in which trees
  const treeAssignments: Record<string, string[]> = {
    'TechMakers':       ['Leo','María García','Ana Martínez','Carlos López','Diego Morales','Valentina Ruiz','Javier Herrera','Sofía Paredes','Tomás Núñez','Andrés Rivas','Natalia Campos','Luis Santander'],
    'EcoLabs':          ['María García','Pedro Rodríguez','Ana Martínez','Roberto Fuentes','Sofía Paredes','Elena Vargas','Paz Montenegro','Valentina Ruiz'],
    'SaludDigital':     ['Elena Vargas','Camila Torres','Isabel Mena','Carlos López','Paz Montenegro','Diego Morales','Javier Herrera','Luis Santander','Leo'],
  };

  const treeIds: Record<string, string> = { 'TechMakers': techId, 'EcoLabs': ecoId, 'SaludDigital': saludId };

  const memberData: any[] = [];
  for (const [treeName, members] of Object.entries(treeAssignments)) {
    const treeId = treeIds[treeName];
    for (const memberName of members) {
      memberData.push({
        id: uuid(),
        userId: uid(memberName),
        treeId,
        status: 'VERIFIED' as const,
        role: memberName === 'Leo' || (memberName === 'María García' && treeName === 'EcoLabs') || (memberName === 'Elena Vargas' && treeName === 'SaludDigital')
          ? 'ADMIN' as const : 'MEMBER' as const,
        xp: Math.floor(Math.random() * 800) + 50,
        level: Math.floor(Math.random() * 6) + 1,
        needPointsPool: 1000,
        availableNeedPoints: 1000,
        skills: skillsMap[memberName] || '[]',
        strikesEconomicos: '[]',
        goldenTickets: '[]',
        bayasBalance: treeName === 'EcoLabs' ? Math.random() * 500 : Math.random() * 100,
      });
    }
  }
  await prisma.treeMember.createMany({ data: memberData });
  console.log(`   ✅ 3 trees, ${memberData.length} memberships`);

  // ════════════════════════════════════════════════════════════════════
  // 3. FIAT TRANSACTIONS (TreeExpenses — for TechMakers root)
  // ════════════════════════════════════════════════════════════════════
  console.log('💰 Creating FIAT transactions (TreeExpenses)...');

  const currentMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date().getUTCMonth() === 0
    ? `${new Date().getUTCFullYear() - 1}-12`
    : `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth()).padStart(2, '0')}`;

  const techExpenses = [
    // Recurring monthly expenses for TechMakers
    { description: 'Servidores AWS EC2 + RDS', amount: 245000, category: 'INFRASTRUCTURE' as const, isRecurring: true, dueDayOfMonth: 1, month: currentMonth },
    { description: 'GitHub Team (10 seats)', amount: 85000, category: 'TOOLS' as const, isRecurring: true, dueDayOfMonth: 1, month: currentMonth },
    { description: 'Figma Enterprise (8 seats)', amount: 120000, category: 'TOOLS' as const, isRecurring: true, dueDayOfMonth: 3, month: currentMonth },
    { description: 'Datadog Monitoring', amount: 185000, category: 'INFRASTRUCTURE' as const, isRecurring: true, dueDayOfMonth: 5, month: currentMonth },
    { description: 'Dominio + Cloudflare Pro', amount: 35000, category: 'INFRASTRUCTURE' as const, isRecurring: true, dueDayOfMonth: 10, month: currentMonth },
    { description: 'Oficina coworking — WeWork Providencia', amount: 480000, category: 'INFRASTRUCTURE' as const, isRecurring: true, dueDayOfMonth: 1, month: currentMonth },
    { description: 'Seguro de responsabilidad profesional', amount: 95000, category: 'LEGAL' as const, isRecurring: true, dueDayOfMonth: 15, month: currentMonth },
    { description: 'Consultoría legal trimestral', amount: 150000, category: 'LEGAL' as const, isRecurring: false, dueDayOfMonth: 20, month: lastMonth },
    { description: 'Workshop team building Q1', amount: 75000, category: 'EVENTS' as const, isRecurring: false, month: lastMonth },
    { description: 'Campaña LinkedIn Ads', amount: 120000, category: 'MARKETING' as const, isRecurring: false, month: currentMonth },
    { description: 'Licencia JetBrains All Products (3 seats)', amount: 95000, category: 'TOOLS' as const, isRecurring: true, dueDayOfMonth: 1, month: currentMonth },
    { description: 'Servicio de limpieza oficina', amount: 60000, category: 'SERVICES' as const, isRecurring: true, dueDayOfMonth: 5, month: currentMonth },
  ];

  const ecoExpenses = [
    { description: 'Sensores IoT para monitoreo de cultivos', amount: 180000, category: 'INFRASTRUCTURE' as const, isRecurring: false, month: lastMonth },
    { description: 'Semillas orgánicas certificadas — temporada', amount: 45000, category: 'OTHER' as const, isRecurring: false, month: currentMonth },
    { description: 'Taller comunitario de compostaje', amount: 25000, category: 'EVENTS' as const, isRecurring: false, month: currentMonth },
  ];

  const saludExpenses = [
    { description: 'Plataforma telemedicina — licencia anual', amount: 350000, category: 'TOOLS' as const, isRecurring: true, dueDayOfMonth: 1, month: currentMonth },
    { description: 'Servidor HIPAA-compliant', amount: 220000, category: 'INFRASTRUCTURE' as const, isRecurring: true, dueDayOfMonth: 1, month: currentMonth },
    { description: 'Certificación ISO 13485 (dispositivos médicos)', amount: 420000, category: 'LEGAL' as const, isRecurring: false, month: lastMonth },
  ];

  const allExpenses = [
    ...techExpenses.map(e => ({ ...e, treeId: techId, addedById: uid('Leo') })),
    ...ecoExpenses.map(e => ({ ...e, treeId: ecoId, addedById: uid('María García') })),
    ...saludExpenses.map(e => ({ ...e, treeId: saludId, addedById: uid('Elena Vargas') })),
  ];

  let totalFiat = 0;
  for (const exp of allExpenses) {
    const { addedById, treeId, month, ...expData } = exp;
    await (prisma as any).treeExpense.create({
      data: {
        id: uuid(),
        treeId,
        addedById,
        month,
        ...expData,
      },
    });
    totalFiat += exp.amount;
  }
  console.log(`   ✅ ${allExpenses.length} TreeExpenses (${(totalFiat/1000000).toFixed(1)}M CLP total)`);

  // ════════════════════════════════════════════════════════════════════
  // 4. USER AI — BYO AI registrations
  // ════════════════════════════════════════════════════════════════════
  console.log('🤖 Creating BYO AI registrations...');

  const aiDefs = [
    { userName: 'Carlos López',    name: 'Carlos-DevOps-GPT',   provider: 'OPENAI' as const,    monthlySavings: 45000,  totalPayout: 180000 },
    { userName: 'Diego Morales',   name: 'Diego-Backend-Copilot', provider: 'ANTHROPIC' as const, monthlySavings: 32000,  totalPayout: 0 },
    { userName: 'Javier Herrera',  name: 'Javier-ML-Assistant', provider: 'DEEPSEEK' as const,  monthlySavings: 58000,  totalPayout: 232000 },
    { userName: 'Sofía Paredes',   name: 'Sofía-Cloud-CLI',    provider: 'OPENAI' as const,    monthlySavings: 28000,  totalPayout: 84000 },
    { userName: 'Isabel Mena',     name: 'Isabel-Bioinfo-R',   provider: 'CUSTOM' as const,    monthlySavings: 15000,  totalPayout: 0 },
    { userName: 'Andrés Rivas',    name: 'Andrés-Mobile-Copilot', provider: 'ANTHROPIC' as const, monthlySavings: 35000,  totalPayout: 70000 },
    { userName: 'Luis Santander',  name: 'Luis-SecOps-Agent',  provider: 'DEEPSEEK' as const,  monthlySavings: 42000,  totalPayout: 0 },
  ];

  for (const ai of aiDefs) {
    await prisma.userAI.create({
      data: {
        id: uuid(),
        userId: uid(ai.userName),
        name: ai.name,
        provider: ai.provider,
        apiKeyHash: crypto.createHash('sha256').update(`sk-demo-${ai.userName}-${crypto.randomBytes(4).toString('hex')}`).digest('hex'),
        endpoint: ai.provider === 'CUSTOM' ? 'https://api.isabel-bioinfo.internal/v1' : null,
        status: 'ACTIVE',
        monthlySavings: ai.monthlySavings,
        totalPayout: ai.totalPayout,
        createdAt: daysAgo(45),
      },
    });
  }
  console.log(`   ✅ ${aiDefs.length} UserAIs (${aiDefs.filter(a => a.totalPayout > 0).length} with payouts)`);

  // ════════════════════════════════════════════════════════════════════
  // 5. MODEL REGISTRY — Models downloaded via Trust Maker
  // ════════════════════════════════════════════════════════════════════
  console.log('📦 Creating model registry entries...');

  const model1Id = uuid(), model2Id = uuid(), model3Id = uuid(), model4Id = uuid();

  await prisma.modelRegistry.createMany({
    data: [
      {
        id: model1Id, name: 'Llama-3.2-3B-Instruct', source: 'huggingface',
        hfRepo: 'unsloth/Llama-3.2-3B-Instruct', filename: 'model.safetensors',
        sizeBytes: BigInt(6_400_000_000), status: 'READY', downloadedAt: daysAgo(7),
      },
      {
        id: model2Id, name: 'Mistral-7B-Instruct-v0.3', source: 'huggingface',
        hfRepo: 'mistralai/Mistral-7B-Instruct-v0.3', filename: 'model.safetensors',
        sizeBytes: BigInt(14_500_000_000), status: 'READY', downloadedAt: daysAgo(14),
      },
      {
        id: model3Id, name: 'DeepSeek-Coder-6.7B', source: 'huggingface',
        hfRepo: 'deepseek-ai/deepseek-coder-6.7b-instruct', filename: 'model.safetensors',
        sizeBytes: BigInt(13_400_000_000), status: 'READY', downloadedAt: daysAgo(3),
      },
      {
        id: model4Id, name: 'Qwen2.5-7B-Instruct', source: 'huggingface',
        hfRepo: 'Qwen/Qwen2.5-7B-Instruct', filename: 'model.safetensors',
        sizeBytes: BigInt(15_200_000_000), status: 'DOWNLOADING', downloadedAt: null,
      },
    ],
  });
  console.log('   ✅ 4 models (3 READY, 1 DOWNLOADING)');

  // ════════════════════════════════════════════════════════════════════
  // 6. INFERENCE JOBS
  // ════════════════════════════════════════════════════════════════════
  console.log('⚡ Creating inference jobs...');

  const inferenceJobs = [
    { modelId: model1Id, userId: uid('Javier Herrera'), input: 'Explica el concepto de transfer learning en machine learning', output: 'Transfer learning es una técnica donde un modelo pre-entrenado en una tarea se reutiliza como punto de partida para otra tarea relacionada...', status: 'COMPLETED' as const, priority: 1 },
    { modelId: model1Id, userId: uid('Carlos López'), input: 'Genera un script de Terraform para desplegar un clúster EKS', output: 'module "eks" { source = "terraform-aws-modules/eks/aws" version = "~> 20.0" cluster_name = "techmakers-prod"... }', status: 'COMPLETED' as const, priority: 2 },
    { modelId: model2Id, userId: uid('Isabel Mena'), input: 'Analiza esta secuencia de ADN: ATCGTAGCTAGCTACGATCG', output: 'La secuencia contiene un posible sitio de restricción EcoRI (GAATTC) en posición 8-13...', status: 'COMPLETED' as const, priority: 1 },
    { modelId: model3Id, userId: uid('Diego Morales'), input: 'Escribe una función Python para ordenamiento merge sort con complejidad O(n log n)', output: 'def merge_sort(arr): if len(arr) <= 1: return arr; mid = len(arr) // 2...', status: 'COMPLETED' as const, priority: 0 },
    { modelId: model3Id, userId: uid('Andrés Rivas'), input: 'Optimiza este código React Native para mejor rendimiento en scroll', output: 'Usando FlatList con getItemLayout, windowSize=5 y removeClippedSubviews se reduce el lag de scroll en listas largas...', status: 'RUNNING' as const, priority: 3 },
    { modelId: model2Id, userId: uid('Paz Montenegro'), input: 'Calcula el índice de masa corporal poblacional y sugiere intervalos', output: null, status: 'FAILED' as const, priority: 1 },
    { modelId: model1Id, userId: uid('Sofía Paredes'), input: 'Genera política IAM para acceso mínimo a S3', output: '{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": ["s3:GetObject", "s3:ListBucket"]...}]}', status: 'COMPLETED' as const, priority: 0 },
  ];

  for (const job of inferenceJobs) {
    await (prisma as any).inferenceJob.create({
      data: {
        id: uuid(),
        modelId: job.modelId,
        userId: job.userId,
        input: job.input,
        output: job.output,
        status: job.status,
        priority: job.priority,
        createdAt: daysAgo(Math.floor(Math.random() * 10) + 1),
        updatedAt: now(),
      },
    });
  }
  console.log(`   ✅ ${inferenceJobs.length} inference jobs`);

  // ════════════════════════════════════════════════════════════════════
  // 7. FINE-TUNE JOBS
  // ════════════════════════════════════════════════════════════════════
  console.log('🔧 Creating fine-tune jobs...');

  await prisma.fineTuneJob.createMany({
    data: [
      {
        id: uuid(),
        name: 'TechMakers DevOps Assistant',
        baseModel: 'unsloth/Llama-3.2-3B',
        status: 'COMPLETED',
        datasetSource: 'TASKS_EXPORT',
        taskFilter: { treeId: techId, skillTags: ['devops', 'docker', 'kubernetes', 'AWS'], minDifficulty: 3, maxDifficulty: 7 },
        outputModelPath: '/models/fine-tuned/devops-assistant-q1',
        metricsJson: { loss: 0.23, accuracy: 0.91, eval_loss: 0.31, training_time_seconds: 18420 },
        startedAt: daysAgo(14),
        completedAt: daysAgo(12),
        createdById: uid('Carlos López'),
      },
      {
        id: uuid(),
        name: 'SaludDigital Clinical NLP',
        baseModel: 'mistralai/Mistral-7B-v0.3',
        status: 'RUNNING',
        datasetSource: 'MANUAL_UPLOAD',
        taskFilter: { treeId: saludId, skillTags: ['telemedicina', 'psicología', 'salud mental'], minDifficulty: 2, maxDifficulty: 6 },
        outputModelPath: null,
        metricsJson: { current_loss: 0.45, step: 3200, total_steps: 8000, eta_minutes: 180 },
        startedAt: daysAgo(2),
        completedAt: null,
        createdById: uid('Camila Torres'),
      },
      {
        id: uuid(),
        name: 'EcoLabs Crop Prediction v1',
        baseModel: 'unsloth/Llama-3.2-3B',
        status: 'FAILED',
        datasetSource: 'TASKS_EXPORT',
        taskFilter: { treeId: ecoId, skillTags: ['agricultura', 'hidroponía', 'compostaje'], minDifficulty: 1, maxDifficulty: 5 },
        outputModelPath: null,
        metricsJson: { loss: 0.89, error: 'CUDA out of memory at step 1200/4000', exit_code: 137 },
        startedAt: daysAgo(7),
        completedAt: daysAgo(6),
        createdById: uid('Javier Herrera'),
      },
    ],
  });
  console.log('   ✅ 3 fine-tune jobs (1 COMPLETED, 1 RUNNING, 1 FAILED)');

  // ════════════════════════════════════════════════════════════════════
  // 8. NEEDS (5-10 with different states)
  // ════════════════════════════════════════════════════════════════════
  console.log('📋 Creating needs...');

  const needDefs = [
    // TechMakers
    { title: 'Falta CI/CD pipeline para nuevos microservicios', description: 'Los 3 nuevos microservicios (auth, payments, notifications) necesitan pipeline CI/CD con tests automáticos, build Docker y deploy a staging.', status: 'OPEN' as const, treeId: techId, creatorId: uid('Carlos López') },
    { title: 'Migrar frontend de React 17 a React 19', description: 'El dashboard principal corre en React 17 con class components. Necesitamos migrar a React 19 con Server Components y streaming SSR.', status: 'IN_PROGRESS' as const, treeId: techId, creatorId: uid('Ana Martínez') },
    { title: 'Implementar autenticación WebAuthn/Passkeys', description: 'Añadir soporte para passkeys como alternativa a contraseñas. Integrar con el sistema existente de JWT.', status: 'COMPLETED' as const, treeId: techId, creatorId: uid('Luis Santander') },
    { title: 'Auditar costos de AWS y optimizar', description: 'La factura AWS subió 35% en 3 meses. Se necesita análisis de recursos subutilizados, reserved instances y arquitectura serverless.', status: 'OPEN' as const, treeId: techId, creatorId: uid('Sofía Paredes') },

    // EcoLabs
    { title: 'Instalar sistema de riego automatizado en invernadero', description: 'Invernadero de 500m² necesita riego por goteo con sensores de humedad y controlador programable.', status: 'IN_PROGRESS' as const, treeId: ecoId, creatorId: uid('Pedro Rodríguez') },
    { title: 'Evaluar viabilidad de biodigestor para residuos orgánicos', description: 'Estudio de factibilidad para instalar biodigestor que procese 200kg/semana de residuos y genere biogás para cocina comunitaria.', status: 'OPEN' as const, treeId: ecoId, creatorId: uid('Roberto Fuentes') },
    { title: 'Diseñar programa educativo de agricultura regenerativa', description: 'Crear programa de 8 módulos para escolares y agricultores locales sobre técnicas regenerativas.', status: 'COMPLETED' as const, treeId: ecoId, creatorId: uid('María García') },

    // SaludDigital
    { title: 'Desarrollar app de triage para emergencias', description: 'App móvil que guíe a pacientes con síntomas hacia el nivel de atención adecuado (consulta, urgencia, emergencia) usando árbol de decisión clínico.', status: 'OPEN' as const, treeId: saludId, creatorId: uid('Camila Torres') },
    { title: 'Análisis de datos epidemiológicos regionales', description: 'Cruzar datos del MINSAL con variables ambientales para identificar patrones de enfermedades respiratorias en la Región del Biobío.', status: 'IN_PROGRESS' as const, treeId: saludId, creatorId: uid('Isabel Mena') },
    { title: 'Protocolo de seguridad de datos de pacientes', description: 'Definir e implementar protocolo de anonimización y cifrado para datos clínicos compartidos entre profesionales del árbol.', status: 'COMPLETED' as const, treeId: saludId, creatorId: uid('Luis Santander') },
  ];

  const needIds: string[] = [];
  for (const nd of needDefs) {
    const nid = uuid();
    await prisma.need.create({
      data: {
        id: nid,
        creatorId: nd.creatorId,
        treeId: nd.treeId,
        title: nd.title,
        description: nd.description,
        status: nd.status,
        totalPointsAssigned: 1000,
        pointsAllocated: nd.status === 'COMPLETED' ? 1000 : (nd.status === 'IN_PROGRESS' ? 500 : 200),
        createdAt: daysAgo(Math.floor(Math.random() * 60) + 5),
      },
    });
    // Also create NeedTree link
    await (prisma as any).needTree.create({
      data: { id: uuid(), needId: nid, treeId: nd.treeId },
    });
    needIds.push(nid);
  }
  console.log(`   ✅ ${needDefs.length} needs (${needDefs.filter(n => n.status === 'OPEN').length} OPEN, ${needDefs.filter(n => n.status === 'IN_PROGRESS').length} IN_PROGRESS, ${needDefs.filter(n => n.status === 'COMPLETED').length} COMPLETED)`);

  // ════════════════════════════════════════════════════════════════════
  // 9. IDEAS (1-2 per need)
  // ════════════════════════════════════════════════════════════════════
  console.log('💡 Creating ideas...');

  const ideaDefs = [
    { needIdx: 0, creator: 'Carlos López', title: 'Pipeline GitHub Actions + ArgoCD', desc: 'GitHub Actions para CI (test, lint, build), ArgoCD para CD con despliegue progresivo canary. Notificaciones a Slack.', likes: 15 },
    { needIdx: 0, creator: 'Sofía Paredes', title: 'GitLab CI + FluxCD', desc: 'Alternativa self-hosted con GitLab CI runners en EKS y FluxCD para GitOps. Incluye escaneo de seguridad Trivy.', likes: 7 },
    { needIdx: 1, creator: 'Ana Martínez', title: 'Migración incremental con Reactcodemod', desc: 'Usar reactcodemod para conversión automática de class→function components, luego refactor manual de 3 pantallas críticas.', likes: 11 },
    { needIdx: 2, creator: 'Luis Santander', title: 'WebAuthn con SimpleWebAuthn + JWT bridge', desc: 'Librería SimpleWebAuthn para registro/login con huella/FaceID. Bridge JWT para mantener compatibilidad con API existente.', likes: 18 },
    { needIdx: 3, creator: 'Tomás Núñez', title: 'Análisis de costos con AWS Cost Explorer + Reservations', desc: 'Dashboard de costos por servicio, recomendaciones de reserved instances y savings plans, alertas de presupuesto.', likes: 9 },
    { needIdx: 4, creator: 'Pedro Rodríguez', title: 'Sistema de riego IoT con ESP32', desc: 'Controlador ESP32 con 4 zonas, sensores de humedad capacitivos, dashboard Grafana con métricas de consumo de agua.', likes: 12 },
    { needIdx: 5, creator: 'Roberto Fuentes', title: 'Biodigestor tubular de bajo costo', desc: 'Diseño de biodigestor tubular de polietileno con capacidad de 20m³, sistema de captura de biogás y filtro de H2S.', likes: 8 },
    { needIdx: 6, creator: 'María García', title: 'Programa "Semillas del Futuro" — 8 módulos', desc: 'Módulos: suelo vivo, agua, biodiversidad, semillas nativas, compostaje, biofertilizantes, diseño de parcela, comercialización justa.', likes: 14 },
    { needIdx: 7, creator: 'Camila Torres', title: 'Triage App con árbol de decisión validado', desc: 'App React Native con árbol de decisión basado en protocolo MTS (Manchester Triage System) adaptado a realidad chilena.', likes: 20 },
    { needIdx: 8, creator: 'Isabel Mena', title: 'Pipeline ETL con datos MINSAL + satelitales', desc: 'Pipeline Python/Apache Spark que cruza egresos hospitalarios con datos de calidad de aire (MODIS) y temperatura.', likes: 10 },
    { needIdx: 9, creator: 'Luis Santander', title: 'Protocolo basado en HIPAA + Ley 19.628', desc: 'Anonimización k-anonymity (k≥5), cifrado AES-256 en reposo, TLS 1.3 en tránsito, registro de accesos inmutable.', likes: 16 },
  ];

  const ideaIds: string[] = [];
  for (const idef of ideaDefs) {
    const ideaId = uuid();
    await prisma.idea.create({
      data: {
        id: ideaId,
        needId: needIds[idef.needIdx],
        creatorId: uid(idef.creator),
        title: idef.title,
        description: idef.desc,
        likesCount: idef.likes,
        proposedPhasesJson: JSON.stringify(['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'DISTRIBUTION', 'MAINTENANCE']),
      },
    });
    ideaIds.push(ideaId);
  }
  console.log(`   ✅ ${ideaDefs.length} ideas`);

  // ════════════════════════════════════════════════════════════════════
  // 10. BRANCHES
  // ════════════════════════════════════════════════════════════════════
  console.log('🌿 Creating branches...');

  const branches: { id: string; name: string; type: string; ideaIdx: number; treeName: string; phase: string; xpPool: number; currentPhaseIdx: number; phases: string; daysAgo: number; userId: string }[] = [
    // TechMakers
    { id: uuid(), name: 'CI/CD Pipeline Moderno', type: 'NORMAL', ideaIdx: 0, treeName: 'TechMakers', phase: 'DEVELOPMENT', xpPool: 250, currentPhaseIdx: 1, phases: '["INVESTIGATION","DEVELOPMENT","PRODUCTION"]', daysAgo: 14, userId: 'Carlos López' },
    { id: uuid(), name: 'React 19 Migration', type: 'NORMAL', ideaIdx: 2, treeName: 'TechMakers', phase: 'INVESTIGATION', xpPool: 80, currentPhaseIdx: 0, phases: '["INVESTIGATION","DEVELOPMENT"]', daysAgo: 5, userId: 'Ana Martínez' },
    { id: uuid(), name: '#WebAuthn', type: 'HASHTAG', ideaIdx: 3, treeName: 'TechMakers', phase: 'PRODUCTION', xpPool: 400, currentPhaseIdx: 2, phases: '["INVESTIGATION","DEVELOPMENT","PRODUCTION"]', daysAgo: 21, userId: 'Luis Santander' },
    { id: uuid(), name: '#CostOptimization', type: 'HASHTAG', ideaIdx: 4, treeName: 'TechMakers', phase: 'INVESTIGATION', xpPool: 0, currentPhaseIdx: 0, phases: '["INVESTIGATION"]', daysAgo: 2, userId: 'Tomás Núñez' },

    // EcoLabs
    { id: uuid(), name: 'Riego IoT Invernadero', type: 'NORMAL', ideaIdx: 5, treeName: 'EcoLabs', phase: 'DEVELOPMENT', xpPool: 180, currentPhaseIdx: 1, phases: '["INVESTIGATION","DEVELOPMENT","PRODUCTION"]', daysAgo: 18, userId: 'Pedro Rodríguez' },
    { id: uuid(), name: 'Biodigestor Comunitario', type: 'NORMAL', ideaIdx: 6, treeName: 'EcoLabs', phase: 'INVESTIGATION', xpPool: 30, currentPhaseIdx: 0, phases: '["INVESTIGATION"]', daysAgo: 7, userId: 'Roberto Fuentes' },
    { id: uuid(), name: '#SemillasDelFuturo', type: 'HASHTAG', ideaIdx: 7, treeName: 'EcoLabs', phase: 'DISTRIBUTION', xpPool: 320, currentPhaseIdx: 3, phases: '["INVESTIGATION","DEVELOPMENT","PRODUCTION","DISTRIBUTION"]', daysAgo: 35, userId: 'María García' },

    // SaludDigital
    { id: uuid(), name: 'Triage App Móvil', type: 'NORMAL', ideaIdx: 8, treeName: 'SaludDigital', phase: 'INVESTIGATION', xpPool: 60, currentPhaseIdx: 0, phases: '["INVESTIGATION","DEVELOPMENT"]', daysAgo: 8, userId: 'Camila Torres' },
    { id: uuid(), name: 'Epidemiología Data Pipeline', type: 'NORMAL', ideaIdx: 9, treeName: 'SaludDigital', phase: 'DEVELOPMENT', xpPool: 150, currentPhaseIdx: 1, phases: '["INVESTIGATION","DEVELOPMENT","PRODUCTION"]', daysAgo: 12, userId: 'Isabel Mena' },
    { id: uuid(), name: '#DataProteccion', type: 'HASHTAG', ideaIdx: 10, treeName: 'SaludDigital', phase: 'MAINTENANCE', xpPool: 500, currentPhaseIdx: 4, phases: '["INVESTIGATION","DEVELOPMENT","PRODUCTION","DISTRIBUTION","MAINTENANCE"]', daysAgo: 45, userId: 'Luis Santander' },
  ];

  const branchData = branches.map(br => ({
    id: br.id,
    ideaId: ideaIds[br.ideaIdx],
    treeId: treeIds[br.treeName],
    name: br.name,
    type: br.type as any,
    isHashtag: br.type === 'HASHTAG',
    phase: br.phase as any,
    xpPool: br.xpPool,
    currentPhaseIndex: br.currentPhaseIdx,
    activePhasesJson: br.phases,
    bayasFund: br.type === 'HASHTAG' ? Math.random() * 200 : 0,
    valorOficial: br.type === 'HASHTAG' ? Math.random() * 100 : 0,
    createdAt: daysAgo(br.daysAgo),
    userId: uid(br.userId),
  }));
  await prisma.branch.createMany({ data: branchData });
  const branchIds = branches.map(br => br.id);

  // ── Branch members ──────────────────────────────────────────────────
  const branchMemberDefs: [number, string[]][] = [
    [0, ['Carlos López','Sofía Paredes','Diego Morales','Tomás Núñez']],
    [1, ['Ana Martínez','Valentina Ruiz','Andrés Rivas']],
    [2, ['Luis Santander','Carlos López','Sofía Paredes']],
    [3, ['Tomás Núñez','Sofía Paredes']],
    [4, ['Pedro Rodríguez','Roberto Fuentes','María García']],
    [5, ['Roberto Fuentes','María García','Pedro Rodríguez']],
    [6, ['María García','Elena Vargas','Paz Montenegro','Valentina Ruiz']],
    [7, ['Camila Torres','Andrés Rivas','Javier Herrera']],
    [8, ['Isabel Mena','Javier Herrera','Paz Montenegro','Carlos López']],
    [9, ['Luis Santander','Isabel Mena','Camila Torres','Elena Vargas']],
  ];

  const bmInserts: any[] = [];
  for (const [brIdx, members] of branchMemberDefs) {
    for (const m of members) {
      bmInserts.push({
        id: uuid(),
        userId: uid(m),
        branchId: branchIds[brIdx],
        joinedPhases: JSON.stringify(['INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE']),
        joinedAt: daysAgo(Math.floor(Math.random() * 30)),
      });
    }
  }
  await prisma.branchMember.createMany({ data: bmInserts });
  console.log(`   ✅ ${branches.length} branches, ${bmInserts.length} branch members`);

  // ════════════════════════════════════════════════════════════════════
  // 11. TASKS (20-30)
  // ════════════════════════════════════════════════════════════════════
  console.log('✅ Creating tasks...');

  interface TaskDef {
    branchIdx: number;
    name: string;
    desc: string;
    status: string;
    assignedTo?: string;
    creatorId: string;
    phase: string;
    difficulty: number;
    hours: number;
    tags: string[];
    requiresVoting?: boolean;
    isAnonymous?: boolean;
    completedDaysAgo?: number;
  }

  const taskDefs: TaskDef[] = [
    // Branch 0: CI/CD Pipeline Moderno
    { branchIdx: 0, name: 'Definir arquitectura de pipeline', desc: 'Documentar flujo: push → lint → test → build → scan → push image → deploy staging → canary → production.', status: 'COMPLETED', assignedTo: 'Carlos López', creatorId: 'Carlos López', phase: 'INVESTIGATION', difficulty: 3, hours: 6, completedDaysAgo: 12, tags: ['devops','documentación','arquitectura'] },
    { branchIdx: 0, name: 'Configurar GitHub Actions con matrix build', desc: 'Workflow con matrix de Node 18/20/22, caché de node_modules, parallel test suites.', status: 'COMPLETED', assignedTo: 'Diego Morales', creatorId: 'Carlos López', phase: 'DEVELOPMENT', difficulty: 5, hours: 12, completedDaysAgo: 8, tags: ['CI/CD','github actions','devops'] },
    { branchIdx: 0, name: 'Integrar ArgoCD con notificaciones Slack', desc: 'Configurar ArgoCD ApplicationSets, webhooks a Slack para deploy events, rollback automático si health check falla.', status: 'IN_PROGRESS', assignedTo: 'Sofía Paredes', creatorId: 'Carlos López', phase: 'DEVELOPMENT', difficulty: 6, hours: 16, tags: ['argocd','kubernetes','gitops'] },
    { branchIdx: 0, name: 'Escanear imágenes con Trivy en CI', desc: 'Integrar Trivy scan en GitHub Actions. Bloquear deploy si se detectan CVEs critical/high.', status: 'OPEN', creatorId: 'Luis Santander', phase: 'DEVELOPMENT', difficulty: 4, hours: 8, requiresVoting: true, tags: ['seguridad','trivy','devsecops'] },

    // Branch 1: React 19 Migration
    { branchIdx: 1, name: 'Auditar componentes class actuales', desc: 'Inventariar 47 class components, categorizar por complejidad (simple/medio/complejo) y priorizar migración.', status: 'COMPLETED', assignedTo: 'Ana Martínez', creatorId: 'Ana Martínez', phase: 'INVESTIGATION', difficulty: 2, hours: 5, completedDaysAgo: 4, tags: ['react','auditoría','frontend'] },
    { branchIdx: 1, name: 'Migrar Dashboard principal a Server Components', desc: 'Convertir Dashboard de class→function components con RSC, streaming SSR y suspenso boundaries.', status: 'IN_PROGRESS', assignedTo: 'Andrés Rivas', creatorId: 'Ana Martínez', phase: 'DEVELOPMENT', difficulty: 7, hours: 20, tags: ['react 19','RSC','frontend'] },
    { branchIdx: 1, name: 'Actualizar tests de Enzyme a React Testing Library', desc: 'Migrar 85 tests de Enzyme (deprecado en React 19) a RTL con queries accesibles.', status: 'OPEN', creatorId: 'Ana Martínez', phase: 'DEVELOPMENT', difficulty: 5, hours: 14, tags: ['testing','RTL','react'] },

    // Branch 2: #WebAuthn
    { branchIdx: 2, name: 'Prototipo de registro con huella digital', desc: 'Implementar flujo WebAuthn: credential creation, attestation verification, almacenamiento de public key.', status: 'COMPLETED', assignedTo: 'Luis Santander', creatorId: 'Luis Santander', phase: 'INVESTIGATION', difficulty: 6, hours: 10, completedDaysAgo: 18, tags: ['webauthn','seguridad','autenticación'] },
    { branchIdx: 2, name: 'Bridge JWT para mantener compatibilidad', desc: 'Una vez autenticado con WebAuthn, emitir JWT estándar para que APIs existentes funcionen sin cambios.', status: 'COMPLETED', assignedTo: 'Carlos López', creatorId: 'Luis Santander', phase: 'DEVELOPMENT', difficulty: 5, hours: 8, completedDaysAgo: 14, tags: ['jwt','backend','seguridad'] },
    { branchIdx: 2, name: 'Implementar recovery flow (dispositivo perdido)', desc: 'Flujo de recuperación: email magic link + pregunta de seguridad → registrar nueva credencial WebAuthn.', status: 'IN_PROGRESS', assignedTo: 'Sofía Paredes', creatorId: 'Luis Santander', phase: 'PRODUCTION', difficulty: 4, hours: 6, tags: ['recovery','ux','seguridad'] },
    { branchIdx: 2, name: 'Test de usabilidad con 10 usuarios no técnicos', desc: 'Pruebas de usabilidad: medir tiempo de registro, tasa de error, satisfacción. Informe con recomendaciones.', status: 'OPEN', creatorId: 'Valentina Ruiz', phase: 'PRODUCTION', difficulty: 2, hours: 8, isAnonymous: true, tags: ['ux','testing','investigación'] },

    // Branch 3: #CostOptimization
    { branchIdx: 3, name: 'Exportar datos de AWS Cost Explorer', desc: 'Configurar exportación diaria a S3, consultas Athena para agregar por servicio/tag/entorno.', status: 'IN_PROGRESS', assignedTo: 'Tomás Núñez', creatorId: 'Tomás Núñez', phase: 'INVESTIGATION', difficulty: 3, hours: 5, tags: ['aws','costos','data engineering'] },

    // Branch 4: Riego IoT Invernadero
    { branchIdx: 4, name: 'Diseñar circuito de sensores ESP32', desc: 'Esquemático: ESP32-WROOM, 4 sensores capacitivos v2.0, módulo relé 4 canales, fuente 5V 3A.', status: 'COMPLETED', assignedTo: 'Pedro Rodríguez', creatorId: 'Pedro Rodríguez', phase: 'INVESTIGATION', difficulty: 4, hours: 8, completedDaysAgo: 15, tags: ['IoT','electrónica','diseño'] },
    { branchIdx: 4, name: 'Programar lógica de control de riego', desc: 'Firmware ESP32: lectura de sensores cada 5min, umbrales configurables, MQTT para telemetría, watchdog timer.', status: 'IN_PROGRESS', assignedTo: 'Pedro Rodríguez', creatorId: 'Pedro Rodríguez', phase: 'DEVELOPMENT', difficulty: 5, hours: 14, tags: ['firmware','C++','IoT','MQTT'] },
    { branchIdx: 4, name: 'Dashboard Grafana + InfluxDB', desc: 'Métricas: humedad 4 zonas, litros consumidos/día, alertas de fuga. Dashboard con serie temporal 30 días.', status: 'OPEN', creatorId: 'Roberto Fuentes', phase: 'DEVELOPMENT', difficulty: 4, hours: 10, tags: ['grafana','influxdb','monitoreo'] },

    // Branch 5: Biodigestor Comunitario
    { branchIdx: 5, name: 'Estudio de factibilidad técnica', desc: 'Calcular volumen de residuos disponibles, producción estimada de biogás, requerimientos de espacio y normativa aplicable.', status: 'COMPLETED', assignedTo: 'Roberto Fuentes', creatorId: 'Roberto Fuentes', phase: 'INVESTIGATION', difficulty: 3, hours: 6, completedDaysAgo: 5, tags: ['investigación','biodigestor','factibilidad'] },
    { branchIdx: 5, name: 'Cotizar materiales y permisos', desc: 'Cotizar polietileno tubular, tuberías, filtros H2S. Solicitar permisos municipales y sanitaria.', status: 'IN_PROGRESS', assignedTo: 'María García', creatorId: 'Roberto Fuentes', phase: 'INVESTIGATION', difficulty: 2, hours: 4, tags: ['gestión','trámites','compras'] },

    // Branch 6: #SemillasDelFuturo
    { branchIdx: 6, name: 'Validar contenido con agrónomos expertos', desc: 'Revisión por 3 agrónomos de los 8 módulos. Ajustar según feedback en precisión científica y aplicabilidad local.', status: 'COMPLETED', assignedTo: 'María García', creatorId: 'María García', phase: 'PRODUCTION', difficulty: 3, hours: 5, completedDaysAgo: 20, tags: ['validación','educación'] },
    { branchIdx: 6, name: 'Piloto con escuela rural de Valdivia', desc: 'Ejecutar 4 módulos con 25 estudiantes de escuela rural. Evaluar comprensión y engagement.', status: 'COMPLETED', assignedTo: 'Valentina Ruiz', creatorId: 'María García', phase: 'DISTRIBUTION', difficulty: 2, hours: 20, completedDaysAgo: 10, tags: ['educación','piloto'] },

    // Branch 7: Triage App Móvil
    { branchIdx: 7, name: 'Adaptar protocolo MTS a realidad chilena', desc: 'Traducir y adaptar Manchester Triage System: modificar discriminadores para patologías prevalentes en Chile.', status: 'COMPLETED', assignedTo: 'Camila Torres', creatorId: 'Camila Torres', phase: 'INVESTIGATION', difficulty: 4, hours: 12, completedDaysAgo: 6, tags: ['medicina','protocolo','investigación'] },
    { branchIdx: 7, name: 'Diseñar UI de triage accesible', desc: 'Interfaz con letra grande, alto contraste, soporte lector de pantalla, iconografía universal. 5 pantallas.', status: 'IN_PROGRESS', assignedTo: 'Andrés Rivas', creatorId: 'Camila Torres', phase: 'INVESTIGATION', difficulty: 4, hours: 10, tags: ['diseño','accesibilidad','mobile'] },

    // Branch 8: Epidemiología Data Pipeline
    { branchIdx: 8, name: 'Obtener y limpiar datos MINSAL', desc: 'Descargar DEIS datasets 2023-2026, limpiar valores nulos, normalizar códigos CIE-10, unificar formato fecha.', status: 'COMPLETED', assignedTo: 'Isabel Mena', creatorId: 'Isabel Mena', phase: 'INVESTIGATION', difficulty: 4, hours: 8, completedDaysAgo: 10, tags: ['datos','ETL','salud pública'] },
    { branchIdx: 8, name: 'Pipeline Spark para cruce de datos', desc: 'Apache Spark job que cruza egresos por fecha/ubicación con datos MODIS AOD. Output: dataset en formato Parquet.', status: 'IN_PROGRESS', assignedTo: 'Javier Herrera', creatorId: 'Isabel Mena', phase: 'DEVELOPMENT', difficulty: 7, hours: 20, tags: ['spark','python','big data'] },
    { branchIdx: 8, name: 'Dashboard interactivo con Streamlit', desc: 'Visualizaciones: mapa de calor de enfermedades, series temporales, correlación con contaminación. Filtros por comuna/edad.', status: 'OPEN', creatorId: 'Paz Montenegro', phase: 'DEVELOPMENT', difficulty: 4, hours: 12, requiresVoting: true, tags: ['streamlit','visualización','dashboard'] },

    // Branch 9: #DataProteccion
    { branchIdx: 9, name: 'Implementar anonimización k-anonymity', desc: 'Algoritmo Mondrian multidimensional para garantizar k≥5. Registrar queries originales para auditoría.', status: 'COMPLETED', assignedTo: 'Luis Santander', creatorId: 'Luis Santander', phase: 'DEVELOPMENT', difficulty: 6, hours: 15, completedDaysAgo: 30, tags: ['privacidad','anonimización','backend'] },
    { branchIdx: 9, name: 'Configurar cifrado AES-256 en reposo', desc: 'Envelope encryption con AWS KMS. Rotación automática cada 90 días. Backup cifrado con clave separada.', status: 'COMPLETED', assignedTo: 'Sofía Paredes', creatorId: 'Luis Santander', phase: 'PRODUCTION', difficulty: 5, hours: 8, completedDaysAgo: 25, tags: ['cifrado','KMS','seguridad'] },
    { branchIdx: 9, name: 'Auditoría de cumplimiento externa', desc: 'Contratar firma externa para auditar cumplimiento HIPAA + Ley 19.628. Generar informe y plan de remediación.', status: 'IN_PROGRESS', assignedTo: 'Isabel Mena', creatorId: 'Luis Santander', phase: 'MAINTENANCE', difficulty: 3, hours: 10, tags: ['auditoría','compliance','legal'] },
  ];

  const taskIds: string[] = [];
  for (const td of taskDefs) {
    const tid = uuid();
    await prisma.task.create({
      data: {
        id: tid,
        branchId: branchIds[td.branchIdx],
        name: td.name,
        description: td.desc,
        status: td.status as any,
        assignedTo: td.assignedTo ? uid(td.assignedTo) : null,
        creatorId: uid(td.creatorId),
        phase: td.phase as any,
        difficulty: td.difficulty,
        requiredHours: td.hours,
        requiresVoting: td.requiresVoting || false,
        isAnonymous: td.isAnonymous || false,
        completedAt: td.completedDaysAgo ? daysAgo(td.completedDaysAgo) : null,
        completionComment: td.completedDaysAgo ? `Completada por ${td.assignedTo}. Sin observaciones.` : null,
      },
    });
    for (const tag of td.tags) {
      await prisma.taskTag.create({ data: { id: uuid(), taskId: tid, skillName: tag } });
    }
    taskIds.push(tid);
  }
  console.log(`   ✅ ${taskDefs.length} tasks (${taskDefs.filter(t => t.status === 'COMPLETED').length} completed, ${taskDefs.filter(t => t.status === 'IN_PROGRESS').length} in progress, ${taskDefs.filter(t => t.status === 'OPEN').length} open)`);

  // ════════════════════════════════════════════════════════════════════
  // 12. USER SKILL XP
  // ════════════════════════════════════════════════════════════════════
  console.log('📊 Creating skill XP...');
  const completedTasks = taskDefs.filter(t => t.status === 'COMPLETED');
  const brIdxToTreeName: Record<number, string> = {
    0: 'TechMakers', 1: 'TechMakers', 2: 'TechMakers', 3: 'TechMakers',
    4: 'EcoLabs', 5: 'EcoLabs', 6: 'EcoLabs',
    7: 'SaludDigital', 8: 'SaludDigital', 9: 'SaludDigital',
  };

  for (const td of completedTasks) {
    if (!td.assignedTo) continue;
    const treeName = brIdxToTreeName[td.branchIdx];
    const tid = treeIds[treeName];
    for (const tag of td.tags) {
      await (prisma as any).userSkillXP.upsert({
        where: { userId_skillTag_treeId: { userId: uid(td.assignedTo), skillTag: tag, treeId: tid } },
        update: { accumulatedPoints: { increment: Math.floor((td.difficulty || 1) * 12) }, completedTasks: { increment: 1 }, updatedAt: now() },
        create: { id: uuid(), userId: uid(td.assignedTo), skillTag: tag, treeId: tid, accumulatedPoints: Math.floor((td.difficulty || 1) * 12), completedTasks: 1, updatedAt: now() },
      });
    }
  }
  console.log('   ✅ skill XP entries created');

  // ════════════════════════════════════════════════════════════════════
  // 13. SUBSCRIPTION PLAN (Trust Maker dynamic engine)
  // ════════════════════════════════════════════════════════════════════
  console.log('📊 Creating subscription plan snapshot...');

  const totalTechFiat = techExpenses.reduce((s, e) => s + e.amount, 0);
  const totalEcoFiat = ecoExpenses.reduce((s, e) => s + e.amount, 0);
  const totalSaludFiat = saludExpenses.reduce((s, e) => s + e.amount, 0);
  const grandTotal = totalTechFiat + totalEcoFiat + totalSaludFiat;
  const memberCount = memberData.length;

  await (prisma as any).subscriptionPlan.create({
    data: {
      id: uuid(),
      name: 'Plan Dinámico — ' + currentMonth,
      currentMonthlyCost: grandTotal,
      costBreakdown: {
        trees: {
          TechMakers: { members: treeAssignments['TechMakers'].length, costs: totalTechFiat, perMember: Math.round(totalTechFiat / treeAssignments['TechMakers'].length) },
          EcoLabs: { members: treeAssignments['EcoLabs'].length, costs: totalEcoFiat, perMember: 0 },
          SaludDigital: { members: treeAssignments['SaludDigital'].length, costs: totalSaludFiat, perMember: Math.round(totalSaludFiat / treeAssignments['SaludDigital'].length) },
        },
        totalMembers: memberCount,
        platformFee: Math.round(grandTotal * 0.05),
        grandTotal: Math.round(grandTotal * 1.05),
      },
      calculatedAt: now(),
    },
  });
  console.log(`   ✅ SubscriptionPlan: ${(grandTotal / 1000000).toFixed(1)}M CLP/mes`);

  // ════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════
  const [uCount, tCount, nCount, iCount, bCount, tskCount, memCount, bmemCount, xpCount, ftCount, uaiCount, modelCount, infCount, subCount, stripeCount, expenseCount] = await Promise.all([
    prisma.user.count(),
    prisma.tree.count({ where: { name: { in: ['TechMakers', 'EcoLabs', 'SaludDigital'] } } }),
    prisma.need.count(),
    prisma.idea.count(),
    prisma.branch.count(),
    prisma.task.count(),
    prisma.treeMember.count(),
    prisma.branchMember.count(),
    (prisma as any).userSkillXP.count(),
    prisma.fineTuneJob.count(),
    prisma.userAI.count(),
    prisma.modelRegistry.count(),
    (prisma as any).inferenceJob.count(),
    (prisma as any).userSubscription.count(),
    (prisma as any).stripeConnectAccount.count(),
    (prisma as any).treeExpense.count(),
  ]);

  console.log('\n═══════════════════════════════════════');
  console.log('  🚀 TRUST MAKER SEED COMPLETE');
  console.log('═══════════════════════════════════════');
  console.log(`  Users:                ${uCount}`);
  console.log(`  Trees:                ${tCount}`);
  console.log(`  Tree Members:         ${memCount}`);
  console.log(`  TreeExpenses (FIAT):  ${expenseCount} (${(totalFiat/1000000).toFixed(1)}M CLP)`);
  console.log(`  Needs:                ${nCount}`);
  console.log(`  Ideas:                ${iCount}`);
  console.log(`  Branches:             ${bCount}`);
  console.log(`  Branch Members:       ${bmemCount}`);
  console.log(`  Tasks:                ${tskCount}`);
  console.log(`  Skill XP entries:     ${xpCount}`);
  console.log(`  UserAIs (BYO AI):     ${uaiCount}`);
  console.log(`  Model Registry:       ${modelCount}`);
  console.log(`  Inference Jobs:       ${infCount}`);
  console.log(`  Fine-tune Jobs:       ${ftCount}`);
  console.log(`  Subscriptions:        ${subCount}`);
  console.log(`  Stripe Connect:       ${stripeCount}`);
  console.log(`  SubscriptionPlan:     1`);
  console.log('═══════════════════════════════════════');
  console.log(`\n  Admin: leo@demo.com / demo123`);
  console.log(`  Trees: TechMakers, EcoLabs, SaludDigital\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ Seed failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
