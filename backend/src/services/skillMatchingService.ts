import { prisma } from '../index';

// ── Allowed skill categories ─────────────────────────────────────────────────
const ALLOWED_CATEGORIES = new Set([
  'design', 'frontend', 'backend', 'data', 'ops',
  'writing', 'research', 'coordination', 'marketing', 'finance',
]);

// ── Keyword → category mapping ───────────────────────────────────────────────
// Maps extracted keywords from task title+description to skill categories.
// Keys are lowercase; values are category names from the allowed set.

const KEYWORD_TO_CATEGORY: Record<string, string> = {
  // design
  diseño: 'design', design: 'design', ui: 'design', ux: 'design',
  css: 'design', html: 'design', visual: 'design', figma: 'design',
  sketch: 'design', layout: 'design', color: 'design', typography: 'design',
  branding: 'design', estilo: 'design', interfaz: 'design', interface: 'design',
  prototipo: 'design', prototype: 'design', mockup: 'design', ilustración: 'design',
  illustration: 'design', gráfico: 'design', grafico: 'design', graphic: 'design',

  // frontend
  frontend: 'frontend', react: 'frontend', vue: 'frontend', angular: 'frontend',
  javascript: 'frontend', typescript: 'frontend', component: 'frontend',
  componente: 'frontend', spa: 'frontend', responsive: 'frontend',
  browser: 'frontend', navegador: 'frontend', web: 'frontend',
  cliente: 'frontend', client: 'frontend', nextjs: 'frontend', next: 'frontend',
  nuxt: 'frontend', svelte: 'frontend', redux: 'frontend', state: 'frontend',
  tailwind: 'frontend', bootstrap: 'frontend',

  // backend
  backend: 'backend', api: 'backend', server: 'backend', servidor: 'backend',
  database: 'backend', base: 'backend', datos: 'backend', sql: 'backend',
  endpoint: 'backend', rest: 'backend', graphql: 'backend',
  microservice: 'backend', microservicio: 'backend', authentication: 'backend',
  auth: 'backend', autenticación: 'backend', autenticacion: 'backend',
  jwt: 'backend', token: 'backend', middleware: 'backend', prisma: 'backend',
  orm: 'backend', migration: 'backend', migración: 'backend', migracion: 'backend',
  schema: 'backend', crud: 'backend', postgres: 'backend', mysql: 'backend',
  mongodb: 'backend', redis: 'backend', express: 'backend', fastify: 'backend',
  nestjs: 'backend',

  // data
  data: 'data', analytics: 'data', analítica: 'data', analitica: 'data',
  python: 'data', pandas: 'data', tableau: 'data', dashboard: 'data',
  metric: 'data', métrica: 'data', metrica: 'data', statistics: 'data',
  estadística: 'data', estadistica: 'data', machine: 'data', learning: 'data',
  ml: 'data', ai: 'data', artificial: 'data', intelligence: 'data',
  inteligencia: 'data', model: 'data', modelo: 'data', prediction: 'data',
  predicción: 'data', prediccion: 'data', etl: 'data', pipeline: 'data',
  warehouse: 'data', bi: 'data', reporting: 'data', reporte: 'data',

  // ops
  ops: 'ops', deploy: 'ops', deployment: 'ops', desplegar: 'ops',
  docker: 'ops', kubernetes: 'ops', k8s: 'ops', ci: 'ops', cd: 'ops',
  aws: 'ops', cloud: 'ops', nube: 'ops', infrastructure: 'ops',
  infraestructura: 'ops', monitoring: 'ops', monitoreo: 'ops',
  terraform: 'ops', ansible: 'ops', linux: 'ops', unix: 'ops',
  serverless: 'ops', lambda: 'ops', scaling: 'ops', escalado: 'ops',
  nginx: 'ops', proxy: 'ops', dns: 'ops', ssl: 'ops', tls: 'ops',
  backup: 'ops', logging: 'ops', logs: 'ops', alert: 'ops', alerta: 'ops',

  // writing
  writing: 'writing', copy: 'writing',
  documentation: 'writing', documentación: 'writing', documentacion: 'writing',
  docs: 'writing', blog: 'writing', article: 'writing', articulo: 'writing',
  translation: 'writing', traducción: 'writing',
  traduccion: 'writing', editing: 'writing', edición: 'writing',
  edicion: 'writing', redacción: 'writing', redaccion: 'writing',
  escribir: 'writing', write: 'writing', texto: 'writing', text: 'writing',
  copywriting: 'writing', storytelling: 'writing', guión: 'writing',
  guion: 'writing', script: 'writing',

  // research
  research: 'research', investigar: 'research', investigacion: 'research',
  investigación: 'research', análisis: 'research', analisis: 'research',
  analysis: 'research', study: 'research', estudio: 'research', survey: 'research',
  encuesta: 'research', market: 'research', mercado: 'research',
  competitor: 'research', competidor: 'research', benchmark: 'research',
  paper: 'research', source: 'research',
  fuente: 'research', explorar: 'research', explore: 'research',
  literatura: 'research', literature: 'research', referencia: 'research',

  // coordination
  coordination: 'coordination', coordinación: 'coordination',
  coordinacion: 'coordination', management: 'coordination', gestión: 'coordination',
  gestion: 'coordination', planning: 'coordination', planificación: 'coordination',
  planificacion: 'coordination', organize: 'coordination', organizar: 'coordination',
  lead: 'coordination', liderar: 'coordination', scrum: 'coordination',
  agile: 'coordination', ágil: 'coordination', agil: 'coordination',
  meeting: 'coordination', reunión: 'coordination', reunion: 'coordination',
  stakeholder: 'coordination', schedule: 'coordination', calendario: 'coordination',
  roadmap: 'coordination', priorizar: 'coordination', prioritize: 'coordination',

  // marketing
  marketing: 'marketing', seo: 'marketing', sem: 'marketing', social: 'marketing',
  media: 'marketing', campaign: 'marketing', campaña: 'marketing',
  campana: 'marketing', growth: 'marketing', crecimiento: 'marketing',
  acquisition: 'marketing', adquisición: 'marketing', adquisicion: 'marketing',
  funnel: 'marketing', embudo: 'marketing', ads: 'marketing', anuncios: 'marketing',
  contenido: 'marketing', email: 'marketing',
  newsletter: 'marketing', conversion: 'marketing', conversión: 'marketing',
  traffic: 'marketing', tráfico: 'marketing',
  trafico: 'marketing', engagement: 'marketing', brand: 'marketing',

  // finance
  finance: 'finance', finanzas: 'finance', budget: 'finance', presupuesto: 'finance',
  accounting: 'finance', contabilidad: 'finance', invoice: 'finance',
  factura: 'finance', payment: 'finance', pago: 'finance', tax: 'finance',
  impuesto: 'finance', revenue: 'finance', ingreso: 'finance', cost: 'finance',
  costo: 'finance', pricing: 'finance', precio: 'finance', financial: 'finance',
  financiero: 'finance', billing: 'finance', facturación: 'finance',
  facturacion: 'finance', stripe: 'finance', paddle: 'finance', transaction: 'finance',
  transacción: 'finance', transaccion: 'finance', wallet: 'finance',
  billetera: 'finance',
};

