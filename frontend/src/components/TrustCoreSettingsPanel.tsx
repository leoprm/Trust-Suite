import { useState, useEffect } from 'react';
import { Shield, ToggleLeft, ToggleRight, Sliders, Save, Wallet, Loader2, AlertCircle, CheckCircle2, ArrowUpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';

type Props = {
  treeId: string;
  tree: any;
  isTreeAdmin: boolean;
};

type Stats = {
  treeId: string;
  treeName: string;
  isTrustCore: boolean;
  isActive: boolean;
  trustCoreBalanceClp: number;
  totalFeesCollected: number;
  totalFeesDistributed: number;
  maintenanceShare: number;
  growthShare: number;
  monthlyMaintenanceCost: number;
  feesThisMonth: number;
  distributionCount: number;
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 45, 0.5)',
  backdropFilter: 'blur(12px)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.8rem',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  fontFamily: 'Inter, sans-serif',
};

function fmtClp(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);
}

export default function TrustCoreSettingsPanel({ treeId, tree, isTreeAdmin }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Config form
  const [maintenanceShare, setMaintenanceShare] = useState(70);
  const [monthlyCost, setMonthlyCost] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => { fetchStats(); }, [treeId]);

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/trees/${treeId}/trustcore/stats`);
      setStats(data);
      setMaintenanceShare(Math.round(data.maintenanceShare * 100));
      setMonthlyCost(data.monthlyMaintenanceCost?.toString() || '');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar estadísticas TrustCore');
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setActionError('');
    setActionSuccess('');
  };

  const handleOptIn = async () => {
    clearMessages();
    setActionLoading('optIn');
    try {
      await api.patch(`/trees/${treeId}/trustcore/opt-in`);
      setActionSuccess('Árbol registrado como TrustCore. Esperando activación del servidor.');
      await fetchStats();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Error al activar TrustCore');
    } finally {
      setActionLoading('');
    }
  };

  const handleOptOut = async () => {
    if (!confirm('¿Desactivar TrustCore? Solo es posible si el balance es $0.')) return;
    clearMessages();
    setActionLoading('optOut');
    try {
      await api.patch(`/trees/${treeId}/trustcore/opt-out`);
      setActionSuccess('TrustCore desactivado.');
      await fetchStats();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Error al desactivar TrustCore');
    } finally {
      setActionLoading('');
    }
  };

  const handleSaveConfig = async () => {
    clearMessages();
    const mShare = maintenanceShare / 100;
    const gShare = 1 - mShare;

    setActionLoading('config');
    try {
      await api.patch(`/trees/${treeId}/trustcore/config`, {
        maintenanceShare: mShare,
        growthShare: gShare,
        monthlyMaintenanceCost: monthlyCost ? parseFloat(monthlyCost) : undefined,
      });
      setActionSuccess('Configuración guardada.');
      await fetchStats();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Error al guardar configuración');
    } finally {
      setActionLoading('');
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0 || amount > (stats?.trustCoreBalanceClp || 0)) {
      setActionError('Monto inválido o excede el balance disponible.');
      return;
    }
    if (!confirm(`¿Retirar ${fmtClp(amount)} del balance TrustCore?`)) return;
    clearMessages();
    setActionLoading('withdraw');
    try {
      await api.post(`/trees/${treeId}/trustcore/withdraw`, { amount, description: 'Retiro TrustCore' });
      setActionSuccess(`Retiro exitoso: ${fmtClp(amount)}`);
      setWithdrawAmount('');
      await fetchStats();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Error al retirar fondos');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem', color: 'var(--text-secondary)' }}>
          <Loader2 className="animate-spin" size={22} />
          Cargando TrustCore...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '2rem', color: 'var(--accent-danger)' }}>
          <AlertCircle size={36} />
          <span>{error}</span>
          <button onClick={fetchStats} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, color: '#a78bfa', padding: '0.35rem 0.9rem', cursor: 'pointer', fontSize: '0.8rem' }}>Reintentar</button>
        </div>
      </div>
    );
  }

  const isTrustCore = stats?.isTrustCore || tree?.isTrustCore;
  const isActive = stats?.isActive;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Header card ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: isTrustCore ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={22} color={isTrustCore ? '#a78bfa' : 'var(--text-secondary)'} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>TrustCore Fee Protocol</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {isTrustCore
                  ? isActive ? 'Activo — recibiendo fees del ecosistema' : 'Pendiente de activación por el servidor'
                  : 'Inactivo — este árbol no es TrustCore'}
              </p>
            </div>
          </div>
          {/* Status badge */}
          <span style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '0.25rem 0.75rem', borderRadius: '100px',
            background: isActive ? 'rgba(34,197,94,0.15)' : isTrustCore ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
            color: isActive ? '#22c55e' : isTrustCore ? '#f59e0b' : 'var(--text-secondary)',
            border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : isTrustCore ? 'rgba(245,158,11,0.3)' : 'var(--border-color)'}`,
          }}>
            {isActive ? '● Activo' : isTrustCore ? '◐ Pendiente' : '○ Inactivo'}
          </span>
        </div>

        {/* Stats grid */}
        {isTrustCore && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <StatBox label="Balance" value={fmtClp(stats.trustCoreBalanceClp)} color="#a78bfa" />
            <StatBox label="Fees Acumulados" value={fmtClp(stats.totalFeesCollected)} color="#60a5fa" />
            <StatBox label="Fees Este Mes" value={fmtClp(stats.feesThisMonth)} color="#34d399" />
            <StatBox label="Distribuciones" value={stats.distributionCount.toLocaleString('es-CL')} color="#fbbf24" />
          </div>
        )}

        {/* Toggle button (tree creator only) */}
        {isTreeAdmin && tree?.creatorId && (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            {!isTrustCore ? (
              <button
                onClick={handleOptIn}
                disabled={actionLoading === 'optIn'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.65rem 1.25rem', borderRadius: 8,
                  background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                  color: '#c4b5fd', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                  opacity: actionLoading === 'optIn' ? 0.7 : 1,
                }}
              >
                {actionLoading === 'optIn' ? <Loader2 size={18} className="animate-spin" /> : <ToggleRight size={18} />}
                Activar TrustCore
              </button>
            ) : (
              <button
                onClick={handleOptOut}
                disabled={actionLoading === 'optOut'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  color: '#fca5a5', cursor: 'pointer', fontSize: '0.78rem',
                  opacity: actionLoading === 'optOut' ? 0.7 : 1,
                }}
              >
                {actionLoading === 'optOut' ? <Loader2 size={16} className="animate-spin" /> : <ToggleLeft size={16} />}
                Desactivar TrustCore
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Configuration card (tree admins, when TrustCore) ── */}
      {isTrustCore && isTreeAdmin && (
        <div style={cardStyle}>
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Sliders size={18} color="#a78bfa" /> Configuración de distribución
          </h4>

          {/* Maintenance/Growth slider */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Mantención: <strong style={{ color: '#fbbf24' }}>{maintenanceShare}%</strong></span>
              <span>Crecimiento: <strong style={{ color: '#34d399' }}>{100 - maintenanceShare}%</strong></span>
            </label>
            <input
              type="range"
              min={10}
              max={90}
              value={maintenanceShare}
              onChange={(e) => setMaintenanceShare(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
            />
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
              Mantención cubre costos fijos. Crecimiento financia expansión del ecosistema.
            </p>
          </div>

          {/* Monthly maintenance cost */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
              Costo Mensual Declarado (CLP)
            </label>
            <input
              type="number"
              placeholder="Ej: 300000"
              value={monthlyCost}
              onChange={(e) => setMonthlyCost(e.target.value)}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
              Declara el costo real de tu infraestructura. Esto influye en tu proporción de fees.
            </p>
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={actionLoading === 'config'}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.65rem 1.25rem', borderRadius: 8,
              background: 'var(--accent-primary)', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              opacity: actionLoading === 'config' ? 0.7 : 1,
            }}
          >
            {actionLoading === 'config' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Guardar configuración
          </button>
        </div>
      )}

      {/* ── Withdraw card (tree admins, when has balance) ── */}
      {isTrustCore && isTreeAdmin && stats && stats.trustCoreBalanceClp > 0 && (
        <div style={cardStyle}>
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowUpCircle size={18} color="#f59e0b" /> Retirar fondos
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Balance disponible: <strong style={{ color: '#a78bfa' }}>{fmtClp(stats.trustCoreBalanceClp)}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                placeholder="Monto a retirar"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                style={inputStyle}
                min={1}
                max={stats.trustCoreBalanceClp}
              />
            </div>
            <button
              onClick={handleWithdraw}
              disabled={actionLoading === 'withdraw' || !withdrawAmount}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.65rem 1.25rem', borderRadius: 8,
                background: 'var(--accent-warning)', border: 'none',
                color: '#000', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                opacity: actionLoading === 'withdraw' ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {actionLoading === 'withdraw' ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}
              Retirar
            </button>
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <AnimatePresence>
        {actionError && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#fca5a5' }}>
            <AlertCircle size={18} /> {actionError}
          </motion.div>
        )}
        {actionSuccess && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#4ade80' }}>
            <CheckCircle2 size={18} /> {actionSuccess}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border-color)', padding: '0.75rem 1rem' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
