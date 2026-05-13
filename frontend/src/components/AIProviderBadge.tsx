import { CheckCircle, XCircle, Clock } from 'lucide-react';

type AIStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: 'OpenAI',
  DEEPSEEK: 'DeepSeek',
  ANTHROPIC: 'Anthropic',
  CUSTOM: 'Personalizado',
};

const STATUS_CONFIG: Record<AIStatus, { color: string; bg: string; border: string; Icon: typeof CheckCircle; label: string }> = {
  ACTIVE: {
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.08)',
    border: 'rgba(34, 197, 94, 0.2)',
    Icon: CheckCircle,
    label: 'Activo',
  },
  INACTIVE: {
    color: '#9ca3af',
    bg: 'rgba(156, 163, 175, 0.08)',
    border: 'rgba(156, 163, 175, 0.2)',
    Icon: XCircle,
    label: 'Inactivo',
  },
  PENDING: {
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.2)',
    Icon: Clock,
    label: 'Pendiente',
  },
};

interface Props {
  provider: string;
  status?: AIStatus;
  monthlySavings?: number;
  compact?: boolean;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

export default function AIProviderBadge({ provider, status = 'ACTIVE', monthlySavings, compact = false }: Props) {
  const cfg = STATUS_CONFIG[status];
  const label = PROVIDER_LABELS[provider] || provider;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: compact ? '0.3rem 0.7rem' : '0.5rem 0.9rem',
      borderRadius: 'var(--radius-full)',
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      fontSize: compact ? '0.75rem' : '0.85rem',
      fontWeight: 600,
      color: cfg.color,
      whiteSpace: 'nowrap',
    }}>
      <cfg.Icon size={compact ? 12 : 14} />
      <span>{label}</span>
      {monthlySavings !== undefined && monthlySavings > 0 && (
        <span style={{ fontSize: '0.7rem', opacity: 0.8, marginLeft: '0.25rem' }}>
          ahorras {fmt(monthlySavings)}/mes
        </span>
      )}
    </div>
  );
}
