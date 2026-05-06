import { useEffect, useState } from 'react';
import type React from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  Calendar,
  CheckCircle2,
  Lock,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import api from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CycleStatus = 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'APPROVED' | 'LOCKED';

interface SplitObjective {
  materialsPct: number;
  laborPct: number;
  operationsPct: number;
  taxPct: number;
  reservePct: number;
  maintenancePct: number;
  treeFundPct: number;
  otherPct: number;
}

interface QuickSummary {
  branchId: string;
  treeId: string;
  from: string | null;
  to: string | null;
  currency: string;
  multiCurrencyWarning: boolean;
  totalIncomeFiat: number;
  totalExpenseFiat: number;
  totalInvestmentFiat: number;
  netFiat: number;
  surplusFiat: number;
  deficitFiat: number;
  marginPct: number;
  materialsFiat: number;
  laborFiat: number;
  operationsFiat: number;
  taxFiat: number;
  reserveFiat: number;
  maintenanceFiat: number;
  reinvestmentFiat: number;
  otherFiat: number;
  treeFundFiat: number;
  transactionsCount: number;
  allTimeTransactionsCount: number;
  verifiedAmountFiat: number;
  splitObjective: SplitObjective | null;
  note: string;
}

interface SustainabilityCycle {
  id: string;
  treeId: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  totalIncomeFiat: number;
  totalExpenseFiat: number;
  totalInvestmentFiat: number;
  netFiat: number;
  surplusFiat: number;
  deficitFiat: number;
  marginPct: number;
  materialsFiat: number;
  laborFiat: number;
  operationsFiat: number;
  taxFiat: number;
  reserveFiat: number;
  maintenanceFiat: number;
  reinvestmentFiat: number;
  otherFiat: number;
  treeFundFiat: number;
  transactionsCount: number;
  verifiedAmountFiat: number;
  includeOnlyVerified: boolean;
  multiCurrencyWarning: boolean;
  status: CycleStatus;
  calculatedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  lockedAt: string | null;
  lockedById: string | null;
  notes: string | null;
  allocations: any[];
  createdAt: string;
  updatedAt: string;
}

interface Props {
  branchId: string;
  isAdmin: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = 'CLP') =>
  n.toLocaleString('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 });

const statusColors: Record<CycleStatus, string> = {
  DRAFT: '#6c757d',
  CALCULATED: '#0d6efd',
  REVIEWED: '#6f42c1',
  APPROVED: '#198754',
  LOCKED: '#dc3545',
};

const statusLabels: Record<CycleStatus, string> = {
  DRAFT: 'Borrador',
  CALCULATED: 'Calculado',
  REVIEWED: 'Revisado',
  APPROVED: 'Aprobado',
  LOCKED: 'Bloqueado',
};

function StatusBadge({ status }: { status: CycleStatus }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 10,
        background: statusColors[status] + '22',
        color: statusColors[status],
        fontWeight: 600,
        border: `1px solid ${statusColors[status]}44`,
      }}
    >
      {statusLabels[status]}
    </span>
  );
}

