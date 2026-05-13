import { Prisma } from '@prisma/client';
import { prisma } from '../index';

const DEFAULT_GROWTH_PCT = 15;
const DAYS_LOOKBACK = 30;

export interface CostBreakdown {
  infraCost: number;
  aiCost: number;
  growthPct: number;
  totalUsers: number;
  rootTreeId: string;
  rootTreeName: string;
}

/**
 * Finds the root tree for billing.
 * Priority: tree named "Trust Maker" → first tree with expenses → any tree.
 */
async function findRootTree(): Promise<{ id: string; name: string } | null> {
  // Try by name
  const byName = await prisma.tree.findFirst({
    where: { name: { contains: 'Trust' } },
    select: { id: true, name: true },
  });
  if (byName) return byName;

  // Try tree with expenses
  const withExpenses = await prisma.treeExpense.findFirst({
    select: { tree: { select: { id: true, name: true } } },
  });
  if (withExpenses?.tree) return withExpenses.tree;

  // Fallback: any tree
  const anyTree = await prisma.tree.findFirst({
    select: { id: true, name: true },
  });
  return anyTree || null;
}

/**
 * Counts active users across the platform.
 * Active = VERIFIED members who have been active in the last 60 days
 * (joined less than 60 days ago or have XP > 0).
 */
async function countActiveUsers(): Promise<number> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);

  // Count distinct users who are VERIFIED members and either joined recently or have XP
  const result = await prisma.treeMember.groupBy({
    by: ['userId'],
    where: {
      status: 'VERIFIED',
      OR: [
        { joinedAt: { gte: sixtyDaysAgo } },
        { xp: { gt: 0 } },
      ],
    },
  });

  return result.length;
}

/**
 * Recalculates the monthly subscription cost based on:
 *   monthlyCost = (last 30d expenses + growthPct%) / activeUsers
 *
 * Saves result to SubscriptionPlan. Creates the plan row if none exists.
 */
export async function recalculateCost(growthPct: number = DEFAULT_GROWTH_PCT): Promise<{
  plan: any;
  breakdown: CostBreakdown;
}> {
  const rootTree = await findRootTree();
  if (!rootTree) {
    throw new Error('No tree found for cost calculation. Seed a tree first.');
  }

  // Sum expenses from the last 30 days for the root tree
  const thirtyDaysAgo = new Date(Date.now() - DAYS_LOOKBACK * 86400000);

  const expenses = await prisma.treeExpense.aggregate({
    _sum: { amount: true },
    where: {
      treeId: rootTree.id,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const rawCost = (expenses._sum.amount || 0);
  const infraCost = rawCost; // All expenses are infra for now
  const aiCost = 0; // Future: AI-specific costs

  // Add growth percentage
  const growthMultiplier = 1 + growthPct / 100;
  const costWithGrowth = rawCost * growthMultiplier;

  // Divide by active users
  const totalUsers = await countActiveUsers();
  const monthlyCost = totalUsers > 0
    ? Math.round((costWithGrowth / totalUsers) * 100) / 100
    : costWithGrowth; // If 0 users, don't divide (avoids Infinity)

  const breakdown: CostBreakdown = {
    infraCost: Math.round(rawCost * 100) / 100,
    aiCost: Math.round(aiCost * 100) / 100,
    growthPct,
    totalUsers,
    rootTreeId: rootTree.id,
    rootTreeName: rootTree.name,
  };

  // Upsert the subscription plan (single row)
  const existing = await prisma.subscriptionPlan.findFirst();
  let plan: any;

  if (existing) {
    plan = await prisma.subscriptionPlan.update({
      where: { id: existing.id },
      data: {
        currentMonthlyCost: monthlyCost,
        costBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
    });
  } else {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'Único',
        currentMonthlyCost: monthlyCost,
        costBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
    });
  }

  console.log(
    `[Billing] Cost recalculated: $${monthlyCost}/user (raw: $${rawCost}, growth: ${growthPct}%, users: ${totalUsers}, tree: ${rootTree.name})`,
  );

  return { plan, breakdown };
}

/**
 * Returns the current subscription cost and breakdown.
 * Public — no auth required.
 */
export async function getCurrentCost() {
  const plan = await prisma.subscriptionPlan.findFirst({
    orderBy: { calculatedAt: 'desc' },
  });

  if (!plan) {
    // Auto-calculate on first request
    const { plan: newPlan, breakdown } = await recalculateCost();
    return {
      monthlyCost: newPlan.currentMonthlyCost,
      currency: 'CLP',
      breakdown,
      calculatedAt: newPlan.calculatedAt,
    };
  }

  return {
    monthlyCost: plan.currentMonthlyCost,
    currency: 'CLP',
    breakdown: plan.costBreakdown,
    calculatedAt: plan.calculatedAt,
  };
}

/**
 * Returns the authenticated user's subscription status.
 */
export async function getMySubscription(userId: string) {
  const sub = await prisma.userSubscription.findFirst({
    where: { userId },
  });

  if (!sub) {
    return {
      hasSubscription: false,
      status: 'NONE',
    };
  }

  return {
    hasSubscription: true,
    id: sub.id,
    status: sub.status,
    planId: sub.planId,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    paddleSubscriptionId: sub.paddleSubscriptionId,
    canceledAt: sub.canceledAt,
  };
}
