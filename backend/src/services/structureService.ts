import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Interfaces ──────────────────────────────────────────────────────────

export interface StructureRecommendationInput {
  groupType: string;
  memberCount: number;
  totalBudget: number;
  roles?: Array<{ name: string; count: number }>;
  tools?: Array<{ name: string; category: string; monthlyCost?: number }>;
}

export interface SubTreeRecommendation {
  name: string;
  budgetPct: number;
  budgetAmount: number;
  recommendedMembers: number;
  goals: string;
}

export interface MilestoneRecommendation {
  phase: number;
  phaseName: string;
  objectives: string[];
  expectedMonths: number;
  expectedBy: string; // ISO date string
  targetKPIs: Record<string, any>;
}

export interface StructureRecommendation {
  groupType: string;
  subTrees: SubTreeRecommendation[];
  budgetAllocation: Record<string, number> | null;
  milestones: MilestoneRecommendation[];
  capitalInicial: number;
  roi: { autonomyMonth: number; estimated: string };
  breakEven: { month: number; estimated: string };
  totalBudget: number;
  memberCount: number;
}

// ── Fuzzy type matching ─────────────────────────────────────────────────

async function fuzzyMatchGroupType(
  normalizedType: string
): Promise<{ groupType: string; score: number } | null> {
  const allTypes = await prisma.groupStructure.findMany({
    select: { groupType: true },
    distinct: ['groupType'],
  });

  const keywords = normalizedType.split(/\s+/).filter(w => w.length > 1);
  if (keywords.length === 0) return null;

  let bestType = '';
  let bestScore = 0;

  for (const t of allTypes) {
    const words = t.groupType.toLowerCase().split(/\s+/);
    if (words.length === 0) continue;
    const common = keywords.filter(k =>
      words.some(w => w.includes(k) || k.includes(w))
    );
    const score = common.length / Math.max(keywords.length, words.length);
    if (score > bestScore) {
      bestScore = score;
      bestType = t.groupType;
    }
  }

  return bestType && bestScore >= 0.3
    ? { groupType: bestType, score: bestScore }
    : null;
}

// ── Default recommendation (no catalog match) ───────────────────────────

