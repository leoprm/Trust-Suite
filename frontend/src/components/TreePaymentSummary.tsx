import { useState, useEffect } from 'react';
import { CreditCard, AlertCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import PaymentStatusBadge from './PaymentStatusBadge';

type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED';

interface TreePaymentInfo {
  treeId: string;
  treeName: string;
  memberId: string;
  status: SubscriptionStatus;
  dueDate: string | null;
  amount: number | null;
  currency: string | null;
  error?: string;
  treeTreasury?: {
    balance: number;
    committedBalance: number;
  };
}

function fmt(n: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);
}

export default function TreePaymentSummary() {
  const { user } = useAuthStore();
  const [trees, setTrees] = useState<TreePaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.memberships?.length) {
      setLoading(false);
      return;
    }
    fetchAllPaymentStatuses();
  }, [user?.memberships]);

  const fetchAllPaymentStatuses = async () => {
    const memberships = user?.memberships || [];
    const results: TreePaymentInfo[] = [];

    await Promise.all(
      memberships.map(async (m) => {
        try {
          const { data } = await api.get(`/trees/${m.treeId}/members/${m.id}/payment-status`);
          results.push({
            treeId: m.treeId,
            treeName: '', // We'll fill this later
            memberId: m.id,
            status: data.subscriptionStatus,
            dueDate: data.paymentDueDate,
            amount: data.tree?.subscriptionAmount ?? null,
            currency: data.tree?.subscriptionCurrency ?? null,
            treeTreasury: data.treeTreasury ?? undefined,
          });
        } catch (e: any) {
          // Skip trees where we can't fetch (e.g., not subscribed or error)
          if (e?.response?.status !== 404) {
            results.push({
              treeId: m.treeId,
              treeName: '',
              memberId: m.id,
              status: 'ACTIVE' as SubscriptionStatus,
              dueDate: null,
              amount: null,
              currency: null,
              error: 'No disponible',
            });
          }
        }
      })
    );

    setTrees(results);
    setLoading(false);
  };

  if (loading) {
    return (
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <CreditCard size={20} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mis pagos pendientes</h3>
        </div>
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--text-secondary)' }} />
        </div>
      </section>
    );
  }

  // Filter to only subscription trees with data
  const subscriptionTrees = trees.filter((t) => !t.error);
  const graceTrees = subscriptionTrees.filter((t) => t.status === 'GRACE');
  const suspendedTrees = subscriptionTrees.filter((t) => t.status === 'SUSPENDED');

  return (
    <section className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CreditCard size={20} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mis pagos pendientes</h3>
        </div>
        {subscriptionTrees.length > 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {subscriptionTrees.length} {subscriptionTrees.length === 1 ? 'suscripción' : 'suscripciones'}
          </span>
        )}
      </div>

      {subscriptionTrees.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '0.5rem 0' }}>
          No tienes suscripciones de pago activas.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {subscriptionTrees
            .filter((t) => t.status !== 'ACTIVE')
            .map((t) => (
              <div
                key={t.treeId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  background: t.status === 'SUSPENDED' ? 'rgba(239, 68, 68, 0.06)' : 'rgba(234, 179, 8, 0.06)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${t.status === 'SUSPENDED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)'}`,
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                  <AlertCircle
                    size={18}
                    style={{ color: t.status === 'SUSPENDED' ? 'var(--accent-error)' : 'var(--accent-warning)', flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      {t.status === 'SUSPENDED'
                        ? 'Membresía suspendida'
                        : 'Pago pendiente'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {t.amount ? `${fmt(t.amount)}` : ''}
                      {t.dueDate ? ` · Vence ${new Date(t.dueDate).toLocaleDateString('es-CL')}` : ''}
                    </div>
                    {/* Treasury indicator for this tree */}
                    {t.treeTreasury && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        <span style={{ color: '#4CAF50' }}>Disponible: {fmt(t.treeTreasury.balance)}</span>
                        <span style={{ margin: '0 0.3rem' }}>|</span>
                        <span style={{ color: '#DAA520' }}>Comprometido: {fmt(t.treeTreasury.committedBalance)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <PaymentStatusBadge status={t.status} dueDate={t.dueDate} />
              </div>
            ))}
          {subscriptionTrees.filter((t) => t.status !== 'ACTIVE').length === 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'rgba(34, 197, 94, 0.06)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(34, 197, 94, 0.15)',
              }}
            >
              <PaymentStatusBadge status="ACTIVE" />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Todas tus suscripciones están al día
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
