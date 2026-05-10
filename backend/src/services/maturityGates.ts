/**
 * Maturity Gates para modos de financiamiento.
 *
 * Reglas de desbloqueo:
 *
 * Mode 1 (GRATUITO) — Siempre disponible. Sin restricciones.
 *
 * Mode 2 (SUBSCRIPCION) — Desbloquea cuando:
 *   - Tree tiene ≥ 5 miembros con MemberStatus=VERIFIED
 *   - Tree tiene ≥ 1 Branch (existe al menos una rama)
 *   - Antigüedad del Tree ≥ 30 días
 *   - economyMode ≥ LEGACY_FIAT
 *
 * Billing PROPORTIONAL (dentro de Mode 2) — Desbloquea cuando:
 *   - Tree tiene ≥ 15 miembros activos (no guest, no suspended)
 *   - ≥ 3 meses consecutivos en Mode 2 con ≥ 80% cumplimiento de pagos
 *   - ≥ 3 ciclos de gastos mensuales documentados (TreeExpense)
 *   - economyMode ≥ BERRIES_LATENT
 */

import { prisma } from '../index';

const ECO_LEVELS: Record<string, number> = {
  NO_ECONOMY: 0,
  LEGACY_FIAT: 1,
  BERRIES_LATENT: 2,
  BERRIES_ACTIVE: 3,
  TRUST_FULL: 4,
};

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface GateStatus {
  currentMode: string;
  currentBillingMode: string | null;
  availableModes: string[];
  blockedModes: BlockedMode[];
}

export interface BlockedMode {
  mode: string;
  missingGates: string[];
}

interface GateCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Cuenta miembros activos (no guest, no BANNED, no SUSPENDED/CANCELLED) */
async function countActiveMembers(treeId: string): Promise<number> {
  const members = await prisma.treeMember.findMany({
    where: { treeId },
    include: { user: { select: { is_guest: true } } },
  });

  return members.filter((m) => {
    if (m.user.is_guest) return false;
    if (m.status === 'BANNED') return false;
    if (m.subscriptionStatus === 'SUSPENDED' || m.subscriptionStatus === 'CANCELLED') return false;
    return true;
  }).length;
}

/** Obtiene los últimos N meses en formato "YYYY-MM" */
function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

/** Verifica el cumplimiento de pagos para los últimos N meses */
async function checkPaymentCompliance(
  treeId: string,
  months: string[],
  minCompliance: number,
): Promise<{ passed: boolean; detail: string }> {
  const activeMemberCount = await countActiveMembers(treeId);
  if (activeMemberCount === 0) {
    return { passed: false, detail: 'No hay miembros activos para medir cumplimiento' };
  }

  const failingMonths: string[] = [];

  for (const month of months) {
    const payments = await prisma.memberPayment.count({
      where: { treeId, period: month },
    });

    const compliance = payments / activeMemberCount;
    if (compliance < minCompliance) {
      failingMonths.push(`${month} (${(compliance * 100).toFixed(0)}% < ${(minCompliance * 100).toFixed(0)}%)`);
    }
  }

  if (failingMonths.length > 0) {
    return {
      passed: false,
      detail: `Cumplimiento insuficiente en: ${failingMonths.join(', ')}`,
    };
  }

  return { passed: true, detail: `${months.length} meses con ≥${(minCompliance * 100).toFixed(0)}% cumplimiento` };
}

// ── Gates ──────────────────────────────────────────────────────────────────

