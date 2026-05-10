import { DollarSign } from 'lucide-react';

type Props = {
  tree: any;
};

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  GRATUITO: { label: 'Gratuito', color: 'var(--accent-success)' },
  SUBSCRIPCION: { label: 'Subscripción', color: 'var(--accent-primary)' },
};

const BILLING_LABELS: Record<string, string> = {
  FIXED: 'Fija',
  PROPORTIONAL: 'Variable',
};

export default function MaturityGatesCard({ tree }: Props) {
  const mode = tree.financingMode || 'GRATUITO';
  const billing = tree.subscriptionBillingMode;
  const info = MODE_LABELS[mode] || MODE_LABELS['GRATUITO'];

  const displayName = mode === 'SUBSCRIPCION' && billing
    ? `Subscripción ${BILLING_LABELS[billing] || billing}`
    : info.label;

  return (
    <div style={{
      padding: '1.25rem',
      borderRadius: 12,
      border: '1px solid var(--border-color)',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <DollarSign size={20} color={info.color} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: info.color }}>
              {displayName}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Todos los modos de financiamiento están disponibles libremente
            </div>
          </div>
        </div>

        {mode === 'SUBSCRIPCION' && tree.subscriptionAmount && (
          <div style={{
            padding: '0.35rem 0.75rem',
            borderRadius: 100,
            background: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--accent-primary)',
            fontSize: '0.8rem',
            fontWeight: 700,
          }}>
            {tree.subscriptionAmount.toLocaleString()} {tree.subscriptionCurrency || 'CLP'}/mes
          </div>
        )}
      </div>
    </div>
  );
}
