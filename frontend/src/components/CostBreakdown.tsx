import { PieChart, TrendingUp, Users, Server, Sparkles, TreePine } from 'lucide-react';

interface CostBreakdownData {
  infraCost: number;
  aiCost: number;
  growthPct: number;
  totalUsers: number;
}

interface Props {
  data: CostBreakdownData | null;
  monthlyCost: number;
  currency: string;
  rootTreeName?: string;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('es-CL')}`;
  }
}

export default function CostBreakdown({ data, monthlyCost, currency, rootTreeName }: Props) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  if (!data) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
        <PieChart size={32} style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No hay datos de costo disponibles.</p>
      </div>
    );
  }

  const { infraCost, aiCost, growthPct, totalUsers } = data;
  const baseCost = infraCost + aiCost;
  const growthAmount = baseCost * (growthPct / 100);
  const totalCost = baseCost + growthAmount;

  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.25rem' : '1.75rem' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <PieChart size={20} style={{ color: 'var(--accent-primary)' }} />
        Desglose de Costos
      </h3>

      {/* Costo mensual total — destacado */}
      <div style={{
        background: 'var(--grad-primary)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', opacity: 0.85 }}>Costo mensual por usuario</span>
        <span style={{ fontWeight: 700, fontSize: '1.5rem' }}>{formatCurrency(monthlyCost, currency)}</span>
      </div>

      {/* Líneas de desglose */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <Row icon={Server} label="Infraestructura" value={infraCost} currency={currency} />
        <Row icon={Sparkles} label="IA / Computo" value={aiCost} currency={currency} />
        <Row
          icon={TrendingUp}
          label={`Crecimiento proyectado (+${growthPct}%)`}
          value={growthAmount}
          currency={currency}
          muted
        />
        <Divider />
        <Row icon={Users} label={`Costo base (${totalUsers} usuarios)`} value={totalCost} currency={currency} bold />
        <Row
          icon={TrendingUp}
          label={`Costo por usuario (÷ ${totalUsers})`}
          value={monthlyCost}
          currency={currency}
          highlight
        />
      </div>

      {rootTreeName && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}>
          <TreePine size={14} />
          <span>Árbol raíz: <strong style={{ color: 'var(--text-primary)' }}>{rootTreeName}</strong></span>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0' }} />;
}

function Row({
  icon: Icon,
  label,
  value,
  currency,
  muted = false,
  bold = false,
  highlight = false,
}: {
  icon: React.ComponentType<{ size: number }>;
  label: string;
  value: number;
  currency: string;
  muted?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  const color = highlight ? 'var(--accent-success)' : muted ? 'var(--text-secondary)' : 'var(--text-primary)';
  const weight = bold ? 600 : 400;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <span style={{ fontWeight: weight, color, fontSize: bold ? '1rem' : '0.9rem', whiteSpace: 'nowrap' }}>
        {formatCurrency(Math.round(value), currency)}
      </span>
    </div>
  );
}
