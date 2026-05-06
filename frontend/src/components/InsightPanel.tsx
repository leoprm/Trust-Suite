import { useState, useEffect, useCallback } from 'react';
import {
  Telescope, Plus, ChevronDown, ChevronRight, ArrowRight, Users,
  Building2, Search, X, CheckCircle, AlertTriangle, Loader2,
  RefreshCw, ExternalLink, FileText, Clock,
} from 'lucide-react';
import api from '../lib/api';
import ExternalOpeningPanel from './ExternalOpeningPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EscalationLevel = 'INTERNAL_TRUST' | 'EXTERNAL_PEOPLE' | 'EXTERNAL_COMPANY';
type SignalStatus = string;

interface InsightSignal {
  id: string;
  title: string;
  description: string;
  status: SignalStatus;
  escalationLevel: EscalationLevel;
  sourceType: string;
  sourceNeedId?: string;
  sourceExternalNeedId?: string;
  urgencyScore?: number;
  capacityGapScore?: number;
  strategicValueScore?: number;
  budgetFiatMin?: number;
  budgetFiatExpected?: number;
  budgetFiatMax?: number;
  currency?: string;
  estimatedBerries?: number;
  requiredSkillTags?: unknown;
  remoteAllowed: boolean;
  locationText?: string;
  resolutionNotes?: string;
  createdAt: string;
  createdBy?: { id: string; username: string };
  _count?: { internalMatches: number; externalOpenings: number; corporateReferrals: number };
}

interface InternalMatch {
  id: string;
  matchType: string;
  status: string;
  matchScore?: number;
  skillTags?: unknown;
  evidenceSummary?: string;
  availabilityNote?: string;
  user?: { id: string; username: string };
  branchId?: string;
  treeId?: string;
  createdAt: string;
}

interface ExternalOpening {
  id: string;
  title: string;
  description: string;
  status: string;
  requiredSkillTags?: unknown;
  paymentFiatExpected?: number;
  currency?: string;
  remoteAllowed: boolean;
  locationText?: string;
  applicationDeadline?: string;
  _count?: { applications: number };
  createdAt: string;
}

interface CorporateReferral {
  id: string;
  providerName: string;
  status: string;
  reasonForEscalation?: string;
  estimatedFiatMin?: number;
  estimatedFiatMax?: number;
  currency?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  INTERNAL_TRUST: 'Interno Trust',
  EXTERNAL_PEOPLE: 'Personas externas',
  EXTERNAL_COMPANY: 'Empresa externa',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  INTERNAL_SEARCH: 'Búsqueda interna',
  INTERNAL_SOLUTION_FOUND: 'Solución interna hallada',
  EXTERNAL_PEOPLE_OPEN: 'Convocatoria abierta',
  EXTERNAL_PEOPLE_IN_REVIEW: 'Revisando candidatos',
  EXTERNAL_PEOPLE_FAILED: 'Sin candidatos suficientes',
  CORPORATE_REFERRAL_OPEN: 'Derivando a empresa',
  CORPORATE_REFERRAL_SELECTED: 'Empresa seleccionada',
  RESOLVED: 'Resuelto',
  CANCELLED: 'Cancelado',
  ARCHIVED: 'Archivado',
};

const SOURCE_LABELS: Record<string, string> = {
  INTERNAL_NEED: 'Necesidad interna',
  EXTERNAL_NEED: 'Necesidad externa',
  BRANCH: 'Rama',
  SOLUTION_PROPOSAL: 'Propuesta de solución',
  TASK_PATTERN: 'Patrón de tareas',
  MANUAL: 'Manual',
};

function escalationColor(level: EscalationLevel): string {
  if (level === 'INTERNAL_TRUST') return 'var(--accent-success, #10b981)';
  if (level === 'EXTERNAL_PEOPLE') return 'var(--accent-warning, #f59e0b)';
  return 'var(--accent-danger, #ef4444)';
}

function statusColor(status: string): string {
  if (['RESOLVED', 'INTERNAL_SOLUTION_FOUND', 'CORPORATE_REFERRAL_SELECTED'].includes(status)) return 'var(--accent-success, #10b981)';
  if (['CANCELLED', 'ARCHIVED', 'EXTERNAL_PEOPLE_FAILED'].includes(status)) return 'var(--text-secondary)';
  if (['CORPORATE_REFERRAL_OPEN', 'EXTERNAL_PEOPLE_FAILED'].includes(status)) return 'var(--accent-danger, #ef4444)';
  return 'var(--accent-primary)';
}

