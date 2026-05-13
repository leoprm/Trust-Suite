import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, ExternalLink, Loader2, AlertCircle,
  CheckCircle2, XCircle, Clock, History,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

// ── Types ──────────────────────────────────────────────────────────────────

interface ConnectStatus {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  canAcceptPayments: boolean;
}

type PageState = 'loading' | 'ready' | 'error' | 'not_connected';

// ── Component ──────────────────────────────────────────────────────────────

export default function BillingPayout() {
  const navigate = useNavigate();
  const user = useAuthStore((state: any) => state.user);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const fetchStatus = async () => {
    setPageState('loading');
    setError('');
    try {
      const res = await api.get('/billing/connect-status');
      setStatus(res.data);
      setPageState('ready');
    } catch (err: any) {
      const msg = err?.response?.data?.error || '';
      if (err?.response?.status === 404 || msg.includes('No Stripe Connect')) {
        setPageState('not_connected');
      } else {
        setError(msg || 'Error al obtener estado de Stripe Connect');
        setPageState('error');
      }
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await api.post('/billing/connect-onboarding');
      const { url } = res.data;
      if (url) {
        window.location.href = url;
      } else {
        setError('No se recibió URL de onboarding de Stripe');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al conectar con Stripe');
    } finally {
      setConnecting(false);
    }
  };

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
          onClick={() => navigate('/billing')}
          className="btn btn-outline"
          style={{ padding: '0.4rem', width: '36px', height: '36px', minWidth: '36px' }}
          title="Volver a facturación"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>Stripe Connect</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Recibe pagos directamente en tu cuenta
          </p>
        </div>
      </div>

      {/* Loading */}
      {pageState === 'loading' && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Verificando conexión…</p>
        </div>
      )}

      {/* Error */}
      {pageState === 'error' && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
          <AlertCircle size={28} style={{ color: 'var(--accent-danger)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--accent-danger)', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</p>
          <button onClick={fetchStatus} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* Not connected */}
      {pageState === 'not_connected' && (
        <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem', textAlign: 'center' }}>
          <ShieldCheck size={40} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Conecta tu cuenta de Stripe</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Stripe Connect te permite recibir pagos automáticos por tu participación en árboles.
            Completa el proceso de onboarding para activar los cobros.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {connecting ? (
              <><Loader2 size={16} className="animate-spin" /> Conectando…</>
            ) : (
              <><ExternalLink size={16} /> Conectar Stripe</>
            )}
          </button>
          {error && (
            <p style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>
          )}
        </div>
      )}

      {/* Connected — Status */}
      {pageState === 'ready' && status && (
        <>
          <div className="glass-panel" style={{ padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: status.canAcceptPayments ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {status.canAcceptPayments
                  ? <CheckCircle2 size={22} style={{ color: 'var(--accent-success)' }} />
                  : <Clock size={22} style={{ color: 'var(--accent-warning)' }} />
                }
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>
                  {status.canAcceptPayments ? 'Listo para recibir pagos' : 'Onboarding en progreso'}
                </p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  ID: {status.stripeAccountId?.substring(0, 12)}…
                </p>
              </div>
            </div>

            {/* Status checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <StatusItem
                done={status.detailsSubmitted}
                label="Datos enviados"
                desc="Información personal y bancaria verificada"
              />
              <StatusItem
                done={status.chargesEnabled}
                label="Cobros habilitados"
                desc="Puedes recibir pagos de suscriptores"
              />
              <StatusItem
                done={status.payoutsEnabled}
                label="Pagos automáticos"
                desc="Los fondos se transfieren a tu cuenta bancaria"
              />
            </div>

            {/* Reconnect button */}
            {!status.canAcceptPayments && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="btn btn-outline"
                style={{ width: '100%', marginTop: '1.25rem' }}
              >
                {connecting ? (
                  <><Loader2 size={14} className="animate-spin" /> Conectando…</>
                ) : (
                  <><ExternalLink size={14} /> Completar onboarding</>
                )}
              </button>
            )}
          </div>

          {/* Payout history placeholder */}
          <div className="glass-panel" style={{ padding: isMobile ? '1.25rem' : '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <History size={18} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Historial de Pagos</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
              No hay pagos registrados aún. Los pagos aparecerán aquí una vez que comiences a recibir fondos.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusItem({ done, label, desc }: { done: boolean; label: string; desc: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.65rem',
      padding: '0.5rem 0',
    }}>
      {done
        ? <CheckCircle2 size={18} style={{ color: 'var(--accent-success)', marginTop: 1, flexShrink: 0 }} />
        : <XCircle size={18} style={{ color: 'var(--text-secondary)', marginTop: 1, flexShrink: 0, opacity: 0.5 }} />
      }
      <div>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.85rem', color: done ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {done ? desc : 'Pendiente'}
        </p>
      </div>
    </div>
  );
}
