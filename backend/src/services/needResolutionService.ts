import { prisma } from '../index';
import { extractKeywords } from './treeRecommenderService';

// ── Types ───────────────────────────────────────────────────────────────────

type ResolutionStep = 'SIMPLE' | 'GITHUB_SEARCH' | 'GITHUB_INSTALL' | 'CUSTOM_BUILD' | 'PUBLISHED';

interface ResolutionAttempt {
  step: ResolutionStep;
  success: boolean;
  details: string;
  repoUrl?: string;
  startedAt: Date;
  completedAt?: Date;
}

interface NeedData {
  id: string;
  treeId: string | null;
  creatorId: string;
  title: string;
  description: string;
  importance: number | null;
  status: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function estimateComplexity(need: NeedData): string {
  // Simple heuristic: based on importance and description length
  if (need.importance && need.importance >= 8) return 'compleja';
  if (need.description && need.description.length > 500) return 'media';
  return 'simple';
}

async function markResolved(
  needId: string,
  treeId: string,
  attempt: ResolutionAttempt,
): Promise<void> {
  await prisma.need.update({
    where: { id: needId },
    data: { status: 'SATISFIED' },
  });

  // Register in SolutionCatalog
  const levelMap: Record<ResolutionStep, number> = {
    SIMPLE: 1,
    GITHUB_SEARCH: 2,
    GITHUB_INSTALL: 2,
    CUSTOM_BUILD: 3,
    PUBLISHED: 3,
  };

  const need = await prisma.need.findUnique({ where: { id: needId } });
  if (!need) return;

  await prisma.solutionCatalog.create({
    data: {
      needId,
      treeId,
      title: need.title,
      description: attempt.details,
      resolutionLevel: levelMap[attempt.step],
      repoUrl: attempt.repoUrl || null,
      keywords: JSON.stringify(
        extractKeywords(need.title + ' ' + need.description),
      ),
    },
  });
}

// ── Nivel 1: Solución simple ────────────────────────────────────────────────

async function trySimpleSolution(need: NeedData): Promise<ResolutionAttempt> {
  const attempt: ResolutionAttempt = {
    step: 'SIMPLE',
    success: false,
    details: '',
    startedAt: new Date(),
  };

  try {
    const response = await fetch('http://127.0.0.1:8642/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.HERMES_API_SERVER_KEY || ''}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `Eres un solucionador de necesidades para Trust Maker.
        
La necesidad es: "${need.title} — ${need.description}"

Determina si se puede resolver SIN código:
- Cambio de proceso o workflow
- Herramienta existente que ya tienen
- Comunicación o coordinación
- Reconfiguración de algo existente

Responde en JSON:
{
  "canResolve": true/false,
  "solution": "descripción de la solución simple",
  "steps": ["paso 1", "paso 2"]
}`,
          },
        ],
        stream: false,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '{"canResolve":false}';

    // Extract JSON from potential markdown wrapping
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { canResolve: false };

    attempt.success = result.canResolve === true;
    attempt.details = result.solution || 'No simple solution found';
  } catch (err: any) {
    attempt.details = `Hermes API error: ${err.message}`;
  }

  attempt.completedAt = new Date();
  return attempt;
}

// ── Nivel 2: Buscar en GitHub ───────────────────────────────────────────────

async function searchGitHubForSolution(need: NeedData): Promise<ResolutionAttempt> {
  const attempt: ResolutionAttempt = {
    step: 'GITHUB_SEARCH',
    success: false,
    details: '',
    startedAt: new Date(),
  };

  try {
    const keywords = extractKeywords(need.title + ' ' + need.description);
    const query = keywords.slice(0, 5).join('+');

    if (!query) {
      attempt.details = 'No searchable keywords extracted';
      attempt.completedAt = new Date();
      return attempt;
    }

    const ghResponse = await fetch(
      `https://api.github.com/search/repositories?q=${query}+in:name,description&sort=stars&per_page=5`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TrustMaker/1.0',
          ...(process.env.GITHUB_TOKEN
            ? { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
      },
    );

    const ghData = await ghResponse.json();

    if (ghData.items?.length > 0) {
      const best = ghData.items[0];
      attempt.success = best.stargazers_count > 10;
      attempt.repoUrl = best.html_url;
      attempt.details = `Found: ${best.full_name} (${best.stargazers_count}⭐) — ${best.description}`;
    } else {
      attempt.details = 'No suitable open source project found';
    }
  } catch (err: any) {
    attempt.details = `GitHub search error: ${err.message}`;
  }

  attempt.completedAt = new Date();
  return attempt;
}

// ── Nivel 2.5: Instalar solución de GitHub ──────────────────────────────────

async function installGitHubSolution(
  _need: NeedData,
  repoUrl: string,
): Promise<ResolutionAttempt> {
  const attempt: ResolutionAttempt = {
    step: 'GITHUB_INSTALL',
    success: true,
    details: `GitHub solution identified: ${repoUrl}. Manual integration required.`,
    repoUrl,
    startedAt: new Date(),
    completedAt: new Date(),
  };

  return attempt;
}

// ── Nivel 3: Desarrollar custom ─────────────────────────────────────────────

async function buildCustomSolution(need: NeedData): Promise<ResolutionAttempt> {
  const attempt: ResolutionAttempt = {
    step: 'CUSTOM_BUILD',
    success: false,
    details: '',
    startedAt: new Date(),
  };

  try {
    if (!need.treeId) {
      attempt.details = 'Need has no treeId — cannot create task';
      attempt.completedAt = new Date();
      return attempt;
    }

    const task = await prisma.task.create({
      data: {
        treeId: need.treeId,
        needId: need.id,
        title: `Resolver: ${need.title}`,
        description: need.description,
        status: 'PENDING',
        budget: 0,
        complexity: estimateComplexity(need),
        creatorId: need.creatorId,
      },
    });

    attempt.success = true;
    attempt.details = `Task created: ${task.id}. Solution will be published to GitHub.`;
  } catch (err: any) {
    attempt.details = `Task creation error: ${err.message}`;
  }

  attempt.completedAt = new Date();
  return attempt;
}

// ── Nivel 3.5: Publicar en GitHub ───────────────────────────────────────────

async function publishToGitHub(
  need: NeedData,
  buildAttempt: ResolutionAttempt,
): Promise<ResolutionAttempt> {
  const attempt: ResolutionAttempt = {
    step: 'PUBLISHED',
    success: false,
    details: '',
    startedAt: new Date(),
  };

  if (!process.env.GITHUB_TOKEN) {
    attempt.details = 'No GITHUB_TOKEN configured. Skipping publish.';
    attempt.completedAt = new Date();
    return attempt;
  }

  try {
    const repoName = `trust-${need.id.slice(0, 8)}`;

    const createResponse = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TrustMaker/1.0',
      },
      body: JSON.stringify({
        name: repoName,
        description: `Solution for: ${need.title} — generated by Trust Maker`,
        private: false,
        auto_init: true,
      }),
    });

