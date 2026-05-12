/**
 * TrustCore Fee Calculation Engine
 *
 * Pure function — no DB access. Receives all inputs as params.
 * Formula from docs/trustcore-fee-protocol.md Section 3.
 */

export interface FeeConfig {
  baseMaintenanceCostClp: number;
  growthFactor: number;
  minFeePercent: number;
  maxFeePercent: number;
}

export interface FeeBreakdown {
  feePercent: number;
  maintenanceComponent: number;
  growthComponent: number;
  minFeePercent: number;
  maxFeePercent: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate the dynamic fee percentage.
 *
 * @param config  Subset of GlobalFeeConfig — base cost, growth factor, and clamp bounds.
 * @param volume  Monthly transaction volume in CLP (V). Non-negative; 0 is clamped to 1 in formula.
 * @param activeUsers  Total active users (U). Non-negative.
 * @returns FeeBreakdown with all components.
 */
export function calculateFeePercent(
  config: FeeConfig,
  volume: number,
  activeUsers: number,
): FeeBreakdown {
  const B = Math.max(0, config.baseMaintenanceCostClp);
  const V = Math.max(1, Math.max(0, volume)); // clamp volume to >= 1 to avoid division by zero
  const U = Math.max(0, activeUsers);
  const α = Math.max(0, config.growthFactor);
  const minFee = Math.max(0, config.minFeePercent);
  const maxFee = Math.max(minFee, config.maxFeePercent);

  // maintenanceComponent = (B / V) × 100
  const maintenanceComponent = (B / V) * 100;

  // growthComponent = α × (1 − 1/(1 + U/1000)) × 100
  const growthComponent = α * (1 - 1 / (1 + U / 1000)) * 100;

  const rawFee = maintenanceComponent + growthComponent;
  const feePercent = clamp(rawFee, minFee, maxFee);

  return {
    feePercent: Math.round(feePercent * 100) / 100, // round to 2 decimals
    maintenanceComponent: Math.round(maintenanceComponent * 100) / 100,
    growthComponent: Math.round(growthComponent * 100) / 100,
    minFeePercent: minFee,
    maxFeePercent: maxFee,
  };
}
