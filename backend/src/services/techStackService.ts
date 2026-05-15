import { prisma } from '../index';
import {
  findSuccessfulTrees,
  findSimilarTrees,
  SuccessfulTreeResult,
  ScoredTree,
} from './treeRecommenderService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TechStackSolution {
  name: string;
  category: string;
  description: string;
  repoUrl?: string;
  websiteUrl?: string;
}

export interface TechStackRecommendation {
  item: {
    name: string;
    category: string;
    description: string;
    repoUrl: string | null;
    websiteUrl: string | null;
  };
  count: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  agricultura: ['farm', 'cultivo', 'siembra', 'agro', 'riego', 'cosecha', 'campo'],
  ecommerce: ['shop', 'cart', 'payment', 'venta', 'tienda', 'checkout', 'woo'],
  crm: ['customer', 'client', 'lead', 'contact', 'erp', 'odoo'],
  contabilidad: ['accounting', 'invoice', 'billing', 'contabilidad', 'factura'],
  comunicacion: ['chat', 'message', 'email', 'sms', 'notificación', 'telegram'],
  gestion: ['project', 'task', 'board', 'kanban', 'tareas', 'gestión'],
  educacion: ['lms', 'course', 'learn', 'curso', 'educación', 'enseñar'],
  salud: ['health', 'clinic', 'patient', 'salud', 'médico', 'paciente'],
  devops: ['deploy', 'ci/cd', 'docker', 'server', 'hosting', 'infra'],
  analitica: ['analytics', 'dashboard', 'report', 'métrica', 'datos'],
};

function detectTags(solution: TechStackSolution): string[] {
  const tags: string[] = [];
  const haystack = [
    solution.name,
    solution.category,
    solution.description,
    solution.repoUrl || '',
    solution.websiteUrl || '',
  ].join(' ').toLowerCase();

  // Detect open-source
  if (/open.?source|github\.com|gitlab\.com|free software/i.test(haystack)) {
    tags.push('open-source');
  }

  // Detect self-hosted
  if (/self.?host|on.?premise|docker|desplegar propio/i.test(haystack)) {
    tags.push('self-hosted');
  }

  // Detect SaaS
  if (/saas|cloud|api|\.com|suscrib/i.test(haystack) && !tags.includes('self-hosted')) {
    tags.push('saas');
  }

  // Category-based tags
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (solution.category === category || keywords.some(k => haystack.includes(k))) {
      if (!tags.includes(category)) tags.push(category);
    }
  }

  // Language/framework detection
  const langHints: Record<string, RegExp> = {
    php: /php|laravel|wordpress/i,
    python: /python|django|flask/i,
    javascript: /javascript|node\.js|react|vue/i,
    ruby: /ruby|rails/i,
    java: /\bjava\b|spring/i,
    rust: /\brust\b/i,
  };
  for (const [lang, regex] of Object.entries(langHints)) {
    if (regex.test(haystack)) tags.push(lang);
  }

  return tags;
}

// ── Register a solution in the tree's tech stack ─────────────────────────────

export async function addToTechStack(
  treeId: string,
  needId: string,
  solution: TechStackSolution,
): Promise<{ id: string; name: string }> {
  const tags = detectTags(solution);

  // 1. Find or create TechStackItem
  let item = await (prisma as any).techStackItem.findFirst({
    where: {
      OR: [
        solution.repoUrl ? { repoUrl: solution.repoUrl } : {},
        { name: solution.name },
      ].filter((c: any) => Object.keys(c).length > 0),
    },
  });

  if (!item) {
    item = await (prisma as any).techStackItem.create({
      data: {
        name: solution.name,
        category: solution.category,
        description: solution.description,
        repoUrl: solution.repoUrl || null,
        websiteUrl: solution.websiteUrl || null,
        tags: JSON.stringify(tags),
        addedBy: needId,
      },
    });
  }

  // 2. Link to tree (upsert — may have been removed and re-added)
  await (prisma as any).treeTechStack.upsert({
    where: {
      treeId_stackItemId: { treeId, stackItemId: item.id },
    },
    create: {
      treeId,
      stackItemId: item.id,
      installedBy: 'system',
    },
    update: {
      status: 'active',
    },
  });

  console.log(
    `[techStack] Added "${solution.name}" (${solution.category}) to tree ${treeId}`,
  );

  return { id: item.id, name: item.name };
}

// ── Recommend tech stack based on similar trees ──────────────────────────────

export async function recommendTechStack(
  treeDescription: string,
): Promise<TechStackRecommendation[]> {
  // 1. Find similar trees (reuse T23)
  const successful = await findSuccessfulTrees();
  if (successful.length === 0) return [];

  const similar = await findSimilarTrees(treeDescription, successful);
  if (similar.length === 0) return [];

  // 2. Collect their tech stacks
  const stackFrequency: Record<string, { item: any; count: number }> = {};

  for (const { tree } of similar) {
    const stacks = await (prisma as any).treeTechStack.findMany({
      where: { treeId: tree.id, status: 'active' },
      include: { stackItem: true },
    });

    for (const stack of stacks) {
      const key = stack.stackItem.name;
      if (!stackFrequency[key]) {
        stackFrequency[key] = {
          item: stack.stackItem,
          count: 0,
        };
      }
      stackFrequency[key].count++;
    }
  }

  // 3. Sort by frequency (more trees use it = higher recommendation)
  const ranked = Object.entries(stackFrequency)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 8)
    .map(([, { item, count }]) => ({
      item: {
        name: item.name,
        category: item.category,
        description: item.description,
        repoUrl: item.repoUrl,
        websiteUrl: item.websiteUrl,
      },
      count,
    }));

  return ranked;
}

// ── Format recommendation for display ────────────────────────────────────────

export function formatTechStackRecommendation(
  ranked: TechStackRecommendation[],
  similarCount: number,
): string {
  if (ranked.length === 0) return '';

  const lines = [
    '🛠️ **Stack tecnológico recomendado**',
    '',
    `Basado en ${similarCount} árboles similares al tuyo:`,
    '',
    ...ranked.map(({ item, count }, i) => {
      const stars = count >= 3 ? '⭐⭐⭐' : count >= 2 ? '⭐⭐' : '⭐';
      return `${i + 1}. **${item.name}** ${stars} (${count} árboles lo usan)`;
    }),
    '',
    '¿Quieres que instale alguno? Responde con el número.',
  ];

  return lines.join('\n');
}

// ── Get tech stack for a specific tree, grouped by category ──────────────────

export async function getTreeTechStack(treeId: string): Promise<{
  treeId: string;
  stackByCategory: Record<string, any[]>;
  totalTools: number;
}> {
  const stacks = await (prisma as any).treeTechStack.findMany({
    where: { treeId },
    include: { stackItem: true },
    orderBy: { installedAt: 'desc' },
  });

  const byCategory: Record<string, any[]> = {};
  for (const stack of stacks) {
    const cat = stack.stackItem.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      id: stack.stackItem.id,
      name: stack.stackItem.name,
      description: stack.stackItem.description,
      repoUrl: stack.stackItem.repoUrl,
      websiteUrl: stack.stackItem.websiteUrl,
      tags: stack.stackItem.tags ? JSON.parse(stack.stackItem.tags) : [],
      status: stack.status,
      installedAt: stack.installedAt,
    });
  }

  return {
    treeId,
    stackByCategory: byCategory,
    totalTools: stacks.length,
  };
}