function buildDefaultRecommendation(
  groupType: string,
  memberCount: number,
  totalBudget: number,
  toolsMonthly?: number
): StructureRecommendation {
  const subTrees: SubTreeRecommendation[] = [
    {
      name: 'Operaciones',
      budgetPct: 40,
      budgetAmount: Math.round(totalBudget * 0.4),
      recommendedMembers: Math.max(1, Math.round(memberCount * 0.4)),
      goals: 'Ejecución de las tareas principales del grupo',
    },
    {
      name: 'Administración',
      budgetPct: 25,
      budgetAmount: Math.round(totalBudget * 0.25),
      recommendedMembers: Math.max(1, Math.round(memberCount * 0.25)),
      goals: 'Gestión financiera, legal y administrativa',
    },
    {
      name: 'Adquisiciones',
      budgetPct: 20,
      budgetAmount: Math.round(totalBudget * 0.2),
      recommendedMembers: Math.max(1, Math.round(memberCount * 0.2)),
      goals: 'Compra de materiales, herramientas y servicios externos',
    },
    {
      name: 'Reserva',
      budgetPct: 15,
      budgetAmount: Math.round(totalBudget * 0.15),
      recommendedMembers: Math.max(1, Math.round(memberCount * 0.15)),
      goals: 'Fondo de contingencia para imprevistos',
    },
  ];

  const now = new Date();
  const milestones: MilestoneRecommendation[] = [
    {
      phase: 1,
      phaseName: 'Constitución',
      objectives: ['Formar equipo base', 'Configurar herramientas', 'Primera necesidad'],
      expectedMonths: 2,
      expectedBy: new Date(now.getTime() + 2 * 30 * 86400000).toISOString().split('T')[0],
      targetKPIs: { membersOnboarded: Math.round(memberCount * 0.5), tasksCreated: 3 },
    },
    {
      phase: 2,
      phaseName: 'Operación inicial',
      objectives: ['5 tareas completadas', '80% votación activa', 'Primeros ingresos'],
      expectedMonths: 4,
      expectedBy: new Date(now.getTime() + 4 * 30 * 86400000).toISOString().split('T')[0],
      targetKPIs: { tasksCompleted: 5, votingRate: 80, revenueGenerated: Math.round(totalBudget * 0.1) },
    },
    {
      phase: 3,
      phaseName: 'Validación',
      objectives: ['Primer resultado validado', 'Ajuste de presupuesto', 'Revisión de estructura'],
      expectedMonths: 6,
      expectedBy: new Date(now.getTime() + 6 * 30 * 86400000).toISOString().split('T')[0],
      targetKPIs: { validatedResults: 1, budgetAccuracy: 70 },
    },
    {
      phase: 4,
      phaseName: 'Autonomía',
      objectives: ['Autonomía financiera', 'Exportar know-how', 'Replicar estructura'],
      expectedMonths: 12,
      expectedBy: new Date(now.getTime() + 12 * 30 * 86400000).toISOString().split('T')[0],
      targetKPIs: { financialAutonomy: true, replicationCount: 1 },
    },
  ];

  const autonomyMonth = 12;
  const tm = toolsMonthly || 0;
  const serversMonthly = totalBudget * 0.03;
  const capitalInicial = Math.round((tm * 3) + (serversMonthly * 3) + (totalBudget * 0.05));

  return {
    groupType,
    subTrees,
    budgetAllocation: { tools: 30, personnel: 50, services: 10, contingency: 10 },
    milestones,
    capitalInicial,
    roi: {
      autonomyMonth,
      estimated:
        autonomyMonth <= 6
          ? 'Rápido — autonomía financiera esperada en los primeros 6 meses'
          : autonomyMonth <= 12
            ? 'Moderado — autonomía financiera esperada dentro del primer año'
            : 'Largo plazo — requiere paciencia y capital de respaldo',
    },
    breakEven: {
      month: Math.max(3, Math.round(autonomyMonth * 0.6)),
      estimated: `Punto de equilibrio estimado al mes ${Math.max(3, Math.round(autonomyMonth * 0.6))} (≈${capitalInicial} CLP de inversión inicial)`,
    },
    totalBudget,
    memberCount,
  };
}

// ── Main recommendation function ────────────────────────────────────────

