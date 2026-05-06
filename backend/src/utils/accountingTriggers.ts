import { prisma } from '../index';
import { createFiatTransaction } from '../services/fiatLedgerService';

/**
 * Records automatic external fiat ledger interactions only.
 * This helper must never be used to translate XP, levels, votes, reputation or Berries into fiat.
 */
export async function recordAutoTransaction(
  treeId: string,
  branchId: string | null,
  amount: number,
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT',
  description: string
): Promise<void> {
  try {
    if (/xp|level|nivel|berries|bayas|vote|voto|reput/i.test(description)) {
      console.warn('[FiatLedger] Blocked automatic fiat ledger entry with reputation/internal-currency wording:', description);
      return;
    }

    await createFiatTransaction({
      treeId,
      branchId,
      amount: Math.abs(amount),
      type,
      category: 'OTHER',
      description,
      verificationStatus: 'DECLARED',
      metadataJson: {
        source: 'automatic_external_ledger',
        noReputationEffect: true,
      },
      isAutomatic: true,
    }, {
      treeId,
      actorId: null,
      source: 'AUTOMATION',
    });
  } catch (err) {
    console.error('[FiatLedger] Failed to record auto transaction:', err);
  }
}

/**
 * Get EBITDA for a tree: SUM(automatic INCOME) - SUM(automatic EXPENSE).
 * This is external ledger reporting, not internal reputation or authority.
 */
export async function getTreeEBITDA(treeId: string): Promise<{
  income: number;
  expense: number;
  investment: number;
  ebitda: number;
  inversionPct: number;
}> {
  const aggregate = await (prisma as any).fiatTransaction.groupBy({
    by: ['type'],
    where: { treeId, isAutomatic: true },
    _sum: { amount: true },
  });

  const income = Number((aggregate as any[]).find(a => a.type === 'INCOME')?._sum?.amount || 0);
  const expense = Number((aggregate as any[]).find(a => a.type === 'EXPENSE')?._sum?.amount || 0);
  const investment = Number((aggregate as any[]).find(a => a.type === 'INVESTMENT')?._sum?.amount || 0);

  const ebitda = income - expense;
  const totalFlow = income + investment;
  const inversionPct = totalFlow > 0 ? (investment / totalFlow) * 100 : 0;

  return {
    income: parseFloat(income.toFixed(2)),
    expense: parseFloat(expense.toFixed(2)),
    investment: parseFloat(investment.toFixed(2)),
    ebitda: parseFloat(ebitda.toFixed(2)),
    inversionPct: parseFloat(inversionPct.toFixed(1)),
  };
}
