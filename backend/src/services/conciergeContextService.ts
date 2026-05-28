import { prisma } from '../index';
import fs from 'fs';
import path from 'path';

const TREES_BASE = process.env.SANDBOX_BASE_DIR || '/home/leo/trees';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SnapshotMember {
  id: string;
  username: string;
  skills: Record<string, number> | null;
  xp: number;
  level: number;
  joinedAt: string;
  status: string;
}

export interface SnapshotNeed {
  id: string;
  title: string;
  description: string;
  status: string;
  importance: number | null;
  dailyVotes: number;
  ideaCount: number;
  createdAt: string;
}

export interface SnapshotTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  budget: number;
  assigneeUsername: string | null;
  creatorUsername: string;
  skills: string[] | null;
  createdAt: string;
}

export interface TimelineEvent {
  type: string;
  description: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface SnapshotRating {
  agentName: string;
  role: string;
  stars: number;
  createdAt: string;
}

export interface TreeSnapshot {
  tree: {
    id: string;
    name: string;
    icono: string;
    description: string | null;
    objectives: string | null;
    admissionPolicy: string;
    memberCount: number;
    openNeedCount: number;
    totalTaskCount: number;
    createdAt: string;
  };
  members: SnapshotMember[];
  needs: SnapshotNeed[];
  tasks: SnapshotTask[];
  timeline: {
    last48h: TimelineEvent[];
    summary: {
      period: string; // "30d"
      totalEvents: number;
      needsCreated: number;
      tasksCreated: number;
      tasksCompleted: number;
      membersJoined: number;
      ideasSubmitted: number;
      votesCast: number;
    };
  };
  ratings: SnapshotRating[];
  costs: {
    totalBudget: number | null;
    paymentMode: string;
    skillRates: { skillTag: string; ratePerHour: number; demandLevel: number }[];
  };
  generatedAt: string;
}

// ── Delta types ────────────────────────────────────────────────────────────────

export interface ProviderRating {
  provider: string;
  avgStars: number;
  totalRatings: number;
  treeCount: number;
}

export interface TokenCost {
  provider: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface FinancialHealth {
  balance: number;
  marginMonths: number;
  delinquencyPct: number;
}

export interface CrossTreeBenchmark {
  metric: string;
  value: number;
  unit: string;
  percentile: number; // 0-100
}

export interface ResourceConsumption {
  tokensToday: number;
  tokensThisWeek: number;
  tokensThisMonth: number;
  budgetTokensPerMonth: number | null;
  sandboxUsagePct: number; // % de sandboxes en uso
}

export interface AgentAvailability {
  totalAgents: number;
  online: number;
  avgResponseTimeMs: number | null;
  loadDistribution: Record<string, number>; // provider -> active tasks
}

export interface ExternalAlert {
  type: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  detectedAt: string;
}

export interface TreeDelta {
  treeId: string;
  providerRatings: ProviderRating[];
  tokenCosts: TokenCost[];
  maintenance: {
    salaries: number;
    infrastructure: number;
    fixed: number;
    growthMarginPct: number;
    totalFixed: number;
  };
  financialHealth: FinancialHealth;
  crossTreeBenchmarks: CrossTreeBenchmark[];
  resourceConsumption: ResourceConsumption;
  agentAvailability: AgentAvailability;
  alerts: ExternalAlert[];
  generatedAt: string;
}

// ── Snapshot builder ───────────────────────────────────────────────────────────

export async function buildSnapshot(treeId: string): Promise<TreeSnapshot | null> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    include: {
      _count: { select: { members: true, needs: true, tasks: true } },
    },
  });
  if (!tree) return null;

  const [
    members,
    needs,
    tasks,
    recentEvents,
    thirtyDayStats,
    ratings,
    skillRates,
  ] = await Promise.all([
    // ── Members ────────────────────────────────────────────────────────────
    prisma.treeMember.findMany({
      where: { treeId, status: 'ACTIVE' },
      include: {
        user: { select: { username: true, skills: true } },
      },
      orderBy: { xp: 'desc' },
      take: 50,
    }),

    // ── Needs (open + recent) ──────────────────────────────────────────────
    prisma.need.findMany({
      where: { treeId, status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL'] } },
      include: {
        _count: { select: { ideas: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // ── Tasks (pending + assigned) ─────────────────────────────────────────
    prisma.task.findMany({
      where: { treeId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } },
      include: {
        assignee: { select: { username: true } },
        creator: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // ── Timeline: last 48h (detailed) ──────────────────────────────────────
    (async () => {
      const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const events = await prisma.eventLog.findMany({
        where: { treeId, createdAt: { gte: since48h } },
        select: {
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          metadataJson: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return events.map((e: any) => ({
        type: e.action as string,
        description: describeEvent(e),
        entityType: e.entityType as string,
        entityId: e.entityId as string | null,
        createdAt: e.createdAt.toISOString(),
      }));
    })(),

    // ── Timeline: 30-day summary ───────────────────────────────────────────
    (async () => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [totalEvents, needsCreated, tasksCreated, tasksCompleted, membersJoined, ideasSubmitted, votesCast] =
        await Promise.all([
          prisma.eventLog.count({ where: { treeId, createdAt: { gte: since30d } } }),
          prisma.need.count({ where: { treeId, createdAt: { gte: since30d } } }),
          prisma.task.count({ where: { treeId, createdAt: { gte: since30d } } }),
          prisma.task.count({ where: { treeId, status: 'VERIFIED', updatedAt: { gte: since30d } } }),
          prisma.treeMember.count({ where: { treeId, joinedAt: { gte: since30d } } }),
          prisma.idea.count({ where: { needId: { in: (await prisma.need.findMany({ where: { treeId }, select: { id: true } })).map(n => n.id) }, createdAt: { gte: since30d } } }),
          prisma.ideaVote.count({ where: { needId: { in: (await prisma.need.findMany({ where: { treeId }, select: { id: true } })).map(n => n.id) }, createdAt: { gte: since30d } } }),
        ]);
      return {
        period: '30d',
        totalEvents,
        needsCreated,
        tasksCreated,
        tasksCompleted,
        membersJoined,
        ideasSubmitted,
        votesCast: votesCast,
      };
    })(),

    // ── Ratings (last 30 days) ─────────────────────────────────────────────
    (async () => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentRatings = await prisma.rating.findMany({
        where: { treeId, createdAt: { gte: since30d } },
        include: { agent: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return recentRatings.map((r: any) => ({
        agentName: r.agent?.name || 'desconocido',
        role: r.role,
        stars: r.stars,
        createdAt: r.createdAt.toISOString(),
      }));
    })(),

    // ── Skill pricing ──────────────────────────────────────────────────────
    prisma.skillPricing.findMany({
      where: { treeId },
      select: { skillTag: true, ratePerHour: true, demandLevel: true },
      orderBy: { demandLevel: 'desc' },
    }),
  ]);

  return {
    tree: {
      id: tree.id,
      name: tree.name,
      icono: tree.icono,
      description: tree.description,
      objectives: tree.objectives,
      admissionPolicy: tree.admissionPolicy,
      memberCount: (tree as any)._count.members,
      openNeedCount: (tree as any)._count.needs,
      totalTaskCount: (tree as any)._count.tasks,
      createdAt: tree.createdAt.toISOString(),
    },
    members: members.map((m: any) => ({
      id: m.id,
      username: m.user?.username || '(anónimo)',
      skills: safeParseSkills(m.user?.skills),
      xp: m.xp || 0,
      level: m.level || 1,
      joinedAt: m.joinedAt.toISOString(),
      status: m.status,
    })),
    needs: needs.map((n: any) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      status: n.status,
      importance: n.importance,
      dailyVotes: n.dailyVotes,
      ideaCount: (n as any)._count?.ideas ?? 0,
      createdAt: n.createdAt.toISOString(),
    })),
    tasks: tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      budget: t.budget,
      assigneeUsername: t.assignee?.username || null,
      creatorUsername: t.creator?.username || 'desconocido',
      skills: safeParseSkillArray(t.skills),
      createdAt: t.createdAt.toISOString(),
    })),
    timeline: {
      last48h: recentEvents,
      summary: thirtyDayStats,
    },
    ratings,
    costs: {
      totalBudget: tree.totalBudget,
      paymentMode: tree.paymentMode,
      skillRates: skillRates.map((s: any) => ({
        skillTag: s.skillTag,
        ratePerHour: s.ratePerHour,
        demandLevel: s.demandLevel,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Delta builder ──────────────────────────────────────────────────────────────

export async function buildDelta(treeId: string): Promise<TreeDelta> {
  const [
    providerRatings,
    tokenCosts,
    maintenance,
    financialHealth,
    crossTreeBenchmarks,
    resourceConsumption,
    agentAvailability,
    alerts,
  ] = await Promise.all([
    // ── Average agent ratings by provider (across all trees, anonymized) ──
    (async () => {
      const ratings = await prisma.$queryRawUnsafe(`
        SELECT
          CASE
            WHEN a.name LIKE '%deepseek%' OR a.name LIKE '%ds%' THEN 'deepseek'
            WHEN a.name LIKE '%openai%' OR a.name LIKE '%gpt%' THEN 'openai'
            WHEN a.name LIKE '%claude%' OR a.name LIKE '%anthropic%' THEN 'anthropic'
            ELSE 'other'
          END as provider,
          AVG(r.stars) as avgStars,
          COUNT(*) as totalRatings,
          COUNT(DISTINCT r.treeId) as treeCount
        FROM Rating r
        JOIN Agent a ON a.id = r.agentId
        WHERE r.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY provider
        ORDER BY totalRatings DESC
      `);
      return (ratings as any[]).map((r: any) => ({
        provider: r.provider,
        avgStars: Math.round(r.avgStars * 100) / 100,
        totalRatings: Number(r.totalRatings),
        treeCount: Number(r.treeCount),
      }));
    })(),

    // ── Token costs per provider ───────────────────────────────────────────
    (async () => {
      const configs = await prisma.platformConfig.findMany({
        where: { category: 'api_cost' },
      });
      const result: TokenCost[] = [];
      const costMap: Record<string, { input?: number; output?: number }> = {};
      for (const c of configs) {
        try {
          const val = JSON.parse(c.value);
          if (c.key.startsWith('cost_api_input_')) {
            const provider = c.key.replace('cost_api_input_', '').replace('_1m', '');
            if (!costMap[provider]) costMap[provider] = {};
            costMap[provider].input = typeof val === 'number' ? val : parseFloat(val);
          }
          if (c.key.startsWith('cost_api_output_')) {
            const provider = c.key.replace('cost_api_output_', '').replace('_1m', '');
            if (!costMap[provider]) costMap[provider] = {};
            costMap[provider].output = typeof val === 'number' ? val : parseFloat(val);
          }
        } catch {}
      }
      for (const [provider, costs] of Object.entries(costMap)) {
        result.push({
          provider,
          inputCostPer1M: costs.input || 0,
          outputCostPer1M: costs.output || 0,
        });
      }
      // Fallback defaults if no config
      if (result.length === 0) {
        result.push({ provider: 'deepseek', inputCostPer1M: 0.27, outputCostPer1M: 1.10 });
        result.push({ provider: 'openai', inputCostPer1M: 2.50, outputCostPer1M: 10.00 });
        result.push({ provider: 'anthropic', inputCostPer1M: 3.00, outputCostPer1M: 15.00 });
      }
      return result;
    })(),

    // ── Maintenance costs ──────────────────────────────────────────────────
    (async () => {
      const configs = await prisma.platformConfig.findMany({
        where: { category: { in: ['fixed', 'margin', 'infrastructure'] } },
      });
      const getVal = (key: string): number => {
        const c = configs.find((c: any) => c.key === key);
        if (!c) return 0;
        try {
          return parseFloat(JSON.parse(c.value));
        } catch {
          return 0;
        }
      };
      const salaries = getVal('cost_salaries');
      const infrastructure = getVal('cost_infrastructure');
      const fixed = getVal('cost_fixed');
      const growthMarginPct = getVal('growth_margin_pct');
      return {
        salaries,
        infrastructure,
        fixed,
        growthMarginPct,
        totalFixed: salaries + infrastructure + fixed,
      };
    })(),

    // ── Financial health ───────────────────────────────────────────────────
    (async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { totalBudget: true },
      });

      // Total collected this month from payments
      let balance = 0;
      try {
        const payments = await prisma.$queryRawUnsafe(`
          SELECT COALESCE(SUM(tl.amount), 0) as total
          FROM TransactionLedger tl
          WHERE tl.treeId = ? AND tl.type = 'SPLIT_CREDIT'
            AND tl.createdAt >= ?
        `, treeId, startOfMonth);
        balance = Number((payments as any[])[0]?.total || 0);
      } catch {}

      // Delinquency %
      let delinquencyPct = 0;
      try {
        const totalMembers = await prisma.treeMember.count({ where: { treeId, status: 'ACTIVE' } });
        const delinquent = await prisma.treeMember.count({
          where: { treeId, paymentStatus: 'DELINQUENT' },
        });
        delinquencyPct = totalMembers > 0 ? Math.round((delinquent / totalMembers) * 100) : 0;
      } catch {}

      // Margin months: how many months can the tree operate with current balance
      const monthlyCost = await prisma.platformConfig.findUnique({
        where: { key: 'cost_fixed' },
      });
      let monthlyFixed = 0;
      try {
        if (monthlyCost) monthlyFixed = parseFloat(JSON.parse(monthlyCost.value));
      } catch {}
      const marginMonths = monthlyFixed > 0 ? Math.round((balance / monthlyFixed) * 10) / 10 : 99;

      return { balance, marginMonths, delinquencyPct };
    })(),

    // ── Cross-tree benchmarks (anonymized) ─────────────────────────────────
    (async () => {
      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { _count: { select: { members: true } } },
      });
      const memberCount = (tree as any)?._count?.members ?? 0;

      // Get global averages for trees in similar size range (±50%)
      const minMembers = Math.floor(memberCount * 0.5);
      const maxMembers = Math.ceil(memberCount * 1.5);
      const similarTrees = await prisma.$queryRawUnsafe(`
        SELECT
          AVG(memberCount) as avgMembers,
          AVG(needCount) as avgNeeds,
          AVG(taskCompletionDays) as avgCompletionDays
        FROM (
          SELECT
            t.id,
            COUNT(DISTINCT tm.id) as memberCount,
            COUNT(DISTINCT n.id) as needCount,
            AVG(DATEDIFF(tk.updatedAt, tk.createdAt)) as taskCompletionDays
          FROM Tree t
          LEFT JOIN TreeMember tm ON tm.treeId = t.id AND tm.status = 'ACTIVE'
          LEFT JOIN Need n ON n.treeId = t.id
          LEFT JOIN Task tk ON tk.treeId = t.id AND tk.status = 'VERIFIED'
          GROUP BY t.id
          HAVING memberCount BETWEEN ? AND ?
        ) sub
      `, minMembers, maxMembers > 0 ? maxMembers : 1);

      const bench = (similarTrees as any[])[0] || {};
      const benchmarks: CrossTreeBenchmark[] = [
        {
          metric: 'avg_members_similar_trees',
          value: Math.round(Number(bench.avgMembers) || 0),
          unit: 'miembros',
          percentile: memberCount > 0 && bench.avgMembers > 0
            ? Math.round(Math.min(memberCount / Number(bench.avgMembers), 2) * 50)
            : 50,
        },
        {
          metric: 'avg_needs_similar_trees',
          value: Math.round(Number(bench.avgNeeds) || 0),
          unit: 'necesidades',
          percentile: 50,
        },
        {
          metric: 'avg_task_completion_days',
          value: Math.round(Number(bench.avgCompletionDays) || 0),
          unit: 'días',
          percentile: 50,
        },
      ];
      return benchmarks;
    })(),

    // ── Resource consumption ───────────────────────────────────────────────
    (async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todayUsage, weekUsage, monthUsage] = await Promise.all([
        prisma.$queryRawUnsafe(
          `SELECT COALESCE(SUM(tokensIn + tokensOut), 0) as total FROM ApiUsage WHERE treeId = ? AND createdAt >= ?`,
          treeId, today
        ),
        prisma.$queryRawUnsafe(
          `SELECT COALESCE(SUM(tokensIn + tokensOut), 0) as total FROM ApiUsage WHERE treeId = ? AND createdAt >= ?`,
          treeId, weekAgo
        ),
        prisma.$queryRawUnsafe(
          `SELECT COALESCE(SUM(tokensIn + tokensOut), 0) as total FROM ApiUsage WHERE treeId = ? AND createdAt >= ?`,
          treeId, monthStart
        ),
      ]);

      // Sandbox usage %
      const totalSandboxes = await prisma.treeSandbox.count();
      const runningSandboxes = await prisma.treeSandbox.count({ where: { status: 'RUNNING' } });
      const sandboxUsagePct = totalSandboxes > 0
        ? Math.round((runningSandboxes / totalSandboxes) * 100)
        : 0;

      // Budget tokens: from platform config
      let budgetTokens: number | null = null;
      try {
        const budgetConfig = await prisma.platformConfig.findUnique({
          where: { key: 'budget_tokens_per_month' },
        });
        if (budgetConfig) budgetTokens = parseInt(JSON.parse(budgetConfig.value), 10);
      } catch {}

      return {
        tokensToday: Number((todayUsage as any[])[0]?.total || 0),
        tokensThisWeek: Number((weekUsage as any[])[0]?.total || 0),
        tokensThisMonth: Number((monthUsage as any[])[0]?.total || 0),
        budgetTokensPerMonth: budgetTokens,
        sandboxUsagePct,
      };
    })(),

    // ── Agent availability ─────────────────────────────────────────────────
    (async () => {
      const agents = await prisma.agentMembership.findMany({
        where: { treeId, status: 'ACTIVE' },
        include: {
          agent: {
            select: { name: true, profile: { select: { lastActiveAt: true, confidenceScore: true } } },
          },
        },
      });

      const totalAgents = agents.length;

      // Online: active in last 15 minutes
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const online = agents.filter((a: any) =>
        a.agent?.profile?.lastActiveAt && new Date(a.agent.profile.lastActiveAt) > fifteenMinAgo
      ).length;

      // Load by provider
      const loadDistribution: Record<string, number> = {};
      for (const a of agents) {
        const provider = (a as any).aiProvider || 'deepseek';
        loadDistribution[provider] = (loadDistribution[provider] || 0) + 1;
      }

      // Average response time (from apiUsage latency if tracked)
      let avgResponseTimeMs: number | null = null;
      try {
        const responseTime = await prisma.$queryRawUnsafe(`
          SELECT AVG(latencyMs) as avgMs
          FROM ApiUsage
          WHERE treeId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            AND latencyMs IS NOT NULL
        `, treeId);
        avgResponseTimeMs = Math.round(Number((responseTime as any[])[0]?.avgMs) || 0) || null;
      } catch {}

      return { totalAgents, online, avgResponseTimeMs, loadDistribution };
    })(),

    // ── External alerts ────────────────────────────────────────────────────
    (async () => {
      const alerts: ExternalAlert[] = [];

      // Check subscription expiry
      const subscriptions = await prisma.subscription.findMany({
        where: {
          userId: { in: (await prisma.treeMember.findMany({
            where: { treeId, status: 'ACTIVE' },
            select: { userId: true },
          })).map((m: any) => m.userId) },
          status: 'ACTIVE',
        },
      });
      for (const sub of subscriptions) {
        const daysUntil = Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        if (daysUntil <= 7 && daysUntil > 0) {
          alerts.push({
            type: 'subscription_expiring',
            message: `Suscripción expira en ${daysUntil} días`,
            priority: daysUntil <= 2 ? 'high' : 'medium',
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // Check provider price changes (from event log)
      try {
        const priceChanges = await prisma.eventLog.findMany({
          where: {
            action: { contains: 'PROVIDER_PRICE' },
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          take: 5,
        });
        for (const pc of priceChanges) {
          alerts.push({
            type: 'provider_price_change',
            message: pc.action,
            priority: 'high',
            detectedAt: pc.createdAt.toISOString(),
          });
        }
      } catch {}

      return alerts;
    })(),
  ]);

  return {
    treeId,
    providerRatings,
    tokenCosts,
    maintenance,
    financialHealth,
    crossTreeBenchmarks,
    resourceConsumption,
    agentAvailability,
    alerts,
    generatedAt: new Date().toISOString(),
  };
}

// ── Cache I/O ──────────────────────────────────────────────────────────────────

function getContextDir(treeId: string): string {
  return path.join(TREES_BASE, treeId, 'context');
}

function getSnapshotPath(treeId: string): string {
  return path.join(getContextDir(treeId), 'snapshot.json');
}

function getDeltaPath(treeId: string): string {
  return path.join(getContextDir(treeId), 'delta.json');
}

export function writeSnapshotToDisk(treeId: string, snapshot: TreeSnapshot): void {
  const dir = getContextDir(treeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getSnapshotPath(treeId), JSON.stringify(snapshot, null, 2), 'utf-8');
  // Touch a .updated file for mtime-based detection
  fs.writeFileSync(path.join(dir, '.updated'), new Date().toISOString(), 'utf-8');
}

export function readSnapshotFromDisk(treeId: string): TreeSnapshot | null {
  const filePath = getSnapshotPath(treeId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeDeltaToDisk(treeId: string, delta: TreeDelta): void {
  const dir = getContextDir(treeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getDeltaPath(treeId), JSON.stringify(delta, null, 2), 'utf-8');
}

export function readDeltaFromDisk(treeId: string): TreeDelta | null {
  const filePath = getDeltaPath(treeId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ── History query ──────────────────────────────────────────────────────────────

export async function getHistory(
  treeId: string,
  opts?: { userId?: string; from?: string; limit?: number }
): Promise<{ events: TimelineEvent[]; total: number }> {
  const { from, limit = 100 } = opts || {};
  const where: any = { treeId };
  if (from) {
    where.createdAt = { gte: new Date(from) };
  }

  const [events, total] = await Promise.all([
    prisma.eventLog.findMany({
      where,
      select: {
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        metadataJson: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.eventLog.count({ where }),
  ]);

  return {
    events: events.map((e: any) => ({
      type: e.action as string,
      description: describeEvent(e),
      entityType: e.entityType as string,
      entityId: e.entityId as string | null,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeParseSkills(raw: any): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return null;
  } catch {
    return null;
  }
}

function safeParseSkillArray(raw: any): string[] | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function describeEvent(e: any): string {
  const action = e.action || '';
  const meta = e.metadataJson || {};
  switch (action) {
    case 'TASK_CREATED': return meta.title ? `Tarea creada: "${meta.title}"` : 'Tarea creada';
    case 'TASK_COMPLETED': return 'Tarea completada';
    case 'NEED_CREATED': return meta.title ? `Necesidad creada: "${meta.title}"` : 'Necesidad creada';
    case 'NEED_RESOLVED': return meta.title ? `Necesidad resuelta: "${meta.title}"` : 'Necesidad resuelta';
    case 'MEMBER_JOINED': return meta.username ? `${meta.username} se unió al árbol` : 'Miembro se unió';
    case 'MEMBER_LEFT': return 'Miembro salió del árbol';
    case 'IDEA_CREATED': return 'Idea propuesta';
    case 'VOTE_CAST': return 'Voto registrado';
    default: return action.replace(/_/g, ' ').toLowerCase();
  }
}