export async function recommendStructure(
  input: StructureRecommendationInput
): Promise<StructureRecommendation> {
  const { groupType, memberCount, totalBudget, roles, tools } = input;
  const normalizedType = groupType.toLowerCase().trim();

  // 1. Look up GroupStructure catalog
  let structure = await prisma.groupStructure.findFirst({
    where: { groupType: normalizedType },
  });

  let matchedType = normalizedType;

  // 2. Fuzzy fallback
  if (!structure) {
    const fuzzy = await fuzzyMatchGroupType(normalizedType);
    if (fuzzy) {
      structure = await prisma.groupStructure.findFirst({
        where: { groupType: fuzzy.groupType },
      });
      matchedType = fuzzy.groupType;
    }
  }

  // 3. Get milestones for this groupType
  let dbMilestones: any[] = [];
  if (structure) {
    dbMilestones = await prisma.groupMilestone.findMany({
      where: { groupType: structure.groupType },
      orderBy: { phase: 'asc' },
    });
  }

  // 4. No catalog match → default
  if (!structure || dbMilestones.length === 0) {
    return buildDefaultRecommendation(groupType, memberCount, totalBudget);
  }

  // 5. Build sub-tree recommendations from catalog (or default if typicalSubTrees is null/empty)
  let subTrees: SubTreeRecommendation[];
  const rawSubTrees = structure.typicalSubTrees as any[] | null;
  if (rawSubTrees && Array.isArray(rawSubTrees) && rawSubTrees.length > 0) {
    subTrees = rawSubTrees.map((st: any) => ({
      name: st.name || 'Sin nombre',
      budgetPct: st.budgetPct || 0,
      budgetAmount: Math.round(totalBudget * (st.budgetPct || 0) / 100),
      recommendedMembers: st.members || Math.max(1, Math.round(memberCount * (st.budgetPct || 0) / 100)),
      goals: st.goals || '',
    }));
  } else {
    // Fallback to default sub-trees with the matched type's milestones
    subTrees = buildDefaultRecommendation(groupType, memberCount, totalBudget).subTrees;
  }

  // 6. Build milestones from DB
  const now = new Date();
  const milestones: MilestoneRecommendation[] = dbMilestones.map((m: any) => {
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() + m.expectedMonths);
    return {
      phase: m.phase,
      phaseName: m.phaseName,
      objectives: Array.isArray(m.objectives) ? m.objectives : [],
      expectedMonths: m.expectedMonths,
      expectedBy: targetDate.toISOString().split('T')[0],
      targetKPIs: (m.targetKPIs as Record<string, any>) || {},
    };
  });

  // 7. Compute capitalInicial, ROI, break-even
  const lastMilestone = dbMilestones[dbMilestones.length - 1];
  const autonomyMonth = lastMilestone?.expectedMonths || structure.roiMonth || 12;

  const toolsMonthly = tools?.reduce((sum: number, t: any) => sum + (t.monthlyCost || 0), 0) || 0;
  const serversMonthly = totalBudget * 0.03;
  const rawCapital = (toolsMonthly * 3) + (serversMonthly * 3) + (totalBudget * 0.05);
  const capitalInicial = Math.round(structure.capitalInicial || rawCapital);

  const roi = {
    autonomyMonth,
    estimated:
      autonomyMonth <= 6
        ? 'Rápido — autonomía financiera esperada en los primeros 6 meses'
        : autonomyMonth <= 12
          ? 'Moderado — autonomía financiera esperada dentro del primer año'
          : 'Largo plazo — requiere paciencia y capital de respaldo',
  };

  const breakEvenMonth = Math.max(3, Math.round(autonomyMonth * 0.6));
  const breakEven = {
    month: breakEvenMonth,
    estimated: `Punto de equilibrio estimado al mes ${breakEvenMonth} (≈${capitalInicial.toLocaleString('es-CL')} CLP de inversión inicial)`,
  };

  return {
    groupType: matchedType,
    subTrees,
    budgetAllocation: (structure.budgetAllocation as Record<string, number>) || null,
    milestones,
    capitalInicial,
    roi,
    breakEven,
    totalBudget,
    memberCount,
  };
}

// ── Adopt structure ─────────────────────────────────────────────────────

export async function adoptStructure(
  treeId: string,
  recommendation: StructureRecommendation,
  userId?: string
): Promise<any> {
  // Check tree exists
  const tree = await prisma.tree.findUnique({ where: { id: treeId } });
  if (!tree) throw new Error('Tree not found');

  // Delete any existing structure for this tree (one active per tree)
  await prisma.treeStructure.deleteMany({ where: { treeId } });
  await prisma.treeMilestone.deleteMany({ where: { treeId } });

  // Create TreeStructure with full snapshot
  const ts = await prisma.treeStructure.create({
    data: {
      treeId,
      structureJson: recommendation as any,
      acceptedBy: userId || null,
    },
  });

  // Create TreeMilestone records
  const milestoneRecords = recommendation.milestones.map(m => ({
    treeId,
    subTreeName: 'General', // root-level milestone
    milestonePhase: m.phase,
    milestoneName: m.phaseName,
    targetDate: new Date(m.expectedBy),
    targetKPIs: m.targetKPIs as any,
    status: 'PENDING' as const,
  }));

  if (milestoneRecords.length > 0) {
    await prisma.treeMilestone.createMany({ data: milestoneRecords });
  }

  // Bump usageCount on the catalog entry
  await prisma.groupStructure.updateMany({
    where: { groupType: recommendation.groupType },
    data: { usageCount: { increment: 1 } },
  });

  const created = await prisma.treeStructure.findUnique({
    where: { id: ts.id },
  });

  const milestones = await prisma.treeMilestone.findMany({
    where: { treeId },
    orderBy: { milestonePhase: 'asc' },
  });

  return { structure: created, milestones };
}

