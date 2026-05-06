import { useState, useEffect, useCallback } from 'react';
import {
  Telescope, Loader2, ChevronRight, CheckCircle,
  Activity, TrendingUp, Shield, ShieldAlert, ShieldOff,
  Users, Building2, Home,
} from 'lucide-react';
import api from '../lib/api';
import InsightPanel from '../components/InsightPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TreeInfo {
  id: string;
  name: string;
  role?: string;
}

interface InsightSummary {
  treeId: string;
  treeName: string;
  total: number;
  active: number;
  resolvedTotal: number;
  resolvedInternally: number;    // INTERNAL_SOLUTION_FOUND
  resolvedViaPeople: number;     // RESOLVED (from external people path)
  resolvedViaCorporate: number;  // CORPORATE_REFERRAL_SELECTED
  maturityPct: number;           // % resolved internally
  signals: any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Maturity level
// ─────────────────────────────────────────────────────────────────────────────

type MaturityTier = 'autosuficiente' | 'solido' | 'mixto' | 'dependiente' | 'sin_datos';

function getMaturityTier(pct: number, total: number): MaturityTier {
  if (total === 0) return 'sin_datos';
  if (pct >= 80) return 'autosuficiente';
  if (pct >= 60) return 'solido';
  if (pct >= 30) return 'mixto';
  return 'dependiente';
}

const MATURITY_CONFIG: Record<MaturityTier, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  autosuficiente: {
    label: 'Autosuficiente', icon: <Shield size={16} />,
    color: 'var(--accent-success, #10b981)',
    desc: 'Resuelve ≥80% de sus necesidades con capacidad interna.',
  },
  solido: {
    label: 'Sólido', icon: <ShieldAlert size={16} />,
    color: '#22c55e',
    desc: '≥60% interno. Buena capacidad, ocasionalmente necesita apoyo externo.',
  },
  mixto: {
    label: 'Mixto', icon: <ShieldAlert size={16} />,
    color: 'var(--accent-warning, #f59e0b)',
    desc: '≥30% interno. Depende regularmente de talento externo.',
  },
  dependiente: {
    label: 'Dependiente', icon: <ShieldOff size={16} />,
    color: 'var(--accent-danger, #ef4444)',
    desc: '<30% interno. La mayoría de necesidades se resuelven fuera del Tree.',
  },
  sin_datos: {
    label: 'Sin datos', icon: <Activity size={16} />,
    color: 'var(--text-secondary)',
    desc: 'Aún no hay señales resueltas para medir madurez.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Stats card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string;
}) {
  return (
    <div style={{
      background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 12,
      padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
      flex: '1 1 140px', minWidth: 0,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Maturity gauge bar (horizontal stacked)
// ─────────────────────────────────────────────────────────────────────────────

const GAUGE_COLORS: Record<string, string> = {
  internal: '#10b981',
  people: '#f59e0b',
  corporate: '#ef4444',
};

function MaturityGauge({ internal, people, corporate, total }: {
  internal: number; people: number; corporate: number; total: number;
}) {
  if (total === 0) {
    return <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>—</div>;
  }

  const pctInternal = Math.round((internal / total) * 100);
  const pctPeople = Math.round((people / total) * 100);
  const pctCorporate = Math.round((corporate / total) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {internal > 0 && (
          <div style={{ width: `${pctInternal}%`, background: GAUGE_COLORS.internal, transition: 'width 0.4s' }} />
        )}
        {people > 0 && (
          <div style={{ width: `${pctPeople}%`, background: GAUGE_COLORS.people, transition: 'width 0.4s' }} />
        )}
        {corporate > 0 && (
          <div style={{ width: `${pctCorporate}%`, background: GAUGE_COLORS.corporate, transition: 'width 0.4s' }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.65rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
        <span style={{ color: GAUGE_COLORS.internal }}>🏠 {pctInternal}% interno</span>
        <span style={{ color: GAUGE_COLORS.people }}>👤 {pctPeople}% personas</span>
        {pctCorporate > 0 && <span style={{ color: GAUGE_COLORS.corporate }}>🏢 {pctCorporate}% empresas</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function TrustInsightDashboard() {
  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [summaries, setSummaries] = useState<InsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedTreeName, setSelectedTreeName] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: treeData } = await api.get('/trees');
      const userTrees: TreeInfo[] = treeData?.trees ?? treeData ?? [];

      const results = await Promise.allSettled(
        userTrees.map(async (t: TreeInfo) => {
          const { data } = await api.get(`/trees/${t.id}/insights?limit=100`);
          const signals: any[] = data?.signals ?? [];

          const resolvedInternally = signals.filter((s: any) =>
            s.status === 'INTERNAL_SOLUTION_FOUND'
          ).length;
          const resolvedViaPeople = signals.filter((s: any) =>
            s.status === 'RESOLVED'
          ).length;
          const resolvedViaCorporate = signals.filter((s: any) =>
            s.status === 'CORPORATE_REFERRAL_SELECTED'
          ).length;
          const resolvedTotal = resolvedInternally + resolvedViaPeople + resolvedViaCorporate;

          return {
            treeId: t.id,
            treeName: t.name,
            total: data?.total ?? signals.length,
            active: signals.filter((s: any) =>
              ['ACTIVE', 'INTERNAL_SEARCH', 'EXTERNAL_PEOPLE_OPEN', 'EXTERNAL_PEOPLE_IN_REVIEW', 'CORPORATE_REFERRAL_OPEN'].includes(s.status)
            ).length,
            resolvedTotal,
            resolvedInternally,
            resolvedViaPeople,
            resolvedViaCorporate,
            maturityPct: resolvedTotal > 0 ? Math.round((resolvedInternally / resolvedTotal) * 100) : 0,
            signals,
          } as InsightSummary;
        })
      );

      const summaries: InsightSummary[] = results
        .filter((r): r is PromiseFulfilledResult<InsightSummary> => r.status === 'fulfilled')
        .map(r => r.value);

      setTrees(userTrees);
      setSummaries(summaries);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Error al cargar datos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Drilled into a specific tree ──
  if (selectedTreeId) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem 1.25rem' }}>
        <button
          onClick={() => { setSelectedTreeId(null); setSelectedTreeName(''); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent-primary)', fontSize: '0.82rem', padding: 0,
            display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem',
          }}
        >
          ← Volver al radar
        </button>
        <InsightPanel
          treeId={selectedTreeId}
          isAdmin={trees.find(t => t.id === selectedTreeId)?.role === 'ADMIN' ||
                     trees.find(t => t.id === selectedTreeId)?.role === 'CREATOR'}
        />
      </div>
    );
  }

  // ── Aggregate stats ──
  const totalSignals = summaries.reduce((a, s) => a + s.total, 0);
  const totalActive = summaries.reduce((a, s) => a + s.active, 0);
  const totalResolved = summaries.reduce((a, s) => a + s.resolvedTotal, 0);
  const totalInternal = summaries.reduce((a, s) => a + s.resolvedInternally, 0);
  const totalPeople = summaries.reduce((a, s) => a + s.resolvedViaPeople, 0);
  const totalCorporate = summaries.reduce((a, s) => a + s.resolvedViaCorporate, 0);
  const aggregateMaturityPct = totalResolved > 0 ? Math.round((totalInternal / totalResolved) * 100) : 0;
  const aggregateTier = getMaturityTier(aggregateMaturityPct, totalResolved);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem 1.25rem' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6366f1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Telescope size={26} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Trust Insight</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Radar de necesidades persistentes
            </div>
          </div>
        </div>
        <button
          onClick={fetchAll}
          style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 8, padding: '0.5rem 0.9rem', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: '0.8rem',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}
        >
          <Activity size={14} /> Actualizar
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={28} className="animate-spin" color="var(--text-secondary)" />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--accent-danger)' }}>{error}</div>
      ) : (
        <>
          {/* ── Stats row ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard icon={<Telescope size={18} />} label="Señales totales" value={totalSignals} color="var(--accent-primary)" />
            <StatCard icon={<Activity size={18} />} label="Activas" value={totalActive} color="var(--accent-warning, #f59e0b)" />
            <StatCard icon={<CheckCircle size={18} />} label="Resueltas" value={totalResolved} color="var(--accent-success, #10b981)" />
          </div>

          {/* ── Madurez agregada ── */}
          {totalResolved > 0 && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={16} color="var(--accent-primary)" />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Madurez agregada</span>
                </div>
                <span style={{
                  padding: '0.25rem 0.7rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700,
                  background: `${MATURITY_CONFIG[aggregateTier].color}22`,
                  color: MATURITY_CONFIG[aggregateTier].color,
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                }}>
                  {MATURITY_CONFIG[aggregateTier].icon}
                  {MATURITY_CONFIG[aggregateTier].label} · {aggregateMaturityPct}% interno
                </span>
              </div>
              <MaturityGauge
                internal={totalInternal}
                people={totalPeople}
                corporate={totalCorporate}
                total={totalResolved}
              />
            </div>
          )}

          {/* ── Per-tree breakdown ── */}
          {summaries.length === 0 ? (
            <div style={{
              textAlign: 'center', color: 'var(--text-secondary)',
              padding: '3rem', fontSize: '0.9rem',
            }}>
              <Telescope size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <div>No hay señales Insight en tus Trees.</div>
              <div style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>
                Las señales se crean desde necesidades persistentes dentro de cada Tree.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {summaries.length} Tree{summaries.length !== 1 ? 's' : ''}
              </div>
              {summaries.map(s => {
                const tier = getMaturityTier(s.maturityPct, s.resolvedTotal);
                const cfg = MATURITY_CONFIG[tier];

                return (
                  <div
                    key={s.treeId}
                    onClick={() => { setSelectedTreeId(s.treeId); setSelectedTreeName(s.treeName); }}
                    style={{
                      border: '1px solid var(--border-color)', borderRadius: 12,
                      padding: '1.1rem 1.25rem', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.015)', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
                  >
                    {/* Top row: name + tier badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', gap: '0.75rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                        <Home size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.treeName}</span>
                      </div>
                      <span style={{
                        padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                        background: `${cfg.color}22`, color: cfg.color,
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>

                    {/* Maturity gauge */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <MaturityGauge
                        internal={s.resolvedInternally}
                        people={s.resolvedViaPeople}
                        corporate={s.resolvedViaCorporate}
                        total={s.resolvedTotal}
                      />
                    </div>

                    {/* Bottom row: counts + drill */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        <span>{s.total} señales</span>
                        {s.active > 0 && <span style={{ color: 'var(--accent-warning, #f59e0b)', fontWeight: 600 }}>{s.active} activas</span>}
                        {s.resolvedTotal > 0 && <span style={{ color: 'var(--accent-success, #10b981)' }}>{s.resolvedTotal} resueltas</span>}
                      </div>
                      <ChevronRight size={15} color="var(--text-secondary)" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
