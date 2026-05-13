import { PiggyBank, TrendingUp, Award, AlertCircle } from 'lucide-react';

interface AIBreakdown {
  name: string;
  provider: string;
  monthlySavings: number;
}

interface Props {
  monthlySavings: number;
  subscriptionCost: number;
  payoutEligible: boolean;
  payoutAmount: number;
  ais: AIBreakdown[];
  loading?: boolean;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

export default function SavingsCard({ monthlySavings, subscriptionCost, payoutEligible, payoutAmount, ais, loading }: Props) {
  if (loading) {
    return (
      <section className="glass-panel" style={{ padding: '1.5rem', opacity: 0.7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <PiggyBank size={20} style={{ color: 'var(--accent-success)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Ahorros BYO AI</h3>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Cargando...
        </div>
      </section>
    );
  }

  const savingsPercent = subscriptionCost > 0 ? Math.round((monthlySavings / subscriptionCost) * 100) : 0;

  return (
    <section className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PiggyBank size={20} style={{ color: 'var(--accent-success)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Ahorros BYO AI</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {payoutEligible && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.7rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--accent-success)',
            }}>
              <Award size={14} />
              Elegible para payout
            </span>
          )}
        </div>
      </div>

      {/* Savings highlight */}
      <div style={{
        background: monthlySavings > 0
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))'
          : 'rgba(255,255,255,0.03)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        marginBottom: '1.25rem',
        border: '1px solid rgba(16, 185, 129, 0.12)',
      }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
          Este mes ahorraste
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-success)' }}>
            {fmt(monthlySavings)}
          </span>
          {savingsPercent > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              ({savingsPercent}% del costo de suscripción)
            </span>
          )}
        </div>
        {monthlySavings === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <AlertCircle size={14} />
            Registra tus IAs para empezar a ahorrar
          </div>
        )}
      </div>

      {/* Payout info */}
      {payoutEligible && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(245, 158, 11, 0.06)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(245, 158, 11, 0.15)',
          marginBottom: '1.25rem',
        }}>
          <TrendingUp size={18} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-warning)' }}>
              Payout disponible: {fmt(payoutAmount)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Ahorraste más que el costo de suscripción (${subscriptionCost})
            </div>
          </div>
        </div>
      )}

      {/* AI breakdown table */}
      {ais.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Desglose por IA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ais.map((ai, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.75rem',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--accent-success)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{ai.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({ai.provider})</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-success)' }}>
                  {fmt(ai.monthlySavings)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