function MetricCard({
  label, value, currency, color, icon,
}: {
  label: string; value: number; currency: string; color?: string; icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 20px',
        minWidth: 140,
        flex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: 'var(--text-muted)', fontSize: 12 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)' }}>
        {fmt(value, currency)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Breakown table row
// ─────────────────────────────────────────────────────────────────────────────

function BreakdownRow({
  label, actual, objective, total, currency,
}: {
  label: string; actual: number; objective: number | null; total: number; currency: string;
}) {
  const actualPct = total > 0 ? Math.round((actual / total) * 10000) / 100 : 0;
  const diff = objective !== null ? actualPct - objective : null;
  return (
    <tr>
      <td style={{ padding: '6px 0', color: 'var(--text)' }}>{label}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(actual, currency)}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{actualPct.toFixed(1)}%</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>
        {objective !== null ? `${objective.toFixed(1)}%` : '—'}
      </td>
      <td style={{ padding: '6px 0', textAlign: 'right', color: diff === null ? 'var(--text-muted)' : diff > 5 ? '#dc3545' : diff < -5 ? '#198754' : 'var(--text-muted)' }}>
        {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Summary Panel
// ─────────────────────────────────────────────────────────────────────────────

function QuickSummaryPanel({ branchId, isAdmin }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<QuickSummary | null>(null);
  const [error, setError] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await api.get(`/autosustento-branches/${branchId}/sustainability-summary${qs}`);
      setSummary(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al cargar resumen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [branchId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Period filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
        </div>
        <button onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {from || to ? 'Filtrar' : 'Actualizar'}
        </button>
      </div>

      {error && <div style={{ color: '#dc3545', background: '#dc354511', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

      {summary && (
        <>
          {summary.multiCurrencyWarning && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#ffc10711', border: '1px solid #ffc10744', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#664d03' }}>
              <AlertTriangle size={16} />
              Atención: se detectaron transacciones en múltiples monedas. Los totales pueden no ser comparables.
            </div>
          )}

          {/* Main metrics */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <MetricCard label="Ingresos" value={summary.totalIncomeFiat} currency={summary.currency} color="#198754" icon={<TrendingUp size={14} />} />
            <MetricCard label="Gastos" value={summary.totalExpenseFiat} currency={summary.currency} color="#dc3545" icon={<TrendingDown size={14} />} />
            <MetricCard label="Inversión" value={summary.totalInvestmentFiat} currency={summary.currency} icon={<BarChart2 size={14} />} />
            <MetricCard
              label={summary.netFiat >= 0 ? 'Excedente' : 'Déficit'}
              value={summary.netFiat >= 0 ? summary.surplusFiat : summary.deficitFiat}
              currency={summary.currency}
              color={summary.netFiat >= 0 ? '#198754' : '#dc3545'}
              icon={summary.netFiat >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            />
          </div>

          {/* Margin & tree fund */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Margen neto</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: summary.marginPct >= 0 ? '#198754' : '#dc3545' }}>
                {summary.marginPct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Aporte al Tree (sugerido)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmt(summary.treeFundFiat, summary.currency)}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Transacciones</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{summary.transactionsCount}</div>
            </div>
          </div>

          {/* Breakdown toggle */}
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
          >
            {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showBreakdown ? 'Ocultar' : 'Ver'} desglose por categoría
          </button>

          {showBreakdown && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ paddingBottom: 8 }}>Categoría</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>Real</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>% Real</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>% Objetivo</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right' }}>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  <BreakdownRow label="Materiales" actual={summary.materialsFiat} objective={summary.splitObjective?.materialsPct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Trabajo / Labor" actual={summary.laborFiat} objective={summary.splitObjective?.laborPct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Operaciones" actual={summary.operationsFiat} objective={summary.splitObjective?.operationsPct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Impuestos" actual={summary.taxFiat} objective={summary.splitObjective?.taxPct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Reserva" actual={summary.reserveFiat} objective={summary.splitObjective?.reservePct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Mantenimiento" actual={summary.maintenanceFiat} objective={summary.splitObjective?.maintenancePct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Reinversión" actual={summary.reinvestmentFiat} objective={null} total={summary.totalExpenseFiat} currency={summary.currency} />
                  <BreakdownRow label="Otros" actual={summary.otherFiat} objective={summary.splitObjective?.otherPct ?? null} total={summary.totalExpenseFiat} currency={summary.currency} />
                </tbody>
              </table>
              {!summary.splitObjective && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  No hay distribución objetivo configurada. Configura el Split de Sostenibilidad en la rama para ver diferencias.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {summary.note}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle Card
// ─────────────────────────────────────────────────────────────────────────────

function CycleCard({ cycle, isAdmin, onRefresh }: { cycle: SustainabilityCycle; isAdmin: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notesValue, setNotesValue] = useState(cycle.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);

  const doAction = async (endpoint: string) => {
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/sustainability-cycles/${cycle.id}/${endpoint}`);
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? `Error en acción: ${endpoint}`);
    } finally {
      setActionLoading(false);
    }
  };

  const doDelete = async () => {
    if (!window.confirm('¿Eliminar este ciclo? Solo se puede eliminar si está en borrador o calculado.')) return;
    setActionLoading(true);
    setError('');
    try {
      await api.delete(`/sustainability-cycles/${cycle.id}`);
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al eliminar ciclo');
    } finally {
      setActionLoading(false);
    }
  };

  const saveNotes = async () => {
    setActionLoading(true);
    setError('');
    try {
      await api.patch(`/sustainability-cycles/${cycle.id}`, { notes: notesValue });
      setEditingNotes(false);
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al guardar notas');
    } finally {
      setActionLoading(false);
    }
  };

  const isSurplus = cycle.netFiat >= 0;
  const periodLabel = `${new Date(cycle.periodStart).toLocaleDateString('es-CL')} – ${new Date(cycle.periodEnd).toLocaleDateString('es-CL')}`;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{periodLabel}</span>
          <StatusBadge status={cycle.status} />
          {cycle.multiCurrencyWarning && (
            <span title="Múltiples monedas" style={{ color: '#ffc107' }}><AlertTriangle size={14} /></span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: isSurplus ? '#198754' : '#dc3545' }}>
            {isSurplus ? '+' : '-'}{fmt(isSurplus ? cycle.surplusFiat : cycle.deficitFiat, cycle.currency)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cycle.marginPct.toFixed(1)}%</span>
          <button onClick={() => setExpanded((v) => !v)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, color: '#dc3545', fontSize: 13 }}>{error}</div>}

      {expanded && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Key figures */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <MetricCard label="Ingresos" value={cycle.totalIncomeFiat} currency={cycle.currency} color="#198754" icon={<TrendingUp size={14} />} />
            <MetricCard label="Gastos" value={cycle.totalExpenseFiat} currency={cycle.currency} color="#dc3545" icon={<TrendingDown size={14} />} />
            <MetricCard label={isSurplus ? 'Excedente' : 'Déficit'} value={isSurplus ? cycle.surplusFiat : cycle.deficitFiat} currency={cycle.currency}
              color={isSurplus ? '#198754' : '#dc3545'} icon={isSurplus ? <TrendingUp size={14} /> : <TrendingDown size={14} />} />
            <MetricCard label="Aporte Tree" value={cycle.treeFundFiat} currency={cycle.currency} color="var(--accent)" icon={<BarChart2 size={14} />} />
          </div>

          {/* Breakdown table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ paddingBottom: 6 }}>Categoría</th>
                  <th style={{ paddingBottom: 6, textAlign: 'right' }}>Monto</th>
                  <th style={{ paddingBottom: 6, textAlign: 'right' }}>% del gasto</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Materiales', cycle.materialsFiat],
                  ['Trabajo / Labor', cycle.laborFiat],
                  ['Operaciones', cycle.operationsFiat],
                  ['Impuestos', cycle.taxFiat],
                  ['Reserva', cycle.reserveFiat],
                  ['Mantenimiento', cycle.maintenanceFiat],
                  ['Reinversión', cycle.reinvestmentFiat],
                  ['Otros', cycle.otherFiat],
                ].map(([label, val]) => (
                  <tr key={label as string}>
                    <td style={{ padding: '5px 0', color: 'var(--text)' }}>{label as string}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(val as number, cycle.currency)}</td>
                    <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {cycle.totalExpenseFiat > 0 ? `${((val as number / cycle.totalExpenseFiat) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meta */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>{cycle.transactionsCount} transacciones</span>
            <span>Verificado: {fmt(cycle.verifiedAmountFiat, cycle.currency)}</span>
            {cycle.includeOnlyVerified && <span>Solo verificadas</span>}
            {cycle.calculatedAt && <span>Calculado: {new Date(cycle.calculatedAt).toLocaleDateString('es-CL')}</span>}
            {cycle.approvedAt && <span>Aprobado: {new Date(cycle.approvedAt).toLocaleDateString('es-CL')}</span>}
          </div>

          {/* Notes */}
          <div>
            {editingNotes ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} rows={3}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, resize: 'vertical', width: '100%' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveNotes} disabled={actionLoading}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                    Guardar
                  </button>
                  <button onClick={() => setEditingNotes(false)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
                  {cycle.notes ? cycle.notes : <em>Sin notas</em>}
                </span>
                {isAdmin && cycle.status !== 'LOCKED' && (
                  <button onClick={() => setEditingNotes(true)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    Editar notas
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['CALCULATED', 'REVIEWED'].includes(cycle.status) && (
                <button onClick={() => doAction('approve')} disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#19875422', border: '1px solid #19875444', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: '#198754' }}>
                  <CheckCircle2 size={14} />Aprobar
                </button>
              )}
              {cycle.status === 'APPROVED' && (
                <button onClick={() => doAction('lock')} disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#dc354522', border: '1px solid #dc354544', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: '#dc3545' }}>
                  <Lock size={14} />Bloquear (permanente)
                </button>
              )}
              {['DRAFT', 'CALCULATED'].includes(cycle.status) && (
                <button onClick={doDelete} disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <Trash2 size={14} />Eliminar
                </button>
              )}
              {actionLoading && <Loader2 size={16} className="spin" style={{ margin: '8px 0', color: 'var(--text-muted)' }} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculate Cycle Form
// ─────────────────────────────────────────────────────────────────────────────

function CalculateCycleForm({ branchId, onCreated }: { branchId: string; onCreated: () => void }) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [includeOnlyVerified, setIncludeOnlyVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!periodStart || !periodEnd) {
      setError('Debes seleccionar un período de inicio y fin');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post(`/autosustento-branches/${branchId}/sustainability-cycles/calculate`, {
        periodStart,
        periodEnd,
        includeOnlyVerified,
      });
      setSuccess(res.data.recalculated
        ? 'Ciclo recalculado correctamente.'
        : 'Ciclo calculado y guardado correctamente.');
      onCreated();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al calcular ciclo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>Calcular nuevo ciclo de excedente</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Inicio del período *</label>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fin del período *</label>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={includeOnlyVerified} onChange={(e) => setIncludeOnlyVerified(e.target.checked)} />
        Solo incluir transacciones verificadas (con respaldo, conciliadas o auditadas)
      </label>
      {error && <div style={{ color: '#dc3545', fontSize: 13 }}>{error}</div>}
      {success && <div style={{ color: '#198754', fontSize: 13 }}>{success}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>
          {loading ? <Loader2 size={14} className="spin" /> : <BarChart2 size={14} />}
          Calcular y registrar
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Si ya existe un ciclo para este período exacto, se recalculará (siempre que no esté Bloqueado).
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SustainabilityCyclePanel({ branchId, isAdmin }: Props) {
  const [cycles, setCycles] = useState<SustainabilityCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'summary' | 'cycles'>('summary');
  const [showForm, setShowForm] = useState(false);

  const loadCycles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/autosustento-branches/${branchId}/sustainability-cycles`);
      setCycles(res.data.cycles ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Error al cargar ciclos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCycles(); }, [branchId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Constitutional note */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          El excedente de sostenibilidad muestra si esta Rama está cubriendo sus costos y aportando al Tree.
          <strong> No es lucro privado automático. No otorga XP, autoridad, votos ni Berries.</strong>{' '}
          "El fiat puede financiar recursos, pero no comprar autoridad."
        </span>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-input)', borderRadius: 10, padding: 3 }}>
        {(['summary', 'cycles'] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
              background: activeTab === t ? 'var(--bg-card)' : 'transparent',
              color: activeTab === t ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: activeTab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
            {t === 'summary' ? 'Resumen rápido' : `Ciclos registrados (${cycles.length})`}
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <QuickSummaryPanel branchId={branchId} isAdmin={isAdmin} />
      )}

      {/* Cycles tab */}
      {activeTab === 'cycles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isAdmin && (
            <button onClick={() => setShowForm((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>
              <BarChart2 size={14} />
              {showForm ? 'Cancelar' : 'Calcular nuevo ciclo'}
            </button>
          )}

          {showForm && isAdmin && (
            <CalculateCycleForm branchId={branchId} onCreated={() => { loadCycles(); setShowForm(false); }} />
          )}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={24} className="spin" style={{ color: 'var(--accent)' }} />
            </div>
          )}

          {error && <div style={{ color: '#dc3545', fontSize: 13 }}>{error}</div>}

          {!loading && cycles.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
              No hay ciclos de excedente registrados todavía.
              {isAdmin && ' Usa el botón de arriba para calcular el primer ciclo.'}
            </div>
          )}

          {cycles.map((cycle) => (
            <CycleCard key={cycle.id} cycle={cycle} isAdmin={isAdmin} onRefresh={loadCycles} />
          ))}
        </div>
      )}
    </div>
  );
}
