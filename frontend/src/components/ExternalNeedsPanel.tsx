import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Plus, Send, XCircle } from 'lucide-react';
import api from '../lib/api';

type ExternalNeedsPanelProps = {
  treeId: string;
  isTreeAdmin?: boolean;
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  OPEN: 'Abierta',
  UNDER_REVIEW: 'En revision',
  SOLUTIONS_PROPOSED: 'Con soluciones',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CONVERTED_TO_TASKS: 'Convertida a tareas',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
};

const riskLabels: Record<string, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
  CRITICAL: 'Critico',
};

const solutionStatusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  UNDER_REVIEW: 'En revision',
  APPROVED_BY_TREE: 'Aprobada por Tree',
  APPROVED_BY_CLIENT: 'Aprobada por cliente',
  SELECTED: 'Seleccionada',
  REJECTED: 'Rechazada',
  ARCHIVED: 'Archivada',
  CONVERTED_TO_TASKS: 'Convertida a tareas',
};

const budgetLineTypeLabels: Record<string, string> = {
  LABOR: 'Trabajo',
  MATERIALS: 'Materiales',
  INFRASTRUCTURE: 'Infraestructura',
  TAXES: 'Impuestos',
  RESERVE: 'Reserva',
  TREE_FUND: 'Fondo Tree',
  MAINTENANCE: 'Mantencion',
  EXTERNAL_SERVICE: 'Servicio externo',
  OTHER: 'Otro',
};

const suggestedCriteria = [
  'Bajo costo',
  'Rapidez',
  'Seguridad',
  'Calidad',
  'Diseno',
  'Escalabilidad',
  'Mantenimiento',
  'Facilidad de uso',
  'Privacidad',
  'Soporte posterior',
  'Documentacion',
  'Cumplimiento legal',
  'Impacto comunitario',
];

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

function formatFiat(min?: number | null, max?: number | null, currency = 'CLP') {
  if (min == null && max == null) return 'Sin presupuesto';
  if (min != null && max != null) return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  if (min != null) return `Desde ${currency} ${min.toLocaleString()}`;
  return `Hasta ${currency} ${Number(max).toLocaleString()}`;
}

function formatSolutionFiat(solution: any) {
  if (solution.estimatedFiatExpected != null) {
    return `${solution.currency || 'CLP'} ${Number(solution.estimatedFiatExpected).toLocaleString()} esperado`;
  }
  return formatFiat(solution.estimatedFiatMin, solution.estimatedFiatMax, solution.currency);
}

