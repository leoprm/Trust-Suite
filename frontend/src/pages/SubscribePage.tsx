import { useEffect, useState } from 'react';
import { CreditCard, Loader2, AlertCircle, Server, Brain, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';

interface CostData {
  monthlyCost: number;
  currency: string;
  breakdown: { infraCost: number; aiCost: number; growthPct: number; totalUsers: number };
}

function fmt(n: number, c: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: c, minimumFractionDigits: 0 }).format(n);
}

export default function SubscribePage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get('/billing/current-cost'); setCostData(data); }
      catch { setError('No se pudo cargar la información de costos'); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSubscribe = async () => {
    if (!isAuthenticated) { navigate('/login?redirect=/subscribe'); return; }
    setActionLoading(true); setError('');
    try {
      const res = await api.post('/billing/create-checkout', {});
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
      else { setError('No se recibió URL de checkout'); setActionLoading(false); }
    } catch (err: any) { setError(err?.response?.data?.error || 'Error al iniciar suscripción'); setActionLoading(false); }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: isMobile ? '1.5rem' : '3rem 2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, margin: '0 0 0.5rem' }}>Suscribite a Trust Maker</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>Accedé a todas las funcionalidades y contribuí al crecimiento de la plataforma.</p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}><Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }} /><p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Consultando costo…</p></div>
        ) : error && !costData ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}><AlertCircle size={24} style={{ color: 'var(--accent-danger)', marginBottom: '0.5rem' }} /><p style={{ color: 'var(--accent-danger)', fontSize: '0.85rem' }}>{error}</p></div>
        ) : costData ? (<>
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(139,92,246,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(139,92,246,0.15)', marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Costo mensual</p>
            <span style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>{fmt(costData.monthlyCost, costData.currency)}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/mes</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
            <Row icon={<Server size={16} />} label="Infraestructura" amount={fmt(costData.breakdown.infraCost, costData.currency)} />
            <Row icon={<Brain size={16} />} label="Inteligencia Artificial" amount={fmt(costData.breakdown.aiCost, costData.currency)} />
            <Row icon={<TrendingUp size={16} />} label={`Crecimiento (${costData.breakdown.growthPct}%)`} amount={fmt(Math.round((costData.breakdown.infraCost + costData.breakdown.aiCost) * (costData.breakdown.growthPct / 100)), costData.currency)} />
            <Row icon={<Users size={16} />} label={`Entre ${costData.breakdown.totalUsers} usuarios`} amount={`${fmt(costData.monthlyCost, costData.currency)}/usuario`} />
          </div>
          <button onClick={handleSubscribe} disabled={actionLoading} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
            {actionLoading ? <><Loader2 size={16} className="animate-spin" /> Redirigiendo…</> : <><CreditCard size={16} /> Suscribirme</>}
          </button>
          {error && costData && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-danger)', fontSize: '0.8rem' }}><AlertCircle size={14} /> {error}</div>}
        </>) : null}
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
          ¿Ya tenés cuenta? <span onClick={() => navigate('/login')} style={{ color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline' }}>Iniciá sesión</span>
        </p>
      </div>
    </div>
  );
}

function Row({ icon, label, amount }: { icon: React.ReactNode; label: string; amount: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: 'var(--text-secondary)' }}>{icon}</span><span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span></div>
      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{amount}</span>
    </div>
  );
}
