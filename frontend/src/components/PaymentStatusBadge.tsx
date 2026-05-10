import { CheckCircle, AlertCircle, Ban, Clock, Undo2, AlertTriangle } from 'lucide-react';

type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED';
type EscrowStatus = 'PLEDGED' | 'RELEASED' | 'REFUNDED' | 'DISPUTED';
type PaymentStatus = SubscriptionStatus | EscrowStatus;

interface Props {
  status: PaymentStatus;
  dueDate?: string | null;
  releasedAmount?: number;
  refundedAmount?: number;
  currency?: string;
}

function fmt(n: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);
}

const STATUS_CONFIG: Record<PaymentStatus, {
  color: string;
  bg: string;
  border: string;
  Icon: typeof CheckCircle;
  label: string;
}> = {
  ACTIVE: {
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.08)',
    border: 'rgba(34, 197, 94, 0.2)',
    Icon: CheckCircle,
    label: 'Al día',
  },
  GRACE: {
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.08)',
    border: 'rgba(234, 179, 8, 0.2)',
    Icon: AlertCircle,
    label: 'En gracia',
  },
  SUSPENDED: {
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.2)',
    Icon: Ban,
    label: 'Suspendido',
  },
  PLEDGED: {
    color: '#DAA520',
    bg: 'rgba(218, 165, 32, 0.08)',
    border: 'rgba(218, 165, 32, 0.2)',
    Icon: Clock,
    label: 'En garantía — pendiente de entrega',
  },
  RELEASED: {
    color: '#4CAF50',
    bg: 'rgba(76, 175, 80, 0.08)',
    border: 'rgba(76, 175, 80, 0.2)',
    Icon: CheckCircle,
    label: 'Liberado',
  },
  REFUNDED: {
    color: '#2196F3',
    bg: 'rgba(33, 150, 243, 0.08)',
    border: 'rgba(33, 150, 243, 0.2)',
    Icon: Undo2,
    label: 'Devuelto',
  },
  DISPUTED: {
    color: '#F44336',
    bg: 'rgba(244, 67, 54, 0.08)',
    border: 'rgba(244, 67, 54, 0.2)',
    Icon: AlertTriangle,
    label: 'En disputa — revisión pendiente',
  },
};

export default function PaymentStatusBadge({ status, dueDate, releasedAmount, refundedAmount, currency }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;
  const { color, bg, border, Icon, label } = config;

  const formattedDate = dueDate
    ? new Date(dueDate).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    : null;

  let text = label;
  if (status === 'GRACE' && formattedDate) {
    text = `En gracia — vence el ${formattedDate}`;
  }
  if (status === 'SUSPENDED') {
    text = 'Suspendido — regulariza para recuperar acceso';
  }
  if (status === 'RELEASED' && releasedAmount !== undefined) {
    text = `Liberado — ${fmt(releasedAmount, currency || 'CLP')} recibidos`;
  }
  if (status === 'REFUNDED' && refundedAmount !== undefined) {
    text = `Devuelto — ${fmt(refundedAmount, currency || 'CLP')} reembolsados`;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.35rem 0.8rem',
        borderRadius: '100px',
        background: bg,
        border: `1px solid ${border}`,
        fontSize: '0.85rem',
        fontWeight: 600,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={16} />
      {text}
    </span>
  );
}
