/**
 * berryFlowService.ts
 *
 * Berries — unidad de circulación interna del Tree.
 * "Las Berries no son un lago que se acumula indefinidamente; son un río de valor interno."
 *
 * Reglas constitucionales:
 *  - El fiat NO compra Berries.
 *  - Las Berries NO compran XP, votos ni autoridad.
 *  - El 10% mensual se DESTRUYE. No se redistribuye ni transfiere a nadie.
 *  - La reducción se aplica al SALDO INICIAL del ciclo, no al saldo final.
 *
 * Rounding: Math.round(x * 100) / 100  (2 decimales sobre Float — convención del proyecto)
 */

import { prisma } from '../index';
import { logEvent } from './eventLogService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default monthly flow reduction rate: 10% */
export const DEFAULT_MONTHLY_FLOW_RATE = 0.10;

/** Minimum amount to trigger a MONTHLY_FLOW_LOSS transaction (avoid micro-noise) */
const MIN_LOSS_TO_RECORD = 0.01;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format: YYYY-MM */
export function getCurrentCycleKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// BerryConfig
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreateBerryConfig(treeId: string) {
  const existing = await (prisma as any).berryConfig.findUnique({ where: { treeId } });
  if (existing) return existing;

  const created = await (prisma as any).berryConfig.create({
    data: {
      treeId,
      berriesEnabled: false,
      monthlyFlowRate: DEFAULT_MONTHLY_FLOW_RATE,
      monthlyFlowDay: 1,
      allowP2PTransfers: false,
      allowTaskRewards: true,
      allowAuditRewards: true,
    },
  });

  void logEvent({
    treeId,
    actorId: null,
    action: 'BERRY_CONFIG_CREATED',
    entityType: 'BerryConfig',
    entityId: created.id,
    metadataJson: { monthlyFlowRate: created.monthlyFlowRate },
    severity: 'INFO',
    source: 'SYSTEM',
  });

  return created;
}

