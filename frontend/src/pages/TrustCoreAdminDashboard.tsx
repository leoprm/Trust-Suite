import { useState, useEffect } from 'react';
import { Shield, Activity, Wallet, Trees, Users, TrendingUp, Power, PowerOff, Settings, Loader2, AlertCircle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';

interface TreeData {
  treeId: string;
  name: string;
  isActive: boolean;
  balanceClp: number;
  maintenanceCost: number;
  maintenanceShare: number;
  growthShare: number;
  totalFeesCollected: number;
}

interface DashboardData {
  currentFeePercent: number;
  totalFeesCollectedAllTime: number;
  totalFeesThisMonth: number;
  activeTrustCoreTrees: number;
  totalTransactionsWithFee: number;
  systemMetrics: {
    totalActiveUsers: number;
    monthlyVolumeClp: number;
    activeTrees: number;
  };
  trees: TreeData[];
}

interface GlobalConfig {
  id: string;
  baseMaintenanceCostClp: number;
  growthFactor: number;
  minFeePercent: number;
  maxFeePercent: number;
  currentFeePercent: number;
  maintenanceComponent: number;
  growthComponent: number;
  recalculationIntervalHours: number;
  lastRecalculatedAt: string | null;
}

function fmtClp(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(20, 20, 45, 0.5)',
  backdropFilter: 'blur(12px)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-color)',
  padding: '1.5rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  borderRadius: 6,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.8rem',
  fontFamily: 'Inter, sans-serif',
};

export default function TrustCoreAdminDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState('');

  // Config editor
  const [showConfig, setShowConfig] = useState(false);
  const [editConfig, setEditConfig] = useState<Partial<GlobalConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tree action
  const [actionLoading, setActionLoading] = useState<string>('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    setConfigLoading(true);
    setError('');
    try {
      const [dashRes, configRes] = await Promise.all([
        api.get('/admin/trustcore/dashboard'),
        api.get('/admin/trustcore/config'),
      ]);
      setDashboard(dashRes.data);
      setGlobalConfig(configRes.data.config);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar dashboard. ¿Eres server admin?');
    } finally {
      setLoading(false);
      setConfigLoading(false);
    }
  };

  const handleToggleTree = async (treeId: string, activate: boolean) => {
    setActionLoading(treeId);
    try {
      if (activate) {
        await api.post(`/admin/trustcore/${treeId}/activate`);
      } else {
        await api.post(`/admin/trustcore/${treeId}/deactivate`);
      }
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al cambiar estado del árbol');
    } finally {
      setActionLoading('');
    }
  };

  const openConfigEditor = () => {
    if (!globalConfig) return;
    setEditConfig({ ...globalConfig });
    setConfigMsg(null);
    setShowConfig(true);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigMsg(null);
    try {
      const { data } = await api.put('/admin/trustcore/config', editConfig);
      setGlobalConfig(data.config);
      setConfigMsg({ type: 'success', text: 'Configuración global guardada.' });
      setTimeout(() => setConfigMsg(null), 3000);
    } catch (err: any) {
      setConfigMsg({ type: 'error', text: err?.response?.data?.error || 'Error al guardar' });
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '4rem', gap: '0.75rem', color: 'var(--text-secondary)' }}>
        <Loader2 className="animate-spin" size={28} />
        Cargando dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '4rem', gap: '1rem' }}>
        <AlertCircle size={48} color="#ef4444" />
        <p style={{ color: '#f87171', fontSize: '1rem', textAlign: 'center', maxWidth: 400 }}>{error}</p>
        <button onClick={fetchAll} style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.85rem' }}>Reintentar</button>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={28} color="#a78bfa" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>TrustCore Admin Dashboard</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Panel de administración del Fee Protocol</p>
          </div>
        </div>
        <button
          onClick={openConfigEditor}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: 8, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
        >
          <Settings size={16} /> Configurar fees
        </button>
      </div>

      {/* ── Global Fee Card ── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Activity size={18} color="#a78bfa" /> Fee Actual del Sistema
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <MiniStat label="Fee Actual" value={fmtPct(dashboard.currentFeePercent)} color="#a78bfa" />
          <MiniStat label="Fees Totales (histórico)" value={fmtClp(dashboard.totalFeesCollectedAllTime)} color="#60a5fa" />
          <MiniStat label="Fees Este Mes" value={fmtClp(dashboard.totalFeesThisMonth)} color="#34d399" />
          <MiniStat label="Transacciones con Fee" value={dashboard.totalTransactionsWithFee.toLocaleString('es-CL')} color="#fbbf24" />
        </div>
      </div>

      {/* ── System Metrics ── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <TrendingUp size={18} color="#60a5fa" /> Métricas del Sistema
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <MiniStat label="Usuarios Activos" value={dashboard.systemMetrics.totalActiveUsers.toLocaleString('es-CL')} color="#60a5fa" icon={<Users size={14} />} />
          <MiniStat label="Árboles Totales" value={dashboard.systemMetrics.activeTrees.toString()} color="#34d399" icon={<Trees size={14} />} />
          <MiniStat label="Volumen Mensual" value={fmtClp(dashboard.systemMetrics.monthlyVolumeClp)} color="#fbbf24" icon={<Wallet size={14} />} />
          <MiniStat label="Árboles TrustCore Activos" value={dashboard.activeTrustCoreTrees.toString()} color="#a78bfa" icon={<Shield size={14} />} />
        </div>
      </div>

      {/* ── Tree Table ── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Trees size={18} color="#34d399" /> Árboles TrustCore
        </h3>

        {dashboard.trees.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
            No hay árboles TrustCore registrados.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={thStyle}>Árbol</th>
                  <th style={thStyle}>Estado</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Costo/mes</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Mantención</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Crecimiento</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total Fees</th>
                  <th style={thStyle}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.trees.map((t) => (
                  <tr key={t.treeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '100px',
                        background: t.isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        color: t.isActive ? '#22c55e' : '#f87171',
                      }}>
                        {t.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#a78bfa' }}>{fmtClp(t.balanceClp)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{fmtClp(t.maintenanceCost)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{Math.round(t.maintenanceShare * 100)}%</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{Math.round(t.growthShare * 100)}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{fmtClp(t.totalFeesCollected)}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleToggleTree(t.treeId, !t.isActive)}
                        disabled={actionLoading === t.treeId}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                          padding: '0.3rem 0.65rem', borderRadius: 6,
                          background: t.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                          border: `1px solid ${t.isActive ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                          color: t.isActive ? '#fca5a5' : '#4ade80',
                          cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                          opacity: actionLoading === t.treeId ? 0.6 : 1,
                        }}
                      >
                        {actionLoading === t.treeId ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : t.isActive ? (
                          <PowerOff size={12} />
                        ) : (
                          <Power size={12} />
                        )}
                        {t.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Config Editor Modal ── */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowConfig(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              style={{ ...cardStyle, maxWidth: 550, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={20} color="#a78bfa" /> Configuración Global de Fees
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <ConfigField label="Fee Mínimo (%)" value={editConfig.minFeePercent} onChange={(v) => setEditConfig({ ...editConfig, minFeePercent: v })} step={0.1} />
                <ConfigField label="Fee Máximo (%)" value={editConfig.maxFeePercent} onChange={(v) => setEditConfig({ ...editConfig, maxFeePercent: v })} step={0.1} />
                <ConfigField label="Costo Base Mantención (CLP)" value={editConfig.baseMaintenanceCostClp} onChange={(v) => setEditConfig({ ...editConfig, baseMaintenanceCostClp: v })} step={10000} />
                <ConfigField label="Factor de Crecimiento (0-1)" value={editConfig.growthFactor} onChange={(v) => setEditConfig({ ...editConfig, growthFactor: v })} step={0.01} min={0} max={1} />
                <ConfigField label="Intervalo Recalculo (horas)" value={editConfig.recalculationIntervalHours} onChange={(v) => setEditConfig({ ...editConfig, recalculationIntervalHours: v })} step={1} min={1} max={168} />

                {/* Current fee (read-only-ish but editable for overrides) */}
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Fee Actual (%)</label>
                  <input type="number" step={0.01} value={editConfig.currentFeePercent ?? ''} onChange={(e) => setEditConfig({ ...editConfig, currentFeePercent: parseFloat(e.target.value) })}
                    style={inputStyle} />
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>Recalculado automáticamente por el cron</span>
                </div>

                {/* Component breakdown (read-only for reference) */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.75rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Componentes actuales</div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                    <span>Mantención: <strong style={{ color: '#fbbf24' }}>{fmtPct(globalConfig?.maintenanceComponent || 0)}</strong></span>
                    <span>Crecimiento: <strong style={{ color: '#34d399' }}>{fmtPct(globalConfig?.growthComponent || 0)}</strong></span>
                  </div>
                  {globalConfig?.lastRecalculatedAt && (
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                      Último recalculo: {new Date(globalConfig.lastRecalculatedAt).toLocaleString('es-CL')}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              {configMsg && (
                <div style={{
                  marginTop: '1rem', padding: '0.6rem 0.8rem', borderRadius: 6, fontSize: '0.78rem',
                  background: configMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${configMsg.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: configMsg.type === 'success' ? '#4ade80' : '#fca5a5',
                }}>
                  {configMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button onClick={() => setShowConfig(false)}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancelar
                </button>
                <button onClick={handleSaveConfig} disabled={savingConfig}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: 8, background: 'var(--accent-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', opacity: savingConfig ? 0.7 : 1 }}>
                  {savingConfig ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.75rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.65rem 0.75rem',
  whiteSpace: 'nowrap',
};

function MiniStat({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border-color)', padding: '0.85rem 1rem' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ConfigField({ label, value, onChange, step, min, max }: { label: string; value?: number; onChange: (v: number) => void; step: number; min?: number; max?: number }) {
  return (
    <div>
      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>{label}</label>
      <input type="number" step={step} min={min} max={max} value={value ?? ''} onChange={(e) => onChange(parseFloat(e.target.value))} style={inputStyle} />
    </div>
  );
}