// ── Stop words (es + en) ──────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con',
  'por', 'para', 'que', 'es', 'son', 'the', 'a', 'an', 'and', 'or', 'but', 'in',
  'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been',
  'this', 'that', 'it', 'its', 'se', 'no', 'si', 'ya', 'lo', 'al', 'como', 'más',
  'muy', 'todo', 'todos', 'hay', 'tiene', 'tienen', 'ser', 'hacer', 'puede',
  'debe', 'deben', 'pueden', 'cada', 'entre', 'desde', 'hasta', 'sin', 'sobre',
  'también', 'tambien', 'porque', 'cuando', 'donde', 'all', 'can', 'will',
  'just', 'now', 'has', 'have', 'had', 'not', 'from', 'then', 'than', 'only',
  'also', 'into', 'more', 'some', 'such', 'other', 'these', 'those', 'each',
]);

// ── Keyword extraction ────────────────────────────────────────────────────────
// Extract meaningful words from title+description.

function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const tokens = text.split(/[^a-záéíóúüñ0-9]+/);
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const token of tokens) {
    const clean = token.trim();
    if (clean.length < 3) continue;
    if (STOP_WORDS.has(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    keywords.push(clean);
  }

  return keywords;
}

// ── Keyword → Category resolution ─────────────────────────────────────────────
// Maps extracted keywords to allowed categories. Returns a set of matched
// categories. If no keywords match any category, returns empty set.

function resolveCategories(keywords: string[]): string[] {
  const categories: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const category = KEYWORD_TO_CATEGORY[kw];
    if (category && ALLOWED_CATEGORIES.has(category) && !seen.has(category)) {
      seen.add(category);
      categories.push(category);
    }
  }

  return categories;
}

