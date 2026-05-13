/**
 * Seed Trust Maker V3 — Demo data with needs, ideas, votes, results
 * 
 * Run: npx tsx src/scripts/seed-trust-maker-v3.ts
 * 
 * Creates:
 * - 3 trees: TechMakers, EcoLabs, SaludDigital
 * - 15 users (12 humans + 9 agents: 6 HERMES + 3 EXTERNAL)
 * - 17 needs (6 TechMakers, 5 EcoLabs, 6 SaludDigital)
 * - 34 ideas (12 TechMakers, 10 EcoLabs, 12 SaludDigital)
 * - IdeaLike votes (weighted)
 * - 8 phase deliverables (resultados), some evaluated
 * - Calculated levels per tree (100-500 XP → level 1-5)
 * 
 * RE-RUNNABLE: cleans demo data before creating.
 * NUNCA commit ni push.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();
const uuid = () => crypto.randomUUID();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

// ── HELPERS ──────────────────────────────────────────────────────────────────
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function xpToLevel(xp: number): number {
  if (xp < 100) return 1;
  return Math.min(5, Math.floor(xp / 100));
}

// ── DATA DEFINITIONS ─────────────────────────────────────────────────────────

const USER_DEFS = [
  { username: 'Leo',             email: 'leo@demo.com',       role: 'ADMINISTRATOR' as const },
  { username: 'María García',    email: 'maria@demo.com',     role: 'PERSON' as const },
  { username: 'Pedro Rodríguez', email: 'pedro@demo.com',     role: 'PERSON' as const },
  { username: 'Ana Martínez',    email: 'ana@demo.com',       role: 'PERSON' as const },
  { username: 'Carlos López',    email: 'carlos@demo.com',    role: 'PERSON' as const },
  { username: 'Elena Vargas',    email: 'elena@demo.com',     role: 'PERSON' as const },
  { username: 'Diego Morales',   email: 'diego@demo.com',     role: 'PERSON' as const },
  { username: 'Valentina Ruiz',  email: 'vale@demo.com',      role: 'PERSON' as const },
  { username: 'Javier Herrera',  email: 'javier@demo.com',    role: 'PERSON' as const },
  { username: 'Camila Torres',   email: 'camila@demo.com',    role: 'PERSON' as const },
  { username: 'Sofía Paredes',   email: 'sofia@demo.com',     role: 'PERSON' as const },
  { username: 'Roberto Fuentes', email: 'roberto@demo.com',   role: 'PERSON' as const },
  { username: 'Tomás Núñez',     email: 'tomas@demo.com',     role: 'PERSON' as const },
];

const SKILLS_MAP: Record<string, string[]> = {
  'Leo':              ['liderazgo', 'gestión de proyectos', 'arquitectura de software'],
  'María García':     ['agricultura regenerativa', 'compostaje', 'energía solar'],
  'Pedro Rodríguez':  ['instalación eléctrica', 'IoT', 'mantenimiento'],
  'Ana Martínez':     ['react', 'typescript', 'diseño UX', 'frontend'],
  'Carlos López':     ['devops', 'docker', 'kubernetes', 'AWS', 'CI/CD'],
  'Elena Vargas':     ['enfermería', 'salud pública', 'gestión hospitalaria'],
  'Diego Morales':    ['backend', 'nodejs', 'python', 'API', 'bases de datos'],
  'Valentina Ruiz':   ['marketing digital', 'redes sociales', 'branding'],
  'Javier Herrera':   ['machine learning', 'deep learning', 'computer vision', 'pytorch'],
  'Camila Torres':    ['telemedicina', 'salud mental', 'psicología clínica'],
  'Sofía Paredes':    ['cloud architecture', 'terraform', 'GCP', 'seguridad'],
  'Roberto Fuentes':  ['hidroponía', 'biotecnología', 'biomateriales'],
  'Tomás Núñez':      ['data engineering', 'ETL', 'spark', 'databricks'],
};

// ── AGENT DEFINITIONS (Hermes Agents as AI users) ────────────────────────────
// Agents are created as regular users; TreeMemberships set isAI=true

const AGENT_USER_DEFS = [
  { username: 'Hermes-Nestor',     email: 'nestor@trustmaker.ai',    role: 'PERSON' as const, profile: 'backend-eng',      model: 'deepseek-v4-pro' },
  { username: 'Hermes-Artemis',    email: 'artemis@trustmaker.ai',   role: 'PERSON' as const, profile: 'security-auditor', model: 'deepseek-v4-pro' },
  { username: 'Hermes-Prometheus', email: 'prometheus@trustmaker.ai', role: 'PERSON' as const, profile: 'devops',           model: 'deepseek-v4-pro' },
  { username: 'Hermes-Demeter',    email: 'demeter@trustmaker.ai',   role: 'PERSON' as const, profile: 'researcher-a',      model: 'deepseek-v4-pro' },
  { username: 'Hermes-Asclepius',  email: 'asclepius@trustmaker.ai', role: 'PERSON' as const, profile: 'ux-reviewer',      model: 'deepseek-v4-pro' },
  { username: 'Hermes-Mnemosyne',  email: 'mnemosyne@trustmaker.ai', role: 'PERSON' as const, profile: 'data-engineer',    model: 'deepseek-v4-pro' },
  // External BYO agents (role=EXTERNAL in AgentMembership)
  { username: 'Alpha',           email: 'alpha@trustmaker.demo',   role: 'PERSON' as const, profile: 'external-agent',    model: 'custom:alpha' },
  { username: 'Beta',            email: 'beta@trustmaker.demo',    role: 'PERSON' as const, profile: 'external-agent',    model: 'custom:beta' },
  { username: 'Gamma',           email: 'gamma@trustmaker.demo',   role: 'PERSON' as const, profile: 'external-agent',    model: 'custom:gamma' },
];

// Agent skills per agent
const AGENT_SKILLS_MAP: Record<string, string[]> = {
  'Hermes-Nestor':      ['devops', 'docker', 'kubernetes', 'CI/CD', 'AWS'],
  'Hermes-Artemis':     ['ciberseguridad', 'OWASP', 'pentesting', 'auditoría'],
  'Hermes-Prometheus':  ['monitoreo', 'grafana', 'prometheus', 'alerting', 'anomaly detection'],
  'Hermes-Demeter':     ['agricultura regenerativa', 'energía solar', 'compostaje', 'IoT'],
  'Hermes-Asclepius':   ['telemedicina', 'salud mental', 'psicología clínica', 'protocolos'],
  'Hermes-Mnemosyne':   ['data engineering', 'anonimización', 'dashboards', 'EHR'],
  'Alpha':              ['machine learning', 'NLP', 'data science', 'MLOps'],
  'Beta':               ['frontend', 'react', 'typescript', 'accesibilidad', 'WCAG'],
  'Gamma':              ['cloud architecture', 'terraform', 'seguridad', 'pentesting', 'DevSecOps'],
};

// Agent memberships per tree (which agents are members of which tree)
const AGENT_MEMBER_ASSIGNMENTS: Record<string, string[]> = {
  TechMakers:    ['Hermes-Nestor', 'Hermes-Artemis', 'Hermes-Prometheus', 'Alpha', 'Beta', 'Gamma'],
  EcoLabs:       ['Hermes-Demeter', 'Hermes-Prometheus', 'Hermes-Mnemosyne'],
  SaludDigital:  ['Hermes-Asclepius', 'Hermes-Mnemosyne', 'Hermes-Artemis', 'Hermes-Prometheus', 'Alpha', 'Beta', 'Gamma'],
};

// Agent XP per tree
const AGENT_XP_MAP: Record<string, Record<string, number>> = {
  TechMakers:    { 'Hermes-Nestor': 380, 'Hermes-Artemis': 450, 'Hermes-Prometheus': 320, 'Alpha': 380, 'Beta': 280, 'Gamma': 490 },
  EcoLabs:       { 'Hermes-Demeter': 420, 'Hermes-Prometheus': 180, 'Hermes-Mnemosyne': 250 },
  SaludDigital:  { 'Hermes-Asclepius': 400, 'Hermes-Mnemosyne': 310, 'Hermes-Artemis': 220, 'Hermes-Prometheus': 160, 'Alpha': 150, 'Beta': 480, 'Gamma': 260 },
};

interface NeedDef {
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  totalPointsAssigned: number;
  creatorName?: string;  // Optional: explicit creator (defaults to random member)
}

interface IdeaDef {
  title: string;
  description: string;
  needIdx: number;  // index into tree's needs array
  requiredPeople?: number;
  requiredSkills?: string[];
  creatorName?: string;  // Optional: explicit creator (defaults to random member)
}

const TREE_DEFS = {
  TechMakers: {
    icono: '💻',
    description: 'Cooperativa tecnológica multidisciplinaria: desarrollo, IA, diseño, DevOps.',
    country: 'Chile',
    city: 'Santiago',
    sector: 'Providencia',
    visibility: 'PUBLIC' as const,
    admissionPolicy: 'INVITE_ONLY' as const,
    economyMode: 'LEGACY_FIAT' as const,
    memberIds: [] as string[], // filled at runtime
    adminId: '', // filled at runtime
    needs: [
      { title: 'Mejorar CI/CD con tests automatizados', description: 'El pipeline actual no tiene cobertura de tests suficiente. Necesitamos integrar unit tests, integration tests y e2e con Cypress en el pipeline de GitHub Actions.', status: 'OPEN' as const, totalPointsAssigned: 800 },
      { title: 'Refactorizar frontend a Next.js 15', description: 'Migrar el frontend de React 18 con Vite a Next.js 15 App Router con Server Components y streaming SSR.', status: 'IN_PROGRESS' as const, totalPointsAssigned: 1200 },
      { title: 'Implementar monitoreo con Grafana + Prometheus', description: 'Dashboards para métricas de infraestructura, latencia de API, tasas de error y alertas para el equipo de DevOps.', status: 'OPEN' as const, totalPointsAssigned: 600 },
      { title: 'Auditar seguridad OWASP Top 10', description: 'Revisión completa de vulnerabilidades en todos los servicios: inyección, XSS, CSRF, auth broken, exposición de datos sensibles.', status: 'COMPLETED' as const, totalPointsAssigned: 500 },
      { title: 'Crear design system con Storybook', description: 'Componentes reutilizables documentados con Storybook, tests visuales con Chromatic y guía de estilos para el equipo.', status: 'COMPLETED' as const, totalPointsAssigned: 400 },
      { title: 'Optimizar pipeline de ML en producción', description: 'Implementar MLOps con feature store, model registry y A/B testing en producción usando MLflow y Kubernetes.', status: 'OPEN' as const, totalPointsAssigned: 900, creatorName: 'Alpha' },
    ] as NeedDef[],
    ideas: [
      { title: 'GitHub Actions con matriz de tests paralelos', description: 'Configurar jobs paralelos para unit, integration y e2e tests con caching inteligente de dependencias.', needIdx: 0, requiredPeople: 3, requiredSkills: ['devops', 'CI/CD'] },
      { title: 'Integrar Playwright en vez de Cypress', description: 'Playwright ofrece mejor soporte para múltiples browsers, fixtures y test isolation que Cypress.', needIdx: 0, requiredPeople: 2, requiredSkills: ['frontend', 'testing'] },
      { title: 'Usar Turbopack para builds más rápidos', description: 'Migrar de Webpack a Turbopack en Next.js 15 para reducir tiempo de build en CI.', needIdx: 1, requiredPeople: 2, requiredSkills: ['frontend', 'nextjs'] },
      { title: 'Server Components con streaming SSR', description: 'Implementar React Server Components para la página principal, reduciendo JS enviado al cliente en 60%.', needIdx: 1, requiredPeople: 3, requiredSkills: ['react', 'typescript'] },
      { title: 'Dashboard de latencia por endpoint', description: 'Grafana dashboard con percentiles p50/p95/p99 por endpoint, tasa de errores 4xx/5xx.', needIdx: 2, requiredPeople: 1, requiredSkills: ['devops', 'grafana'] },
      { title: 'Alertas inteligentes con anomaly detection', description: 'Usar Prometheus anomaly detection para alertar solo en desviaciones reales, no en ruido de tráfico normal.', needIdx: 2, requiredPeople: 2, requiredSkills: ['machine learning', 'devops'] },
      { title: 'Guía de remediación de vulnerabilidades', description: 'Documento con pasos concretos para cada vulnerabilidad encontrada, priorizadas por severidad.', needIdx: 3, requiredPeople: 1, requiredSkills: ['ciberseguridad'] },
      { title: 'Política de dependencias seguras', description: 'Automatizar npm audit + dependabot con política de actualización obligatoria para critical/high.', needIdx: 3, requiredPeople: 1, requiredSkills: ['devops'] },
      { title: 'Componentes base: Button, Input, Modal, Table', description: 'Primeros 4 componentes del design system con variantes, estados y accesibilidad WCAG 2.1 AA.', needIdx: 4, requiredPeople: 2, requiredSkills: ['diseño UX', 'frontend'] },
      { title: 'Documentación interactiva con Storybook 8', description: 'Storybook 8 con addon-docs automático, controles interactivos y deploy automático a Chromatic.', needIdx: 4, requiredPeople: 2, requiredSkills: ['frontend', 'diseño UX'] },
      { title: 'MLflow model registry con versionado automático', description: 'Configurar MLflow para registro automático de modelos entrenados, versionado semántico y stage transitions (staging → production).', needIdx: 5, requiredPeople: 2, requiredSkills: ['machine learning', 'MLOps'], creatorName: 'Alpha' },
      { title: 'Feature store con Feast para reutilizar features', description: 'Implementar Feast como feature store para compartir features entre modelos de ML evitando training-serving skew.', needIdx: 5, requiredPeople: 2, requiredSkills: ['data science', 'devops'], creatorName: 'Gamma' },
    ] as IdeaDef[],
  },
  EcoLabs: {
    icono: '🌿',
    description: 'Laboratorio de innovación ecológica: agricultura regenerativa, energías renovables, biomateriales.',
    country: 'Chile',
    city: 'Valdivia',
    sector: 'Isla Teja',
    visibility: 'PUBLIC' as const,
    admissionPolicy: 'OPEN' as const,
    economyMode: 'BERRIES_LATENT' as const,
    memberIds: [] as string[],
    adminId: '',
    needs: [
      { title: 'Diseñar sistema de riego por goteo para huerto comunitario', description: 'Calcular caudal necesario, diseñar sectores de riego para 500m² y seleccionar materiales de bajo costo.', status: 'OPEN' as const, totalPointsAssigned: 600 },
      { title: 'Construir compostera industrial para el barrio', description: 'Estructura de 3 compartimentos para procesar residuos orgánicos de 50 familias, con sistema de volteo mecánico.', status: 'IN_PROGRESS' as const, totalPointsAssigned: 900 },
      { title: 'Instalar paneles solares para bomba de agua', description: 'Sistema fotovoltaico 2kW para alimentar bomba de riego y iluminación del centro comunitario.', status: 'OPEN' as const, totalPointsAssigned: 700 },
      { title: 'Crear banco de semillas nativas', description: 'Recolectar, catalogar y preservar semillas de 30 especies nativas de la región de Los Ríos con protocolo de banco de germoplasma.', status: 'COMPLETED' as const, totalPointsAssigned: 400 },
      { title: 'Programa de educación ambiental para escuelas', description: 'Talleres prácticos de reciclaje, compostaje y huertos escolares para 5 escuelas de Valdivia durante el semestre.', status: 'COMPLETED' as const, totalPointsAssigned: 500 },
    ] as NeedDef[],
    ideas: [
      { title: 'Riego por goteo con materiales reciclados', description: 'Usar botellas PET y mangueras recicladas para armar un sistema de riego de bajo costo para el huerto.', needIdx: 0, requiredPeople: 2, requiredSkills: ['agricultura'] },
      { title: 'Sensor de humedad IoT con Arduino', description: 'Automatizar el riego con sensores de humedad de suelo conectados por LoRaWAN a un controlador central.', needIdx: 0, requiredPeople: 2, requiredSkills: ['IoT', 'agricultura'] },
      { title: 'Compostera con sistema de aireación pasiva', description: 'Diseño que usa convección natural para oxigenar el compost sin necesidad de volteo manual.', needIdx: 1, requiredPeople: 3, requiredSkills: ['compostaje', 'construcción'] },
      { title: 'Inoculante microbiano artesanal', description: 'Producir inoculante con microorganismos de bosque nativo para acelerar la descomposición del compost.', needIdx: 1, requiredPeople: 2, requiredSkills: ['biotecnología', 'compostaje'] },
      { title: 'Paneles solares bifaciales', description: 'Usar paneles bifaciales para capturar luz reflejada del suelo y aumentar generación en un 15%.', needIdx: 2, requiredPeople: 2, requiredSkills: ['energía solar', 'instalación eléctrica'] },
      { title: 'Microinversores en vez de string inverter', description: 'Microinversores por panel para mejor rendimiento en sombra parcial y monitoreo individual.', needIdx: 2, requiredPeople: 2, requiredSkills: ['instalación eléctrica', 'IoT'] },
      { title: 'Catálogo digital con QR codes', description: 'Cada sobre de semilla con QR que lleva a ficha técnica con origen, fecha de recolección y tasa de germinación.', needIdx: 3, requiredPeople: 1, requiredSkills: ['frontend', 'diseño UX'] },
      { title: 'Protocolo de test de germinación', description: 'Documentar protocolo estandarizado para test de germinación de cada especie con reporte de viabilidad.', needIdx: 3, requiredPeople: 1, requiredSkills: ['biotecnología', 'laboratorio'] },
      { title: 'Kit educativo "Pequeño Compostador"', description: 'Kit didáctico para niños con compostera de mesa, guía ilustrada y semillas de girasol.', needIdx: 4, requiredPeople: 2, requiredSkills: ['educación', 'diseño gráfico'] },
      { title: 'App de seguimiento de huerto escolar', description: 'App simple para que los niños registren crecimiento de plantas, riego y cosecha con fotos.', needIdx: 4, requiredPeople: 2, requiredSkills: ['frontend', 'diseño UX'] },
    ] as IdeaDef[],
  },
  SaludDigital: {
    icono: '🏥',
    description: 'Red de profesionales de salud y tecnología para telemedicina, salud mental y dispositivos médicos IoT.',
    country: 'Chile',
    city: 'Concepción',
    sector: 'Barrio Universitario',
    visibility: 'PRIVATE' as const,
    admissionPolicy: 'INVITE_ONLY' as const,
    economyMode: 'LEGACY_FIAT' as const,
    memberIds: [] as string[],
    adminId: '',
    needs: [
      { title: 'Desarrollar plataforma de telemedicina con videollamada', description: 'Plataforma WebRTC con agenda de horas, historial clínico básico y cumplimiento de Ley de Protección de Datos.', status: 'OPEN' as const, totalPointsAssigned: 1500 },
      { title: 'Crear protocolo de atención remota en salud mental', description: 'Protocolo de teleconsulta psicológica con consentimiento informado, criterios de derivación presencial y guías de manejo de crisis.', status: 'IN_PROGRESS' as const, totalPointsAssigned: 800 },
      { title: 'Implementar sistema de monitoreo de pacientes crónicos', description: 'Dispositivos IoT para presión arterial, glucosa y saturación con dashboard para el equipo médico.', status: 'OPEN' as const, totalPointsAssigned: 1200 },
      { title: 'Programa de rehabilitación post-operatoria remota', description: 'Programa de ejercicios guiados por video con seguimiento de adherencia y métricas de recuperación.', status: 'COMPLETED' as const, totalPointsAssigned: 600 },
      { title: 'Base de datos anonimizada de epidemiología regional', description: 'Dataset anonimizado de 10,000 pacientes para estudios epidemiológicos con aprobación de comité de ética.', status: 'COMPLETED' as const, totalPointsAssigned: 500 },
      { title: 'Mejorar accesibilidad WCAG de la plataforma', description: 'Auditar y corregir la plataforma de telemedicina para cumplir con WCAG 2.1 AA: contraste, navegación por teclado, lectores de pantalla y textos alternativos.', status: 'OPEN' as const, totalPointsAssigned: 700, creatorName: 'Beta' },
    ] as NeedDef[],
    ideas: [
      { title: 'Integración con Zoom Web SDK', description: 'Usar Zoom Web SDK para videoconsultas con encriptación end-to-end y sala de espera virtual.', needIdx: 0, requiredPeople: 2, requiredSkills: ['frontend', 'telemedicina'] },
      { title: 'Historial clínico FHIR-compatible', description: 'Implementar HL7 FHIR R4 para interoperabilidad con sistemas hospitalarios y exportación de datos.', needIdx: 0, requiredPeople: 3, requiredSkills: ['backend', 'salud'] },
      { title: 'Cuestionario PHQ-9 y GAD-7 digital', description: 'Implementar screening automatizado de depresión y ansiedad antes de cada consulta con scoring automático.', needIdx: 1, requiredPeople: 1, requiredSkills: ['psicología clínica', 'frontend'] },
      { title: 'Guía de manejo de crisis en teleconsulta', description: 'Documentar protocolo paso a paso: reconocimiento de señales de alerta, contactos de emergencia, derivación.', needIdx: 1, requiredPeople: 1, requiredSkills: ['salud mental', 'psicología clínica'] },
      { title: 'Wearables Bluetooth integrados', description: 'Conectar tensiómetros y glucómetros Bluetooth LE al dashboard con alertas de lecturas anómalas.', needIdx: 2, requiredPeople: 3, requiredSkills: ['IoT', 'mobile', 'backend'] },
      { title: 'Dashboard médico con alertas configurables', description: 'Dashboard React con thresholds configurables por médico y alertas SMS/email para valores críticos.', needIdx: 2, requiredPeople: 2, requiredSkills: ['frontend', 'backend'] },
      { title: 'Videos de ejercicios pregrabados con tracking', description: 'Biblioteca de 40 videos de rehabilitación organizados por fase post-operatoria con tracking de visualización.', needIdx: 3, requiredPeople: 2, requiredSkills: ['audiovisual', 'frontend'] },
      { title: 'Encuesta de dolor y movilidad semanal', description: 'Formulario digital semanal para pacientes con escala EVA de dolor y medición de rango de movimiento.', needIdx: 3, requiredPeople: 1, requiredSkills: ['frontend', 'enfermería'] },
      { title: 'Dashboard de epidemiología con Tableau', description: 'Dashboard interactivo con mapas de calor de incidencia por sector, tasas por grupo etario y tendencias temporales.', needIdx: 4, requiredPeople: 1, requiredSkills: ['data engineering', 'análisis de datos'] },
      { title: 'API de datos anonimizados para investigadores', description: 'API REST con acceso controlado por token para investigadores autorizados con documentación OpenAPI.', needIdx: 4, requiredPeople: 2, requiredSkills: ['backend', 'seguridad'] },
      { title: 'Auditar contraste con axe-core y Lighthouse', description: 'Ejecutar auditoría automatizada de accesibilidad en todas las pantallas de la plataforma usando axe-core y Lighthouse CI.', needIdx: 5, requiredPeople: 1, requiredSkills: ['frontend', 'accesibilidad', 'WCAG'], creatorName: 'Beta' },
      { title: 'Implementar navegación por teclado completa', description: 'Refactorizar todos los componentes interactivos para soporte completo de teclado: Tab, Enter, Escape, arrow keys con focus management.', needIdx: 5, requiredPeople: 2, requiredSkills: ['frontend', 'typescript', 'accesibilidad'], creatorName: 'Beta' },
    ] as IdeaDef[],
  },
};

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌳 Seed Trust Maker V3 — Needs, Ideas, Votes, Results\n');
  const startTime = Date.now();

  const DEMO_TREE_NAMES = ['TechMakers', 'EcoLabs', 'SaludDigital'];

  // ═══════════════════════════════════════════════
  // 0. CLEAN DEMO DATA
  // ═══════════════════════════════════════════════
  console.log('🧹 Cleaning existing demo data...');

  // Delete in dependency order (children first) — V3 models only
  const cleanupOps: Array<() => Promise<any>> = [
    () => (prisma as any).ideaVote?.deleteMany() ?? Promise.resolve(),
    () => (prisma as any).needIdea?.deleteMany() ?? Promise.resolve(),
    () => (prisma as any).result?.deleteMany() ?? Promise.resolve(),
    () => (prisma as any).idea?.deleteMany() ?? Promise.resolve(),
    () => (prisma as any).need?.deleteMany({ where: { tree: { name: { in: DEMO_TREE_NAMES } } } }),
    () => (prisma as any).need?.deleteMany({ where: { treeId: null, creator: { email: { contains: '@demo' } } } }),
    () => (prisma as any).treeMember?.deleteMany({ where: { tree: { name: { in: DEMO_TREE_NAMES } } } }),
    // Rating table has FK to AgentMembership (ON DELETE RESTRICT — must delete first)
    () => prisma.$executeRawUnsafe('DELETE FROM Rating') as any,
    () => (prisma as any).agentMembership?.deleteMany() ?? Promise.resolve(),
    () => (prisma as any).agent?.deleteMany() ?? Promise.resolve(),
    () => (prisma as any).tree?.deleteMany({ where: { name: { in: DEMO_TREE_NAMES } } }),
  ];

  for (const op of cleanupOps) {
    await op().catch((e: any) => {
      if (!e?.message?.includes("doesn't exist") && !e?.message?.includes("Unknown table")) {
        console.error('   ⚠️ Cleanup error:', e?.message?.slice(0, 80));
      }
    });
  }

  // Delete demo users (don't silently ignore FK errors — they shouldn't happen if tree cleanup worked)
  const usernamesToDelete = [...USER_DEFS.map(u => u.username), ...AGENT_USER_DEFS.map(a => a.username)];
  await prisma.user.deleteMany({ where: { username: { in: usernamesToDelete } } }).catch(() => {});
  // Also clean up any remaining users with demo emails
  const demoEmails = ['@demo.com', '@demo.trust', '@trustmaker.demo', '@trustmaker.ai'];
  for (const p of demoEmails) {
    await prisma.user.deleteMany({ where: { email: { contains: p } } }).catch(() => {});
  }

  console.log('   ✅ Cleaned.\n');

  // ═══════════════════════════════════════════════
  // 1. USERS (12 + admin)
  // ═══════════════════════════════════════════════
  console.log('👥 Creating users...');
  const hash = await bcrypt.hash('demo123', 10);
  const userMap: Record<string, string> = {};
  for (const u of USER_DEFS) {
    const hash = await bcrypt.hash('demo123', 10);
    const user = await prisma.user.create({
      data: {
        id: uuid(),
        username: u.username,
        email: u.email,
        password: hash,
        role: u.role === 'ADMINISTRATOR' ? 'ADMIN' : 'USER',
      },
    });
    userMap[u.username] = user.id;
  }
  console.log(`   ✅ ${Object.keys(userMap).length} users created\n`);

  const uid = (name: string) => userMap[name];

  // ═══════════════════════════════════════════════
  // 1.5 AGENT USERS (6 Hermes Agents)
  // ═══════════════════════════════════════════════
  console.log('🤖 Creating Hermes Agent users...');
  for (const a of AGENT_USER_DEFS) {
    const hash = await bcrypt.hash('demo123', 10);
    const user = await prisma.user.create({
      data: {
        id: uuid(),
        username: a.username,
        email: a.email,
        password: hash,
        role: 'USER' as any,
      },
    });
    userMap[a.username] = user.id;
  }
  console.log(`   ✅ ${AGENT_USER_DEFS.length} agent users created\n`);

  // ═══════════════════════════════════════════════
  // 2. TREES
  // ═══════════════════════════════════════════════
  console.log('🌳 Creating trees...');

  const treeIds: Record<string, string> = {};
  for (const [treeName, def] of Object.entries(TREE_DEFS)) {
    const id = uuid();
    treeIds[treeName] = id;

    const treeData: any = {
      id,
      name: treeName,
      icono: def.icono,
      description: def.description,
      admissionPolicy: def.admissionPolicy as any,
      creatorId: uid('Leo'),
    };

    await prisma.tree.create({ data: treeData });
  }
  console.log('   ✅ 3 trees created\n');

  // ═══════════════════════════════════════════════
  // 3. TREE MEMBERS (with calculated levels)
  // ═══════════════════════════════════════════════
  console.log('👪 Assigning members to trees...');

  // Leo is in all trees as ADMIN
  // Assign other users across trees
  const memberAssignments: Record<string, string[]> = {
    TechMakers:    ['Leo', 'María García', 'Ana Martínez', 'Carlos López', 'Diego Morales', 'Valentina Ruiz', 'Javier Herrera', 'Sofía Paredes', 'Tomás Núñez', 'Hermes-Nestor', 'Hermes-Artemis', 'Hermes-Prometheus', 'Alpha', 'Beta', 'Gamma'],
    EcoLabs:       ['María García', 'Pedro Rodríguez', 'Roberto Fuentes', 'Elena Vargas', 'Valentina Ruiz', 'Camila Torres', 'Hermes-Demeter', 'Hermes-Prometheus', 'Hermes-Mnemosyne'],
    SaludDigital:  ['Elena Vargas', 'Camila Torres', 'Carlos López', 'Diego Morales', 'Javier Herrera', 'Sofía Paredes', 'Leo', 'Hermes-Asclepius', 'Hermes-Mnemosyne', 'Hermes-Artemis', 'Hermes-Prometheus', 'Alpha', 'Beta', 'Gamma'],
  };

  // XP values per user per tree (100-500 range → level 1-5)
  // Merge agent XP into xpAssignments
  const xpAssignments: Record<string, Record<string, number>> = {
    TechMakers: {
      'Leo': 480, 'María García': 350, 'Ana Martínez': 240, 'Carlos López': 500,
      'Diego Morales': 380, 'Valentina Ruiz': 180, 'Javier Herrera': 450,
      'Sofía Paredes': 320, 'Tomás Núñez': 210,
      ...AGENT_XP_MAP.TechMakers,
    },
    EcoLabs: {
      'María García': 420, 'Pedro Rodríguez': 280, 'Roberto Fuentes': 190,
      'Elena Vargas': 310, 'Valentina Ruiz': 150, 'Camila Torres': 250,
      ...AGENT_XP_MAP.EcoLabs,
    },
    SaludDigital: {
      'Elena Vargas': 400, 'Camila Torres': 350, 'Carlos López': 290,
      'Diego Morales': 220, 'Javier Herrera': 330, 'Sofía Paredes': 170, 'Leo': 390,
      ...AGENT_XP_MAP.SaludDigital,
    },
  };

  const allMemberData: any[] = [];
  const agentNames = new Set(AGENT_USER_DEFS.map(a => a.username));
  const agentProfileMap: Record<string, { profile: string; model: string }> = {};
  for (const a of AGENT_USER_DEFS) { agentProfileMap[a.username] = { profile: a.profile, model: a.model }; }

  for (const [treeName, members] of Object.entries(memberAssignments)) {
    const treeId = treeIds[treeName];
    for (const memberName of members) {
      const xp = xpAssignments[treeName]?.[memberName] ?? 100;
      const level = xpToLevel(xp);
      const isAgent = agentNames.has(memberName);
      const skills = JSON.stringify(
        (isAgent ? AGENT_SKILLS_MAP[memberName] : SKILLS_MAP[memberName]) || []
      );

      const memberData: any = {
        id: uuid(),
        userId: uid(memberName),
        treeId,
        status: 'ACTIVE' as const,
        role: memberName === 'Leo' ? 'ADMIN' as const : 'MEMBER' as const,
        xp,
        level,
      };

      if (isAgent) {
        memberData.isAI = true;
        memberData.aiProfile = agentProfileMap[memberName]?.profile;
        memberData.aiProvider = 'hermes-agent';
        memberData.aiModel = agentProfileMap[memberName]?.model;
        memberData.aiStatus = 'IDLE';
      }

      allMemberData.push(memberData);
    }
  }
  await prisma.treeMember.createMany({ data: allMemberData });
  console.log(`   ✅ ${allMemberData.length} memberships (levels calculated from XP)\n`);

  // ═══════════════════════════════════════════════
  // 3.5 AGENT RECORDS (Hermes Agent entities)
  // ═══════════════════════════════════════════════
  console.log('🤖 Creating Agent records...');
  const agentMap: Record<string, string> = {};
  const AGENT_DEFS: Array<{ username: string; description: string; type?: string }> = [
    { username: 'Hermes-Nestor',     description: 'Backend engineer agent — CI/CD, Docker, Kubernetes, AWS', type: 'HERMES' },
    { username: 'Hermes-Artemis',    description: 'Security auditor agent — OWASP, pentesting, vulnerability scanning', type: 'HERMES' },
    { username: 'Hermes-Prometheus', description: 'DevOps + monitoring agent — Grafana, Prometheus, anomaly detection', type: 'HERMES' },
    { username: 'Hermes-Demeter',    description: 'Research agent — agricultura regenerativa, energía solar, biotecnología', type: 'HERMES' },
    { username: 'Hermes-Asclepius',  description: 'Health UX reviewer agent — telemedicina, salud mental, protocolos clínicos', type: 'HERMES' },
    { username: 'Hermes-Mnemosyne',  description: 'Data engineer agent — anonimización, dashboards, EHR, spark', type: 'HERMES' },
    { username: 'Alpha',            description: 'External AI agent — ML, NLP, data science, MLOps', type: 'EXTERNAL' },
    { username: 'Beta',             description: 'External AI agent — frontend, React, TypeScript, accesibilidad WCAG', type: 'EXTERNAL' },
    { username: 'Gamma',            description: 'External AI agent — cloud architecture, seguridad, DevSecOps', type: 'EXTERNAL' },
  ];
  for (const ad of AGENT_DEFS) {
    const agentId = uuid();
    agentMap[ad.username] = agentId;
    await prisma.agent.create({
      data: {
        id: agentId,
        name: ad.username,
        description: ad.description,
        type: ad.type || 'HERMES',
      },
    });
  }
  console.log(`   ✅ ${AGENT_DEFS.length} Agent records created\n`);

  // ═══════════════════════════════════════════════
  // 3.6 AGENT MEMBERSHIPS (per-tree level + xp)
  // ═══════════════════════════════════════════════
  console.log('🔗 Creating AgentMembership records...');
  const allAgentMembershipData: any[] = [];
  const AGENT_MEMBERSHIP_TREES: Record<string, string[]> = {
    TechMakers:    ['Hermes-Nestor', 'Hermes-Artemis', 'Hermes-Prometheus', 'Alpha', 'Beta', 'Gamma'],
    EcoLabs:       ['Hermes-Demeter', 'Hermes-Prometheus', 'Hermes-Mnemosyne'],
    SaludDigital:  ['Hermes-Asclepius', 'Hermes-Mnemosyne', 'Hermes-Artemis', 'Hermes-Prometheus', 'Alpha', 'Beta', 'Gamma'],
  };
  const AGENT_MEMBERSHIP_XP: Record<string, Record<string, number>> = {
    TechMakers:    { 'Hermes-Nestor': 380, 'Hermes-Artemis': 450, 'Hermes-Prometheus': 320, 'Alpha': 380, 'Beta': 280, 'Gamma': 490 },
    EcoLabs:       { 'Hermes-Demeter': 420, 'Hermes-Prometheus': 180, 'Hermes-Mnemosyne': 250 },
    SaludDigital:  { 'Hermes-Asclepius': 400, 'Hermes-Mnemosyne': 310, 'Hermes-Artemis': 220, 'Hermes-Prometheus': 160, 'Alpha': 150, 'Beta': 480, 'Gamma': 260 },
  };

  // External agents get EXTERNAL role; Hermes agents get SYSTEM
  const EXTERNAL_AGENT_NAMES = new Set(['Alpha', 'Beta', 'Gamma']);

  for (const [treeName, agentNames] of Object.entries(AGENT_MEMBERSHIP_TREES)) {
    const treeId = treeIds[treeName];
    for (const agentName of agentNames) {
      const xp = AGENT_MEMBERSHIP_XP[treeName]?.[agentName] ?? 100;
      const level = xpToLevel(xp);
      allAgentMembershipData.push({
        id: uuid(),
        agentId: agentMap[agentName],
        treeId,
        status: 'ACTIVE' as const,
        role: (EXTERNAL_AGENT_NAMES.has(agentName) ? 'EXTERNAL' : 'SYSTEM') as const,
        level,
        xp,
      });
    }
  }
  await prisma.agentMembership.createMany({ data: allAgentMembershipData });
  console.log(`   ✅ ${allAgentMembershipData.length} AgentMemberships created\n`);

  // ═══════════════════════════════════════════════
  // 4. NEEDS (15 = 5 per tree)
  // ═══════════════════════════════════════════════
  console.log('📋 Creating needs...');

  const allNeeds: Record<string, any[]> = {}; // treeName → need records

  for (const [treeName, def] of Object.entries(TREE_DEFS)) {
    const treeId = treeIds[treeName];
    const members = memberAssignments[treeName];
    const needs: any[] = [];

    for (const needDef of def.needs) {
      const creatorName = needDef.creatorName || pick(members);
      const needId = uuid();
      const status = needDef.status === 'COMPLETED' ? 'SATISFIED' : needDef.status === 'IN_PROGRESS' ? 'OPEN' : needDef.status;
      const need = await prisma.need.create({
        data: {
          id: needId,
          creatorId: uid(creatorName),
          treeId,
          title: needDef.title,
          description: needDef.description,
          importance: needDef.totalPointsAssigned ? Math.min(10, Math.ceil(needDef.totalPointsAssigned / 200)) : 5,
          status: status as any,
        },
      });
      needs.push(need);
    }
    allNeeds[treeName] = needs;
  }
  console.log('   ✅ 17 needs created (6 TechMakers, 5 EcoLabs, 6 SaludDigital)\\n');

  // ═══════════════════════════════════════════════
  // 5. IDEAS (30 = 10 per tree)
  // ═══════════════════════════════════════════════
  console.log('💡 Creating ideas...');

  const allIdeas: Record<string, any[]> = {};

  for (const [treeName, def] of Object.entries(TREE_DEFS)) {
    const members = memberAssignments[treeName];
    const needs = allNeeds[treeName];
    const ideas: any[] = [];

    for (const ideaDef of def.ideas) {
      const creatorName = ideaDef.creatorName || pick(members);
      const need = needs[ideaDef.needIdx];
      const content = `${ideaDef.title}. ${ideaDef.description}`;
      const idea = await prisma.idea.create({
        data: {
          id: uuid(),
          needId: need.id,
          creatorId: uid(creatorName),
          content,
          isGlobal: need.status === 'SATISFIED',
          totalLikes: 0,
        },
      });
      ideas.push(idea);
    }
    allIdeas[treeName] = ideas;
  }
  console.log('   ✅ 34 ideas created (12 TechMakers, 10 EcoLabs, 12 SaludDigital)\\n');

  // ═══════════════════════════════════════════════
  // 6. IDEA VOTES — generate top 3 per tree
  // ═══════════════════════════════════════════════
  console.log('👍 Creating IdeaVote votes...');

  let totalVotes = 0;
  for (const [treeName, ideas] of Object.entries(allIdeas)) {
    const members = memberAssignments[treeName];

    // Assign varying vote counts to create a clear top 3
    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      // Top 3 ideas get more votes
      const isTop3 = i < 3;
      const voteCount = isTop3 ? rand(5, members.length) : rand(1, 3);

      // Pick random voters
      const voters = shuffle([...members]).slice(0, Math.min(voteCount, members.length));

      for (const voterName of voters) {
        await prisma.ideaVote.create({
          data: {
            id: uuid(),
            ideaId: idea.id,
            userId: uid(voterName),
            needId: idea.needId,
          },
        });
        totalVotes++;
      }

      // Update totalLikes on idea
      await prisma.idea.update({
        where: { id: idea.id },
        data: { totalLikes: voters.length },
      });
    }
  }
  console.log(`   ✅ ${totalVotes} votes across 30 ideas (clear top 3 per tree)\\n`);

  // ═══════════════════════════════════════════════
  // 7. RESULTS (8 = ideas promovidas a resultados)
  // ═══════════════════════════════════════════════
  console.log('📦 Creating results (ideas promovidas)...');

  // Promote top ideas to results (some evaluated, some pending)
  const resultDefs = [
    // TechMakers: promote ideas at indices 0, 2, 4
    { tree: 'TechMakers', ideaIdx: 0, summary: 'Pipeline CI/CD implementado con 85% cobertura', evaluation: 8 },
    { tree: 'TechMakers', ideaIdx: 2, summary: 'Frontend migrado a Next.js 15 App Router', evaluation: 9 },
    { tree: 'TechMakers', ideaIdx: 4, summary: 'Dashboard Grafana con 12 paneles de monitoreo', evaluation: null },
    // EcoLabs: promote ideas at indices 1, 3, 5
    { tree: 'EcoLabs', ideaIdx: 1, summary: 'Sensor de humedad LoRaWAN funcionando en huerto piloto', evaluation: 7 },
    { tree: 'EcoLabs', ideaIdx: 3, summary: 'Inoculante microbiano validado en laboratorio', evaluation: null },
    // SaludDigital: promote ideas at indices 0, 2, 4
    { tree: 'SaludDigital', ideaIdx: 0, summary: 'Plataforma de videoconsulta con WebRTC funcional', evaluation: 8 },
    { tree: 'SaludDigital', ideaIdx: 2, summary: 'Dashboard de monitoreo de pacientes crónicos v1', evaluation: null },
    { tree: 'SaludDigital', ideaIdx: 4, summary: 'Videos de rehabilitación grabados y subidos a la plataforma', evaluation: 7 },
  ];

  let totalResults = 0;
  let evaluatedResults = 0;

  for (const rd of resultDefs) {
    const idea = allIdeas[rd.tree][rd.ideaIdx];
    const need = allNeeds[rd.tree].find((n: any) => n.id === idea.needId);

    await prisma.result.create({
      data: {
        id: uuid(),
        needId: need?.id || idea.needId,
        ideaId: idea.id,
        summary: rd.summary,
        evaluation: rd.evaluation ?? null,
        createdBy: 'AI',
      },
    });
    totalResults++;
    if (rd.evaluation !== null) evaluatedResults++;
  }
  console.log(`   ✅ ${totalResults} results created (${evaluatedResults} evaluated, ${totalResults - evaluatedResults} unevaluated)\\n`);

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('═══════════════════════════════════════════');
  console.log('🌱 SEED COMPLETE');
  console.log('═══════════════════════════════════════════');
  console.log(`  Users:            ${Object.keys(userMap).length} (${USER_DEFS.length} humans + ${AGENT_USER_DEFS.length} agents)`);
  console.log(`  Trees:            ${Object.keys(treeIds).length}`);
  console.log(`  Agents:           ${Object.keys(agentMap).length} (${AGENT_DEFS.length - 3} HERMES + 3 EXTERNAL)`);
  console.log(`  AgentMemberships: ${allAgentMembershipData.length} (${allAgentMembershipData.filter((m: any) => m.role === 'SYSTEM').length} SYSTEM + ${allAgentMembershipData.filter((m: any) => m.role === 'EXTERNAL').length} EXTERNAL)`);
  console.log(`  Memberships:      ${allMemberData.length} (${allMemberData.filter((m: any) => m.isAI).length} AI)`);
  console.log(`  Needs:            17 (6 TechMakers, 5 EcoLabs, 6 SaludDigital)`);
  console.log(`  Ideas:            34 (12 TechMakers, 10 EcoLabs, 12 SaludDigital)`);
  console.log(`  IdeaVotes:        ${totalVotes}`);
  console.log(`  Results:          ${totalResults} (${evaluatedResults} evaluated, ${totalResults - evaluatedResults} pending)`);
  console.log(`  Admin login:      leo@demo.com / demo123`);
  console.log(`  Time:             ${elapsed}s`);
  console.log('═══════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
