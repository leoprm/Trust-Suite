import { CheckCircle2, XCircle, Clock, AlertTriangle, HelpCircle } from 'lucide-react';

interface Props {
  status: string;
  hasSubscription: boolean;
}

const STATUS_MAP: Record<string, { label: string; icon: React.ComponentType<{ size: number }>; color: string; bg: string }> = {
  ACTIVE:     { label: 'Activa',        icon: CheckCircle2,    color: 'var(--accent-success)', bg: 'rgba(16,185,129,0.12)' },
  CANCELED:   { label: 'Cancelada',     icon: XCircle,         color: 'var(--accent-danger)',  bg: 'rgba(239,68,68,0.12)' },
  PAST_DUE:   { label: 'Pago vencido',  icon: AlertTriangle,   color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.12)' },
  PENDING:    { label: 'Pendiente',     icon: Clock,            color: 'var(--text-secondary)', bg: 'rgba(156,163,175,0.12)' },
  NONE:       { label: 'Sin suscripción', icon: HelpCircle,    color: 'var(--text-secondary)', bg: 'rgba(156,163,175,0.12)' },
};

export default function SubscriptionStatus({ status, hasSubscription }: Props) {
  const config = STATUS_MAP[status] || STATUS_MAP.NONE;
  const Icon = config.icon;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.35rem 0.75rem',
        borderRadius: 'var(--radius-full)',
        background: config.bg,
        border: `1px solid ${config.color}20`,
        fontSize: '0.8rem',
        fontWeight: 500,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={14} />
      <span>{config.label}</span>
    </div>
  );
}

export { STATUS_MAP };
