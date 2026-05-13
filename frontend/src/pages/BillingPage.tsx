import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Loader2, AlertCircle, ArrowLeft, ExternalLink,
  Receipt, ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import CostBreakdown from '../components/CostBreakdown';
import SubscriptionStatus from '../components/SubscriptionStatus';

// ── Types ──────────────────────────────────────────────────────────────────

interface CostData {
  monthlyCost: number;
  currency: string;
  breakdown: {
    infraCost: number;
    aiCost: number;
    growthPct: number;
    totalUsers: number;
    rootTreeId: string;
    rootTreeName: string;
  } | null;
  calculatedAt: string;
}

interface SubData {
  hasSubscription: boolean;
  status: string;
  id?: string;
  planId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  paddleSubscriptionId?: string;
  canceledAt?: string;
}

type PageState = 'loading' | 'ready' | 'error';

// ── Component ──────────────────────────────────────────────────────────────

export default function BillingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state: any) => state.user);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [error, setError] = useState('');
  const [costData, setCostData] = useState<CostData | null>(null);
  const [subData, setSubData] = useState<SubData | null>(null);
  const [actionLoading, setActionLoading] = useState(''); // 'subscribe' | 'cancel' | ''

  const fetchData = useCallback(async () => {
    setPageState('loading');
    setError('');
    try {
      const [costRes, subRes] = await Promise.all([
        api.get('/billing/current-cost'),
        api.get('/billing/subscription').catch(() => ({ data: { hasSubscription: false, status: 'NONE' } })),
      ]);
      setCostData(costRes.data);
      setSubData(subRes.data);
      setPageState('ready');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar datos de facturación');
      setPageState('error');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleSubscribe = async () => {
    if (!user?.id) return;
    setActionLoading('subscribe');
    try {
      const res = await api.post('/billing/create-checkout', { userId: user.id });
      const { checkoutUrl } = res.data;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        setError('No se recibió URL de checkout de Paddle');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al iniciar suscripción');
      setActionLoading('');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('¿Estás seguro de cancelar tu suscripción? Perderás acceso al final del período actual.')) return;
    setActionLoading('cancel');
    try {
      await api.post('/billing/cancel');
      fetchData(); // Refresh
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cancelar suscripción');
    } finally {
      setActionLoading('');
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const isSubscribed = subData?.hasSubscription && subData?.status === 'ACTIVE';
  const isCanceled = subData?.status === 'CANCELED';
  const canCancel = isSubscribed && subData?.paddleSubscriptionId;

  const periodLabel = subData?.currentPeriodEnd
    ? `Próximo cobro: ${new Date(subData.currentPeriodEnd).toLocaleDateString('es-CL')}`
    : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      maxWidth: 540,
      margin: '0 auto',
      padding: isMobile ? '1rem' : '1.5rem',
      minHeight: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-outline"
          style={{ padding: '0.4rem', width: '36px', height: '36px', minWidth: '36px' }}
          title="Volver"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>Facturación</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Gestiona tu suscripción y pagos
          </p>
        </div>
      </div>

      {/* Loading */}
      {pageState === 'loading' && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Cargando datos de facturación…</p>
        </div>
      )}

      {/* Error */}
      {pageState === 'error' && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
          <AlertCircle size={28} style={{ color: 'var(--accent-danger)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--accent-danger)', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</p>
          <button onClick={fetchData} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* Ready */}
      {pageState === 'ready' && (
        <>
          {/* Action Error Toast */}
          {error && actionLoading === '' && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--accent-danger)',
              fontSize: '0.85rem',
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
              <button
                onClick={() => setError('')}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Subscription Status Card */}
          <div className="glass-panel" style={{ padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '1.25rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '0.75rem',
              marginBottom: periodLabel ? '0.75rem' : '0',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <Receipt size={18} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontWeight: 600, fontSize: '1rem' }}>Mi Suscripción</span>
                </div>
                <SubscriptionStatus status={subData?.status || 'NONE'} hasSubscription={subData?.hasSubscription || false} />
              </div>
              {isSubscribed && costData && (
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-success)' }}>
                  {new Intl.NumberFormat('es-CL', { style: 'currency', currency: costData.currency }).format(costData.monthlyCost)}
                  <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/mes</span>
                </span>
              )}
            </div>

            {periodLabel && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{periodLabel}</p>
            )}

            {/* Subscribe / Cancel buttons */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {!isSubscribed && !isCanceled && (
                <button
                  onClick={handleSubscribe}
                  disabled={actionLoading === 'subscribe'}
                  className="btn btn-primary"
                  style={{ flex: 1, minWidth: 160 }}
                >
                  {actionLoading === 'subscribe' ? (
                    <><Loader2 size={16} className="animate-spin" /> Procesando…</>
                  ) : (
                    <><CreditCard size={16} /> Suscribirse</>
                  )}
                </button>
              )}

              {isSubscribed && (
                <button
                  onClick={handleSubscribe}
                  disabled={actionLoading === 'subscribe'}
                  className="btn btn-outline"
                  style={{ flex: 1, minWidth: 160 }}
                >
                  {actionLoading === 'subscribe' ? (
                    <><Loader2 size={16} className="animate-spin" /> Procesando…</>
                  ) : (
                    <><ExternalLink size={14} /> Gestionar plan</>
                  )}
                </button>
              )}

              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading === 'cancel'}
                  className="btn btn-outline"
                  style={{
                    color: 'var(--accent-danger)',
                    borderColor: 'rgba(239,68,68,0.3)',
                    flex: 1,
                    minWidth: 160,
                  }}
                >
                  {actionLoading === 'cancel' ? (
                    <><Loader2 size={16} className="animate-spin" /> Cancelando…</>
                  ) : (
                    'Cancelar suscripción'
                  )}
                </button>
              )}
            </div>

            {isCanceled && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Tu suscripción fue cancelada. El acceso continúa hasta el final del período actual.
              </p>
            )}

            {/* Re-subscribe after cancel */}
            {isCanceled && (
              <button
                onClick={handleSubscribe}
                disabled={actionLoading === 'subscribe'}
                className="btn btn-primary"
                style={{ marginTop: '0.75rem', width: '100%' }}
              >
                {actionLoading === 'subscribe' ? (
                  <><Loader2 size={16} className="animate-spin" /> Procesando…</>
                ) : (
                  <><CreditCard size={16} /> Reactivar suscripción</>
                )}
              </button>
            )}
          </div>

          {/* Cost Breakdown */}
          {costData && (
            <CostBreakdown
              data={costData.breakdown}
              monthlyCost={costData.monthlyCost}
              currency={costData.currency}
              rootTreeName={costData.breakdown?.rootTreeName}
            />
          )}

          {/* Stripe Connect Link */}
          <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
            <button
              onClick={() => navigate('/billing/payout')}
              className="btn btn-outline"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <ShieldCheck size={16} />
              <span>Configurar pagos (Stripe Connect)</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
