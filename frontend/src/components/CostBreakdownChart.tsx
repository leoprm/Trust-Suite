import { Server, Cpu, TrendingUp, Users } from 'lucide-react';

export interface BreakdownItem {
  label: string;
  amount: number;
  icon: 'infra' | 'ai' | 'growth' | 'users';
  percentage: number;
}

interface Props {
  items: BreakdownItem[];
  total: number;
  currency?: string;
}

const ICON_MAP = {
  infra: Server,
  ai: Cpu,
  growth: TrendingUp,
  users: Users,
};

const COLOR_MAP = {
  infra: '#3b82f6',
  ai: '#8b5cf6',
  growth: '#10b981',
  users: '#f59e0b',
};

function fmt(n: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);
}

export default function CostBreakdownChart({ items, total, currency = 'CLP' }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {items.map((item) => {
        const Icon = ICON_MAP[item.icon];
        const color = COLOR_MAP[item.icon];
        const pct = total > 0 ? (item.amount / total) * 100 : 0;

        return (
          <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon size={16} style={{ color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {item.label}
                </span>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {fmt(item.amount, currency)}
              </span>
            </div>
            <div style={{
              height: '6px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(pct, 100)}%`,
                background: color,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: 0.8,
              }} />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