export async function updateBerryConfig(
  treeId: string,
  updates: {
    berriesEnabled?: boolean;
    monthlyFlowRate?: number;
    monthlyFlowDay?: number;
    allowP2PTransfers?: boolean;
    allowTaskRewards?: boolean;
    allowAuditRewards?: boolean;
  },
  actorId: string,
) {
  if (updates.monthlyFlowRate !== undefined) {
    if (updates.monthlyFlowRate < 0 || updates.monthlyFlowRate > 1) {
      throw new Error('monthlyFlowRate must be between 0 and 1');
    }
  }

  const config = await getOrCreateBerryConfig(treeId);
  const updated = await (prisma as any).berryConfig.update({
    where: { treeId },
    data: updates,
  });

  void logEvent({
    treeId,
    actorId,
    action: 'BERRY_CONFIG_UPDATED',
    entityType: 'BerryConfig',
    entityId: config.id,
    beforeJson: {
      berriesEnabled: config.berriesEnabled,
      monthlyFlowRate: config.monthlyFlowRate,
      monthlyFlowDay: config.monthlyFlowDay,
    },
    afterJson: updates,
    severity: 'INFO',
    source: 'USER',
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance
// ─────────────────────────────────────────────────────────────────────────────

export async function getBerryBalance(userId: string, treeId: string) {
  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { bayasBalance: true, lastCycleKey: true, lastBerriesUpdate: true },
  });
  return member ?? { bayasBalance: 0, lastCycleKey: null, lastBerriesUpdate: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview
// ─────────────────────────────────────────────────────────────────────────────

export async function previewMonthlyBerryFlow(userId: string, treeId: string) {
  const [member, config] = await Promise.all([
    getBerryBalance(userId, treeId),
    getOrCreateBerryConfig(treeId),
  ]);

  const now = new Date();
  const cycleKey = getCurrentCycleKey(now);

  // Next cycle key: first of next month
  const nextYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const nextMonth = String((now.getUTCMonth() + 2 > 12 ? 1 : now.getUTCMonth() + 2)).padStart(2, '0');
  const nextCycleKey = `${nextYear}-${nextMonth}`;

  const balance = round2(Number(member.bayasBalance ?? 0));
  const flowRate = Number(config.monthlyFlowRate ?? DEFAULT_MONTHLY_FLOW_RATE);
  const estimatedLoss = round2(balance * flowRate);
  const balanceAfterFlow = round2(balance - estimatedLoss);

  const alreadyApplied = member.lastCycleKey === cycleKey;

  return {
    treeId,
    userId,
    balance,
    monthlyFlowRate: flowRate,
    estimatedMonthlyLoss: estimatedLoss,
    balanceAfterFlow,
    // TODO: estimatedMonthlyIncome from level/tasks/audits — not yet implemented
    estimatedMonthlyIncome: null,
    projectedBalance: balanceAfterFlow,
    currentCycleKey: cycleKey,
    nextCycleKey,
    alreadyAppliedThisCycle: alreadyApplied,
    note: 'Las Berries funcionan como un río, no como un lago. Cada mes el saldo pierde el 10%. Ese 10% sale de circulación y no va a ningún fondo ni administrador.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply monthly flow for a single user
// ─────────────────────────────────────────────────────────────────────────────

export async function applyMonthlyBerryFlowForUser(
  userId: string,
  treeId: string,
  cycleKey: string,
  flowRate?: number,
): Promise<{ skipped: boolean; lossAmount: number; newBalance: number }> {
  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
  });

  if (!member) return { skipped: true, lossAmount: 0, newBalance: 0 };

  // Idempotency: already applied this cycle for this user
  if (member.lastCycleKey === cycleKey) {
    void logEvent({
      treeId,
      actorId: userId,
      action: 'BERRY_MONTHLY_FLOW_SKIPPED_ALREADY_APPLIED',
      entityType: 'TreeMember',
      entityId: member.id,
      metadataJson: { cycleKey, balance: member.bayasBalance },
      severity: 'INFO',
      source: 'AUTOMATION',
    });
    return { skipped: true, lossAmount: 0, newBalance: round2(Number(member.bayasBalance)) };
  }

  const openingBalance = round2(Number(member.bayasBalance ?? 0));

  // No balance, no loss — but still mark cycle applied to prevent future noise
  if (openingBalance <= 0) {
    await (prisma as any).treeMember.update({
      where: { userId_treeId: { userId, treeId } },
      data: { lastCycleKey: cycleKey, lastBerriesUpdate: new Date() },
    });
    return { skipped: true, lossAmount: 0, newBalance: 0 };
  }

  const rate = flowRate ?? DEFAULT_MONTHLY_FLOW_RATE;
  const lossAmount = round2(openingBalance * rate);

  // If loss is below minimum threshold, skip
  if (lossAmount < MIN_LOSS_TO_RECORD) {
    await (prisma as any).treeMember.update({
      where: { userId_treeId: { userId, treeId } },
      data: { lastCycleKey: cycleKey, lastBerriesUpdate: new Date() },
    });
    return { skipped: true, lossAmount: 0, newBalance: openingBalance };
  }

  const newBalance = round2(openingBalance - lossAmount);

  // Update balance and mark cycle
  await (prisma as any).treeMember.update({
    where: { userId_treeId: { userId, treeId } },
    data: {
      bayasBalance: newBalance,
      lastCycleKey: cycleKey,
      lastBerriesUpdate: new Date(),
    },
  });

  // Record BerryTransaction — MONTHLY_FLOW_LOSS
  // No recipient. The lossAmount is destroyed.
  await (prisma as any).berryTransaction.create({
    data: {
      treeId,
      userId,
      type: 'MONTHLY_FLOW_LOSS',
      amount: lossAmount,
      balanceBefore: openingBalance,
      balanceAfter: newBalance,
      cycleKey,
      description: `Reducción mensual del ${Math.round(rate * 100)}% sobre saldo inicial ${openingBalance}. Monto destruido: ${lossAmount}.`,
      metadataJson: {
        openingBalance,
        lossAmount,
        newBalance,
        monthlyFlowRate: rate,
        cycleKey,
        note: 'El monto destruido no se transfiere a nadie. Sale de circulación.',
      },
    },
  });

  void logEvent({
    treeId,
    actorId: userId,
    action: 'BERRY_MONTHLY_FLOW_LOSS_APPLIED',
    entityType: 'TreeMember',
    entityId: member.id,
    metadataJson: {
      cycleKey,
      openingBalance,
      lossAmount,
      balanceAfter: newBalance,
      monthlyFlowRate: rate,
    },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  return { skipped: false, lossAmount, newBalance };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply monthly flow for entire Tree
// ─────────────────────────────────────────────────────────────────────────────

export async function applyMonthlyBerryFlowForTree(
  treeId: string,
  cycleKey: string,
): Promise<{ cycleId: string; usersProcessed: number; totalDestroyed: number; skipped: boolean }> {
  // Check for tree-level cycle idempotency
  const existingCycle = await (prisma as any).berryMonthlyCycle.findUnique({
    where: { treeId_cycleKey: { treeId, cycleKey } },
  });

  if (existingCycle?.status === 'COMPLETED') {
    return {
      cycleId: existingCycle.id,
      usersProcessed: existingCycle.usersProcessed,
      totalDestroyed: existingCycle.totalDestroyed,
      skipped: true,
    };
  }

  const config = await getOrCreateBerryConfig(treeId);

  // Create or reuse RUNNING cycle record
  const cycle = existingCycle ?? await (prisma as any).berryMonthlyCycle.create({
    data: { treeId, cycleKey, status: 'RUNNING' },
  });

  void logEvent({
    treeId,
    actorId: null,
    action: 'BERRY_MONTHLY_FLOW_TREE_STARTED',
    entityType: 'BerryMonthlyCycle',
    entityId: cycle.id,
    metadataJson: { cycleKey, monthlyFlowRate: config.monthlyFlowRate },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  const members = await (prisma as any).treeMember.findMany({
    where: { treeId },
    select: { userId: true, bayasBalance: true, lastCycleKey: true },
  });

  let usersProcessed = 0;
  let totalDestroyed = 0;

  for (const member of members) {
    try {
      const result = await applyMonthlyBerryFlowForUser(
        member.userId,
        treeId,
        cycleKey,
        Number(config.monthlyFlowRate),
      );
      if (!result.skipped) {
        usersProcessed++;
        totalDestroyed = round2(totalDestroyed + result.lossAmount);
      }
    } catch (err) {
      console.error(`[BerryFlow] Failed for user ${member.userId} in tree ${treeId}:`, err);
    }
  }

  // Mark cycle completed
  await (prisma as any).berryMonthlyCycle.update({
    where: { id: cycle.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      usersProcessed,
      totalDestroyed,
      metadataJson: { cycleKey, totalMembers: members.length, usersProcessed, totalDestroyed },
    },
  });

  void logEvent({
    treeId,
    actorId: null,
    action: 'BERRY_MONTHLY_FLOW_TREE_COMPLETED',
    entityType: 'BerryMonthlyCycle',
    entityId: cycle.id,
    metadataJson: { cycleKey, usersProcessed, totalDestroyed, totalMembers: members.length },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  return { cycleId: cycle.id, usersProcessed, totalDestroyed, skipped: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Berry reward (task, audit, level)
// ─────────────────────────────────────────────────────────────────────────────

export interface BerryRewardInput {
  userId: string;
  treeId: string;
  amount: number;
  type: 'TASK_REWARD' | 'AUDIT_REWARD' | 'LEVEL_REWARD' | 'ADJUSTMENT';
  sourceType?: string;
  sourceId?: string;
  description?: string;
}

export async function addBerryReward(input: BerryRewardInput): Promise<number> {
  const amount = round2(Math.abs(input.amount));
  if (amount <= 0) return 0;

  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId: input.userId, treeId: input.treeId } },
  });
  if (!member) return 0;

  const balanceBefore = round2(Number(member.bayasBalance ?? 0));
  const balanceAfter = round2(balanceBefore + amount);

  await (prisma as any).treeMember.update({
    where: { userId_treeId: { userId: input.userId, treeId: input.treeId } },
    data: { bayasBalance: balanceAfter },
  });

  await (prisma as any).berryTransaction.create({
    data: {
      treeId: input.treeId,
      userId: input.userId,
      type: input.type,
      amount,
      balanceBefore,
      balanceAfter,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      description: input.description ?? null,
      metadataJson: { note: 'Las Berries no otorgan XP, votos ni autoridad.' },
    },
  });

  void logEvent({
    treeId: input.treeId,
    actorId: input.userId,
    action: 'BERRY_REWARD_GRANTED',
    entityType: 'TreeMember',
    entityId: member.id,
    metadataJson: {
      type: input.type,
      amount,
      balanceBefore,
      balanceAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  return balanceAfter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction history
// ─────────────────────────────────────────────────────────────────────────────

export async function getBerryTransactionHistory(
  userId: string,
  treeId: string,
  limit = 50,
  offset = 0,
) {
  const [total, transactions] = await Promise.all([
    (prisma as any).berryTransaction.count({ where: { userId, treeId } }),
    (prisma as any).berryTransaction.findMany({
      where: { userId, treeId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, limit),
      skip: offset,
      select: {
        id: true, type: true, amount: true, balanceBefore: true, balanceAfter: true,
        cycleKey: true, sourceType: true, sourceId: true, description: true, createdAt: true,
      },
    }),
  ]);

  return { total, transactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-level Berry summary (admin view)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTreeBerrySummary(treeId: string) {
  const [members, config, lastCycle] = await Promise.all([
    (prisma as any).treeMember.findMany({
      where: { treeId },
      select: { userId: true, bayasBalance: true, lastCycleKey: true },
    }),
    getOrCreateBerryConfig(treeId),
    (prisma as any).berryMonthlyCycle.findFirst({
      where: { treeId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totalBalance = round2(members.reduce((sum: number, m: any) => sum + Number(m.bayasBalance ?? 0), 0));
  const activeWallets = members.filter((m: any) => Number(m.bayasBalance) > 0).length;

  return {
    treeId,
    totalBalance,
    activeWallets,
    totalMembers: members.length,
    berriesEnabled: config.berriesEnabled,
    monthlyFlowRate: config.monthlyFlowRate,
    lastCycle: lastCycle ? {
      cycleKey: lastCycle.cycleKey,
      usersProcessed: lastCycle.usersProcessed,
      totalDestroyed: lastCycle.totalDestroyed,
      completedAt: lastCycle.completedAt,
    } : null,
    note: 'Fiat financia recursos externos; Berries coordinan circulación interna; XP certifica contribución.',
  };
}
