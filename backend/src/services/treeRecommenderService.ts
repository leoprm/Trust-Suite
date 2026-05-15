import { prisma } from '../index';

// ── Types ───────────────────────────────────────────────────────────────────

interface SuccessfulTreeResult {
  id: string;
  name: string;
  icono: string;
  description: string | null;
  totalBudget: number | null;
  memberCount: number;
  resolvedNeedCount: number;
  avgBalance: number;
  skillPricing: Array<{
    skillTag: string;
    ratePerHour: number;
    supplyCount: number;
    demandLevel: number;
  }>;
}

interface ScoredTree {
  tree: SuccessfulTreeResult;
  score: number;
}

export interface RoleRecommendation {
  skill: string;
  suggestedCount: number;
  suggestedRate: number;
  demand: 'HIGH' | 'MEDIUM';
}

export interface TreeStructureRecommendation {
  suggestedMembers: number;
  roles: RoleRecommendation[];
  suggestedBudget: number | null;
  basedOn: number;
  confidence: number;
}

// ── Stopwords en español para keyword extraction ────────────────────────────

const SPANISH_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en',
  'con', 'por', 'para', 'a', 'ante', 'bajo', 'cabe', 'contra', 'desde',
  'durante', 'entre', 'hacia', 'hasta', 'mediante', 'según', 'sin', 'sobre',
  'tras', 'y', 'e', 'o', 'u', 'ni', 'que', 'cual', 'cuales', 'quien',
  'quienes', 'cuyo', 'cuya', 'cuyos', 'cuyas', 'es', 'son', 'se', 'no',
  'su', 'sus', 'al', 'lo', 'le', 'les', 'me', 'te', 'nos', 'os', 'mi',
  'tu', 'más', 'como', 'pero', 'si', 'ya', 'muy', 'todo', 'todos', 'hay',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
]);

function extractKeywords(text: string): string[] {
  // Normalize: lowercase, strip accents, split on non-alpha
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9áéíóúüñ ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !SPANISH_STOPWORDS.has(w));

  // Deduplicate preserving order
  return [...new Set(normalized)];
}

// ── Paso 1: Find successful trees ───────────────────────────────────────────

async function findSuccessfulTrees(): Promise<SuccessfulTreeResult[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const candidates = await prisma.tree.findMany({
    where: {
      createdAt: { lt: sixMonthsAgo },
    },
    include: {
      _count: {
        select: { members: true },
      },
      members: {
        where: { status: 'ACTIVE' },
        include: {
          balance: { select: { availableBalance: true } },
        },
      },
      needs: {
        where: { status: 'SATISFIED' },
      },
      skillPricing: true,
    },
  });

  const successful: SuccessfulTreeResult[] = [];

  for (const tree of candidates) {
    // Filter: al menos 10 necesidades satisfechas
    if (tree.needs.length < 10) continue;

    // Filter: al menos 5 miembros activos
    if (tree.members.length < 5) continue;

    // Filter: MemberBalance promedio positivo
    const balances = tree.members
      .map(m => m.balance?.availableBalance ?? 0);
    const avgBalance = balances.length > 0
      ? balances.reduce((sum, b) => sum + b, 0) / balances.length
      : 0;
    if (avgBalance <= 0) continue;

    // Filter: baja rotación — si hay INACTIVE members, ratio < 30%
    const totalMembers = await prisma.treeMember.count({
      where: { treeId: tree.id },
    });
    const inactiveMembers = await prisma.treeMember.count({
      where: { treeId: tree.id, status: 'INACTIVE' },
    });
    const turnoverRatio = totalMembers > 0 ? inactiveMembers / totalMembers : 0;
    if (turnoverRatio > 0.3) continue;

    successful.push({
      id: tree.id,
      name: tree.name,
      icono: tree.icono,
      description: tree.description,
      totalBudget: tree.totalBudget,
      memberCount: tree.members.length,
      resolvedNeedCount: tree.needs.length,
      avgBalance,
      skillPricing: tree.skillPricing.map(sp => ({
        skillTag: sp.skillTag,
        ratePerHour: sp.ratePerHour,
        supplyCount: sp.supplyCount,
        demandLevel: sp.demandLevel,
      })),
    });
  }

  return successful;
}