// ── Get progress ────────────────────────────────────────────────────────

export async function getStructureProgress(treeId: string): Promise<any> {
  const structure = await prisma.treeStructure.findUnique({
    where: { treeId },
  });

  if (!structure) {
    return { error: 'No structure adopted for this tree' };
  }

  const milestones = await prisma.treeMilestone.findMany({
    where: { treeId },
    orderBy: { milestonePhase: 'asc' },
  });

  // Count tasks for this tree to derive live KPIs
  const taskCounts = await prisma.task.groupBy({
    by: ['status'],
    where: { treeId },
    _count: { id: true },
  });

  const completedTasks =
    taskCounts.find(t => t.status === 'VERIFIED' || t.status === 'PAID')?._count.id || 0;

  // Member voting rate (simplified — count active members with xp > 0)
  const activeMembers = await prisma.treeMember.count({
    where: { treeId, status: 'ACTIVE', xp: { gt: 0 } },
  });

  const totalMembers = await prisma.treeMember.count({
    where: { treeId, status: 'ACTIVE' },
  });

  const votingRate = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 0;

  // Compute live KPIs per milestone
  const needsCreated = await prisma.need.count({ where: { treeId } });
  const validatedResults = await prisma.result.count({
    where: { need: { treeId }, evaluation: { not: null } },
  });

  // Revenue from transaction ledger
  const ledgerAgg = await prisma.transactionLedger.aggregate({
    where: { treeId, type: 'SPLIT_CREDIT' },
    _sum: { amount: true },
  });
  const revenueGenerated = ledgerAgg._sum.amount || 0;

  const liveKPIs: Record<string, any> = {
    tasksCompleted: completedTasks,
    tasksCreated: needsCreated,
    votingRate,
    activeMembers,
    totalMembers,
    validatedResults,
    revenueGenerated,
    financialAutonomy: revenueGenerated > 0, // simplified: any revenue = autonomy started
    membersOnboarded: activeMembers,
  };

  // Update currentKPIs on milestones
  for (const m of milestones) {
    await prisma.treeMilestone.update({
      where: { id: m.id },
      data: { currentKPIs: liveKPIs as any },
    });

    // Auto-mark as COMPLETED if all target KPIs are met
    if (m.status === 'PENDING' || m.status === 'IN_PROGRESS') {
      const targets = (m.targetKPIs as Record<string, any>) || {};
      const allMet = Object.entries(targets).every(([key, target]) => {
        const current = liveKPIs[key];
        if (current === undefined) return false; // KPI not tracked yet — not met
        if (typeof target === 'boolean') return current === target;
        return current >= target;
      });

      if (allMet) {
        await prisma.treeMilestone.update({
          where: { id: m.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      } else if (!allMet && m.status === 'PENDING') {
        await prisma.treeMilestone.update({
          where: { id: m.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
    }
  }

  // Refresh after updates
  const updatedMilestones = await prisma.treeMilestone.findMany({
    where: { treeId },
    orderBy: { milestonePhase: 'asc' },
  });

  const overview = {
    totalPhases: milestones.length,
    completedPhases: milestones.filter(m => m.status === 'COMPLETED').length,
    inProgressPhases: milestones.filter(m => m.status === 'IN_PROGRESS').length,
    overduePhases: milestones.filter(m => m.status === 'OVERDUE').length,
    pendingPhases: milestones.filter(m => m.status === 'PENDING').length,
    liveKPIs,
  };

  return {
    structure: structure.structureJson,
    milestones: updatedMilestones,
    overview,
  };
}

// ── Get adoption history ────────────────────────────────────────────────

export async function getAdoptionHistory(treeId: string): Promise<any> {
  const structure = await prisma.treeStructure.findUnique({ where: { treeId } });
  if (!structure) return { error: 'No structure adopted' };

  const expenses = await prisma.treeExpense.findMany({
    where: { treeId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    structure: structure.structureJson,
    adoptedAt: structure.createdAt,
    acceptedBy: structure.acceptedBy,
    modifiedAt: structure.modifiedAt,
    expenses,
  };
}
