import { useState, useEffect } from 'react';
import { CreditCard, AlertCircle, Loader2, History, Upload, Eye, HandCoins } from 'lucide-react';
import api from '../lib/api';
import PaymentStatusBadge from './PaymentStatusBadge';
import ReceiptUploader from './ReceiptUploader';
import ReceiptPreview from './ReceiptPreview';

type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED';
type EscrowStatus = 'PLEDGED' | 'RELEASED' | 'REFUNDED' | 'DISPUTED';

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  period: string;
  paidAt: string;
  status: string; // PAID | PLEDGED | RELEASED | REFUNDED | DISPUTED
  receiptAttempts: number;
  releasedAmount?: number;
  refundedAmount?: number;
}

interface PaymentStatusResponse {
  memberId: string;
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  isPayingMember: boolean;
  lastPaymentDate: string | null;
  paymentDueDate: string | null;
  graceEndDate: string | null;
  daysUntilDue: number | null;
  daysInGrace: number | null;
  gracePeriodDays: number;
  tree: {
    financingMode: string;
    subscriptionAmount: number | null;
    subscriptionCurrency: string | null;
    subscriptionDayOfMonth: number | null;
    subscriptionBillingMode: string | null;
  };
  recentPayments: PaymentRecord[];
  treeTreasury?: {
    balance: number;
    committedBalance: number;
  };
}

interface Props {
  treeId: string;
  memberId: string;
}

function formatCurrency(amount: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  const meses = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  ];
  return `${meses[parseInt(month) - 1]} ${year}`;
}

/** Mini progress bar for escrow payments — shows released (green) + refunded (blue) fraction */
function EscrowProgressBar({
  amount,
  releasedAmount,
  refundedAmount,
  status,
}: {
  amount: number;
  releasedAmount?: number;
  refundedAmount?: number;
  status: string;
}) {
  const released = releasedAmount ?? 0;
  const refunded = refundedAmount ?? 0;
  const processed = released + refunded;
  const pct = amount > 0 ? Math.min(100, (processed / amount) * 100) : 0;
  const pctReleased = amount > 0 ? (released / amount) * 100 : 0;
  const pctRefunded = amount > 0 ? (refunded / amount) * 100 : 0;

  // Only show for escrow states
  if (!['PLEDGED', 'RELEASED', 'REFUNDED'].includes(status)) return null;

  const isFullySettled = processed >= amount || status === 'RELEASED' || status === 'REFUNDED';

  return (
    <div style={{ marginTop: '0.3rem' }}>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* Released portion */}
        {pctReleased > 0 && (
          <div
            style={{
              width: `${pctReleased}%`,
              height: '100%',
              background: '#4CAF50',
              transition: 'width 0.4s ease',
            }}
          />
        )}
        {/* Refunded portion */}
        {pctRefunded > 0 && (
          <div
            style={{
              width: `${pctRefunded}%`,
              height: '100%',
              background: '#2196F3',
              transition: 'width 0.4s ease',
            }}
          />
        )}
        {/* Pledged (remaining) — only if not fully settled */}
        {!isFullySettled && pct < 100 && (
          <div
            style={{
              width: `${100 - pct}%`,
              height: '100%',
              background: 'rgba(218, 165, 32, 0.35)',
            }}
          />
        )}
      </div>
      {/* Caption */}
      {status === 'PLEDGED' && released > 0 && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
          {formatCurrency(released)} liberado{refunded > 0 ? ` · ${formatCurrency(refunded)} devuelto` : ''}
        </div>
      )}
      {status === 'RELEASED' && (
        <div style={{ fontSize: '0.7rem', color: '#4CAF50', marginTop: '0.15rem' }}>
          ✓ Total liberado
        </div>
      )}
      {status === 'REFUNDED' && (
        <div style={{ fontSize: '0.7rem', color: '#2196F3', marginTop: '0.15rem' }}>
          ↰ Total devuelto
        </div>
      )}
    </div>
  );
}