export default function ExternalNeedsPanel({ treeId, isTreeAdmin }: ExternalNeedsPanelProps) {
  const [needs, setNeeds] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [scopeSummary, setScopeSummary] = useState<any | null>(null);
  const [budgetSummaries, setBudgetSummaries] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [needForm, setNeedForm] = useState({
    title: '',
    description: '',
    clientSummary: '',
    desiredOutcome: '',
    constraints: '',
    budgetMinFiat: '',
    budgetMaxFiat: '',
    currency: 'CLP',
    deadline: '',
    agentName: '',
    agentEmail: '',
    agentOrganization: '',
  });

  const [scopeForm, setScopeForm] = useState({ label: '', score: '8', description: '', agentId: '' });
  const [agentForm, setAgentForm] = useState({ name: '', email: '', organization: '', role: 'CLIENT', notes: '' });
  const [solutionForm, setSolutionForm] = useState({
    title: '',
    description: '',
    estimatedFiatMin: '',
    estimatedFiatExpected: '',
    estimatedFiatMax: '',
    currency: 'CLP',
    estimatedBerries: '',
    estimatedDurationDays: '',
    riskLevel: 'MEDIUM',
    assumptions: '',
    included: '',
    excluded: '',
    deliverables: '',
    acceptanceCriteria: '',
    maintenanceNotes: '',
    scopeAlignmentText: '',
  });
  const [budgetLineTargetId, setBudgetLineTargetId] = useState<string | null>(null);
  const [budgetLineForm, setBudgetLineForm] = useState({
    label: '',
    description: '',
    type: 'LABOR',
    estimatedFiat: '',
    estimatedBerries: '',
    quantity: '',
    unit: '',
    unitCostFiat: '',
  });

  const selectedSummary = useMemo(() => needs.find((need) => need.id === selectedId), [needs, selectedId]);

  const fetchNeeds = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/trees/${treeId}/external-needs`);
      setNeeds(data);
      if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudieron cargar las Necesidades Externas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const [detail, summary] = await Promise.all([
        api.get(`/external-needs/${id}`),
        api.get(`/external-needs/${id}/scope-summary`),
      ]);
      setSelected(detail.data);
      setScopeSummary(summary.data);
      const summaries = await Promise.all((detail.data.solutions || []).map(async (solution: any) => {
        try {
          const { data } = await api.get(`/solution-proposals/${solution.id}/budget-summary`);
          return [solution.id, data];
        } catch {
          return [solution.id, null];
        }
      }));
      setBudgetSummaries(Object.fromEntries(summaries.filter(([, summaryData]) => summaryData)));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar el detalle.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchNeeds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const createNeed = async () => {
    setSaving(true);
    setError('');
    try {
      const agents = needForm.agentName.trim()
        ? [{
          name: needForm.agentName.trim(),
          email: needForm.agentEmail.trim() || undefined,
          organization: needForm.agentOrganization.trim() || undefined,
          role: 'CLIENT',
          consentAccepted: false,
        }]
        : [];
      const { data } = await api.post(`/trees/${treeId}/external-needs`, {
        title: needForm.title.trim(),
        description: needForm.description.trim(),
        clientSummary: needForm.clientSummary.trim() || undefined,
        desiredOutcome: needForm.desiredOutcome.trim() || undefined,
        constraints: needForm.constraints.trim() || undefined,
        budgetMinFiat: needForm.budgetMinFiat || undefined,
        budgetMaxFiat: needForm.budgetMaxFiat || undefined,
        currency: needForm.currency,
        deadline: needForm.deadline || undefined,
        agents,
      });
      setNeedForm({
        title: '',
        description: '',
        clientSummary: '',
        desiredOutcome: '',
        constraints: '',
        budgetMinFiat: '',
        budgetMaxFiat: '',
        currency: 'CLP',
        deadline: '',
        agentName: '',
        agentEmail: '',
        agentOrganization: '',
      });
      setShowCreate(false);
      await fetchNeeds();
      setSelectedId(data.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo crear la Necesidad Externa.');
    } finally {
      setSaving(false);
    }
  };

  const runNeedAction = async (action: 'open' | 'approve' | 'reject' | 'cancel') => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/external-needs/${selected.id}/${action}`);
      await fetchNeeds();
      await fetchDetail(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo actualizar el estado.');
    } finally {
      setSaving(false);
    }
  };

  const addScope = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/external-needs/${selected.id}/scope-preferences`, {
        label: scopeForm.label.trim(),
        score: Number(scopeForm.score),
        description: scopeForm.description.trim() || undefined,
        agentId: scopeForm.agentId || undefined,
      });
      setScopeForm({ label: '', score: '8', description: '', agentId: '' });
      await fetchDetail(selected.id);
      await fetchNeeds();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo agregar el punto de alcance.');
    } finally {
      setSaving(false);
    }
  };

  const updateScopeScore = async (scope: any, score: number) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/scope-preferences/${scope.id}`, {
        label: scope.label,
        score,
        description: scope.description || undefined,
        agentId: scope.agentId || undefined,
      });
      await fetchDetail(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo editar el punto de alcance.');
    } finally {
      setSaving(false);
    }
  };

  const deleteScope = async (scopeId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.delete(`/scope-preferences/${scopeId}`);
      await fetchDetail(selected.id);
      await fetchNeeds();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo eliminar el punto de alcance.');
    } finally {
      setSaving(false);
    }
  };

  const addAgent = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/external-needs/${selected.id}/agents`, {
        name: agentForm.name.trim(),
        email: agentForm.email.trim() || undefined,
        organization: agentForm.organization.trim() || undefined,
        role: agentForm.role,
        notes: agentForm.notes.trim() || undefined,
      });
      setAgentForm({ name: '', email: '', organization: '', role: 'CLIENT', notes: '' });
      await fetchDetail(selected.id);
      await fetchNeeds();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo agregar el agente externo.');
    } finally {
      setSaving(false);
    }
  };

  const createSolution = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/external-needs/${selected.id}/solutions`, {
        title: solutionForm.title.trim(),
        description: solutionForm.description.trim(),
        estimatedFiatMin: solutionForm.estimatedFiatMin || undefined,
        estimatedFiatExpected: solutionForm.estimatedFiatExpected || undefined,
        estimatedFiatMax: solutionForm.estimatedFiatMax || undefined,
        currency: solutionForm.currency,
        estimatedBerries: solutionForm.estimatedBerries || undefined,
        estimatedDurationDays: solutionForm.estimatedDurationDays || undefined,
        riskLevel: solutionForm.riskLevel,
        assumptions: solutionForm.assumptions.trim() || undefined,
        included: solutionForm.included.trim() || undefined,
        excluded: solutionForm.excluded.trim() || undefined,
        deliverables: solutionForm.deliverables.trim() || undefined,
        acceptanceCriteria: solutionForm.acceptanceCriteria.trim() || undefined,
        maintenanceNotes: solutionForm.maintenanceNotes.trim() || undefined,
        scopeAlignmentJson: solutionForm.scopeAlignmentText.trim() ? { general: solutionForm.scopeAlignmentText.trim() } : undefined,
      });
      setSolutionForm({
        title: '',
        description: '',
        estimatedFiatMin: '',
        estimatedFiatExpected: '',
        estimatedFiatMax: '',
        currency: 'CLP',
        estimatedBerries: '',
        estimatedDurationDays: '',
        riskLevel: 'MEDIUM',
        assumptions: '',
        included: '',
        excluded: '',
        deliverables: '',
        acceptanceCriteria: '',
        maintenanceNotes: '',
        scopeAlignmentText: '',
      });
      await fetchNeeds();
      await fetchDetail(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo crear la propuesta.');
    } finally {
      setSaving(false);
    }
  };

  const solutionAction = async (solutionId: string, action: 'submit' | 'review' | 'approve-tree' | 'approve-client' | 'select' | 'reject' | 'archive') => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/solution-proposals/${solutionId}/${action}`);
      await fetchNeeds();
      await fetchDetail(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo actualizar la solucion.');
    } finally {
      setSaving(false);
    }
  };

  const addBudgetLine = async (solutionId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/solution-proposals/${solutionId}/budget-lines`, {
        label: budgetLineForm.label.trim(),
        description: budgetLineForm.description.trim() || undefined,
        type: budgetLineForm.type,
        estimatedFiat: budgetLineForm.estimatedFiat || undefined,
        estimatedBerries: budgetLineForm.estimatedBerries || undefined,
        quantity: budgetLineForm.quantity || undefined,
        unit: budgetLineForm.unit.trim() || undefined,
        unitCostFiat: budgetLineForm.unitCostFiat || undefined,
      });
      setBudgetLineForm({ label: '', description: '', type: 'LABOR', estimatedFiat: '', estimatedBerries: '', quantity: '', unit: '', unitCostFiat: '' });
      setBudgetLineTargetId(null);
      await fetchDetail(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo agregar la linea de presupuesto.');
    } finally {
      setSaving(false);
    }
  };

  const deleteBudgetLine = async (budgetLineId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.delete(`/budget-lines/${budgetLineId}`);
      await fetchDetail(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo eliminar la linea.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.85fr) minmax(320px, 1.35fr)', gap: '1rem' }}>
      <section className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BriefcaseBusiness size={20} color="var(--accent-primary)" />
              <h3 style={{ margin: 0 }}>Necesidades Externas</h3>
            </div>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
              Encargos de clientes o sponsors. No consumen Puntos de Necesidad ni compran autoridad en el Tree.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate((value) => !value)} style={{ flexShrink: 0 }}>
            <Plus size={16} /> Nueva
          </button>
        </div>

        {error && (
          <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--accent-danger)', fontSize: '0.8rem' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {showCreate && (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '1rem', display: 'grid', gap: '0.8rem' }}>
            <Field label="Titulo">
              <input style={inputStyle} value={needForm.title} onChange={(e) => setNeedForm({ ...needForm, title: e.target.value })} />
            </Field>
            <Field label="Descripcion">
              <textarea style={{ ...inputStyle, minHeight: 88 }} value={needForm.description} onChange={(e) => setNeedForm({ ...needForm, description: e.target.value })} />
            </Field>
            <Field label="Cliente / resumen">
              <input style={inputStyle} value={needForm.clientSummary} onChange={(e) => setNeedForm({ ...needForm, clientSummary: e.target.value })} />
            </Field>
            <Field label="Resultado esperado">
              <input style={inputStyle} value={needForm.desiredOutcome} onChange={(e) => setNeedForm({ ...needForm, desiredOutcome: e.target.value })} />
            </Field>
            <Field label="Restricciones">
              <input style={inputStyle} value={needForm.constraints} onChange={(e) => setNeedForm({ ...needForm, constraints: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: '0.5rem' }}>
              <Field label="Min fiat">
                <input type="number" min="0" style={inputStyle} value={needForm.budgetMinFiat} onChange={(e) => setNeedForm({ ...needForm, budgetMinFiat: e.target.value })} />
              </Field>
              <Field label="Max fiat">
                <input type="number" min="0" style={inputStyle} value={needForm.budgetMaxFiat} onChange={(e) => setNeedForm({ ...needForm, budgetMaxFiat: e.target.value })} />
              </Field>
              <Field label="Moneda">
                <input style={inputStyle} value={needForm.currency} onChange={(e) => setNeedForm({ ...needForm, currency: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <Field label="Deadline">
              <input type="date" style={inputStyle} value={needForm.deadline} onChange={(e) => setNeedForm({ ...needForm, deadline: e.target.value })} />
            </Field>
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Agente externo inicial</div>
              <input placeholder="Nombre" style={inputStyle} value={needForm.agentName} onChange={(e) => setNeedForm({ ...needForm, agentName: e.target.value })} />
              <input placeholder="Email privado" style={inputStyle} value={needForm.agentEmail} onChange={(e) => setNeedForm({ ...needForm, agentEmail: e.target.value })} />
              <input placeholder="Organizacion" style={inputStyle} value={needForm.agentOrganization} onChange={(e) => setNeedForm({ ...needForm, agentOrganization: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={saving || !needForm.title.trim() || !needForm.description.trim()} onClick={createNeed}>
              {saving ? 'Guardando...' : 'Crear Necesidad Externa'}
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
        ) : needs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Aun no hay encargos externos en este Tree.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {needs.map((need) => {
              const active = need.id === selectedId;
              return (
                <button
                  key={need.id}
                  onClick={() => setSelectedId(need.id)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 8,
                    padding: '0.85rem',
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                    <strong>{need.title}</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 800 }}>{statusLabels[need.status] || need.status}</span>
                  </div>
                  <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                    {need.clientSummary || 'Sin cliente resumido'} · {need.counts?.solutions || 0} soluciones
                  </div>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                    {formatFiat(need.budgetMinFiat, need.budgetMaxFiat, need.currency)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-panel" style={{ padding: '1.25rem', minHeight: 520 }}>
        {!selectedSummary && !selected ? (
          <p style={{ color: 'var(--text-secondary)' }}>Selecciona una Necesidad Externa para revisar alcance y soluciones.</p>
        ) : detailLoading || !selected ? (
          <p style={{ color: 'var(--text-secondary)' }}>Cargando detalle...</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 800 }}>{statusLabels[selected.status] || selected.status}</div>
                <h2 style={{ margin: '0.2rem 0' }}>{selected.title}</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{selected.description}</p>
              </div>
              {isTreeAdmin && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runNeedAction('open')}>Abrir</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runNeedAction('approve')}><CheckCircle2 size={15} /> Aprobar</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runNeedAction('reject')}><XCircle size={15} /> Rechazar</button>
                  <button className="btn btn-outline" disabled={saving} onClick={() => runNeedAction('cancel')}>Cancelar</button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem' }}>
              <Info title="Cliente" value={selected.clientSummary || 'No indicado'} />
              <Info title="Presupuesto" value={formatFiat(selected.budgetMinFiat, selected.budgetMaxFiat, selected.currency)} />
              <Info title="Deadline" value={selected.deadline ? new Date(selected.deadline).toLocaleDateString() : 'Sin fecha'} />
              <Info title="Visibilidad" value={selected.visibility} />
            </div>

            <div style={{ padding: '0.85rem', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
              El cliente externo puede definir alcance y presupuesto, pero no obtiene votos, XP, nivel, reputacion ni permisos politicos. El XP solo aparece cuando esto se transforma en tareas verificadas.
            </div>

            <Block title="Agentes externos">
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {(selected.agents || []).length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Sin agentes registrados.</span>}
                {(selected.agents || []).map((agent: any) => (
                  <div key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.83rem' }}>
                    <span>{agent.name} {agent.organization ? `· ${agent.organization}` : ''}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{agent.role}{agent.email ? ` · ${agent.email}` : ''}</span>
                  </div>
                ))}
              </div>
              {isTreeAdmin && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.85rem' }}>
                  <input placeholder="Nombre" style={inputStyle} value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} />
                  <input placeholder="Email privado" style={inputStyle} value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} />
                  <input placeholder="Organizacion" style={inputStyle} value={agentForm.organization} onChange={(e) => setAgentForm({ ...agentForm, organization: e.target.value })} />
                  <select style={inputStyle} value={agentForm.role} onChange={(e) => setAgentForm({ ...agentForm, role: e.target.value })}>
                    <option value="CLIENT">Cliente</option>
                    <option value="SPONSOR">Sponsor</option>
                    <option value="CONTACT">Contacto</option>
                    <option value="APPROVER">Aprobador</option>
                    <option value="OBSERVER">Observador</option>
                  </select>
                  <button className="btn btn-outline" disabled={saving || !agentForm.name.trim()} onClick={addAgent}>Agregar agente</button>
                </div>
              )}
            </Block>

            <Block title="Puntos de Alcance">
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                Estos puntos muestran que aspectos importan mas al cliente o sponsor externo. No son votos del Tree, no afectan Puntos de Necesidad internos y no otorgan autoridad.
              </p>

              {(scopeSummary?.items || []).length > 0 && (
                <div style={{ display: 'grid', gap: '0.55rem', padding: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase' }}>
                    Prioridades relativas agregadas
                  </div>
                  {scopeSummary.items.map((item: any) => (
                    <div key={item.labelKey || item.label} style={{ display: 'grid', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.82rem' }}>
                        <strong>{item.label}</strong>
                        <span style={{ color: 'var(--text-secondary)' }}>{Math.round(item.normalizedWeight * 100)}% · promedio {item.averageScore}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(2, item.normalizedWeight * 100)}%`, height: '100%', background: 'var(--accent-primary)' }} />
                      </div>
                    </div>
                  ))}
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                    Si todo se marca con 10, el peso se reparte igual. Sirve para trade-offs, no para comprar prioridad politica.
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {(selected.scopePoints || []).length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Sin preferencias de alcance.</span>}
                {(selected.scopePoints || []).map((scope: any) => (
                  <div key={scope.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', fontSize: '0.83rem', alignItems: 'center' }}>
                    <span>
                      {scope.label}{scope.description ? ` · ${scope.description}` : ''}
                      {scope.agent ? <span style={{ color: 'var(--text-secondary)' }}> · {scope.agent.name}</span> : null}
                      {scope.normalizedWeight != null ? <span style={{ color: 'var(--text-secondary)' }}> · {Math.round(scope.normalizedWeight * 100)}%</span> : null}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {isTreeAdmin ? (
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={scope.score}
                          disabled={saving}
                          onChange={(e) => updateScopeScore(scope, Number(e.target.value))}
                          style={{ ...inputStyle, width: 72, padding: '0.4rem 0.5rem' }}
                        />
                      ) : (
                        <strong>{scope.score}/10</strong>
                      )}
                      {isTreeAdmin && (
                        <button className="btn btn-outline" disabled={saving} onClick={() => deleteScope(scope.id)} style={{ padding: '0.35rem 0.55rem' }}>
                          Eliminar
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '0.5rem', marginTop: '0.85rem' }}>
                <input list="scope-criteria" placeholder="rapidez, bajo costo, seguridad..." style={inputStyle} value={scopeForm.label} onChange={(e) => setScopeForm({ ...scopeForm, label: e.target.value })} />
                <datalist id="scope-criteria">
                  {suggestedCriteria.map((criterion) => <option key={criterion} value={criterion} />)}
                </datalist>
                <input type="number" min="1" max="10" style={inputStyle} value={scopeForm.score} onChange={(e) => setScopeForm({ ...scopeForm, score: e.target.value })} />
                <input placeholder="Descripcion opcional" style={inputStyle} value={scopeForm.description} onChange={(e) => setScopeForm({ ...scopeForm, description: e.target.value })} />
                <select style={inputStyle} value={scopeForm.agentId} onChange={(e) => setScopeForm({ ...scopeForm, agentId: e.target.value })}>
                  <option value="">Preferencia general</option>
                  {(selected.agents || []).map((agent: any) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <button className="btn btn-outline" disabled={saving || !scopeForm.label.trim()} onClick={addScope}>Agregar</button>
              </div>
            </Block>

            <Block title="Propuestas de solucion">
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                {(selected.solutions || []).length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Aun no hay soluciones propuestas.</span>}
                {(selected.solutions || []).map((solution: any) => {
                  const summary = budgetSummaries[solution.id];
                  return (
                    <div key={solution.id} style={{ border: `1px solid ${solution.status === 'SELECTED' ? 'var(--accent-primary)' : 'var(--border-color)'}`, borderRadius: 8, padding: '0.85rem', display: 'grid', gap: '0.7rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <strong>{solution.title}</strong>
                        <span style={{ color: 'var(--accent-primary)', fontSize: '0.72rem', fontWeight: 800 }}>
                          {solutionStatusLabels[solution.status] || solution.status}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>{solution.description}</p>
                      <div style={{ display: 'flex', gap: '0.8rem', color: 'var(--text-secondary)', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                        <span>{formatSolutionFiat(solution)}</span>
                        <span>{formatFiat(solution.estimatedFiatMin, solution.estimatedFiatMax, solution.currency)}</span>
                        <span>{solution.estimatedBerries ?? 0} Berries estimadas</span>
                        <span>{solution.estimatedDurationDays ?? 'Sin'} dias</span>
                        <span>Riesgo {riskLabels[solution.riskLevel] || solution.riskLevel}</span>
                      </div>
                      {(solution.assumptions || solution.deliverables || solution.acceptanceCriteria) && (
                        <div style={{ display: 'grid', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.45 }}>
                          {solution.assumptions && <span><strong style={{ color: 'var(--text-primary)' }}>Supuestos:</strong> {solution.assumptions}</span>}
                          {solution.deliverables && <span><strong style={{ color: 'var(--text-primary)' }}>Entregables:</strong> {solution.deliverables}</span>}
                          {solution.acceptanceCriteria && <span><strong style={{ color: 'var(--text-primary)' }}>Aceptacion:</strong> {solution.acceptanceCriteria}</span>}
                        </div>
                      )}
                      {summary && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.65rem', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.78rem' }}>
                            <strong>Resumen presupuesto</strong>
                            <span style={{ color: 'var(--text-secondary)' }}>{summary.currency} {Number(summary.budgetLineTotalFiat || 0).toLocaleString()} en lineas</span>
                          </div>
                          {(summary.linesByType || []).length > 0 && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {summary.linesByType.map((line: any) => (
                                <span key={line.type} style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                                  {budgetLineTypeLabels[line.type] || line.type}: {solution.currency || 'CLP'} {Number(line.totalFiat || 0).toLocaleString()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(solution.budgetLines || []).length > 0 && (
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                          {(solution.budgetLines || []).map((line: any) => (
                            <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', fontSize: '0.76rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
                              <span>
                                <strong style={{ color: 'var(--text-primary)' }}>{line.label}</strong> · {budgetLineTypeLabels[line.type] || line.type}
                                {line.estimatedFiat != null ? ` · ${line.currency || solution.currency || 'CLP'} ${Number(line.estimatedFiat).toLocaleString()}` : ''}
                                {line.estimatedBerries != null ? ` · ${line.estimatedBerries} Berries` : ''}
                              </span>
                              <button className="btn btn-outline" disabled={saving} onClick={() => deleteBudgetLine(line.id)} style={{ padding: '0.35rem 0.55rem' }}>Eliminar</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {budgetLineTargetId === solution.id ? (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.65rem', display: 'grid', gap: '0.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px', gap: '0.5rem' }}>
                            <input placeholder="Linea: labor, materiales..." style={inputStyle} value={budgetLineForm.label} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, label: e.target.value })} />
                            <select style={inputStyle} value={budgetLineForm.type} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, type: e.target.value })}>
                              {Object.entries(budgetLineTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <input type="number" min="0" placeholder="Costo fiat" style={inputStyle} value={budgetLineForm.estimatedFiat} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, estimatedFiat: e.target.value })} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                            <input type="number" min="0" placeholder="Berries opcional" style={inputStyle} value={budgetLineForm.estimatedBerries} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, estimatedBerries: e.target.value })} />
                            <input type="number" min="0" placeholder="Cantidad" style={inputStyle} value={budgetLineForm.quantity} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, quantity: e.target.value })} />
                            <input placeholder="Unidad" style={inputStyle} value={budgetLineForm.unit} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, unit: e.target.value })} />
                          </div>
                          <input placeholder="Descripcion de la linea" style={inputStyle} value={budgetLineForm.description} onChange={(e) => setBudgetLineForm({ ...budgetLineForm, description: e.target.value })} />
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-primary" disabled={saving || !budgetLineForm.label.trim()} onClick={() => addBudgetLine(solution.id)}>Guardar linea</button>
                            <button className="btn btn-outline" disabled={saving} onClick={() => setBudgetLineTargetId(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-outline" disabled={saving || ['REJECTED', 'ARCHIVED', 'SELECTED'].includes(solution.status)} onClick={() => setBudgetLineTargetId(solution.id)}>
                          Agregar linea de presupuesto
                        </button>
                      )}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" disabled={saving} onClick={() => solutionAction(solution.id, 'submit')}><Send size={14} /> Enviar</button>
                        {isTreeAdmin && <button className="btn btn-outline" disabled={saving} onClick={() => solutionAction(solution.id, 'review')}>Revisar</button>}
                        {isTreeAdmin && <button className="btn btn-outline" disabled={saving} onClick={() => solutionAction(solution.id, 'approve-tree')}>Aprobar Tree</button>}
                        {isTreeAdmin && <button className="btn btn-outline" disabled={saving} onClick={() => solutionAction(solution.id, 'approve-client')}>Aprobar cliente</button>}
                        {isTreeAdmin && <button className="btn btn-outline" disabled={saving || solution.status === 'DRAFT'} onClick={() => solutionAction(solution.id, 'select')}>Seleccionar</button>}
                        {isTreeAdmin && <button className="btn btn-outline" disabled={saving} onClick={() => solutionAction(solution.id, 'reject')}>Rechazar</button>}
                        {isTreeAdmin && <button className="btn btn-outline" disabled={saving} onClick={() => solutionAction(solution.id, 'archive')}>Archivar</button>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem', display: 'grid', gap: '0.65rem' }}>
                <div style={{ fontWeight: 800 }}>Nueva propuesta</div>
                {(scopeSummary?.items || []).length > 0 && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem', background: 'rgba(59,130,246,0.06)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Prioridades del cliente para disenar la solucion
                    </div>
                    <ol style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                      {scopeSummary.items.map((item: any) => (
                        <li key={item.labelKey || item.label}>
                          <strong style={{ color: 'var(--text-primary)' }}>{item.label}</strong> - {Math.round(item.normalizedWeight * 100)}%
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <input placeholder="Titulo" style={inputStyle} value={solutionForm.title} onChange={(e) => setSolutionForm({ ...solutionForm, title: e.target.value })} />
                <textarea placeholder="Descripcion" style={{ ...inputStyle, minHeight: 82 }} value={solutionForm.description} onChange={(e) => setSolutionForm({ ...solutionForm, description: e.target.value })} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px', gap: '0.5rem' }}>
                  <input type="number" min="0" placeholder="Fiat min" style={inputStyle} value={solutionForm.estimatedFiatMin} onChange={(e) => setSolutionForm({ ...solutionForm, estimatedFiatMin: e.target.value })} />
                  <input type="number" min="0" placeholder="Fiat esperado" style={inputStyle} value={solutionForm.estimatedFiatExpected} onChange={(e) => setSolutionForm({ ...solutionForm, estimatedFiatExpected: e.target.value })} />
                  <input type="number" min="0" placeholder="Fiat max" style={inputStyle} value={solutionForm.estimatedFiatMax} onChange={(e) => setSolutionForm({ ...solutionForm, estimatedFiatMax: e.target.value })} />
                  <input style={inputStyle} value={solutionForm.currency} onChange={(e) => setSolutionForm({ ...solutionForm, currency: e.target.value.toUpperCase() })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <input type="number" min="0" placeholder="Berries estimadas" style={inputStyle} value={solutionForm.estimatedBerries} onChange={(e) => setSolutionForm({ ...solutionForm, estimatedBerries: e.target.value })} />
                  <input type="number" min="0" placeholder="Dias estimados" style={inputStyle} value={solutionForm.estimatedDurationDays} onChange={(e) => setSolutionForm({ ...solutionForm, estimatedDurationDays: e.target.value })} />
                  <select style={inputStyle} value={solutionForm.riskLevel} onChange={(e) => setSolutionForm({ ...solutionForm, riskLevel: e.target.value })}>
                    <option value="LOW">Riesgo bajo</option>
                    <option value="MEDIUM">Riesgo medio</option>
                    <option value="HIGH">Riesgo alto</option>
                    <option value="CRITICAL">Riesgo critico</option>
                  </select>
                </div>
                <input placeholder="Supuestos" style={inputStyle} value={solutionForm.assumptions} onChange={(e) => setSolutionForm({ ...solutionForm, assumptions: e.target.value })} />
                <input placeholder="Incluye" style={inputStyle} value={solutionForm.included} onChange={(e) => setSolutionForm({ ...solutionForm, included: e.target.value })} />
                <input placeholder="Excluye" style={inputStyle} value={solutionForm.excluded} onChange={(e) => setSolutionForm({ ...solutionForm, excluded: e.target.value })} />
                <textarea placeholder="Entregables" style={{ ...inputStyle, minHeight: 70 }} value={solutionForm.deliverables} onChange={(e) => setSolutionForm({ ...solutionForm, deliverables: e.target.value })} />
                <textarea placeholder="Criterios de aceptacion" style={{ ...inputStyle, minHeight: 70 }} value={solutionForm.acceptanceCriteria} onChange={(e) => setSolutionForm({ ...solutionForm, acceptanceCriteria: e.target.value })} />
                <textarea placeholder="Como responde esta solucion a los Puntos de Alcance" style={{ ...inputStyle, minHeight: 76 }} value={solutionForm.scopeAlignmentText} onChange={(e) => setSolutionForm({ ...solutionForm, scopeAlignmentText: e.target.value })} />
                <input placeholder="Notas de mantencion" style={inputStyle} value={solutionForm.maintenanceNotes} onChange={(e) => setSolutionForm({ ...solutionForm, maintenanceNotes: e.target.value })} />
                <div style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.45 }}>
                  El presupuesto es una estimacion, no una transaccion ni contrato final. Crear, aprobar o seleccionar una solucion no otorga XP, nivel, reputacion, votos ni Berries.
                </div>
                <button className="btn btn-primary" disabled={saving || !solutionForm.title.trim() || !solutionForm.description.trim()} onClick={createSolution}>
                  Crear propuesta
                </button>
                <button className="btn btn-outline" disabled title="Proxima fase">
                  Convertir a tareas - proxima fase
                </button>
              </div>
            </Block>
          </div>
        )}
      </section>
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