/** Retorna true si el tree puede activar SUBSCRIPCION */
async function checkSubscriptionGates(treeId: string): Promise<GateCheck[]> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      id: true,
      economyMode: true,
      createdAt: true,
    },
  });

  if (!tree) return [{ name: 'Tree existe', passed: false, detail: 'Tree no encontrado' }];

  const gates: GateCheck[] = [];

  // Gate 1: ≥5 VERIFIED members
  const verifiedCount = await prisma.treeMember.count({
    where: { treeId, status: 'VERIFIED' },
  });
  gates.push({
    name: '≥5 miembros VERIFIED',
    passed: verifiedCount >= 5,
    detail: `${verifiedCount}/5 verificados`,
  });

  // Gate 2: ≥1 Branch
  const branchCount = await prisma.branch.count({
    where: { treeId },
  });
  gates.push({
    name: '≥1 Branch completado',
    passed: branchCount >= 1,
    detail: `${branchCount}/1 ramas`,
  });

  // Gate 3: Antigüedad ≥30 días
  const ageDays = Math.floor((Date.now() - tree.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  gates.push({
    name: 'Antigüedad ≥30 días',
    passed: ageDays >= 30,
    detail: `${ageDays}/30 días`,
  });

  // Gate 4: economyMode ≥ LEGACY_FIAT
  const currentLevel = ECO_LEVELS[tree.economyMode] ?? 0;
  const requiredLevel = ECO_LEVELS['LEGACY_FIAT'];
  gates.push({
    name: 'economyMode ≥ LEGACY_FIAT',
    passed: currentLevel >= requiredLevel,
    detail: `Actual: ${tree.economyMode} (requiere LEGACY_FIAT+)`,
  });

  return gates;
}

/** Retorna true si el tree puede activar billing PROPORTIONAL */
async function checkProportionalGates(treeId: string): Promise<GateCheck[]> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      id: true,
      economyMode: true,
      financingMode: true,
    },
  });

  if (!tree) return [{ name: 'Tree existe', passed: false, detail: 'Tree no encontrado' }];

  // Requisito previo: debe estar en SUBSCRIPCION
  if (tree.financingMode !== 'SUBSCRIPCION') {
    return [
      { name: 'Modo SUBSCRIPCION activo', passed: false, detail: `Modo actual: ${tree.financingMode}` },
    ];
  }

  const gates: GateCheck[] = [];
  gates.push({ name: 'Modo SUBSCRIPCION activo', passed: true, detail: '✓' });

  // Gate 1: ≥15 miembros activos
  const activeCount = await countActiveMembers(treeId);
  gates.push({
    name: '≥15 miembros activos',
    passed: activeCount >= 15,
    detail: `${activeCount}/15 activos (no guest, no suspended)`,
  });

  // Gate 2: ≥3 meses consecutivos con ≥80% cumplimiento de pagos
  const last3 = lastNMonths(3);
  const compliance = await checkPaymentCompliance(treeId, last3, 0.8);
  gates.push({
    name: '≥3 meses con ≥80% cumplimiento de pagos',
    passed: compliance.passed,
    detail: compliance.detail,
  });

  // Gate 3: ≥3 ciclos de gastos mensuales documentados
  const expenseMonths = await prisma.treeExpense.findMany({
    where: { treeId },
    select: { month: true },
    distinct: ['month'],
  });
  gates.push({
    name: '≥3 ciclos de gastos documentados',
    passed: expenseMonths.length >= 3,
    detail: `${expenseMonths.length}/3 meses con gastos`,
  });

  // Gate 4: economyMode ≥ BERRIES_LATENT
  const currentLevel = ECO_LEVELS[tree.economyMode] ?? 0;
  const requiredLevel = ECO_LEVELS['BERRIES_LATENT'];
  gates.push({
    name: 'economyMode ≥ BERRIES_LATENT',
    passed: currentLevel >= requiredLevel,
    detail: `Actual: ${tree.economyMode} (requiere BERRIES_LATENT+)`,
  });

  return gates;
}

// ── API Pública ────────────────────────────────────────────────────────────

/**
 * Verifica si un Tree puede activar un modo de financiamiento.
 *
 * @param treeId  ID del árbol
 * @param targetMode  'GRATUITO' | 'SUBSCRIPCION'
 * @returns true si todos los gates pasan
 */
export async function canActivateFinancingMode(
  treeId: string,
  targetMode: 'GRATUITO' | 'SUBSCRIPCION',
): Promise<boolean> {
  if (targetMode === 'GRATUITO') return true;

  const gates = await checkSubscriptionGates(treeId);
  return gates.every((g) => g.passed);
}

/**
 * Verifica si un Tree puede activar billing PROPORTIONAL.
 *
 * @param treeId  ID del árbol
 * @returns true si todos los gates pasan
 */
export async function canActivateProportionalBilling(treeId: string): Promise<boolean> {
  const gates = await checkProportionalGates(treeId);
  return gates.every((g) => g.passed);
}

/**
 * Retorna el estado completo de gates de madurez para un Tree.
 *
 * @param treeId  ID del árbol
 * @returns GateStatus con modos disponibles, bloqueados, y qué falta
 */
export async function getMaturityGateStatus(treeId: string): Promise<GateStatus> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      id: true,
      financingMode: true,
      subscriptionBillingMode: true,
    },
  });

  if (!tree) {
    return {
      currentMode: 'UNKNOWN',
      currentBillingMode: null,
      availableModes: [],
      blockedModes: [],
    };
  }

  const availableModes: string[] = [];
  const blockedModes: BlockedMode[] = [];

  // GRATUITO siempre disponible
  availableModes.push('GRATUITO');

  // SUBSCRIPCION gates
  const subGates = await checkSubscriptionGates(treeId);
  const subPassed = subGates.every((g) => g.passed);
  if (subPassed) {
    availableModes.push('SUBSCRIPCION');
  } else {
    const missing = subGates.filter((g) => !g.passed).map((g) => `${g.name}: ${g.detail}`);
    blockedModes.push({ mode: 'SUBSCRIPCION', missingGates: missing });
  }

  return {
    currentMode: tree.financingMode,
    currentBillingMode: tree.subscriptionBillingMode,
    availableModes,
    blockedModes,
  };
}

/**
 * Retorna los gates detallados para PROPORTIONAL billing.
 * Útil para mostrar qué falta específicamente.
 */
export async function getProportionalGateDetails(
  treeId: string,
): Promise<{ passed: boolean; gates: GateCheck[] }> {
  const gates = await checkProportionalGates(treeId);
  return {
    passed: gates.every((g) => g.passed),
    gates,
  };
}
