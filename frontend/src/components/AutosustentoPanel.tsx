import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Lightbulb, Pause, Play, Plus, XCircle } from 'lucide-react';
import api from '../lib/api';
import AutosustentoIdeasPanel from './AutosustentoIdeasPanel';
import SustainabilityCyclePanel from './SustainabilityCyclePanel';
import LedgerFiatPanel from './LedgerFiatPanel';

type AutosustentoPanelProps = {
  treeId: string;
  isTreeAdmin?: boolean;
};

const statusLabels: Record<string, string> = {
  PROPOSED: 'Propuesta',
  UNDER_REVIEW: 'En revision',
  APPROVED: 'Aprobada',
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  REJECTED: 'Rechazada',
  CLOSED: 'Cerrada',
};

const splitLabels: Record<string, string> = {
  materialsPct: 'Materiales',
  laborPct: 'Trabajo',
  operationsPct: 'Operacion',
  taxPct: 'Impuestos',
  reservePct: 'Reserva',
  maintenancePct: 'Mantencion',
  treeFundPct: 'Fondo Tree',
  otherPct: 'Otros',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  fontWeight: 700,
  textTransform: 'uppercase',
};

function formatMoney(value?: number | null, currency = 'CLP') {
  if (value == null) return 'Sin dato';
  return `${currency} ${Number(value).toLocaleString()}`;
}

const emptySplit = {
  materialsPct: '25',
  laborPct: '35',
  operationsPct: '10',
  taxPct: '5',
  reservePct: '5',
  maintenancePct: '5',
  treeFundPct: '10',
  otherPct: '5',
  notes: '',
};