export default function MemberPaymentDashboard({ treeId, memberId }: Props) {
  const [data, setData] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadPaymentId, setUploadPaymentId] = useState<string | null>(null);
  const [previewPaymentId, setPreviewPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId || !memberId) return;
    fetchPaymentStatus();
  }, [treeId, memberId]);

  const fetchPaymentStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/trees/${treeId}/members/${memberId}/payment-status`);
      setData(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar el estado de pagos');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--text-secondary)' }} />
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Cargando estado de membresía...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertCircle size={24} style={{ color: 'var(--accent-warning)' }} />
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{error || 'Sin datos disponibles'}</p>
      </div>
    );
  }

  const { subscriptionStatus, paymentDueDate, tree, recentPayments, daysUntilDue, daysInGrace } = data;

  // Only show for trees with SUBSCRIPTION financing mode
  if (tree.financingMode !== 'SUBSCRIPTION') {
    return (
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <CreditCard size={20} style={{ color: 'var(--text-secondary)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mi membresía</h3>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Este árbol no requiere suscripción de pago.
        </p>
      </div>
    );
  }

  // ── Split payments ──
  const escrowStatuses: EscrowStatus[] = ['PLEDGED', 'RELEASED', 'REFUNDED', 'DISPUTED'];
  const pledgedPayments = recentPayments.filter((p) => p.status === 'PLEDGED');
  const historyPayments = recentPayments.filter(
    (p) => p.status === 'RELEASED' || p.status === 'REFUNDED' || p.status === 'PAID'
  );
  const totalPledged = pledgedPayments.reduce((sum, p) => sum + p.amount, 0);

  const isEscrowStatus = (s: string): s is EscrowStatus => escrowStatuses.includes(s as EscrowStatus);

  return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CreditCard size={20} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mi membresía</h3>
        </div>
        <PaymentStatusBadge status={subscriptionStatus} dueDate={paymentDueDate} />
      </div>

      {/* Status details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Next payment */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            Próximo pago
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {tree.subscriptionAmount ? formatCurrency(tree.subscriptionAmount, tree.subscriptionCurrency || 'CLP') : '—'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {formatDate(paymentDueDate)}
          </div>
        </div>

        {/* Status info */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            Estado
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'capitalize' }}>
            {subscriptionStatus === 'ACTIVE' ? 'Al día' : subscriptionStatus === 'GRACE' ? 'En gracia' : 'Suspendido'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {subscriptionStatus === 'ACTIVE' && daysUntilDue !== null && daysUntilDue > 0
              ? `${daysUntilDue} días para pagar`
              : subscriptionStatus === 'GRACE' && daysInGrace !== null
                ? `Día ${daysInGrace} de gracia`
                : subscriptionStatus === 'SUSPENDED'
                  ? 'Acceso limitado'
                  : ''}
          </div>
        </div>

        {/* Billing mode */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            Facturación
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {tree.subscriptionBillingMode === 'PROPORTIONAL' ? 'Proporcional' : 'Fija'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Día {tree.subscriptionDayOfMonth || 1} de cada mes
          </div>
        </div>
      </div>

      {/* ── Tree Treasury ── */}
      {data.treeTreasury && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            fontSize: '0.85rem',
          }}
        >
          <span>
            <span style={{ color: 'var(--text-secondary)' }}>Disponible: </span>
            <span style={{ fontWeight: 700, color: '#4CAF50' }}>
              {formatCurrency(data.treeTreasury.balance)}
            </span>
          </span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>
            <span style={{ color: 'var(--text-secondary)' }}>Comprometido: </span>
            <span style={{ fontWeight: 700, color: '#DAA520' }}>
              {formatCurrency(data.treeTreasury.committedBalance)}
            </span>
          </span>
        </div>
      )}

      {/* ═════════════════ Pagos en garantía ═════════════════ */}
      {pledgedPayments.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <HandCoins size={18} style={{ color: '#DAA520' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#DAA520' }}>Pagos en garantía</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              ({pledgedPayments.length} · total comprometido: {formatCurrency(totalPledged)})
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Período
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Monto
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Estado
                  </th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Comprobante
                  </th>
                </tr>
              </thead>
              <tbody>
                {pledgedPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>
                      {formatPeriod(p.period)}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatCurrency(p.amount, p.currency)}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <PaymentStatusBadge
                        status={p.status as EscrowStatus}
                        releasedAmount={p.releasedAmount}
                        refundedAmount={p.refundedAmount}
                        currency={p.currency}
                      />
                      <EscrowProgressBar
                        amount={p.amount}
                        releasedAmount={p.releasedAmount}
                        refundedAmount={p.refundedAmount}
                        status={p.status}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      {p.receiptAttempts < 3 && (
                        <button
                          onClick={() => setUploadPaymentId(p.id)}
                          className="btn"
                          style={{
                            background: 'var(--accent-primary)',
                            color: '#fff',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <Upload size={14} />
                          Subir
                        </button>
                      )}
                      {p.receiptAttempts > 0 && p.receiptAttempts < 3 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
                          ({3 - p.receiptAttempts})
                        </span>
                      )}
                      {p.receiptAttempts >= 3 && (
                        <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                          Sin intentos
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═════════════════ Historial ═════════════════ */}
      <div style={{ marginTop: pledgedPayments.length > 0 ? '0' : '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <History size={18} style={{ color: 'var(--text-secondary)' }} />
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Historial</h4>
        </div>

        {historyPayments.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem 0' }}>
            Aún no hay pagos procesados.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Período
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Monto
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Estado
                  </th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    Comprobante
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>
                      {formatPeriod(p.period)}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatCurrency(p.amount, p.currency)}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {isEscrowStatus(p.status) ? (
                        <div>
                          <PaymentStatusBadge
                            status={p.status}
                            releasedAmount={p.releasedAmount}
                            refundedAmount={p.refundedAmount}
                            currency={p.currency}
                          />
                          <EscrowProgressBar
                            amount={p.amount}
                            releasedAmount={p.releasedAmount}
                            refundedAmount={p.refundedAmount}
                            status={p.status}
                          />
                        </div>
                      ) : (
                        <span style={{ color: '#22c55e', fontSize: '0.8rem', fontWeight: 600 }}>Pagado</span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      {p.status === 'PAID' && (
                        <button
                          onClick={() => setPreviewPaymentId(p.id)}
                          className="btn"
                          style={{
                            background: 'rgba(34,197,94,0.12)',
                            color: '#22c55e',
                            border: '1px solid rgba(34,197,94,0.2)',
                            padding: '0.35rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <Eye size={14} />
                          Ver
                        </button>
                      )}
                      {p.status === 'RELEASED' && (
                        <button
                          onClick={() => setPreviewPaymentId(p.id)}
                          className="btn"
                          style={{
                            background: 'rgba(76,175,80,0.12)',
                            color: '#4CAF50',
                            border: '1px solid rgba(76,175,80,0.2)',
                            padding: '0.35rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <Eye size={14} />
                          Ver
                        </button>
                      )}
                      {p.status === 'REFUNDED' && (
                        <button
                          onClick={() => setPreviewPaymentId(p.id)}
                          className="btn"
                          style={{
                            background: 'rgba(33,150,243,0.12)',
                            color: '#2196F3',
                            border: '1px solid rgba(33,150,243,0.2)',
                            padding: '0.35rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <Eye size={14} />
                          Ver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Receipt modals ── */}
      {uploadPaymentId && (
        <ReceiptUploader
          paymentId={uploadPaymentId}
          expectedAmount={recentPayments.find(p => p.id === uploadPaymentId)?.amount || 0}
          onSuccess={() => {
            setUploadPaymentId(null);
            fetchPaymentStatus();
          }}
          onClose={() => setUploadPaymentId(null)}
        />
      )}

      {previewPaymentId && (
        <ReceiptPreview
          paymentId={previewPaymentId}
          expectedAmount={recentPayments.find(p => p.id === previewPaymentId)?.amount || 0}
          onClose={() => setPreviewPaymentId(null)}
        />
      )}
    </div>
  );
}
