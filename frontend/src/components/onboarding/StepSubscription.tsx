import { useState, useEffect } from 'react';
import { CreditCard, Loader2, AlertCircle, ArrowRight, SkipForward } from 'lucide-react';
import api from '../../lib/api';

interface Props { onNext: () => void; onSkip: () => void; }

export default function StepSubscription({ onNext, onSkip }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [costData, setCostData] = useState<{ monthlyCost: number; currency: string } | null>(null);

  useEffect(() => {
    (async () => {
      try { const res = await api.get('/billing/current-cost'); setCostData(res.data); }
      catch (err: any) { setError(err?.response?.data?.error || 'Error al cargar costo'); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSubscribe = async () => {
    setActionLoading(true); setError('');
    try {
      const res = await api.post('/billing/create-checkout', {});
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
      else { setError('No se recibió URL de checkout'); setActionLoading(false); }
    } catch (err: any) { setError(err?.response?.data?.error || 'Error al iniciar suscripción'); setActionLoading(false); }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <CreditCard size={22} style={{ color: 'var(--accent-primary)' }} />
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Suscripción</h3>
      </div>
      {loading && <div style={{ textAlign: 'center', padding: '2rem 0' }}><Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }} /><p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Consultando costo…</p></div>}
      {error && !loading && <div style={{ textAlign: 'center', padding: '1.5rem 0' }}><AlertCircle size={24} style={{ color: 'var(--accent-danger)', marginBottom: '0.5rem' }} /><p style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p></div>}
      {costData && !loading && (<>
        <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(59,130,246,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.15)', marginBottom: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Costo mensual del sistema</p>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: costData.currency }).format(costData.monthlyCost)}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/mes</span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.5rem' }}>Incluye infraestructura, IA, y crecimiento de la plataforma</p>
        </div>
        <button onClick={handleSubscribe} disabled={actionLoading} className="btn btn-primary" style={{ width: '100%', marginBottom: '0.75rem' }}>
          {actionLoading ? <><Loader2 size={16} className="animate-spin" /> Procesando…</> : <><CreditCard size={16} /> Suscribirme</>}
        </button>
        <button onClick={onNext} className="btn btn-outline" style={{ width: '100%', marginBottom: '0.75rem' }}><ArrowRight size={16} /> Ya me suscribí</button>
      </>)}
      <button onClick={onSkip} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
        <SkipForward size={14} /> Omitir por ahora
      </button>
    </div>
  );
}
