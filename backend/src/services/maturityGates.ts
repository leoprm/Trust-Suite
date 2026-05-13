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
// All maturity gates removed — financing modes are freely selectable.
// Internal gate-check functions deleted since they reference deleted Prisma fields
// (subscriptionStatus on TreeMember, memberPayment model, subscriptionBillingMode on Tree).

// ── API Pública ────────────────────────────────────────────────────────────

/**
 * Verifica si un Tree puede activar un modo de financiamiento.
 *
 * @param treeId  ID del árbol
 * @param targetMode  'GRATUITO' | 'SUBSCRIPCION'
 * @returns true si todos los gates pasan
/** Retorna true si el tree puede activar SUBSCRIPCION — SIEMPRE true (gates eliminados) */
export async function canActivateFinancingMode(
  treeId: string,
  targetMode: 'GRATUITO' | 'SUBSCRIPCION',
): Promise<boolean> {
  return true; // Todos los modos son libremente seleccionables
}

/**
 * Verifica si un Tree puede activar billing PROPORTIONAL — SIEMPRE true (gates eliminados)
 */
export async function canActivateProportionalBilling(treeId: string): Promise<boolean> {
  return true; // Todos los billing modes son libremente seleccionables
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

  const availableModes: string[] = ['GRATUITO', 'SUBSCRIPCION'];
  const blockedModes: BlockedMode[] = [];

  return {
    currentMode: tree.financingMode,
    currentBillingMode: null, // subscriptionBillingMode removed (TM1-TM6)
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
  // checkProportionalGates was removed (TM1-TM6) — subscription billing disabled
  const gates: GateCheck[] = [];
  return {
    passed: gates.every((g) => g.passed),
    gates,
  };
}
