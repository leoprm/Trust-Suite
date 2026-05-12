import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Telescope, Loader2, ChevronRight, ChevronDown, ChevronUp,
  Activity, TrendingUp, Shield, ShieldAlert, ShieldOff,
  Users, Building2, Home, Trees, DollarSign, Smile,
  TrendingDown, BarChart3, Radar, Filter, Globe, Network,
  ArrowUpDown, ExternalLink, Eye, EyeOff, PlusCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import api from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TreeHealth {
  fiatMonthlyProfit: number;
  inversionPct: number;
  satisfaction: number | null;
}

interface TreeRelation {
  id: string;
  sourceTreeId: string;
  targetTreeId: string;
  sourceTreeName: string;
  targetTreeName: string;
  relationType: string;
  socialDistanceCategory: string;
}

interface HistoryPoint {
  name: string;
  profit: number;
  investment: number;
  satisfaction: number | null;
}

interface EnrichedTree {
  id: string;
  name: string;
  role: string;
  _count: { members: number };
  healthData: TreeHealth;
  treeRelations: TreeRelation[];
  history: Record<string, HistoryPoint[]>;
  visibility?: string;
  admissionPolicy?: string;
  updatedAt?: string;
  createdAt?: string;
}

type SortField = 'name' | 'members' | 'profit' | 'inversion' | 'satisfaction' | 'activity';
type SortDir = 'asc' | 'desc';

