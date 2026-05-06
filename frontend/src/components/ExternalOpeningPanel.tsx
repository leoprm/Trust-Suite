/**
 * ExternalOpeningPanel.tsx
 * Admin panel for managing external job openings (convocatorias) and applications.
 * Used from InsightPanel within the INSIGHT tab.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  Briefcase, Plus, ChevronRight, Send, Pause, Play,
  XCircle, Archive, CheckCircle, AlertCircle, Clock, Users,
  ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OpeningStatus =
  | 'DRAFT' | 'INTERNAL_REVIEW' | 'OPEN' | 'PAUSED'
  | 'CLOSED' | 'ENOUGH_CANDIDATES' | 'NOT_ENOUGH_CANDIDATES'
  | 'CANCELLED' | 'CONVERTED_TO_VALIDATION' | 'ARCHIVED';

type AppStatus =
  | 'RECEIVED' | 'BASIC_REVIEW' | 'MORE_INFO_REQUESTED'
  | 'INVITED_TO_VALIDATION' | 'REJECTED' | 'WITHDRAWN'
  | 'ACCEPTED_FOR_NEXT_STEP' | 'CONVERTED_TO_USER' | 'ARCHIVED';

interface Opening {
  id: string;
  title: string;
  summary?: string;
  description: string;
  status: OpeningStatus;
  workMode: string;
  paymentMode: string;
  paymentFiatMin?: number;
  paymentFiatExpected?: number;
  paymentFiatMax?: number;
  currency?: string;
  paymentBerriesMin?: number;
  paymentBerriesExpected?: number;
  paymentBerriesMax?: number;
  urgencyLevel: string;
  riskLevel: string;
  applicationDeadline?: string;
  estimatedDurationDays?: number;
  estimatedHours?: number;
  publicVisibility: string;
  requiredSkillTags?: unknown;
  _count?: { applications: number };
  createdAt: string;
}

interface Application {
  id: string;
  applicantName: string;
  applicantEmail?: string;
  applicantLocation?: string;
  applicantSummary?: string;
  motivation?: string;
  experienceSummary?: string;
  portfolioUrl?: string;
  externalProfileUrl?: string;
  status: AppStatus;
  skillTags?: unknown;
  requestedFiat?: number;
  requestedBerries?: number;
  currency?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  createdAt: string;
}

interface Props {
  insightSignalId: string;
  treeId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badges
// ─────────────────────────────────────────────────────────────────────────────

const OPENING_STATUS_COLORS: Record<OpeningStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  INTERNAL_REVIEW: 'bg-yellow-100 text-yellow-800',
  OPEN: 'bg-green-100 text-green-800',
  PAUSED: 'bg-orange-100 text-orange-800',
  CLOSED: 'bg-slate-100 text-slate-700',
  ENOUGH_CANDIDATES: 'bg-blue-100 text-blue-800',
  NOT_ENOUGH_CANDIDATES: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-red-100 text-red-800',
  CONVERTED_TO_VALIDATION: 'bg-purple-100 text-purple-800',
  ARCHIVED: 'bg-gray-200 text-gray-500',
};

const APP_STATUS_COLORS: Record<AppStatus, string> = {
  RECEIVED: 'bg-blue-50 text-blue-700',
  BASIC_REVIEW: 'bg-yellow-50 text-yellow-700',
  MORE_INFO_REQUESTED: 'bg-orange-50 text-orange-700',
  INVITED_TO_VALIDATION: 'bg-purple-50 text-purple-700',
  REJECTED: 'bg-red-50 text-red-700',
  WITHDRAWN: 'bg-gray-100 text-gray-600',
  ACCEPTED_FOR_NEXT_STEP: 'bg-green-50 text-green-700',
  CONVERTED_TO_USER: 'bg-indigo-50 text-indigo-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

const OPENING_STATUS_LABELS: Record<OpeningStatus, string> = {
  DRAFT: 'Borrador', INTERNAL_REVIEW: 'Rev. interna', OPEN: 'Abierta',
  PAUSED: 'Pausada', CLOSED: 'Cerrada', ENOUGH_CANDIDATES: 'Con candidatos',
  NOT_ENOUGH_CANDIDATES: 'Sin candidatos', CANCELLED: 'Cancelada',
  CONVERTED_TO_VALIDATION: 'Validación legacy', ARCHIVED: 'Archivada',
};

const APP_STATUS_LABELS: Record<AppStatus, string> = {
  RECEIVED: 'Recibida', BASIC_REVIEW: 'Revisión básica',
  MORE_INFO_REQUESTED: 'Más info solicitada', INVITED_TO_VALIDATION: 'Aval pendiente',
  REJECTED: 'Rechazada', WITHDRAWN: 'Retirada',
  ACCEPTED_FOR_NEXT_STEP: 'Siguiente etapa', CONVERTED_TO_USER: 'Convertido',
  ARCHIVED: 'Archivada',
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status, map, labels }: { status: string; map: Record<string, string>; labels: Record<string, string> }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function formatBudgetFiat(min?: number, exp?: number, max?: number, currency = 'CLP') {
  if (!min && !exp && !max) return '—';
  const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 0 });
  if (exp) return `${currency} ${fmt(exp)}`;
  if (min && max) return `${currency} ${fmt(min)} – ${fmt(max)}`;
  if (min) return `${currency} ${fmt(min)}+`;
  return '—';
}

function formatBudgetBerries(min?: number, exp?: number, max?: number) {
  if (!min && !exp && !max) return null;
  if (exp) return `🍓 ${exp}`;
  if (min && max) return `🍓 ${min}–${max}`;
  if (min) return `🍓 ${min}+`;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening Form (create / future: edit)
// ─────────────────────────────────────────────────────────────────────────────

interface OpeningFormProps {
  insightSignalId: string;
  treeId: string;
  onCreated: (o: Opening) => void;
  onCancel: () => void;
}

function OpeningForm({ insightSignalId, treeId, onCreated, onCancel }: OpeningFormProps) {
  const [form, setForm] = useState({
    title: '', summary: '', description: '',
    workMode: 'REMOTE_ALLOWED', paymentMode: 'FIAT',
    currency: 'CLP',
    paymentFiatMin: '', paymentFiatExpected: '', paymentFiatMax: '',
    paymentBerriesExpected: '',
    urgencyLevel: 'MEDIUM', riskLevel: 'MEDIUM',
    publicVisibility: 'TRUST_NETWORK',
    applicationDeadline: '',
    maxCandidates: '',
    estimatedDurationDays: '',
    locationText: '',
    remoteAllowed: true,
    desiredEvidence: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr(''); setLoading(true);
    try {
      const body: Record<string, unknown> = {
        insightSignalId, treeId,
        title: form.title, summary: form.summary, description: form.description,
        workMode: form.workMode, paymentMode: form.paymentMode,
        currency: form.currency,
        urgencyLevel: form.urgencyLevel, riskLevel: form.riskLevel,
        publicVisibility: form.publicVisibility,
        remoteAllowed: form.remoteAllowed,
      };
      if (form.paymentFiatExpected) body.paymentFiatExpected = Number(form.paymentFiatExpected);
      if (form.paymentFiatMin) body.paymentFiatMin = Number(form.paymentFiatMin);
      if (form.paymentFiatMax) body.paymentFiatMax = Number(form.paymentFiatMax);
      if (form.paymentBerriesExpected) body.paymentBerriesExpected = Number(form.paymentBerriesExpected);
      if (form.applicationDeadline) body.applicationDeadline = form.applicationDeadline;
      if (form.maxCandidates) body.maxCandidates = Number(form.maxCandidates);
      if (form.estimatedDurationDays) body.estimatedDurationDays = Number(form.estimatedDurationDays);
      if (form.locationText) body.locationText = form.locationText;
      if (form.desiredEvidence) body.desiredEvidence = form.desiredEvidence;

      const { data } = await api.post(`/insights/${insightSignalId}/external-openings`, body);
      onCreated(data);
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  };

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
  const sel = inp;
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">Nueva convocatoria externa</h3>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className={lbl}>Título *</label>
          <input className={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Título de la convocatoria" />
        </div>
        <div>
          <label className={lbl}>Resumen (una línea)</label>
          <input className={inp} value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="Breve descripción para listas" />
        </div>
        <div>
          <label className={lbl}>Descripción completa *</label>
          <textarea className={inp} rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descripción detallada del rol, responsabilidades, contexto..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Modalidad de trabajo</label>
            <select className={sel} value={form.workMode} onChange={e => set('workMode', e.target.value)}>
              <option value="REMOTE_ALLOWED">Remoto permitido</option>
              <option value="REMOTE_ONLY">Solo remoto</option>
              <option value="ON_SITE_ONLY">Solo presencial</option>
              <option value="HYBRID">Híbrido</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Modalidad de pago</label>
            <select className={sel} value={form.paymentMode} onChange={e => set('paymentMode', e.target.value)}>
              <option value="FIAT">Fiat</option>
              <option value="BERRIES">Berries</option>
              <option value="MIXED">Mixto</option>
              <option value="UNPAID_VOLUNTEER">Voluntariado</option>
            </select>
          </div>
        </div>

        {(form.paymentMode === 'FIAT' || form.paymentMode === 'MIXED') && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>Pago Fiat mín.</label>
              <input className={inp} type="number" value={form.paymentFiatMin} onChange={e => set('paymentFiatMin', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Pago Fiat esperado</label>
              <input className={inp} type="number" value={form.paymentFiatExpected} onChange={e => set('paymentFiatExpected', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Pago Fiat máx.</label>
              <input className={inp} type="number" value={form.paymentFiatMax} onChange={e => set('paymentFiatMax', e.target.value)} placeholder="0" />
            </div>
          </div>
        )}

        {(form.paymentMode === 'BERRIES' || form.paymentMode === 'MIXED') && (
          <div>
            <label className={lbl}>Berries esperados</label>
            <input className={inp} type="number" value={form.paymentBerriesExpected} onChange={e => set('paymentBerriesExpected', e.target.value)} placeholder="0" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Urgencia</label>
            <select className={sel} value={form.urgencyLevel} onChange={e => set('urgencyLevel', e.target.value)}>
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Riesgo</label>
            <select className={sel} value={form.riskLevel} onChange={e => set('riskLevel', e.target.value)}>
              <option value="LOW">Bajo</option>
              <option value="MEDIUM">Medio</option>
              <option value="HIGH">Alto</option>
              <option value="CRITICAL">Crítico</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Fecha límite postulaciones</label>
            <input className={inp} type="datetime-local" value={form.applicationDeadline} onChange={e => set('applicationDeadline', e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Máximo candidatos</label>
            <input className={inp} type="number" value={form.maxCandidates} onChange={e => set('maxCandidates', e.target.value)} placeholder="Sin límite" />
          </div>
        </div>

        <div>
          <label className={lbl}>Visibilidad pública</label>
          <select className={sel} value={form.publicVisibility} onChange={e => set('publicVisibility', e.target.value)}>
            <option value="PRIVATE">Privada (solo admins)</option>
            <option value="TREE_ONLY">Solo árbol</option>
            <option value="TRUST_NETWORK">Red Trust</option>
            <option value="PUBLIC_METADATA">Metadatos públicos</option>
            <option value="PUBLIC_APPLICATION">Aplicación pública</option>
          </select>
        </div>

        <div>
          <label className={lbl}>Evidencia deseada</label>
          <textarea className={inp} rows={2} value={form.desiredEvidence} onChange={e => set('desiredEvidence', e.target.value)} placeholder="Qué evidencia/portafolio se valora..." />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
        <button
          onClick={submit}
          disabled={loading || !form.title.trim() || !form.description.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Guardando...' : 'Crear convocatoria'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Application detail (admin view)
// ─────────────────────────────────────────────────────────────────────────────

function ApplicationDetail({ app, onBack, onUpdated }: { app: Application; onBack: () => void; onUpdated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [err, setErr] = useState('');

  const action = useCallback(async (endpoint: string, body?: object) => {
    setErr(''); setLoading(true);
    try {
      await api.post(`/insight-applications/${app.id}/${endpoint}`, body ?? {});
      onUpdated();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [app.id, onUpdated]);

  const s = app.status;
  const isTerminal = ['REJECTED', 'WITHDRAWN', 'ARCHIVED', 'CONVERTED_TO_USER'].includes(s);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">← Volver</button>
        <StatusBadge status={s} map={APP_STATUS_COLORS} labels={APP_STATUS_LABELS} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-gray-800 text-lg">{app.applicantName}</h3>
        {app.applicantEmail && <p className="text-sm text-gray-600">{app.applicantEmail}</p>}
        {app.applicantLocation && <p className="text-sm text-gray-500">{app.applicantLocation}</p>}

        {app.applicantSummary && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Resumen</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.applicantSummary}</p>
          </div>
        )}
        {app.motivation && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Motivación</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.motivation}</p>
          </div>
        )}
        {app.experienceSummary && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Experiencia</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.experienceSummary}</p>
          </div>
        )}
        {(app.portfolioUrl || app.externalProfileUrl) && (
          <div className="flex gap-3">
            {app.portfolioUrl && (
              <a href={app.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 flex items-center gap-1">
                <ExternalLink size={13} /> Portafolio
              </a>
            )}
            {app.externalProfileUrl && (
              <a href={app.externalProfileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 flex items-center gap-1">
                <ExternalLink size={13} /> Perfil externo
              </a>
            )}
          </div>
        )}
        {(app.requestedFiat || app.requestedBerries) && (
          <p className="text-sm text-gray-600">
            Solicita: {app.requestedFiat ? `${app.currency ?? 'CLP'} ${app.requestedFiat.toLocaleString()}` : ''}
            {app.requestedBerries ? ` 🍓 ${app.requestedBerries}` : ''}
          </p>
        )}
        {app.reviewNotes && (
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-xs font-medium text-yellow-700">Notas de revisión</p>
            <p className="text-sm text-yellow-800">{app.reviewNotes}</p>
          </div>
        )}
        {app.rejectionReason && (
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs font-medium text-red-700">Motivo de rechazo</p>
            <p className="text-sm text-red-800">{app.rejectionReason}</p>
          </div>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}

      {!isTerminal && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</p>
          <div className="flex flex-wrap gap-2">
            {s === 'RECEIVED' && (
              <button onClick={() => action('start-basic-review')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 disabled:opacity-50">
                Iniciar revisión
              </button>
            )}
            {['RECEIVED', 'BASIC_REVIEW'].includes(s) && (
              <button onClick={() => action('request-more-info', { note: noteInput || undefined })} disabled={loading}
                className="px-3 py-1.5 text-sm bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 disabled:opacity-50">
                Solicitar más info
              </button>
            )}
            {['RECEIVED', 'BASIC_REVIEW', 'MORE_INFO_REQUESTED'].includes(s) && (
              <button onClick={() => action('invite-to-endorsement')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 disabled:opacity-50">
                Enviar a aval experto
              </button>
            )}
            {s === 'INVITED_TO_VALIDATION' && (
              <button onClick={() => action('accept-next-step', { reviewNotes: noteInput || undefined })} disabled={loading}
                className="px-3 py-1.5 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50">
                Aceptar para siguiente etapa
              </button>
            )}
            <button onClick={() => action('reject', { reason: noteInput || undefined })} disabled={loading}
              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50">
              Rechazar
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nota (opcional para las acciones)</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={noteInput} onChange={e => setNoteInput(e.target.value)}
              placeholder="Agrega una nota..."
            />
          </div>
        </div>
      )}

      {['REJECTED', 'WITHDRAWN', 'ACCEPTED_FOR_NEXT_STEP', 'INVITED_TO_VALIDATION'].includes(s) && s !== 'ARCHIVED' && (
        <button onClick={() => action('archive')} disabled={loading}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <Archive size={14} /> Archivar postulación
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening Detail view
// ─────────────────────────────────────────────────────────────────────────────

function OpeningDetail({
  opening, onBack, onOpeningUpdated,
}: { opening: Opening; onBack: () => void; onOpeningUpdated: () => void }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [showApps, setShowApps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      const { data } = await api.get(`/insight-openings/${opening.id}/applications`);
      setApplications(data);
    } catch { /* ignore */ } finally {
      setAppsLoading(false); }
  }, [opening.id]);

  useEffect(() => { if (showApps) loadApps(); }, [showApps, loadApps]);

  const action = useCallback(async (endpoint: string, body?: object) => {
    setErr(''); setLoading(true);
    try {
      await api.post(`/insight-openings/${opening.id}/${endpoint}`, body ?? {});
      onOpeningUpdated();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally { setLoading(false); }
  }, [opening.id, onOpeningUpdated]);

  const s = opening.status;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">← Convocatorias</button>
        <StatusBadge status={s} map={OPENING_STATUS_COLORS} labels={OPENING_STATUS_LABELS} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-gray-800 text-lg">{opening.title}</h3>
        {opening.summary && <p className="text-sm text-gray-500 italic">{opening.summary}</p>}
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{opening.description}</p>

        <div className="flex flex-wrap gap-4 text-sm text-gray-600 pt-1">
          <span>Modalidad: <strong>{opening.workMode}</strong></span>
          <span>Pago: <strong>{formatBudgetFiat(opening.paymentFiatMin, opening.paymentFiatExpected, opening.paymentFiatMax, opening.currency)}</strong></span>
          {formatBudgetBerries(opening.paymentBerriesMin, opening.paymentBerriesExpected, opening.paymentBerriesMax) && (
            <span>{formatBudgetBerries(opening.paymentBerriesMin, opening.paymentBerriesExpected, opening.paymentBerriesMax)}</span>
          )}
          {opening.applicationDeadline && (
            <span className="flex items-center gap-1"><Clock size={13} /> {new Date(opening.applicationDeadline).toLocaleDateString('es-CL')}</span>
          )}
          <span className="flex items-center gap-1"><Users size={13} /> {opening._count?.applications ?? 0} postulaciones</span>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Acciones de estado</p>
        <div className="flex flex-wrap gap-2">
          {s === 'DRAFT' && (
            <>
              <button onClick={() => action('submit-review')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 disabled:opacity-50 flex items-center gap-1">
                <Send size={14} /> Enviar a revisión
              </button>
              <button onClick={() => action('open')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50 flex items-center gap-1">
                <Play size={14} /> Abrir directamente
              </button>
            </>
          )}
          {s === 'INTERNAL_REVIEW' && (
            <button onClick={() => action('open')} disabled={loading}
              className="px-3 py-1.5 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50 flex items-center gap-1">
              <Play size={14} /> Abrir convocatoria
            </button>
          )}
          {s === 'OPEN' && (
            <>
              <button onClick={() => action('pause')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 disabled:opacity-50 flex items-center gap-1">
                <Pause size={14} /> Pausar
              </button>
              <button onClick={() => action('close')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50">
                Cerrar
              </button>
              <button onClick={() => action('mark-enough-candidates')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-1">
                <CheckCircle size={14} /> Hay suficientes candidatos
              </button>
              <button onClick={() => action('mark-not-enough-candidates')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 flex items-center gap-1">
                <AlertCircle size={14} /> No hay suficientes
              </button>
            </>
          )}
          {s === 'PAUSED' && (
            <>
              <button onClick={() => action('open')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50 flex items-center gap-1">
                <Play size={14} /> Reanudar
              </button>
              <button onClick={() => action('mark-not-enough-candidates')} disabled={loading}
                className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50">
                Sin candidatos suficientes
              </button>
            </>
          )}
          {!['ARCHIVED', 'CANCELLED', 'CONVERTED_TO_VALIDATION'].includes(s) && (
            <button onClick={() => action('cancel')} disabled={loading}
              className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50 flex items-center gap-1">
              <XCircle size={14} /> Cancelar
            </button>
          )}
          {['CLOSED', 'CANCELLED', 'NOT_ENOUGH_CANDIDATES', 'ENOUGH_CANDIDATES', 'CONVERTED_TO_VALIDATION'].includes(s) && (
            <button onClick={() => action('archive')} disabled={loading}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <Archive size={14} /> Archivar
            </button>
          )}
        </div>
      </div>

      {/* Applications section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowApps(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
        >
          <span className="font-medium text-gray-700 flex items-center gap-2">
            <Users size={15} /> Postulaciones ({opening._count?.applications ?? 0})
          </span>
          {showApps ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showApps && (
          <div className="border-t border-gray-100">
            {appsLoading ? (
              <p className="text-sm text-gray-500 px-4 py-3">Cargando...</p>
            ) : applications.length === 0 ? (
              <p className="text-sm text-gray-500 px-4 py-3">No hay postulaciones aún.</p>
            ) : (
              applications.map(app => (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{app.applicantName}</p>
                    <p className="text-xs text-gray-500">{new Date(app.createdAt).toLocaleDateString('es-CL')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={app.status} map={APP_STATUS_COLORS} labels={APP_STATUS_LABELS} />
                    <ChevronRight size={14} className="text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Application detail modal */}
      {selectedApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <ApplicationDetail
              app={selectedApp}
              onBack={() => setSelectedApp(null)}
              onUpdated={() => { setSelectedApp(null); loadApps(); onOpeningUpdated(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export default function ExternalOpeningPanel({ insightSignalId, treeId }: Props) {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selected, setSelected] = useState<Opening | null>(null);

  const loadOpenings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/insights/${insightSignalId}/external-openings`);
      setOpenings(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [insightSignalId]);

  useEffect(() => { loadOpenings(); }, [loadOpenings]);

  const refreshDetail = useCallback(async () => {
    // Re-load list but keep selected (re-find updated opening)
    setLoading(true);
    try {
      const { data } = await api.get(`/insights/${insightSignalId}/external-openings`);
      setOpenings(data);
      if (selected) {
        const updated = data.find((o: Opening) => o.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [insightSignalId, selected]);

  if (view === 'create') {
    return (
      <OpeningForm
        insightSignalId={insightSignalId}
        treeId={treeId}
        onCreated={o => { setOpenings(prev => [o, ...prev]); setSelected(o); setView('detail'); }}
        onCancel={() => setView('list')}
      />
    );
  }

  if (view === 'detail' && selected) {
    return (
      <OpeningDetail
        opening={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onOpeningUpdated={refreshDetail}
      />
    );
  }

  // List view
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          <Briefcase size={16} /> Convocatorias externas
        </h3>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} /> Nueva
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando...</p>
      ) : openings.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-500">
          <Briefcase size={32} className="mx-auto mb-2 text-gray-300" />
          No hay convocatorias externas aún.
          <br />
          <button onClick={() => setView('create')} className="mt-2 text-blue-600 hover:underline">
            Crear la primera
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {openings.map(o => (
            <button
              key={o.id}
              onClick={() => { setSelected(o); setView('detail'); }}
              className="w-full bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/30 text-left transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800 text-sm truncate">{o.title}</span>
                    <StatusBadge status={o.status} map={OPENING_STATUS_COLORS} labels={OPENING_STATUS_LABELS} />
                  </div>
                  {o.summary && <p className="text-xs text-gray-500 mt-0.5 truncate">{o.summary}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1.5">
                    <span>{o.workMode === 'REMOTE_ONLY' ? 'Remoto' : o.workMode === 'ON_SITE_ONLY' ? 'Presencial' : 'Híbrido/Remoto'}</span>
                    <span>{formatBudgetFiat(o.paymentFiatMin, o.paymentFiatExpected, o.paymentFiatMax, o.currency)}</span>
                    {o.applicationDeadline && (
                      <span className="flex items-center gap-0.5"><Clock size={11} /> {new Date(o.applicationDeadline).toLocaleDateString('es-CL')}</span>
                    )}
                    <span className="flex items-center gap-0.5"><Users size={11} /> {o._count?.applications ?? 0}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
