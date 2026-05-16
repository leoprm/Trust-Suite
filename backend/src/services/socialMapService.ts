/**
 * socialMapService.ts — Social map analysis engine for Trust Maker.
 *
 * Analyzes contribution patterns of human members within a tree:
 *  - Topics from needs proposed
 *  - Voting behavior (early/late/consistent)
 *  - Task completion rate
 *  - Chat activity patterns
 *
 * Produces a MemberSocialProfile for each active member, which is then
 * injected into /api/concierge/context so Ari (TrustMakerBot) can reference
 * real member patterns instead of hallucinating.
 */

import { prisma } from '../index';

// ── Types ────────────────────────────────────────────────────────────────

export interface VotingPatterns {
  totalVotes: number;
  avgVoteWeight: number;
  /** True if user tends to vote early (within first 24h of idea creation) */
  earlyVoter: boolean;
  /** True if user tends to vote late (after 7+ days) */
  lateVoter: boolean;
  /** True if vote count is high relative to tree average */
  consistentVoter: boolean;
}

export interface ChatActivity {
  messageCount: number;
  lastActiveAt: string | null;
  /** Top keywords extracted from user's messages */
  commonTopics: string[];
}

export interface SocialProfile {
  userId: string;
  username: string;
  proposedNeedTopics: string[];
  votingPatterns: VotingPatterns;
  taskCompletionRate: number;
  chatActivity: ChatActivity;
  contributionSummary: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Spanish stopwords + Trust Maker specific noise words */
const STOPWORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por',
  'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero',
  'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando',
  'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien',
  'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros',
  'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mí', 'antes', 'algunos',
  'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos',
  'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar',
  'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú', 'te', 'ti',
  'tu', 'tus', 'ellas', 'nosotras', 'vosotros', 'vosotras', 'os', 'mío',
  'mía', 'míos', 'mías', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya',
  'suyos', 'suyas', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro',
  'vuestra', 'vuestros', 'vuestras', 'esos', 'esas', 'estoy', 'estás',
  'está', 'estamos', 'estáis', 'están', 'esté', 'estés', 'estemos', 'estéis',
  'estén', 'estaré', 'estarás', 'estará', 'estaremos', 'estaréis', 'estarán',
  'estaría', 'estarías', 'estaríamos', 'estaríais', 'estarían', 'estaba',
  'estabas', 'estábamos', 'estabais', 'estaban', 'fui', 'fuiste', 'fue',
  'fuimos', 'fuisteis', 'fueron', 'fuera', 'fueras', 'fuéramos', 'fuerais',
  'fueran', 'ser', 'soy', 'eres', 'es', 'somos', 'sois', 'son', 'sea',
  'seas', 'seamos', 'seáis', 'sean', 'seré', 'serás', 'será', 'seremos',
  'seréis', 'serán', 'sería', 'serías', 'seríamos', 'seríais', 'serían',
  'he', 'has', 'ha', 'hemos', 'habéis', 'han', 'había', 'habías', 'habíamos',
  'habíais', 'habían', 'hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis',
  'hubieron', 'tener', 'tengo', 'tienes', 'tiene', 'tenemos', 'tenéis',
  'tienen', 'tenía', 'tenías', 'teníamos', 'teníais', 'tenían', 'tuve',
  'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron', 'hacer', 'hago',
  'haces', 'hace', 'hacemos', 'hacéis', 'hacen', 'hacía', 'hacías',
  'hacíamos', 'hacíais', 'hacían', 'haré', 'harás', 'hará', 'haremos',
  'haréis', 'harán', 'necesito', 'necesitamos', 'necesita', 'necesitan',
  'quiero', 'queremos', 'quiere', 'quieren', 'busco', 'buscamos', 'busca',
  'buscan', 'idea', 'ideas', 'propuesta', 'propuestas',
]);

/** Skill/topic keywords to detect in need titles */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  'frontend': ['frontend', 'front', 'ui', 'ux', 'interfaz', 'react', 'vue', 'angular', 'css', 'html', 'diseño', 'design', 'web', 'landing', 'página', 'pagina'],
  'backend': ['backend', 'back', 'api', 'server', 'servidor', 'endpoint', 'rest', 'graphql', 'prisma', 'express', 'node', 'base de datos', 'database', 'db'],
  'mobile': ['mobile', 'móvil', 'movil', 'app', 'android', 'ios', 'flutter', 'react native'],
  'devops': ['deploy', 'deployment', 'servidor', 'server', 'docker', 'kubernetes', 'k8s', 'ci/cd', 'cloud', 'aws', 'infra'],
  'data': ['data', 'datos', 'análisis', 'analisis', 'analytics', 'estadística', 'estadistica', 'sql', 'python', 'machine learning', 'ml', 'ai'],
  'contenido': ['contenido', 'content', 'copy', 'redacción', 'redaccion', 'texto', 'blog', 'post', 'artículo', 'articulo'],
  'marketing': ['marketing', 'seo', 'ads', 'publicidad', 'redes', 'social media', 'growth', 'campaña', 'campaña'],
  'comunidad': ['comunidad', 'community', 'evento', 'event', 'organizar', 'coordinación', 'coordinacion'],
};

