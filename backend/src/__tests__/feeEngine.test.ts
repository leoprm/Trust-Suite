import { describe, it, expect } from 'vitest';
import { calculateFeePercent, FeeConfig } from '../utils/feeEngine';

const defaultConfig: FeeConfig = {
  baseMaintenanceCostClp: 500000,
  growthFactor: 0.02,
  minFeePercent: 0.5,
  maxFeePercent: 5.0,
};

describe('calculateFeePercent', () => {
  // ── Edge cases: zero volume and zero users ────────────────────────────
  it('V=0, U=0 → clamped to maxFeePercent (5%)', () => {
    const result = calculateFeePercent(defaultConfig, 0, 0);
    expect(result.feePercent).toBe(5);
    expect(result.maintenanceComponent).toBe(50000000); // (500000/1)*100
    expect(result.growthComponent).toBe(0); // α*(1-1/(1+0/1000))*100 = 0
  });

  it('V=0, U=1000 → clamped to maxFeePercent (5%)', () => {
    const result = calculateFeePercent(defaultConfig, 0, 1000);
    expect(result.feePercent).toBe(5);
    expect(result.growthComponent).toBe(1); // α*(1-1/(1+1000/1000))*100 = 0.02*0.5*100
  });

  // ── Edge case: negative values → treated as 0 ─────────────────────────
  it('negative volume → treated as 0, clamped to max', () => {
    const result = calculateFeePercent(defaultConfig, -100, 0);
    expect(result.feePercent).toBe(5);
  });

  it('negative users → treated as 0', () => {
    const result = calculateFeePercent(defaultConfig, 10000000, -5);
    expect(result.growthComponent).toBe(0);
  });

  // ── Various user counts ──────────────────────────────────────────────
  it('U=10 → growth component near 0', () => {
    const result = calculateFeePercent(defaultConfig, 10000000, 10);
    // growth = 0.02 * (1 - 1/(1 + 10/1000)) * 100 ≈ 0.02
    expect(result.growthComponent).toBeCloseTo(0.02, 1);
  });

  it('U=10000 → growth component ≈ 1.82', () => {
    const result = calculateFeePercent(defaultConfig, 10000000, 10000);
    // growth = 0.02 * (1 - 1/(1 + 10000/1000)) * 100 = 0.02 * (1 - 1/11) * 100
    //       = 0.02 * (10/11) * 100 = 1.818...
    expect(result.growthComponent).toBeCloseTo(1.82, 1);
  });

  it('U=1000000 → growth component ≈ 1.998', () => {
    const result = calculateFeePercent(defaultConfig, 10000000, 1000000);
    // growth = 0.02 * (1 - 1/(1 + 1000000/1000)) * 100 ≈ 0.02 * (1 - 0.001) * 100
    expect(result.growthComponent).toBeCloseTo(2.0, 0);
  });

  // ── Clamp at min/max ──────────────────────────────────────────────────
  it('clamped to maxFeePercent when raw fee exceeds max', () => {
    const highCostConfig: FeeConfig = { ...defaultConfig, baseMaintenanceCostClp: 10000000 };
    // V=1M, B=10M → maintenance = 1000%. Should clamp to 5%.
    const result = calculateFeePercent(highCostConfig, 1000000, 0);
    expect(result.feePercent).toBe(5);
    expect(result.maintenanceComponent).toBeGreaterThan(5);
  });

  it('clamped to minFeePercent when raw fee is below min', () => {
    const lowCostConfig: FeeConfig = { ...defaultConfig, baseMaintenanceCostClp: 10, minFeePercent: 0.5 };
    // V=1B, B=10 → maintenance = 0.000001%. Raw fee < 0.5%. Should clamp to 0.5%.
    const result = calculateFeePercent(lowCostConfig, 1000000000, 0);
    expect(result.feePercent).toBe(0.5);
    expect(result.maintenanceComponent).toBeLessThan(0.5);
  });

  // ── Different growthFactor values ─────────────────────────────────────
  it('growthFactor=0 → growth component = 0', () => {
    const config: FeeConfig = { ...defaultConfig, growthFactor: 0 };
    const result = calculateFeePercent(config, 10000000, 1000);
    expect(result.growthComponent).toBe(0);
    expect(result.feePercent).toBeCloseTo(5, 0); // maintenance = (500000/10000000)*100 = 5%
  });

  it('growthFactor=0.1 → higher growth component', () => {
    const config: FeeConfig = { ...defaultConfig, growthFactor: 0.1 };
    const result = calculateFeePercent(config, 10000000, 10000);
    // growth = 0.1 * (1 - 1/(1 + 10000/1000)) * 100 = 0.1 * (10/11) * 100 = 9.09
    expect(result.growthComponent).toBeCloseTo(9.09, 1);
  });

  // ── Maintenance decreases as volume increases ─────────────────────────
  it('maintenanceComponent decreases as V increases', () => {
    const r1 = calculateFeePercent(defaultConfig, 1000000, 1000);
    const r2 = calculateFeePercent(defaultConfig, 10000000, 1000);
    const r3 = calculateFeePercent(defaultConfig, 100000000, 1000);

    expect(r1.maintenanceComponent).toBeGreaterThan(r2.maintenanceComponent);
    expect(r2.maintenanceComponent).toBeGreaterThan(r3.maintenanceComponent);
  });

  // ── Spec examples ──────────────────────────────────────────────────────
  it('matches spec "Maduro" scenario: V=500M, U=50k → ~2.06%', () => {
    const result = calculateFeePercent(defaultConfig, 500000000, 50000);
    expect(result.feePercent).toBeCloseTo(2.06, 1);
    expect(result.maintenanceComponent).toBeCloseTo(0.1, 1);
    expect(result.growthComponent).toBeCloseTo(1.96, 1);
  });

  // ── Return type completeness ──────────────────────────────────────────
  it('returns complete FeeBreakdown with all fields', () => {
    const result = calculateFeePercent(defaultConfig, 10000000, 1000);
    expect(result).toHaveProperty('feePercent');
    expect(result).toHaveProperty('maintenanceComponent');
    expect(result).toHaveProperty('growthComponent');
    expect(result).toHaveProperty('minFeePercent');
    expect(result).toHaveProperty('maxFeePercent');
    expect(typeof result.feePercent).toBe('number');
  });

  // ── Edge: maxFeePercent = minFeePercent ───────────────────────────────
  it('works when minFeePercent = maxFeePercent', () => {
    const config: FeeConfig = { ...defaultConfig, minFeePercent: 3, maxFeePercent: 3 };
    const result = calculateFeePercent(config, 10000000, 1000);
    expect(result.feePercent).toBe(3);
  });
});
