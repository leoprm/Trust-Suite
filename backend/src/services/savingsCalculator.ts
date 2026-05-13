/**
 * SavingsCalculator — estima el ahorro del sistema cuando una tarea
 * usa una IA registrada por el usuario en vez de una IA interna.
 *
 * Costo estimado por 1K tokens (input/output blends):
 */
const PROVIDER_COST_PER_1K_TOKENS: Record<string, number> = {
  OPENAI:    0.009,  // ~$0.003 input + $0.015 output blend
  DEEPSEEK:  0.005,  // ~$0.002 input + $0.008 output blend
  ANTHROPIC: 0.045,  // ~$0.015 input + $0.075 output blend
  CUSTOM:    0.010,  // estimado conservador
};

/** Estimated cost (USD) the system would have paid for internal inference */
export function estimateInternalCost(provider: string, tokenCount: number): number {
  const costPer1K = PROVIDER_COST_PER_1K_TOKENS[provider] ?? 0.010;
  return (tokenCount / 1000) * costPer1K;
}

/** Accumula ahorro estimado en una UserAI */
export function computeSavings(internalCost: number, userCost: number): number {
  // El sistema ahorra la diferencia: lo que habría pagado - lo que le transfiere al usuario
  return Math.max(0, internalCost - userCost);
}

export const MONTHLY_SUBSCRIPTION_COST = 20; // USD — costo base de suscripción

/** Determina si el ahorro supera el costo de suscripción → elegible para payout */
export function isEligibleForPayout(monthlySavings: number): boolean {
  return monthlySavings > MONTHLY_SUBSCRIPTION_COST;
}

/** Calcula el monto de payout: excedente sobre el costo de suscripción */
export function computePayoutAmount(monthlySavings: number): number {
  return Math.max(0, monthlySavings - MONTHLY_SUBSCRIPTION_COST);
}