    if (createResponse.ok) {
      const repo = await createResponse.json();
      attempt.success = true;
      attempt.repoUrl = repo.html_url;
      attempt.details = `Published to ${repo.full_name}`;
    } else {
      const errData = await createResponse.json().catch(() => ({}));
      attempt.details = `GitHub publish failed: ${createResponse.status} ${errData.message || ''}`;
    }
  } catch (err: any) {
    attempt.details = `Publish error: ${err.message}`;
  }

  attempt.completedAt = new Date();
  return attempt;
}

// ── Orquestador principal ───────────────────────────────────────────────────

export async function resolveNeed(needId: string): Promise<{
  resolved: boolean;
  attempts: ResolutionAttempt[];
  finalRepoUrl?: string;
}> {
  const attempts: ResolutionAttempt[] = [];

  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { tree: true },
  });
  if (!need) throw new Error('Need not found');

  const needData: NeedData = {
    id: need.id,
    treeId: need.treeId,
    creatorId: need.creatorId,
    title: need.title,
    description: need.description,
    importance: need.importance,
    status: need.status,
  };

  // ── Nivel 1: Solución simple ──────────────────────────────────────────────
  const simpleAttempt = await trySimpleSolution(needData);
  attempts.push(simpleAttempt);
  if (simpleAttempt.success) {
    await markResolved(needId, need.treeId || 'unknown', simpleAttempt);
    return { resolved: true, attempts };
  }

  // ── Nivel 2: Buscar en GitHub ─────────────────────────────────────────────
  const githubAttempt = await searchGitHubForSolution(needData);
  attempts.push(githubAttempt);

  if (githubAttempt.success && githubAttempt.repoUrl) {
    const installAttempt = await installGitHubSolution(needData, githubAttempt.repoUrl);
    attempts.push(installAttempt);

    if (installAttempt.success) {
      await markResolved(needId, need.treeId || 'unknown', installAttempt);
      return { resolved: true, attempts, finalRepoUrl: githubAttempt.repoUrl };
    }
  }

  // ── Nivel 3: Desarrollar custom ───────────────────────────────────────────
  const buildAttempt = await buildCustomSolution(needData);
  attempts.push(buildAttempt);

  if (buildAttempt.success) {
    const publishAttempt = await publishToGitHub(needData, buildAttempt);
    attempts.push(publishAttempt);
    await markResolved(needId, need.treeId || 'unknown', publishAttempt);
    return { resolved: true, attempts, finalRepoUrl: publishAttempt.repoUrl };
  }

  // No se pudo resolver — registrar intentos en la descripción
  const attemptsSummary = attempts
    .map(a => `[${a.step}] ${a.success ? '✓' : '✗'} ${a.details}`)
    .join('\n');

  await prisma.need.update({
    where: { id: needId },
    data: {
      status: 'OPEN',
      description: `${need.description}\n\n── Resolution attempts ──\n${attemptsSummary}`,
    },
  });

  return { resolved: false, attempts };
}