// ── Best-guess category fallback ──────────────────────────────────────────────
// When no keyword matches any category, pick the single best category based on
// broader heuristic: count keyword→category hits including partial matches.

function guessBestCategory(keywords: string[]): string | null {
  const scores: Record<string, number> = {};

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    // Direct match
    const direct = KEYWORD_TO_CATEGORY[kw];
    if (direct && ALLOWED_CATEGORIES.has(direct)) {
      scores[direct] = (scores[direct] || 0) + 2;
      continue;
    }
    // Partial match: keyword contains category name or vice versa
    const catArray = Array.from(ALLOWED_CATEGORIES);
    for (let j = 0; j < catArray.length; j++) {
      const cat = catArray[j];
      if (kw.includes(cat) || cat.includes(kw)) {
        scores[cat] = (scores[cat] || 0) + 1;
      }
    }
  }

  const entries = Object.entries(scores);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// ── Main: match task keywords → user skills, award XP ────────────────────────

export interface SkillMatchingResult {
  matchedCategories: string[];
  newSkillCreated: string | null;
  xpAwarded: number;
  skillsAfter: Record<string, number>;
  totalXpAfter: number;
}

/**
 * Match a verified task against the assignee's skills and award XP.
 *
 * @param userId   - The assignee (user) being awarded XP
 * @param title    - Task title
 * @param description - Task description
 * @param xpAmount - XP to award (default 10 if not specified on task)
 * @returns SkillMatchingResult with details of what was updated
 */
export async function matchAndAwardXp(
  userId: string,
  title: string,
  description: string,
  xpAmount: number = 10,
): Promise<SkillMatchingResult> {
  // 1. Extract keywords from title+description
  const keywords = extractKeywords(title, description);

  // 2. Map keywords to allowed categories (returns array for downlevel compat)
  const matchedCategories = resolveCategories(keywords);

  // 3. Load user's current skills
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { skills: true, totalXp: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  let currentSkills: Record<string, number> = {};
  if (user.skills) {
    try {
      currentSkills = JSON.parse(user.skills);
    } catch {
      currentSkills = {};
    }
  }

  // 4. Determine which categories to award
  const existingCategories = Object.keys(currentSkills);
  const existingSet = new Set(existingCategories);

  let newSkillCreated: string | null = null;

  if (matchedCategories.length === 0) {
    // No keyword → category mapping found. Try best-guess.
    const guessed = guessBestCategory(keywords);

    if (guessed) {
      if (existingSet.has(guessed)) {
        // User already has this skill → award XP
        matchedCategories.push(guessed);
      } else if (existingSet.size < 10) {
        // Create ONE new skill (max 10)
        currentSkills[guessed] = xpAmount;
        newSkillCreated = guessed;
        existingSet.add(guessed);
        matchedCategories.push(guessed);
      }
    }
  } else {
    // We have matched categories. Split into existing vs new.
    const matchedExisting: string[] = [];
    const matchedNew: string[] = [];

    for (let i = 0; i < matchedCategories.length; i++) {
      const cat = matchedCategories[i];
      if (existingSet.has(cat)) {
        matchedExisting.push(cat);
      } else {
        matchedNew.push(cat);
      }
    }

    // Award XP to existing matched skills
    for (let i = 0; i < matchedExisting.length; i++) {
      const cat = matchedExisting[i];
      currentSkills[cat] = (currentSkills[cat] || 0) + xpAmount;
    }

    // If user has NO matching existing skills, create ONE new skill (max 10)
    if (matchedExisting.length === 0 && matchedNew.length > 0 && existingSet.size < 10) {
      const firstNew = matchedNew[0];
      currentSkills[firstNew] = (currentSkills[firstNew] || 0) + xpAmount;
      newSkillCreated = firstNew;
    }
  }

  // 5. Update user's skills JSON only (totalXp is handled by the caller)
  const skillsJson = JSON.stringify(currentSkills);

  await prisma.user.update({
    where: { id: userId },
    data: { skills: skillsJson },
  });

  // Re-read totalXp for the response (it was already incremented by caller)
  const updatedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { totalXp: true },
  });

  console.log(
    `[skillMatching] User ${userId}: +${xpAmount} XP to skills. ` +
    `Matched: [${matchedCategories.join(', ') || 'none'}]. ` +
    `New skill: ${newSkillCreated || 'none'}. Skills: ${skillsJson}`,
  );

  return {
    matchedCategories,
    newSkillCreated,
    xpAwarded: xpAmount,
    skillsAfter: currentSkills,
    totalXpAfter: updatedUser?.totalXp ?? 0,
  };
}