export default function AutosustentoPanel({ treeId, isTreeAdmin }: AutosustentoPanelProps) {
  const [tab, setTab] = useState<'ideas' | 'branches'>('ideas');
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    productOrService: '',
    targetClient: '',
    valueProposition: '',
    viabilitySummary: '',
    requiredResources: '',
    legalRisks: '',
    operationalRisks: '',
    startupCostFiat: '',
    expectedMonthlyIncomeFiat: '',
    expectedMonthlyCostFiat: '',
    currency: 'CLP',
    reviewPeriodDays: '90',
    closureCriteria: '',
  });
  const [splitForm, setSplitForm] = useState(emptySplit);

  const selectedSummary = useMemo(() => items.find((item) => item.branchId === selectedId), [items, selectedId]);
  const splitTotal = useMemo(() => Object.keys(splitLabels).reduce((sum, field) => sum + Number((splitForm as any)[field] || 0), 0), [splitForm]);

  const fetchItems = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/trees/${treeId}/autosustento-branches`);
      setItems(data);
      if (!selectedId && data.length > 0) setSelectedId(data[0].branchId);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudieron cargar las Ramas de Autosustento.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (branchId: string) => {
    try {
      const [detail, financial] = await Promise.all([
        api.get(`/autosustento-branches/${branchId}`),
        api.get(`/autosustento-branches/${branchId}/financial-summary`),
      ]);
      setSelected(detail.data);
      setSummary(financial.data);
      if (detail.data.split) {
        setSplitForm({
          materialsPct: String(detail.data.split.materialsPct ?? 0),
          laborPct: String(detail.data.split.laborPct ?? 0),
          operationsPct: String(detail.data.split.operationsPct ?? 0),
          taxPct: String(detail.data.split.taxPct ?? 0),
          reservePct: String(detail.data.split.reservePct ?? 0),
          maintenancePct: String(detail.data.split.maintenancePct ?? 0),
          treeFundPct: String(detail.data.split.treeFundPct ?? 0),
          otherPct: String(detail.data.split.otherPct ?? 0),
          notes: detail.data.split.notes || '',
        });
      } else {
        setSplitForm(emptySplit);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar el detalle de Autosustento.');
    }
  };

  useEffect(() => {
    fetchItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const createBranch = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/trees/${treeId}/autosustento-branches`, {
        ...form,
        startupCostFiat: form.startupCostFiat || undefined,
        expectedMonthlyIncomeFiat: form.expectedMonthlyIncomeFiat || undefined,
        expectedMonthlyCostFiat: form.expectedMonthlyCostFiat || undefined,
        reviewPeriodDays: form.reviewPeriodDays || undefined,
      });
      setForm({
        name: '',
        description: '',
        productOrService: '',
        targetClient: '',
        valueProposition: '',
        viabilitySummary: '',
        requiredResources: '',
        legalRisks: '',
        operationalRisks: '',
        startupCostFiat: '',
        expectedMonthlyIncomeFiat: '',
        expectedMonthlyCostFiat: '',
        currency: 'CLP',
        reviewPeriodDays: '90',
        closureCriteria: '',
      });
      setShowCreate(false);
      await fetchItems();
      setSelectedId(data.branchId);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo crear la Rama de Autosustento.');
    } finally {
      setSaving(false);
    }
  };

  const saveSplit = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/autosustento-branches/${selected.branchId}/sustainability-split`, splitForm);
      await fetchItems();
      await fetchDetail(selected.branchId);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo guardar el split.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: 'submit-review' | 'approve' | 'activate' | 'pause' | 'close' | 'reject') => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/autosustento-branches/${selected.branchId}/${action}`, action === 'close' ? { closureNote: selected.closureCriteria || 'Cierre administrativo' } : {});
      await fetchItems();
      await fetchDetail(selected.branchId);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cambiar el estado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setTab('ideas')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.5rem 1.1rem',
            borderRadius: 20,
            border: 'none',
            background: tab === 'ideas' ? 'var(--accent)' : 'var(--bg-input)',
            color: tab === 'ideas' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          <Lightbulb size={14} /> Ideas de Autosustento
        </button>
        <button
          onClick={() => setTab('branches')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.5rem 1.1rem',
            borderRadius: 20,
            border: 'none',
            background: tab === 'branches' ? 'var(--accent)' : 'var(--bg-input)',
            color: tab === 'branches' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          <BriefcaseBusiness size={14} /> Ramas de Autosustento
        </button>
      </div>

      {tab === 'ideas' && (
        <AutosustentoIdeasPanel treeId={treeId} isTreeAdmin={isTreeAdmin} />
      )}

      {tab === 'branches' && (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.85fr) minmax(320px, 1.35fr)', gap: '1rem' }}>
      <section className="glass-panel" style={{ padding: '1.25rem', display: 'grid', gap: '1rem', alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <BriefcaseBusiness size={20} color="var(--accent-primary)" />
              <h3 style={{ margin: 0 }}>Autosustento</h3>
            </div>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
              Ramas que venden productos o servicios al mundo externo para sostener al Tree.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Nueva</button>
        </div>

        {error && <div style={{ color: 'var(--accent-danger)', display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}><AlertTriangle size={16} /> {error}</div>}

        {showCreate && (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '1rem', display: 'grid', gap: '0.7rem' }}>
            <Field label="Nombre de la Rama"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Producto o servicio"><input style={inputStyle} value={form.productOrService} onChange={(e) => setForm({ ...form, productOrService: e.target.value })} /></Field>
            <Field label="Cliente objetivo"><input style={inputStyle} value={form.targetClient} onChange={(e) => setForm({ ...form, targetClient: e.target.value })} /></Field>
            <Field label="Propuesta de valor"><textarea style={{ ...inputStyle, minHeight: 72 }} value={form.valueProposition} onChange={(e) => setForm({ ...form, valueProposition: e.target.value })} /></Field>
            <Field label="Viabilidad"><textarea style={{ ...inputStyle, minHeight: 72 }} value={form.viabilitySummary} onChange={(e) => setForm({ ...form, viabilitySummary: e.target.value })} /></Field>
            <Field label="Recursos requeridos"><input style={inputStyle} value={form.requiredResources} onChange={(e) => setForm({ ...form, requiredResources: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px', gap: '0.5rem' }}>
              <input type="number" min="0" placeholder="Costo inicio" style={inputStyle} value={form.startupCostFiat} onChange={(e) => setForm({ ...form, startupCostFiat: e.target.value })} />
              <input type="number" min="0" placeholder="Ingreso mensual" style={inputStyle} value={form.expectedMonthlyIncomeFiat} onChange={(e) => setForm({ ...form, expectedMonthlyIncomeFiat: e.target.value })} />
              <input type="number" min="0" placeholder="Costo mensual" style={inputStyle} value={form.expectedMonthlyCostFiat} onChange={(e) => setForm({ ...form, expectedMonthlyCostFiat: e.target.value })} />
              <input style={inputStyle} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
            </div>
            <Field label="Criterio de cierre"><input style={inputStyle} value={form.closureCriteria} onChange={(e) => setForm({ ...form, closureCriteria: e.target.value })} /></Field>
            <button className="btn btn-primary" disabled={saving || !form.name.trim() || !form.productOrService.trim()} onClick={createBranch}>
              {saving ? 'Guardando...' : 'Crear Rama de Autosustento'}
            </button>
          </div>
        )}

        {loading ? <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p> : (
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {items.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Aun no hay Ramas de Autosustento.</p>}
            {items.map((item) => (
              <button
                key={item.branchId}
                onClick={() => setSelectedId(item.branchId)}
                style={{
                  textAlign: 'left',
                  borderRadius: 8,
                  padding: '0.85rem',
                  border: `1px solid ${item.branchId === selectedId ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: item.branchId === selectedId ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong>{item.branch?.name || item.businessName}</strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 800 }}>{statusLabels[item.status] || item.status}</span>
                </div>
                <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{item.productOrService}</div>
                <div style={{ marginTop: '0.2rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                  Neto estimado: {formatMoney(item.expectedMonthlyNetFiat, item.currency)}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel" style={{ padding: '1.25rem', minHeight: 520 }}>
        {!selectedSummary && !selected ? (
          <p style={{ color: 'var(--text-secondary)' }}>Selecciona una Rama de Autosustento para revisar viabilidad, split y ledger.</p>
        ) : !selected ? (
          <p style={{ color: 'var(--text-secondary)' }}>Cargando detalle...</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: 'var(--accent-primary)', fontWeight: 800, fontSize: '0.72rem' }}>{statusLabels[selected.status] || selected.status}</div>
                <h2 style={{ margin: '0.2rem 0' }}>{selected.branch?.name || selected.businessName}</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{selected.valueProposition || selected.productOrService}</p>
              </div>
              {isTreeAdmin && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runAction('submit-review')}>Revision</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runAction('approve')}><CheckCircle2 size={15} /> Aprobar</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runAction('activate')}><Play size={15} /> Activar</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runAction('pause')}><Pause size={15} /> Pausar</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runAction('reject')}><XCircle size={15} /> Rechazar</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runAction('close')}>Cerrar</button>
                </div>
              )}
            </div>

            <div style={{ padding: '0.85rem', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
              El fiat registrado aqui financia recursos externos, pero no compra autoridad ni reputacion. El XP se gana por tareas verificadas, no por el monto vendido.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem' }}>
              <Info title="Ingreso mensual" value={formatMoney(selected.expectedMonthlyIncomeFiat, selected.currency)} />
              <Info title="Costo mensual" value={formatMoney(selected.expectedMonthlyCostFiat, selected.currency)} />
              <Info title="Neto estimado" value={formatMoney(selected.expectedMonthlyNetFiat, selected.currency)} />
              <Info title="Proxima revision" value={selected.nextReviewAt ? new Date(selected.nextReviewAt).toLocaleDateString() : 'Sin fecha'} />
            </div>

            <Block title="Ficha de viabilidad">
              <div style={{ display: 'grid', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>Cliente objetivo:</strong> {selected.targetClient || 'No indicado'}</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>Recursos:</strong> {selected.requiredResources || 'No indicado'}</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>Riesgos legales:</strong> {selected.legalRisks || 'No indicado'}</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>Riesgos operativos:</strong> {selected.operationalRisks || 'No indicado'}</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>Criterio de cierre:</strong> {selected.closureCriteria || 'No indicado'}</span>
              </div>
            </Block>

            <Block title="Split de sostenibilidad">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                {Object.entries(splitLabels).map(([field, label]) => (
                  <Field key={field} label={label}>
                    <input type="number" min="0" max="100" style={inputStyle} value={(splitForm as any)[field]} disabled={!isTreeAdmin} onChange={(e) => setSplitForm({ ...splitForm, [field]: e.target.value })} />
                  </Field>
                ))}
              </div>
              <textarea placeholder="Notas del split" style={{ ...inputStyle, minHeight: 68 }} value={splitForm.notes} disabled={!isTreeAdmin} onChange={(e) => setSplitForm({ ...splitForm, notes: e.target.value })} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center', color: splitTotal === 100 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 800 }}>
                <span>Total: {splitTotal}%</span>
                {isTreeAdmin && <button className="btn btn-primary" disabled={saving || splitTotal !== 100} onClick={saveSplit}>Guardar split</button>}
              </div>
            </Block>

            <Block title="Resumen Fiat">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.65rem' }}>
                <Info title="Ingresos" value={formatMoney(summary?.incomeFiat, summary?.currency || selected.currency)} />
                <Info title="Gastos" value={formatMoney(summary?.expensesFiat, summary?.currency || selected.currency)} />
                <Info title="Inversion" value={formatMoney(summary?.investmentFiat, summary?.currency || selected.currency)} />
                <Info title="Neto ledger" value={formatMoney(summary?.netFiat, summary?.currency || selected.currency)} />
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Para registrar ingresos o gastos, usa Ledger Fiat y selecciona esta branchId: <code>{selected.branchId}</code>.
              </p>
              {(summary?.recentTransactions || []).length > 0 && (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {summary.recentTransactions.map((tx: any) => (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                      <span>{tx.type} · {tx.description || tx.category}</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(tx.amount, tx.currency)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Block>

            <Block title="Excedente de Sostenibilidad">
              <SustainabilityCyclePanel branchId={selected.branchId} isAdmin={isTreeAdmin} />
            </Block>

            <Block title="Ledger Fiat de la Rama">
              <LedgerFiatPanel treeId={treeId} branchId={selected.branchId} isAdmin={isTreeAdmin} />
            </Block>
          </div>
        )}
      </section>
    </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.8rem', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: '0.3rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '1rem', display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h3>
      {children}
    </div>
  );
}
