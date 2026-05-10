import { Clock, CheckCircle, XCircle } from 'lucide-react';

type Props = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  size?: 'sm' | 'md';
};

const config: Record<Props['status'], { icon: typeof Clock; color: string; bg: string; label: string }> = {
  PENDING: { icon: Clock, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pendiente' },
  APPROVED: { icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Aprobado' },
  REJECTED: { icon: XCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Rechazado' },
};

export default function SignerApprovalBadge({ status, size = 'md' }: Props) {
  const { icon: Icon, color, bg, label } = config[status];
  const s = size === 'sm' ? 13 : 15;
  const fontSize = size === 'sm' ? '0.65rem' : '0.72rem';
  const padding = size === 'sm' ? '0.15rem 0.5rem' : '0.2rem 0.65rem';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding,
        borderRadius: '100px',
        background: bg,
        color,
        fontSize,
        fontWeight: 600,
        border: `1px solid ${color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={s} />
      {label}
    </span>
  );
}