// ── Paso 2: Find similar trees ─────────────────────────────────────────────

async function findSimilarTrees(
  description: string,
  successfulTrees: SuccessfulTreeResult[],
): Promise<ScoredTree[]> {
  const keywords = extractKeywords(description);

  if (keywords.length === 0) return [];

  const scored: ScoredTree[] = successfulTrees.map(tree => {
    const treeKeywords = extractKeywords(tree.description || '');
    const overlap = keywords.filter(k => treeKeywords.includes(k)).length;
    const score = overlap / Math.max(keywords.length, 1);
    return { tree, score };
  });

  // Top 3, score > 0.2
  return scored
    .filter(s => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ── Paso 3: Generate recommendation ─────────────────────────────────────────

function generateRecommendation(similarTrees: ScoredTree[]): TreeStructureRecommendation | null {
  if (similarTrees.length === 0) return null;

  // Average members
  const totalMembers = similarTrees.reduce((sum, s) => sum + s.tree.memberCount, 0);
  const avgMembers = Math.round(totalMembers / similarTrees.length);

  // Aggregate skills from SkillPricing
  interface SkillAggregate {
    count: number;
    totalRate: number;
    trees: number;
  }

  const skillFrequency: Record<string, SkillAggregate> = {};

  for (const { tree } of similarTrees) {
    for (const pricing of tree.skillPricing) {
      if (!skillFrequency[pricing.skillTag]) {
        skillFrequency[pricing.skillTag] = { count: 0, totalRate: 0, trees: 0 };
      }
      skillFrequency[pricing.skillTag].count += pricing.supplyCount;
      skillFrequency[pricing.skillTag].totalRate += pricing.ratePerHour;
      skillFrequency[pricing.skillTag].trees++;
    }
  }

  // Top 5 roles by demand
  const roles: RoleRecommendation[] = Object.entries(skillFrequency)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)
    .map(([skill, data]) => ({
      skill,
      suggestedCount: Math.max(1, Math.round(data.count / data.trees)),
      suggestedRate: Math.round(data.totalRate / data.trees),
      demand: data.count > avgMembers ? 'HIGH' : 'MEDIUM',
    }));

  // Average total budget (from totalBudget field)
  const budgets = similarTrees
    .map(s => s.tree.totalBudget)
    .filter((b): b is number => b != null);
  const suggestedBudget = budgets.length > 0
    ? Math.round(budgets.reduce((sum, b) => sum + b, 0) / budgets.length)
    : null;

  return {
    suggestedMembers: avgMembers,
    roles,
    suggestedBudget,
    basedOn: similarTrees.length,
    confidence: Math.min(100, similarTrees.length * 25),
  };
}

// ── Paso 4: Main entry point ────────────────────────────────────────────────

export async function suggestTreeStructure(
  description: string,
  objectives: string = '',
): Promise<{
  recommendation: TreeStructureRecommendation | null;
  similarTrees: Array<{
    name: string;
    icono: string;
    members: number;
    similarity: number;
  }>;
  fallback: boolean;
}> {
  const fullDescription = `${description || ''} ${objectives || ''}`.trim();
  if (!fullDescription) {
    return { recommendation: null, similarTrees: [], fallback: true };
  }

  const successful = await findSuccessfulTrees();
  const similar = await findSimilarTrees(fullDescription, successful);
  const recommendation = generateRecommendation(similar);

  return {
    recommendation,
    similarTrees: similar.map(s => ({
      name: s.tree.name,
      icono: s.tree.icono,
      members: s.tree.memberCount,
      similarity: Math.round(s.score * 100),
    })),
    fallback: recommendation === null,
  };
}

// ── Paso 5: Convenience — called during tree creation ───────────────────────

export async function generateRecommendationForNewTree(
  description: string,
): Promise<TreeStructureRecommendation | null> {
  const result = await suggestTreeStructure(description, '');
  return result.recommendation;
}