function scoreBadge(score?: number): string {
  if (!score) return '—';
  if (score >= 8) return `${score} 🔴`;
  if (score >= 5) return `${score} 🟡`;
  return `${score} 🟢`;
}

function skillList(tags: unknown): string {
  if (!tags) return '—';
  if (Array.isArray(tags)) return tags.join(', ');
  if (typeof tags === 'object') return Object.values(tags as Record<string, unknown>).join(', ');
  return String(tags);
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Insight Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CreateModalProps {
  treeId: string;
  onClose: () => void;
  onCreated: () => void;
  prefill?: {
    sourceType?: string;
    sourceNeedId?: string;
    sourceExternalNeedId?: string;
    title?: string;
    description?: string;
  };
}

function CreateInsightModal({ treeId, onClose, onCreated, prefill }: CreateModalProps) {
  const [form, setForm] = useState({
    title: prefill?.title ?? '',
    description: prefill?.description ?? '',
    sourceType: prefill?.sourceType ?? 'MANUAL',
    sourceNeedId: prefill?.sourceNeedId ?? '',
    sourceExternalNeedId: prefill?.sourceExternalNeedId ?? '',
    urgencyScore: '',
    capacityGapScore: '',
    strategicValueScore: '',
    budgetFiatMin: '',
    budgetFiatExpected: '',
    budgetFiatMax: '',
    currency: 'CLP',
    requiredSkillTags: '',
    locationText: '',
    remoteAllowed: true,
    estimatedBerries: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) { setError('Título y descripción son requeridos'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/trees/${treeId}/insights`, {
        ...form,
        urgencyScore: form.urgencyScore ? Number(form.urgencyScore) : undefined,
        capacityGapScore: form.capacityGapScore ? Number(form.capacityGapScore) : undefined,
        strategicValueScore: form.strategicValueScore ? Number(form.strategicValueScore) : undefined,
        budgetFiatMin: form.budgetFiatMin ? Number(form.budgetFiatMin) : undefined,
        budgetFiatExpected: form.budgetFiatExpected ? Number(form.budgetFiatExpected) : undefined,
        budgetFiatMax: form.budgetFiatMax ? Number(form.budgetFiatMax) : undefined,
        estimatedBerries: form.estimatedBerries ? Number(form.estimatedBerries) : undefined,
        requiredSkillTags: form.requiredSkillTags
          ? form.requiredSkillTags.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        sourceNeedId: form.sourceNeedId || undefined,
        sourceExternalNeedId: form.sourceExternalNeedId || undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Error al crear Insight');
    }
    setSaving(false);
  }

  const field = (key: keyof typeof form, label: string, type: string = 'text', placeholder: string = '') => (
    <div>
      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(p => ({ ...p, [key]: type === 'number' ? e.target.value : e.target.value }))}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--input-bg, rgba(255,255,255,0.07))',
          border: '1px solid var(--border-color)', borderRadius: 6,
          padding: '0.5rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem',
        }}
      />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '1.75rem', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Telescope size={20} /> Crear Insight Signal
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {field('title', 'Título *', 'text', 'Nombre de la señal')}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Descripción *</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe el problema, la brecha o la necesidad persistente..." rows={3} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.5rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Tipo de origen</label>
            <select value={form.sourceType} onChange={e => setForm(p => ({ ...p, sourceType: e.target.value }))} style={{ width: '100%', background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.5rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            {field('urgencyScore', 'Urgencia (1-10)', 'number', '7')}
            {field('capacityGapScore', 'Brecha de capacidad', 'number', '8')}
            {field('strategicValueScore', 'Valor estratégico', 'number', '6')}
          </div>
          {field('requiredSkillTags', 'Habilidades requeridas (separadas por coma)', 'text', 'React, Docker, gestión de proyectos')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            {field('budgetFiatMin', 'Pres. mín. fiat', 'number', '0')}
            {field('budgetFiatExpected', 'Pres. esperado', 'number', '500000')}
            {field('budgetFiatMax', 'Pres. máx. fiat', 'number', '1000000')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {field('locationText', 'Ubicación', 'text', 'Santiago, Chile')}
            {field('estimatedBerries', 'Berries estimadas', 'number', '500')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <input type="checkbox" id="remoteAllowed" checked={form.remoteAllowed} onChange={e => setForm(p => ({ ...p, remoteAllowed: e.target.checked }))} />
            <label htmlFor="remoteAllowed" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>Permite trabajo remoto</label>
          </div>
          {error && <div style={{ color: 'var(--accent-danger, #ef4444)', fontSize: '0.8rem' }}>{error}</div>}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            ⚠️ Trust Insight no otorga XP, no crea pagos fiat ni emite Berries.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn" style={{ fontSize: '0.85rem' }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Crear Insight
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight Detail Panel
// ─────────────────────────────────────────────────────────────────────────────

function InsightDetailPanel({ insight, treeId, isAdmin, onBack, onRefresh }: {
  insight: InsightSignal;
  treeId: string;
  isAdmin: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [detailTab, setDetailTab] = useState<'internal' | 'external' | 'corporate' | 'overview'>('overview');
  const [internalMatches, setInternalMatches] = useState<InternalMatch[]>([]);
  const [openings, setOpenings] = useState<ExternalOpening[]>([]);
  const [referrals, setReferrals] = useState<CorporateReferral[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [matchForm, setMatchForm] = useState({ matchType: 'USER', userId: '', branchId: '', evidenceSummary: '', availabilityNote: '' });
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [openingForm, setOpeningForm] = useState({ title: '', description: '', desiredEvidence: '', requiredSkillTags: '', paymentFiatExpected: '', applicationDeadline: '' });
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [referralForm, setReferralForm] = useState({ providerName: '', reasonForEscalation: '', expectedScope: '', estimatedFiatMin: '', estimatedFiatMax: '' });
  const [showApplyForm, setShowApplyForm] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState({ applicantName: '', applicantEmail: '', applicantSummary: '', portfolioUrl: '', skillTags: '', privacyConsent: false });

  const fetchDetail = useCallback(async () => {
    const [m, o, r] = await Promise.all([
      api.get(`/insights/${insight.id}/internal-matches`).then(r => r.data).catch(() => []),
      api.get(`/insights/${insight.id}/external-openings`).then(r => r.data).catch(() => []),
      isAdmin ? api.get(`/insights/${insight.id}/corporate-referrals`).then(r => r.data).catch(() => []) : Promise.resolve([]),
    ]);
    setInternalMatches(m);
    setOpenings(o);
    setReferrals(r);
  }, [insight.id, isAdmin]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function doTransition(url: string, body: Record<string, unknown> = {}) {
    setTransitioning(true); setTransitionError('');
    try {
      await api.post(url, body);
      onRefresh();
    } catch (err: any) {
      setTransitionError(err?.response?.data?.error ?? 'Error');
    }
    setTransitioning(false);
  }

  async function addMatch() {
    try {
      await api.post(`/insights/${insight.id}/internal-matches`, {
        matchType: matchForm.matchType,
        userId: matchForm.userId || undefined,
        branchId: matchForm.branchId || undefined,
        evidenceSummary: matchForm.evidenceSummary || undefined,
        availabilityNote: matchForm.availabilityNote || undefined,
      });
      setShowMatchForm(false);
      fetchDetail();
    } catch (err: any) { setTransitionError(err?.response?.data?.error ?? 'Error'); }
  }

  async function addOpening() {
    try {
      await api.post(`/insights/${insight.id}/external-openings`, {
        title: openingForm.title,
        description: openingForm.description,
        desiredEvidence: openingForm.desiredEvidence || undefined,
        requiredSkillTags: openingForm.requiredSkillTags ? openingForm.requiredSkillTags.split(',').map(s => s.trim()) : undefined,
        paymentFiatExpected: openingForm.paymentFiatExpected ? Number(openingForm.paymentFiatExpected) : undefined,
        applicationDeadline: openingForm.applicationDeadline || undefined,
      });
      setShowOpeningForm(false);
      fetchDetail();
    } catch (err: any) { setTransitionError(err?.response?.data?.error ?? 'Error'); }
  }

  async function addReferral() {
    try {
      await api.post(`/insights/${insight.id}/corporate-referrals`, {
        providerName: referralForm.providerName,
        reasonForEscalation: referralForm.reasonForEscalation || undefined,
        expectedScope: referralForm.expectedScope || undefined,
        estimatedFiatMin: referralForm.estimatedFiatMin ? Number(referralForm.estimatedFiatMin) : undefined,
        estimatedFiatMax: referralForm.estimatedFiatMax ? Number(referralForm.estimatedFiatMax) : undefined,
      });
      setShowReferralForm(false);
      fetchDetail();
    } catch (err: any) { setTransitionError(err?.response?.data?.error ?? 'Error'); }
  }

  async function applyNow(openingId: string) {
    try {
      await api.post(`/insight-openings/${openingId}/applications`, {
        applicantName: applyForm.applicantName,
        applicantEmail: applyForm.applicantEmail || undefined,
        applicantSummary: applyForm.applicantSummary || undefined,
        portfolioUrl: applyForm.portfolioUrl || undefined,
        skillTags: applyForm.skillTags ? applyForm.skillTags.split(',').map(s => s.trim()) : undefined,
        privacyConsent: applyForm.privacyConsent,
      });
      setShowApplyForm(null);
      fetchDetail();
    } catch (err: any) { setTransitionError(err?.response?.data?.error ?? 'Error'); }
  }

  const isTerminal = ['RESOLVED', 'CANCELLED', 'ARCHIVED'].includes(insight.status);

  const tabBtn = (t: typeof detailTab, label: string, icon: React.ReactNode) => (
    <button onClick={() => setDetailTab(t)} style={{ background: 'none', border: 'none', borderRadius: 0, borderBottom: detailTab === t ? '2px solid var(--accent-primary)' : '2px solid transparent', color: detailTab === t ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '0.5rem 0.75rem', cursor: 'pointer', fontWeight: detailTab === t ? 700 : 400, fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      {icon}{label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Breadcrumb */}
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.82rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        ← Volver a lista
      </button>

      {/* Header */}
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.25rem', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.1rem' }}>{insight.title}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: `${escalationColor(insight.escalationLevel)}22`, color: escalationColor(insight.escalationLevel) }}>
                {ESCALATION_LABELS[insight.escalationLevel]}
              </span>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: `${statusColor(insight.status)}22`, color: statusColor(insight.status) }}>
                {STATUS_LABELS[insight.status] ?? insight.status}
              </span>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                {SOURCE_LABELS[insight.sourceType] ?? insight.sourceType}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{insight.description}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
            <span>Urgencia: {scoreBadge(insight.urgencyScore)}</span>
            <span>Brecha: {scoreBadge(insight.capacityGapScore)}</span>
            {insight.budgetFiatExpected && <span>Presupuesto: {insight.budgetFiatExpected.toLocaleString('es-CL')} {insight.currency}</span>}
            {insight.remoteAllowed && <span style={{ color: 'var(--accent-success)' }}>✓ Remoto</span>}
            {insight.locationText && <span>{insight.locationText}</span>}
          </div>
        </div>

        {/* Action buttons */}
        {isAdmin && !isTerminal && (
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {insight.status === 'DRAFT' && (
              <button onClick={() => doTransition(`/insights/${insight.id}/activate`)} className="btn btn-primary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} disabled={transitioning}>
                <CheckCircle size={13} /> Activar
              </button>
            )}
            {insight.status === 'ACTIVE' && (
              <button onClick={() => doTransition(`/insights/${insight.id}/start-internal-search`)} className="btn btn-primary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} disabled={transitioning}>
                <Search size={13} /> Iniciar búsqueda interna
              </button>
            )}
            {insight.status === 'INTERNAL_SEARCH' && (
              <>
                <button onClick={() => doTransition(`/insights/${insight.id}/mark-internal-solution-found`)} className="btn btn-primary" style={{ fontSize: '0.78rem' }} disabled={transitioning}>✓ Solución interna encontrada</button>
                <button onClick={() => doTransition(`/insights/${insight.id}/escalate-to-external-people`, { reason: 'Sin capacidad interna suficiente' })} className="btn" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} disabled={transitioning}>
                  <Users size={13} /> Escalar a personas externas
                </button>
              </>
            )}
            {['EXTERNAL_PEOPLE_OPEN', 'EXTERNAL_PEOPLE_IN_REVIEW'].includes(insight.status) && (
              <button onClick={() => doTransition(`/insights/${insight.id}/mark-external-people-failed`)} className="btn" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} disabled={transitioning}>
                <AlertTriangle size={13} /> Sin candidatos suficientes
              </button>
            )}
            {['EXTERNAL_PEOPLE_FAILED', 'CORPORATE_REFERRAL_OPEN'].includes(insight.status) && (
              <button onClick={() => { const r = window.prompt('Razón para derivar a empresa externa:'); if (r) doTransition(`/insights/${insight.id}/escalate-to-corporate`, { reason: r }); }} className="btn" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent-danger)' }} disabled={transitioning}>
                <Building2 size={13} /> Derivar a empresa externa
              </button>
            )}
            <button onClick={() => { const notes = window.prompt('Notas de resolución (opcional):') ?? undefined; doTransition(`/insights/${insight.id}/resolve`, { notes }); }} className="btn" style={{ fontSize: '0.78rem', color: 'var(--accent-success)' }} disabled={transitioning}>
              ✓ Resolver
            </button>
            <button onClick={() => doTransition(`/insights/${insight.id}/cancel`)} className="btn" style={{ fontSize: '0.78rem', color: 'var(--accent-danger)' }} disabled={transitioning}>
              Cancelar
            </button>
          </div>
        )}
        {isAdmin && ['RESOLVED', 'CANCELLED'].includes(insight.status) && (
          <div style={{ marginTop: '0.75rem' }}>
            <button onClick={() => doTransition(`/insights/${insight.id}/archive`)} className="btn" style={{ fontSize: '0.78rem' }}>Archivar</button>
          </div>
        )}
        {transitionError && <div style={{ marginTop: '0.5rem', color: 'var(--accent-danger, #ef4444)', fontSize: '0.78rem' }}>{transitionError}</div>}
      </div>

      {/* Detail tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '0.25rem' }}>
        {tabBtn('overview', 'Resumen', <FileText size={13} />)}
        {tabBtn('internal', `Búsqueda interna (${internalMatches.length})`, <Search size={13} />)}
        {tabBtn('external', `Personas externas (${openings.length})`, <Users size={13} />)}
        {isAdmin && tabBtn('corporate', `Empresas (${referrals.length})`, <Building2 size={13} />)}
      </div>

      {/* Overview */}
      {detailTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.83rem' }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '1rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>🧭 Flujo de escalamiento:</strong><br />
            <span style={{ color: escalationColor('INTERNAL_TRUST') }}>① Interno Trust</span> → <span style={{ color: escalationColor('EXTERNAL_PEOPLE') }}>② Personas externas</span> → <span style={{ color: escalationColor('EXTERNAL_COMPANY') }}>③ Empresa externa (solo si es necesario)</span><br />
            <em>Las empresas externas son la última capa, no el primer destino.</em>
          </div>
          {insight.requiredSkillTags && (
            <div><strong>Habilidades requeridas:</strong> {skillList(insight.requiredSkillTags)}</div>
          )}
          {insight.resolutionNotes && (
            <div><strong>Notas:</strong> {insight.resolutionNotes}</div>
          )}
          {insight.createdBy && (
            <div style={{ color: 'var(--text-secondary)' }}>
              Creado por <strong>{insight.createdBy.username}</strong> · {new Date(insight.createdAt).toLocaleDateString('es-CL')}
            </div>
          )}
        </div>
      )}

      {/* Internal matches */}
      {detailTab === 'internal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Primero se busca capacidad dentro de Trust: usuarios del Tree, ramas activas, tareas anteriores.
            Un humano autorizado confirma cada match.
          </div>
          {isAdmin && !isTerminal && (
            <button onClick={() => setShowMatchForm(true)} className="btn btn-primary" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-start' }}>
              <Plus size={13} /> Agregar match interno
            </button>
          )}
          {showMatchForm && isAdmin && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Tipo de match</label>
                  <select value={matchForm.matchType} onChange={e => setMatchForm(p => ({ ...p, matchType: e.target.value }))} style={{ width: '100%', background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.83rem' }}>
                    {['USER', 'BRANCH', 'TREE', 'AUTOSUSTENTO_BRANCH', 'PREVIOUS_TASK', 'SOLUTION'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {matchForm.matchType === 'USER' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>User ID (opcional)</label>
                    <input value={matchForm.userId} onChange={e => setMatchForm(p => ({ ...p, userId: e.target.value }))} style={{ width: '100%', background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.83rem' }} />
                  </div>
                )}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Resumen de evidencia</label>
                <textarea value={matchForm.evidenceSummary} onChange={e => setMatchForm(p => ({ ...p, evidenceSummary: e.target.value }))} rows={2} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.83rem', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button onClick={addMatch} className="btn btn-primary" style={{ fontSize: '0.78rem' }}>Guardar</button>
                <button onClick={() => setShowMatchForm(false)} className="btn" style={{ fontSize: '0.78rem' }}>Cancelar</button>
              </div>
            </div>
          )}
          {internalMatches.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', padding: '1.5rem' }}>Sin matches internos aún.</div>
          ) : (
            internalMatches.map(m => (
              <div key={m.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(255,255,255,0.02)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.83rem' }}>{m.matchType}{m.user ? ` — ${m.user.username}` : ''}</div>
                  {m.evidenceSummary && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{m.evidenceSummary}</div>}
                  {m.availabilityNote && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Disponibilidad: {m.availabilityNote}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 12, background: `${statusColor(m.status)}22`, color: statusColor(m.status) }}>{m.status}</span>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem' }}>
                      {m.status === 'SUGGESTED' && (
                        <button onClick={() => api.post(`/insight-internal-matches/${m.id}/select`).then(fetchDetail)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--accent-success)' }}>Seleccionar</button>
                      )}
                      {m.status !== 'DECLINED' && (
                        <button onClick={() => api.post(`/insight-internal-matches/${m.id}/decline`).then(fetchDetail)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--accent-danger)' }}>Declinar</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* External openings — delegated to ExternalOpeningPanel */}
      {detailTab === 'external' && (
        <ExternalOpeningPanel insightSignalId={insight.id} treeId={treeId} />
      )}
      {/* Corporate referrals */}
      {detailTab === 'corporate' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--accent-danger, #ef4444)' }}>⚠️ Última capa de escalamiento.</strong><br />
            Solo derivar a empresas externas si Trust y personas independientes no pueden resolver esto.<br />
            Las empresas externas <strong>no obtienen poder político ni acceso interno al Tree</strong>.
          </div>
          {!isTerminal && (
            <button onClick={() => setShowReferralForm(true)} className="btn" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-start', color: 'var(--accent-danger)' }}>
              <Building2 size={13} /> Registrar empresa externa
            </button>
          )}
          {showReferralForm && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem' }}>
              {[{ k: 'providerName', l: 'Nombre del proveedor *' }, { k: 'reasonForEscalation', l: 'Razón para escalar *' }, { k: 'expectedScope', l: 'Alcance esperado' }, { k: 'estimatedFiatMin', l: 'Costo mín. estimado' }, { k: 'estimatedFiatMax', l: 'Costo máx. estimado' }].map(({ k, l }) => (
                <div key={k} style={{ marginBottom: '0.6rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{l}</label>
                  <input value={(referralForm as any)[k]} onChange={e => setReferralForm(p => ({ ...p, [k]: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.45rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.83rem' }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={addReferral} className="btn btn-primary" style={{ fontSize: '0.78rem' }}>Registrar</button>
                <button onClick={() => setShowReferralForm(false)} className="btn" style={{ fontSize: '0.78rem' }}>Cancelar</button>
              </div>
            </div>
          )}
          {referrals.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', padding: '1.5rem' }}>Sin derivaciones corporativas aún.</div>
          ) : (
            referrals.map(ref => (
              <div key={ref.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ref.providerName}</div>
                    {ref.reasonForEscalation && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Razón: {ref.reasonForEscalation}</div>}
                    {(ref.estimatedFiatMin || ref.estimatedFiatMax) && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                        {ref.estimatedFiatMin?.toLocaleString('es-CL')} – {ref.estimatedFiatMax?.toLocaleString('es-CL')} {ref.currency}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 12, background: 'rgba(255,255,255,0.07)' }}>{ref.status}</span>
                </div>
                {!['SELECTED', 'REJECTED', 'CANCELLED'].includes(ref.status) && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    {ref.status === 'DRAFT' && <button onClick={() => api.post(`/insight-corporate-referrals/${ref.id}/contact`).then(fetchDetail)} className="btn btn-primary" style={{ fontSize: '0.72rem' }}>Contactar</button>}
                    {['CONTACTED', 'PROPOSAL_RECEIVED'].includes(ref.status) && <button onClick={() => api.post(`/insight-corporate-referrals/${ref.id}/select`).then(fetchDetail)} className="btn btn-primary" style={{ fontSize: '0.72rem' }}>Seleccionar</button>}
                    <button onClick={() => api.post(`/insight-corporate-referrals/${ref.id}/reject`).then(fetchDetail)} className="btn" style={{ fontSize: '0.72rem', color: 'var(--accent-danger)' }}>Rechazar</button>
                    <button onClick={() => api.post(`/insight-corporate-referrals/${ref.id}/cancel`).then(fetchDetail)} className="btn" style={{ fontSize: '0.72rem' }}>Cancelar</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  treeId: string;
  isAdmin: boolean;
}

export default function InsightPanel({ treeId, isAdmin }: Props) {
  const [signals, setSignals] = useState<InsightSignal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<InsightSignal | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterLevel) params.set('escalationLevel', filterLevel);
      if (filterSource) params.set('sourceType', filterSource);
      const { data } = await api.get(`/trees/${treeId}/insights?${params}`);
      setSignals(data.signals ?? []);
      setTotal(data.total ?? 0);
    } catch {}
    setLoading(false);
  }, [treeId, filterStatus, filterLevel, filterSource]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  // If a signal is selected but stale, refresh it
  const handleRefresh = useCallback(async () => {
    if (selected) {
      try {
        const { data } = await api.get(`/insights/${selected.id}`);
        setSelected(data);
      } catch {}
    }
    fetchSignals();
  }, [selected, fetchSignals]);

  if (selected) {
    return (
      <InsightDetailPanel
        insight={selected}
        treeId={treeId}
        isAdmin={isAdmin}
        onBack={() => { setSelected(null); fetchSignals(); }}
        onRefresh={handleRefresh}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Telescope size={22} color="var(--accent-primary)" />
          <div>
            <h3 style={{ margin: 0 }}>Trust Insight</h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Escalamiento de necesidades persistentes</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={fetchSignals} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><RefreshCw size={15} /></button>
          {isAdmin && (
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.83rem' }}>
              <Plus size={14} /> Nueva señal
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '0.9rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        Trust Insight escala necesidades que Trust aún no puede resolver.
        Primero se busca capacidad interna. Si no alcanza, se convoca personas externas.
        Solo si eso falla o requiere escala especial, se deriva a empresas externas.
        <br />
        <strong style={{ color: 'var(--text-primary)' }}>Trust Insight no vende datos personales ni entrega inteligencia estratégica completa.</strong>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.4rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <option value=''>Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.4rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <option value=''>Todos los niveles</option>
          {Object.entries(ESCALATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ background: 'var(--input-bg, rgba(255,255,255,0.07))', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.4rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <option value=''>Todos los orígenes</option>
          {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Signal list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}><Loader2 size={24} className="animate-spin" /></div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem', fontSize: '0.88rem' }}>
          No hay señales Insight aún.{isAdmin && ' Crea la primera desde una necesidad persistente.'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{total} señal{total !== 1 ? 'es' : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {signals.map(s => (
              <div
                key={s.id}
                onClick={() => setSelected(s)}
                style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.3rem' }}>{s.title}</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{s.description}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: `${escalationColor(s.escalationLevel)}22`, color: escalationColor(s.escalationLevel) }}>
                        {ESCALATION_LABELS[s.escalationLevel]}
                      </span>
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', background: `${statusColor(s.status)}22`, color: statusColor(s.status) }}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                        {SOURCE_LABELS[s.sourceType] ?? s.sourceType}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {s.urgencyScore && <div>Urgencia: {scoreBadge(s.urgencyScore)}</div>}
                    {s.capacityGapScore && <div>Brecha: {scoreBadge(s.capacityGapScore)}</div>}
                    {s._count && (
                      <div style={{ marginTop: '0.3rem' }}>
                        🔍 {s._count.internalMatches} · 👤 {s._count.externalOpenings} · 🏢 {s._count.corporateReferrals}
                      </div>
                    )}
                    <div style={{ marginTop: '0.3rem' }}>{new Date(s.createdAt).toLocaleDateString('es-CL')}</div>
                    <ChevronRight size={14} style={{ marginTop: '0.25rem', color: 'var(--accent-primary)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showCreateModal && (
        <CreateInsightModal
          treeId={treeId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchSignals(); }}
        />
      )}
    </div>
  );
}