type TrendBadge = 'creciendo' | 'estable' | 'declive';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCLP(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function getTrendBadge(profit: number): TrendBadge {
  if (profit > 100) return 'creciendo';
  if (profit < -100) return 'declive';
  return 'estable';
}

const TREND_CONFIG: Record<TrendBadge, { label: string; icon: React.ReactNode; color: string }> = {
  creciendo: { label: 'Creciendo', icon: <TrendingUp size={12} />, color: '#10b981' },
  estable: { label: 'Estable', icon: <Activity size={12} />, color: '#f59e0b' },
  declive: { label: 'En declive', icon: <TrendingDown size={12} />, color: '#ef4444' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, suffix, color }: {
  icon: React.ReactNode; label: string; value: string; suffix?: string; color: string;
}) {
  return (
    <div className="glass-panel" style={{
      padding: '1.15rem 1.25rem', borderRadius: 14,
      display: 'flex', alignItems: 'center', gap: '0.9rem',
      flex: '1 1 180px', minWidth: 0,
      border: `1px solid ${color}33`,
      background: `linear-gradient(135deg, ${color}11 0%, ${color}08 100%)`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${color}33 0%, ${color}18 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '1.55rem', fontWeight: 800, color, lineHeight: 1.1 }}>
          {value}
          {suffix && <span style={{ fontSize: '0.8rem', fontWeight: 600, marginLeft: 2 }}>{suffix}</span>}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({ height = 100 }: { height?: number }) {
  return (
    <div style={{
      height, borderRadius: 12,
      background: 'var(--bg-secondary)',
      animation: 'pulse 1.5s ease-in-out infinite',
      border: '1px solid var(--border-color)',
      opacity: 0.5,
    }} />
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '4rem 2rem',
      color: 'var(--text-secondary)',
    }}>
      <Trees size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
      <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        No tienes árboles aún
      </div>
      <div style={{ fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        Crea tu primer árbol para empezar a ver métricas agregadas.
      </div>
      <a href="/trees/new" style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.6rem 1.2rem', borderRadius: 10,
        background: 'var(--accent-primary)', color: '#fff',
        fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
      }}>
        <PlusCircle size={16} /> Crear mi primer árbol
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Federation section
// ─────────────────────────────────────────────────────────────────────────────

function FederationSection({ relations, trees }: { relations: TreeRelation[]; trees: EnrichedTree[] }) {
  if (relations.length === 0) return null;

  // Group relations by partner tree
  const partnerMap = new Map<string, { relations: TreeRelation[]; name: string }>();
  for (const rel of relations) {
    const partnerId = rel.sourceTreeId === trees[0]?.id ? rel.targetTreeId : rel.sourceTreeId;
    const partnerName = rel.sourceTreeId === trees[0]?.id ? rel.targetTreeName : rel.sourceTreeName;
    if (!partnerMap.has(partnerId)) {
      partnerMap.set(partnerId, { relations: [], name: partnerName });
    }
    partnerMap.get(partnerId)!.relations.push(rel);
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        marginBottom: '0.75rem',
      }}>
        <Network size={16} color="var(--accent-primary)" />
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Federaciones</span>
        <span style={{
          fontSize: '0.7rem', color: 'var(--text-secondary)',
          background: 'var(--bg-secondary)', padding: '0.15rem 0.55rem', borderRadius: 10,
        }}>
          {relations.length} relación{relations.length !== 1 ? 'es' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {Array.from(partnerMap.entries()).map(([partnerId, data]) => (
          <div key={partnerId} className="glass-panel" style={{
            padding: '0.65rem 1rem', borderRadius: 10,
            fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
            border: '1px solid var(--border-color)',
          }}>
            <Globe size={14} color="var(--accent-primary)" />
            <span style={{ fontWeight: 600 }}>{data.name}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
              {data.relations.map(r => r.relationType.replace(/_/g, ' ')).join(', ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparative table
// ─────────────────────────────────────────────────────────────────────────────

function TreeTable({
  trees, sortField, sortDir, onSort, onSelectTree,
}: {
  trees: EnrichedTree[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelectTree: (tree: EnrichedTree) => void;
}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [mobile, setMobile] = useState(isMobile);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sortedTrees = useMemo(() => {
    return [...trees].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'members': return dir * ((a._count?.members ?? 0) - (b._count?.members ?? 0));
        case 'profit': return dir * ((a.healthData?.fiatMonthlyProfit ?? 0) - (b.healthData?.fiatMonthlyProfit ?? 0));
        case 'inversion': return dir * ((a.healthData?.inversionPct ?? 0) - (b.healthData?.inversionPct ?? 0));
        case 'satisfaction': return dir * ((a.healthData?.satisfaction ?? 0) - (b.healthData?.satisfaction ?? 0));
        case 'activity': return dir * ((a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));
        default: return 0;
      }
    });
  }, [trees, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} color="var(--text-secondary)" opacity={0.4} />;
    return sortDir === 'asc' ? <ChevronUp size={14} color="var(--accent-primary)" /> : <ChevronDown size={14} color="var(--accent-primary)" />;
  };

  const columns: { field: SortField; label: string; width?: string }[] = [
    { field: 'name', label: 'Nombre', width: 'auto' },
    { field: 'members', label: 'Miembros', width: '90px' },
    { field: 'profit', label: 'Profit', width: '110px' },
    { field: 'inversion', label: 'Inversión%', width: '95px' },
    { field: 'satisfaction', label: 'Satisfacción', width: '105px' },
    { field: 'activity', label: 'Actividad', width: '100px' },
  ];

  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sortedTrees.map(tree => {
          const trend = getTrendBadge(tree.healthData?.fiatMonthlyProfit ?? 0);
          const tcfg = TREND_CONFIG[trend];
          return (
            <div
              key={tree.id}
              onClick={() => onSelectTree(tree)}
              className="glass-panel"
              style={{
                padding: '0.85rem 1rem', borderRadius: 12, cursor: 'pointer',
                border: '1px solid var(--border-color)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Home size={14} color="var(--text-secondary)" />
                  {tree.name}
                </div>
                <span style={{
                  padding: '0.15rem 0.5rem', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                  background: `${tcfg.color}22`, color: tcfg.color,
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                }}>
                  {tcfg.icon} {tcfg.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                <span><Users size={12} style={{ marginRight: 3 }} />{tree._count?.members ?? 0}</span>
                <span style={{ color: (tree.healthData?.fiatMonthlyProfit ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatCLP(tree.healthData?.fiatMonthlyProfit ?? 0)}
                </span>
                <span>{tree.healthData?.inversionPct ?? 0}% inv.</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
            {columns.map(col => (
              <th
                key={col.field}
                onClick={() => onSort(col.field)}
                style={{
                  padding: '0.6rem 0.7rem', textAlign: 'left',
                  fontWeight: 600, color: 'var(--text-secondary)',
                  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  width: col.width,
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {col.label} <SortIcon field={col.field} />
                </div>
              </th>
            ))}
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {sortedTrees.map(tree => {
            const trend = getTrendBadge(tree.healthData?.fiatMonthlyProfit ?? 0);
            const tcfg = TREND_CONFIG[trend];
            const sat = tree.healthData?.satisfaction;
            return (
              <tr
                key={tree.id}
                onClick={() => onSelectTree(tree)}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={{ padding: '0.65rem 0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Home size={14} color="var(--text-secondary)" />
                  {tree.name}
                </td>
                <td style={{ padding: '0.65rem 0.7rem', color: 'var(--text-secondary)' }}>
                  <Users size={12} style={{ marginRight: 4 }} />
                  {tree._count?.members ?? 0}
                </td>
                <td style={{
                  padding: '0.65rem 0.7rem', fontWeight: 700,
                  color: (tree.healthData?.fiatMonthlyProfit ?? 0) >= 0 ? '#10b981' : '#ef4444',
                }}>
                  {formatCLP(tree.healthData?.fiatMonthlyProfit ?? 0)}
                </td>
                <td style={{ padding: '0.65rem 0.7rem' }}>
                  {tree.healthData?.inversionPct ?? 0}%
                </td>
                <td style={{ padding: '0.65rem 0.7rem' }}>
                  {sat !== null ? (
                    <span style={{
                      color: sat >= 0.8 ? '#10b981' : sat >= 0.5 ? '#f59e0b' : '#ef4444',
                    }}>
                      {Math.round(sat * 100)}%
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '0.65rem 0.7rem' }}>
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                    background: `${tcfg.color}22`, color: tcfg.color,
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  }}>
                    {tcfg.icon} {tcfg.label}
                  </span>
                </td>
                <td style={{ padding: '0.65rem 0.3rem' }}>
                  <ExternalLink size={14} color="var(--text-secondary)" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart section
// ─────────────────────────────────────────────────────────────────────────────

type ChartTab = 'comparativa' | 'tendencias' | 'radar';

function ChartSection({ trees, filter }: { trees: EnrichedTree[]; filter: string }) {
  const [tab, setTab] = useState<ChartTab>('comparativa');

  const barData = useMemo(() => {
    return trees
      .filter(t => t.healthData)
      .map(t => ({
        name: t.name.length > 18 ? t.name.slice(0, 16) + '…' : t.name,
        profit: Number((t.healthData.fiatMonthlyProfit ?? 0).toFixed(0)),
        miembros: t._count?.members ?? 0,
        inversión: t.healthData.inversionPct ?? 0,
        satisfacción: t.healthData.satisfaction !== null ? Math.round(t.healthData.satisfaction * 100) : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [trees]);

  const trendData = useMemo(() => {
    if (trees.length === 0) return [];
    // Use the first tree's history as a combined trend (monthly)
    const firstTree = trees[0];
    if (!firstTree?.history?.['1M']) return [];
    return firstTree.history['1M'];
  }, [trees]);

  const tabs: { key: ChartTab; label: string; icon: React.ReactNode }[] = [
    { key: 'comparativa', label: 'Comparativa', icon: <BarChart3 size={14} /> },
    { key: 'tendencias', label: 'Tendencias', icon: <TrendingUp size={14} /> },
    { key: 'radar', label: 'Radar', icon: <Radar size={14} /> },
  ];

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1rem',
        background: 'var(--bg-secondary)', padding: '0.3rem',
        borderRadius: 10, width: 'fit-content',
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.4rem 0.85rem', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 600,
              background: tab === t.key ? 'var(--accent-primary)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Chart content */}
      {tab === 'comparativa' && (
        <div className="glass-panel" style={{
          padding: '1.25rem', borderRadius: 14, border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Profit mensual por árbol
          </div>
          {barData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', fontSize: '0.8rem' }}>
              Sin datos de profit para mostrar
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 50)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  tickFormatter={(v) => formatCLP(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: 'var(--text-primary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                    borderRadius: 8, fontSize: '0.75rem',
                  }}
                  formatter={(value: number) => [formatCLP(value), 'Profit']}
                />
                <Bar
                  dataKey="profit"
                  radius={[0, 4, 4, 0]}
                  fill="var(--accent-primary)"
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {tab === 'tendencias' && (
        <div className="glass-panel" style={{
          padding: '1.25rem', borderRadius: 14, border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Tendencia de profit — último mes
          </div>
          {trendData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', fontSize: '0.8rem' }}>
              Sin datos de tendencia disponibles
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData} margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  interval={Math.max(0, Math.floor(trendData.length / 10))}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  tickFormatter={(v) => formatCLP(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                    borderRadius: 8, fontSize: '0.75rem',
                  }}
                  formatter={(value: number) => [formatCLP(value), 'Profit']}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--accent-primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {tab === 'radar' && (
        <div className="glass-panel" style={{
          padding: '1.25rem', borderRadius: 14, border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Métricas comparativas × árbol
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            {barData.map(item => (
              <div key={item.name} style={{
                background: 'var(--bg-secondary)', borderRadius: 10, padding: '0.75rem 1rem',
                border: '1px solid var(--border-color)', minWidth: 140,
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.4rem' }}>{item.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Profit</span>
                    <span style={{ color: item.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {formatCLP(item.profit)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Miembros</span>
                    <span>{item.miembros}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Inversión</span>
                    <span>{item.inversión}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Satisfacción</span>
                    <span style={{ color: item.satisfacción >= 80 ? '#10b981' : item.satisfacción >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {item.satisfacción}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function TrustInsightDashboard() {
  const [trees, setTrees] = useState<EnrichedTree[]>([]);
  const [globalTrees, setGlobalTrees] = useState<EnrichedTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'mine' | 'global'>('mine');
  const [sortField, setSortField] = useState<SortField>('profit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedTree, setSelectedTree] = useState<EnrichedTree | null>(null);
  const [selectedDrawerTree, setSelectedDrawerTree] = useState<EnrichedTree | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch user's trees
      const { data: myData } = await api.get('/trees');
      const myTrees: EnrichedTree[] = Array.isArray(myData) ? myData : (myData?.trees ?? []);

      // Check if user is admin of any tree or foundation admin
      const adminTree = myTrees.find(t => t.role === 'ADMIN' || t.role === 'CREATOR');
      setIsAdmin(!!adminTree);

      setTrees(myTrees);

      // Fetch global trees
      try {
        const { data: globalData } = await api.get('/trees/global');
        const global: EnrichedTree[] = Array.isArray(globalData) ? globalData : (globalData?.trees ?? []);
        setGlobalTrees(global);
      } catch {
        setGlobalTrees([]);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Error al cargar datos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const displayTrees = filter === 'mine' ? trees : globalTrees;

  // Aggregate stats (for user's trees)
  const totalTrees = trees.length;
  const totalMembers = trees.reduce((a, t) => a + (t._count?.members ?? 0), 0);
  const totalProfit = trees.reduce((a, t) => a + (t.healthData?.fiatMonthlyProfit ?? 0), 0);
  const weightedSatisfaction = (() => {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const t of trees) {
      const members = t._count?.members ?? 0;
      const sat = t.healthData?.satisfaction;
      if (sat !== null && members > 0) {
        weightedSum += sat * members;
        totalWeight += members;
      }
    }
    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : null;
  })();
  const avgInversion = trees.length > 0
    ? Math.round(trees.reduce((a, t) => a + (t.healthData?.inversionPct ?? 0), 0) / trees.length)
    : 0;

  // Collect all relations from all trees (deduplicated)
  const allRelations = useMemo(() => {
    const seen = new Set<string>();
    const relations: TreeRelation[] = [];
    for (const t of trees) {
      for (const rel of t.treeRelations ?? []) {
        if (!seen.has(rel.id)) {
          seen.add(rel.id);
          relations.push(rel);
        }
      }
    }
    return relations;
  }, [trees]);

  // ── Drilled into a specific tree (placeholder) ──
  if (selectedTreeId && selectedTree) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem 1.25rem' }}>
        <button
          onClick={() => { setSelectedTreeId(null); setSelectedTree(null); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent-primary)', fontSize: '0.82rem', padding: 0,
            display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem',
          }}
        >
          ← Volver al dashboard
        </button>
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <Telescope size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>{selectedTree.name}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Panel de análisis detallado próximamente
          </p>
        </div>
      </div>
    );
  }

  // ── Drawer for global trees/metrics ──
  if (selectedDrawerTree) {
    const t = selectedDrawerTree;
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem 1.25rem' }}>
        <button
          onClick={() => setSelectedDrawerTree(null)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent-primary)', fontSize: '0.82rem', padding: 0,
            display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem',
          }}
        >
          ← Volver al dashboard
        </button>
        <div className="glass-panel" style={{
          padding: '1.5rem', borderRadius: 14, border: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6366f1 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Globe size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t.name}</h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Árbol global · {t._count?.members ?? 0} miembros
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <SummaryCard
              icon={<DollarSign size={18} color="#10b981" />}
              label="Profit mensual"
              value={formatCLP(t.healthData?.fiatMonthlyProfit ?? 0)}
              color="#10b981"
            />
            <SummaryCard
              icon={<TrendingUp size={18} color="#3b82f6" />}
              label="Inversión"
              value={`${t.healthData?.inversionPct ?? 0}`}
              suffix="%"
              color="#3b82f6"
            />
            <SummaryCard
              icon={<Smile size={18} color="#f59e0b" />}
              label="Satisfacción"
              value={t.healthData?.satisfaction !== null ? `${Math.round(t.healthData.satisfaction * 100)}` : '—'}
              suffix={t.healthData?.satisfaction !== null ? '%' : ''}
              color="#f59e0b"
            />
            <SummaryCard
              icon={<Building2 size={18} color="#8b5cf6" />}
              label="Miembros"
              value={`${t._count?.members ?? 0}`}
              color="#8b5cf6"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ──
  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '1rem 1.25rem' }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem',
      }}>
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
              Dashboard ejecutivo multi-árbol
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Filter toggle */}
          <div style={{
            display: 'flex', background: 'var(--bg-secondary)',
            borderRadius: 8, padding: '0.2rem',
          }}>
            <button
              onClick={() => setFilter('mine')}
              style={{
                padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600,
                background: filter === 'mine' ? 'var(--accent-primary)' : 'transparent',
                color: filter === 'mine' ? '#fff' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              <Home size={13} /> Mis árboles
            </button>
            <button
              onClick={() => setFilter('global')}
              style={{
                padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600,
                background: filter === 'global' ? 'var(--accent-primary)' : 'transparent',
                color: filter === 'global' ? '#fff' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              <Globe size={13} /> Globales
            </button>
          </div>
          <button
            onClick={fetchData}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 8, padding: '0.4rem 0.75rem', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '0.75rem',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            <Activity size={13} /> Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <SkeletonBlock height={88} />
            <SkeletonBlock height={88} />
            <SkeletonBlock height={88} />
            <SkeletonBlock height={88} />
            <SkeletonBlock height={88} />
          </div>
          <SkeletonBlock height={300} />
          <SkeletonBlock height={250} />
        </div>
      ) : error ? (
        <div style={{
          textAlign: 'center', padding: '3rem', color: 'var(--accent-danger)',
          fontSize: '0.9rem',
        }}>
          <ShieldAlert size={40} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <div>{error}</div>
        </div>
      ) : displayTrees.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ── Summary cards (only for "My trees") ── */}
          {filter === 'mine' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <SummaryCard
                icon={<Trees size={18} color="var(--accent-primary)" />}
                label="Árboles administrados"
                value={`${totalTrees}`}
                color="var(--accent-primary)"
              />
              <SummaryCard
                icon={<Users size={18} color="#8b5cf6" />}
                label="Miembros totales"
                value={`${totalMembers}`}
                color="#8b5cf6"
              />
              <SummaryCard
                icon={<DollarSign size={18} color={totalProfit >= 0 ? '#10b981' : '#ef4444'} />}
                label="Profit combinado"
                value={formatCLP(totalProfit)}
                color={totalProfit >= 0 ? '#10b981' : '#ef4444'}
              />
              <SummaryCard
                icon={<Smile size={18} color="#f59e0b" />}
                label="Satisfacción promedio"
                value={weightedSatisfaction !== null ? `${weightedSatisfaction}` : '—'}
                suffix={weightedSatisfaction !== null ? '%' : ''}
                color="#f59e0b"
              />
              <SummaryCard
                icon={<TrendingUp size={18} color="#3b82f6" />}
                label="Inversión% promedio"
                value={`${avgInversion}`}
                suffix="%"
                color="#3b82f6"
              />
            </div>
          )}

          {/* ── Federation section (only for "My trees") ── */}
          {filter === 'mine' && allRelations.length > 0 && (
            <FederationSection relations={allRelations} trees={trees} />
          )}

          {/* ── Chart section ── */}
          {filter === 'mine' && <ChartSection trees={trees} filter={filter} />}

          {/* ── Comparative table ── */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '0.75rem',
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                {filter === 'mine' ? 'Mis árboles' : 'Árboles globales'}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                  {displayTrees.length} árbol{displayTrees.length !== 1 ? 'es' : ''}
                </span>
              </div>
            </div>
            <TreeTable
              trees={displayTrees}
              sortField={sortField}
              sortDir={sortDir}
              onSort={(field) => {
                if (sortField === field) {
                  setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortField(field);
                  setSortDir('desc');
                }
              }}
              onSelectTree={(tree) => {
                if (filter === 'mine') {
                  setSelectedTree(tree);
                  setSelectedTreeId(tree.id);
                } else {
                  setSelectedDrawerTree(tree);
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