// ── Topic Extraction ──────────────────────────────────────────────────────

function extractTopics(titles: string[]): string[] {
  const topicScores: Record<string, number> = {};
  const allWords = titles.join(' ').toLowerCase();

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (allWords.includes(kw)) {
        topicScores[topic] = (topicScores[topic] || 0) + 1;
      }
    }
  }

  return Object.entries(topicScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([topic]) => topic);
}

function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  const words = text.toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));

  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([w]) => w);
}

// ── Voting Pattern Analysis ───────────────────────────────────────────────

async function analyzeVotingPatterns(
  userId: string,
  treeId: string,
): Promise<VotingPatterns> {
  const votes = await (prisma as any).ideaVote.findMany({
    where: {
      userId,
      idea: { need: { treeId } },
    },
    include: {
      idea: { select: { createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const totalVotes = votes.length;
  const avgVoteWeight = totalVotes > 0
    ? votes.reduce((sum: number, v: any) => sum + (v.weight || 1), 0) / totalVotes
    : 0;

  // Voting timing analysis
  let earlyCount = 0;
  let lateCount = 0;

  for (const vote of votes) {
    const ideaCreatedAt = new Date(vote.idea.createdAt).getTime();
    const voteCreatedAt = new Date(vote.createdAt).getTime();
    const hoursDiff = (voteCreatedAt - ideaCreatedAt) / (1000 * 60 * 60);

    if (hoursDiff <= 24) earlyCount++;
    if (hoursDiff >= 168) lateCount++; // 7 days
  }

  // Get tree average for consistency check
  const treeVoteStats = await (prisma as any).ideaVote.groupBy({
    by: ['userId'],
    where: {
      idea: { need: { treeId } },
    },
    _count: { id: true },
  });

  const avgTreeVotes = treeVoteStats.length > 0
    ? treeVoteStats.reduce((sum: number, s: any) => sum + s._count.id, 0) / treeVoteStats.length
    : 0;

  const earlyThreshold = totalVotes > 5 ? 0.4 : 0.3;
  const lateThreshold = totalVotes > 5 ? 0.4 : 0.5;

  return {
    totalVotes,
    avgVoteWeight: Math.round(avgVoteWeight * 100) / 100,
    earlyVoter: totalVotes >= 3 && earlyCount / totalVotes >= earlyThreshold,
    lateVoter: totalVotes >= 3 && lateCount / totalVotes >= lateThreshold,
    consistentVoter: totalVotes >= avgTreeVotes * 0.8 && totalVotes >= 3,
  };
}

// ── Task Completion Analysis ──────────────────────────────────────────────

async function analyzeTaskCompletion(
  userId: string,
  treeId: string,
): Promise<number> {
  const tasks = await (prisma as any).task.findMany({
    where: {
      treeId,
      assigneeId: userId,
    },
    select: { status: true },
  });

  if (tasks.length === 0) return 0;

  const completed = tasks.filter(
    (t: any) => t.status === 'VERIFIED' || t.status === 'PAID',
  ).length;

  return Math.round((completed / tasks.length) * 100) / 100;
}

// ── Chat Activity Analysis ────────────────────────────────────────────────

async function analyzeChatActivity(
  userId: string,
  treeId: string,
): Promise<ChatActivity> {
  const messages = await (prisma as any).chatMessage.findMany({
    where: { userId, treeId, role: 'user' },
    select: { content: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const allContent = messages.map((m: any) => m.content).join(' ');
  const commonTopics = extractKeywords(allContent, 5);

  return {
    messageCount: messages.length,
    lastActiveAt: messages[0]?.createdAt?.toISOString() ?? null,
    commonTopics,
  };
}

// ── Contribution Summary Generator ────────────────────────────────────────

function generateSummary(
  username: string,
  proposedNeedTopics: string[],
  votingPatterns: VotingPatterns,
  taskCompletionRate: number,
  chatActivity: ChatActivity,
): string {
  const parts: string[] = [];

  // Topic specialization
  if (proposedNeedTopics.length > 0) {
    const topics = proposedNeedTopics.slice(0, 2).join(' y ');
    parts.push(`${username} suele proponer necesidades de ${topics}`);
  } else {
    parts.push(`${username} aún no ha propuesto necesidades`);
  }

  // Voting style
  if (votingPatterns.totalVotes >= 3) {
    if (votingPatterns.earlyVoter && votingPatterns.consistentVoter) {
      parts.push('vota rápido y con frecuencia');
    } else if (votingPatterns.earlyVoter) {
      parts.push('tiende a votar temprano');
    } else if (votingPatterns.lateVoter) {
      parts.push('vota tarde pero con criterio');
    } else if (votingPatterns.consistentVoter) {
      parts.push('es un votante consistente');
    }
  }

  // Task completion
  if (taskCompletionRate > 0) {
    const pct = Math.round(taskCompletionRate * 100);
    if (pct >= 80) {
      parts.push(`completa el ${pct}% de sus tareas asignadas`);
    } else if (pct >= 50) {
      parts.push(`ha completado el ${pct}% de sus tareas`);
    }
  }

  // Chat activity
  if (chatActivity.messageCount > 5) {
    parts.push(`participa activamente en el chat del árbol`);
  }

  return parts.join(', ') + '.';
}

// ── Main Analysis Function ────────────────────────────────────────────────

/**
 * Analyzes all active members of a tree and rebuilds their
 * MemberSocialProfile records. Safe to call repeatedly — uses upsert.
 */
export async function analyzeTreeSocialMap(treeId: string): Promise<SocialProfile[]> {
  const members = await prisma.treeMember.findMany({
    where: { treeId, status: 'ACTIVE' },
    include: {
      user: { select: { id: true, username: true } },
    },
  });

  const profiles: SocialProfile[] = [];

  for (const member of members) {
    const userId = member.userId;
    const username = member.user?.username || '(anónimo)';

    // ── Gather contribution data ──────────────────────────────────────
    const needs = await prisma.need.findMany({
      where: { treeId, creatorId: userId },
      select: { title: true },
      take: 50,
    });

    const proposedNeedTopics = extractTopics(needs.map(n => n.title));
    const votingPatterns = await analyzeVotingPatterns(userId, treeId);
    const taskCompletionRate = await analyzeTaskCompletion(userId, treeId);
    const chatActivity = await analyzeChatActivity(userId, treeId);

    const contributionSummary = generateSummary(
      username,
      proposedNeedTopics,
      votingPatterns,
      taskCompletionRate,
      chatActivity,
    );

    // ── Persist ───────────────────────────────────────────────────────
    await (prisma as any).memberSocialProfile.upsert({
      where: { userId_treeId: { userId, treeId } },
      create: {
        userId,
        treeId,
        proposedNeedTopics,
        votingPatterns,
        taskCompletionRate,
        chatActivity,
        contributionSummary,
        lastAnalyzedAt: new Date(),
      },
      update: {
        proposedNeedTopics,
        votingPatterns,
        taskCompletionRate,
        chatActivity,
        contributionSummary,
        lastAnalyzedAt: new Date(),
      },
    });

    profiles.push({
      userId,
      username,
      proposedNeedTopics,
      votingPatterns,
      taskCompletionRate,
      chatActivity,
      contributionSummary,
    });
  }

  return profiles;
}

/**
 * Fetches cached social profiles for a tree.
 * Faster than analyzeTreeSocialMap — returns last computed state.
 */
export async function getTreeSocialProfiles(treeId: string): Promise<SocialProfile[]> {
  const profiles = await (prisma as any).memberSocialProfile.findMany({
    where: { treeId },
    include: {
      user: { select: { username: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return profiles.map((p: any) => ({
    userId: p.userId,
    username: p.user?.username || '(anónimo)',
    proposedNeedTopics: p.proposedNeedTopics || [],
    votingPatterns: p.votingPatterns || {},
    taskCompletionRate: p.taskCompletionRate || 0,
    chatActivity: p.chatActivity || { messageCount: 0, lastActiveAt: null, commonTopics: [] },
    contributionSummary: p.contributionSummary || '',
  }));
}

/**
 * Returns a compact text summary of the social map suitable for
 * injecting into Ari's system prompt context.
 */
export function formatSocialMapContext(profiles: SocialProfile[]): string {
  if (profiles.length === 0) return '';

  const lines: string[] = [
    '',
    '## Social Map — Patrones de contribución del equipo',
    '',
  ];

  for (const p of profiles) {
    lines.push(`- **${p.username}**: ${p.contributionSummary}`);
    if (p.proposedNeedTopics.length > 0) {
      lines.push(`  Temas: ${p.proposedNeedTopics.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('Usa estos patrones para personalizar tus respuestas. Si alguien pregunta "¿quién sabe de frontend?", puedes mencionar a los miembros con ese patrón.');

  return lines.join('\n');
}
