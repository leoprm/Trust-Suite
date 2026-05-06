import { useEffect, useState } from 'react';
import type React from 'react';
import {
  Lightbulb,
  ThumbsUp,
  Users,
  ShoppingBag,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Archive,
  GitBranch,
  Send,
  Loader2,
} from 'lucide-react';
import api from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SupportType = 'LIKE' | 'WOULD_PARTICIPATE' | 'KNOWS_CLIENTS_OR_WOULD_BUY';

type IdeaStatus =
  | 'PROPOSED'
  | 'GATHERING_SUPPORT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_BRANCH'
  | 'ARCHIVED';

interface AutosustentoIdea {
  id: string;
  treeId: string;
  createdById: string | null;
  createdBy: { id: string; username: string } | null;
  title: string;
  description: string;
  status: IdeaStatus;
  productOrService: string | null;
  targetClient: string | null;
  valueProposition: string | null;
  requiredResources: string | null;
  estimatedStartupCostFiat: number | null;
  expectedMonthlyIncomeFiat: number | null;
  expectedMonthlyCostFiat: number | null;
  currency: string;
  legalRisks: string | null;
  operationalRisks: string | null;
  socialRisks: string | null;
  viabilitySummary: string | null;
  closureCriteria: string | null;
  reviewPeriodDays: number | null;
  convertedBranchId: string | null;
  convertedAt: string | null;
  likes: number;
  wouldParticipate: number;
  knowsClientsOrWouldBuy: number;
  totalSupports: number;
  userSupport: {
    LIKE: boolean;
    WOULD_PARTICIPATE: boolean;
    KNOWS_CLIENTS_OR_WOULD_BUY: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

type Props = {
  treeId: string;
  isTreeAdmin?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<IdeaStatus, string> = {
  PROPOSED: 'Propuesta',
  GATHERING_SUPPORT: 'Recibiendo apoyo',
  UNDER_REVIEW: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CONVERTED_TO_BRANCH: 'Convertida en Rama',
  ARCHIVED: 'Archivada',
};

const STATUS_COLORS: Record<IdeaStatus, string> = {
  PROPOSED: '#6366f1',
  GATHERING_SUPPORT: '#0ea5e9',
  UNDER_REVIEW: '#f59e0b',
  APPROVED: '#22c55e',
  REJECTED: '#ef4444',
  CONVERTED_TO_BRANCH: '#8b5cf6',
  ARCHIVED: '#6b7280',
};

const TERMINAL_STATUSES: IdeaStatus[] = ['REJECTED', 'CONVERTED_TO_BRANCH', 'ARCHIVED'];

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '1rem',
};

function formatMoney(value?: number | null, currency = 'CLP') {
  if (value == null) return '—';
  return `${currency} ${Number(value).toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty create form
// ─────────────────────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    title: '',
    description: '',
    productOrService: '',
    targetClient: '',
    valueProposition: '',
    requiredResources: '',
    estimatedStartupCostFiat: '',
    expectedMonthlyIncomeFiat: '',
    expectedMonthlyCostFiat: '',
    currency: 'CLP',
    legalRisks: '',
    operationalRisks: '',
    socialRisks: '',
    viabilitySummary: '',
    closureCriteria: '',
    reviewPeriodDays: '90',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Support button
// ─────────────────────────────────────────────────────────────────────────────

function SupportButton({
  active,
  label,
  count,
  icon,
  loading,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon: React.ReactNode;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 0.85rem',
        borderRadius: 20,
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {label} {count > 0 && <span style={{ fontWeight: 700 }}>{count}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create form
// ─────────────────────────────────────────────────────────────────────────────

function CreateIdeaForm({
  treeId,
  onCreated,
  onCancel,
}: {
  treeId: string;
  onCreated: (idea: AutosustentoIdea) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        productOrService: form.productOrService || undefined,
        targetClient: form.targetClient || undefined,
        valueProposition: form.valueProposition || undefined,
        requiredResources: form.requiredResources || undefined,
        estimatedStartupCostFiat: form.estimatedStartupCostFiat ? Number(form.estimatedStartupCostFiat) : undefined,
        expectedMonthlyIncomeFiat: form.expectedMonthlyIncomeFiat ? Number(form.expectedMonthlyIncomeFiat) : undefined,
        expectedMonthlyCostFiat: form.expectedMonthlyCostFiat ? Number(form.expectedMonthlyCostFiat) : undefined,
        currency: form.currency || 'CLP',
        legalRisks: form.legalRisks || undefined,
        operationalRisks: form.operationalRisks || undefined,
        socialRisks: form.socialRisks || undefined,
        viabilitySummary: form.viabilitySummary || undefined,
        closureCriteria: form.closureCriteria || undefined,
        reviewPeriodDays: form.reviewPeriodDays ? Number(form.reviewPeriodDays) : 90,
      };
      const { data } = await api.post(`/trees/${treeId}/autosustento-ideas`, payload);
      onCreated(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear la idea');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    id: string,
    label: string,
    placeholder: string,
    required = false,
    type: 'text' | 'textarea' | 'number' = 'text',
  ) => (
    <div style={sectionStyle}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={(form as any)[id]}
          onChange={(e) => set(id, e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          required={required}
        />
      ) : (
        <input
          type={type}
          value={(form as any)[id]}
          onChange={(e) => set(id, e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          required={required}
          min={type === 'number' ? 0 : undefined}
        />
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1rem 0' }}>
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 12,
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid var(--border-color)',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>💡 Idea de Autosustento</strong>
        <br />
        Una Idea de Autosustento propone una forma de generar ingresos externos para sostener al Tree.
        No compite con las Necesidades Internas. Los apoyos son señales simples de interés, participación y demanda — no son votos políticos.
        Crear o apoyar una idea no otorga XP.
      </div>

      {field('title', 'Título', 'Ej: Panadería comunitaria', true)}
      {field('description', 'Descripción', 'Describe la idea...', true, 'textarea')}
      {field('productOrService', 'Producto o Servicio', 'Ej: Pan artesanal, talleres de cocina')}
      {field('targetClient', 'Cliente objetivo', 'Ej: Vecinos del sector, restaurantes locales', false, 'textarea')}
      {field('valueProposition', 'Propuesta de valor', '¿Por qué comprarían?', false, 'textarea')}
      {field('requiredResources', 'Recursos necesarios', 'Horno, local, materiales...', false, 'textarea')}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <label style={labelStyle}>Costo inicial estimado</label>
          <input
            type="number"
            min={0}
            value={form.estimatedStartupCostFiat}
            onChange={(e) => set('estimatedStartupCostFiat', e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Ingreso mensual esperado</label>
          <input
            type="number"
            min={0}
            value={form.expectedMonthlyIncomeFiat}
            onChange={(e) => set('expectedMonthlyIncomeFiat', e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Costo mensual esperado</label>
          <input
            type="number"
            min={0}
            value={form.expectedMonthlyCostFiat}
            onChange={(e) => set('expectedMonthlyCostFiat', e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </div>
      </div>

      {field('legalRisks', 'Riesgos legales', 'Permisos, patentes, regulaciones...', false, 'textarea')}
      {field('operationalRisks', 'Riesgos operacionales', 'Logística, suministros...', false, 'textarea')}
      {field('socialRisks', 'Riesgos sociales', 'Conflictos de interés, impacto comunitario...', false, 'textarea')}
      {field('viabilitySummary', 'Resumen de viabilidad', '¿Por qué crees que puede funcionar?', false, 'textarea')}
      {field('closureCriteria', 'Criterio de cierre', '¿Cuándo debería cerrarse si no funciona?', false, 'textarea')}

      <div style={sectionStyle}>
        <label style={labelStyle}>Período de revisión (días)</label>
        <input
          type="number"
          min={1}
          value={form.reviewPeriodDays}
          onChange={(e) => set('reviewPeriodDays', e.target.value)}
          style={{ ...inputStyle, width: '120px' }}
        />
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '0.65rem 1.5rem',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
          Proponer Idea
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.65rem 1.2rem',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Idea card
// ─────────────────────────────────────────────────────────────────────────────

function IdeaCard({
  idea,
  isTreeAdmin,
  onRefresh,
}: {
  idea: AutosustentoIdea;
  isTreeAdmin: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [supporting, setSupporting] = useState<SupportType | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const isTerminal = TERMINAL_STATUSES.includes(idea.status);

  const toggleSupport = async (type: SupportType) => {
    if (supporting) return;
    const wasActive = idea.userSupport?.[type] ?? false;
    setSupporting(type);
    try {
      if (wasActive) {
        await api.delete(`/autosustento-ideas/${idea.id}/support/${type}`);
      } else {
        await api.post(`/autosustento-ideas/${idea.id}/support`, { supportType: type });
      }
      onRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar apoyo');
    } finally {
      setSupporting(null);
    }
  };

  const adminAction = async (endpoint: string) => {
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/autosustento-ideas/${idea.id}/${endpoint}`);
      onRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || `Error al ejecutar acción`);
    } finally {
      setActionLoading(false);
    }
  };

  const statusColor = STATUS_COLORS[idea.status] ?? '#6b7280';

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        border: '1px solid var(--border-color)',
        marginBottom: '0.85rem',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: '0.9rem 1rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
        }}
      >
        <Lightbulb size={18} style={{ color: statusColor, flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '0.2rem',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
              {idea.title}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: '#fff',
                background: statusColor,
                padding: '2px 7px',
                borderRadius: 10,
              }}
            >
              {STATUS_LABELS[idea.status]}
            </span>
          </div>
          {idea.productOrService && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              🛍️ {idea.productOrService}
            </div>
          )}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            <span>
              <ThumbsUp size={11} style={{ marginRight: 3 }} />
              {idea.likes}
            </span>
            <span>
              <Users size={11} style={{ marginRight: 3 }} />
              {idea.wouldParticipate}
            </span>
            <span>
              <ShoppingBag size={11} style={{ marginRight: 3 }} />
              {idea.knowsClientsOrWouldBuy}
            </span>
            {idea.createdBy && (
              <span style={{ marginLeft: 'auto' }}>@{idea.createdBy.username}</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem 1rem', borderTop: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.85rem', lineHeight: 1.5 }}>
            {idea.description}
          </p>

          {/* Viability fields */}
          {(idea.targetClient || idea.valueProposition || idea.requiredResources) && (
            <div
              style={{
                background: 'var(--bg-input)',
                borderRadius: 8,
                padding: '0.75rem',
                marginTop: '0.75rem',
                fontSize: '0.82rem',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Ficha de viabilidad
              </div>
              {idea.targetClient && (
                <p style={{ marginBottom: '0.4rem' }}>
                  <strong>Cliente objetivo:</strong> {idea.targetClient}
                </p>
              )}
              {idea.valueProposition && (
                <p style={{ marginBottom: '0.4rem' }}>
                  <strong>Propuesta de valor:</strong> {idea.valueProposition}
                </p>
              )}
              {idea.requiredResources && (
                <p style={{ marginBottom: '0.4rem' }}>
                  <strong>Recursos necesarios:</strong> {idea.requiredResources}
                </p>
              )}
              {idea.viabilitySummary && (
                <p style={{ marginBottom: '0.4rem' }}>
                  <strong>Resumen de viabilidad:</strong> {idea.viabilitySummary}
                </p>
              )}
            </div>
          )}

          {/* Financial estimates */}
          {(idea.estimatedStartupCostFiat != null ||
            idea.expectedMonthlyIncomeFiat != null ||
            idea.expectedMonthlyCostFiat != null) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                marginTop: '0.75rem',
              }}
            >
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '0.6rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Costo inicio</div>
                <div style={{ fontWeight: 700, marginTop: '0.3rem', fontSize: '0.85rem' }}>
                  {formatMoney(idea.estimatedStartupCostFiat, idea.currency)}
                </div>
              </div>
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '0.6rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Ingreso mensual</div>
                <div style={{ fontWeight: 700, marginTop: '0.3rem', fontSize: '0.85rem', color: '#22c55e' }}>
                  {formatMoney(idea.expectedMonthlyIncomeFiat, idea.currency)}
                </div>
              </div>
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '0.6rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Costo mensual</div>
                <div style={{ fontWeight: 700, marginTop: '0.3rem', fontSize: '0.85rem', color: '#ef4444' }}>
                  {formatMoney(idea.expectedMonthlyCostFiat, idea.currency)}
                </div>
              </div>
            </div>
          )}

          {/* Risks */}
          {(idea.legalRisks || idea.operationalRisks || idea.socialRisks) && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Riesgos identificados
              </div>
              {idea.legalRisks && <p style={{ marginBottom: '0.3rem' }}><strong>Legal:</strong> {idea.legalRisks}</p>}
              {idea.operationalRisks && <p style={{ marginBottom: '0.3rem' }}><strong>Operacional:</strong> {idea.operationalRisks}</p>}
              {idea.socialRisks && <p style={{ marginBottom: '0.3rem' }}><strong>Social:</strong> {idea.socialRisks}</p>}
            </div>
          )}

          {/* Converted branch info */}
          {idea.convertedBranchId && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.65rem',
                background: 'rgba(139,92,246,0.1)',
                borderRadius: 8,
                fontSize: '0.82rem',
                color: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <GitBranch size={14} />
              Convertida en Rama de Autosustento
              {idea.convertedAt && ` · ${new Date(idea.convertedAt).toLocaleDateString()}`}
            </div>
          )}

          {/* Support buttons */}
          {!isTerminal && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <SupportButton
                active={idea.userSupport?.LIKE ?? false}
                label="Me gusta"
                count={idea.likes}
                icon={<ThumbsUp size={13} />}
                loading={supporting === 'LIKE'}
                onClick={() => toggleSupport('LIKE')}
              />
              <SupportButton
                active={idea.userSupport?.WOULD_PARTICIPATE ?? false}
                label="Participaría"
                count={idea.wouldParticipate}
                icon={<Users size={13} />}
                loading={supporting === 'WOULD_PARTICIPATE'}
                onClick={() => toggleSupport('WOULD_PARTICIPATE')}
              />
              <SupportButton
                active={idea.userSupport?.KNOWS_CLIENTS_OR_WOULD_BUY ?? false}
                label="Conozco clientes"
                count={idea.knowsClientsOrWouldBuy}
                icon={<ShoppingBag size={13} />}
                loading={supporting === 'KNOWS_CLIENTS_OR_WOULD_BUY'}
                onClick={() => toggleSupport('KNOWS_CLIENTS_OR_WOULD_BUY')}
              />
            </div>
          )}

          {/* Admin actions */}
          {isTreeAdmin && (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginTop: '0.85rem',
                paddingTop: '0.75rem',
                borderTop: '1px dashed var(--border-color)',
              }}
            >
              {['PROPOSED', 'GATHERING_SUPPORT'].includes(idea.status) && (
                <AdminBtn
                  label="Enviar a revisión"
                  icon={<Send size={12} />}
                  loading={actionLoading}
                  onClick={() => adminAction('submit-review')}
                  color="#f59e0b"
                />
              )}
              {idea.status === 'UNDER_REVIEW' && (
                <AdminBtn
                  label="Aprobar"
                  icon={<CheckCircle2 size={12} />}
                  loading={actionLoading}
                  onClick={() => adminAction('approve')}
                  color="#22c55e"
                />
              )}
              {!isTerminal && (
                <>
                  <AdminBtn
                    label="Rechazar"
                    icon={<XCircle size={12} />}
                    loading={actionLoading}
                    onClick={() => adminAction('reject')}
                    color="#ef4444"
                  />
                  <AdminBtn
                    label="Archivar"
                    icon={<Archive size={12} />}
                    loading={actionLoading}
                    onClick={() => adminAction('archive')}
                    color="#6b7280"
                  />
                </>
              )}
              {idea.status === 'APPROVED' && (
                <AdminBtn
                  label="Convertir en Rama"
                  icon={<GitBranch size={12} />}
                  loading={actionLoading}
                  onClick={() => adminAction('convert-to-branch')}
                  color="#8b5cf6"
                />
              )}
            </div>
          )}

          {error && (
            <div style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '0.5rem' }}>{error}</div>
          )}

          <div
            style={{
              marginTop: '0.75rem',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}
          >
            Los apoyos son señales simples — no son votos políticos y no otorgan XP.
          </div>
        </div>
      )}
    </div>
  );
}

function AdminBtn({
  label,
  icon,
  loading,
  onClick,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.35rem 0.75rem',
        borderRadius: 6,
        border: `1px solid ${color}`,
        background: 'transparent',
        color,
        fontSize: '0.75rem',
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export default function AutosustentoIdeasPanel({ treeId, isTreeAdmin = false }: Props) {
  const [ideas, setIdeas] = useState<AutosustentoIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'active' | 'closed' | 'all'>('active');

  const fetchIdeas = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/trees/${treeId}/autosustento-ideas`);
      setIdeas(data);
    } catch (err) {
      console.error('[AutosustentoIdeas] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdeas();
  }, [treeId]);

  const filtered = ideas.filter((idea) => {
    if (filter === 'active') return !TERMINAL_STATUSES.includes(idea.status);
    if (filter === 'closed') return TERMINAL_STATUSES.includes(idea.status);
    return true;
  });

  const activeCount = ideas.filter((i) => !TERMINAL_STATUSES.includes(i.status)).length;
  const closedCount = ideas.filter((i) => TERMINAL_STATUSES.includes(i.status)).length;

  const tabBtn = (key: 'active' | 'closed' | 'all', label: string, count: number) => (
    <button
      onClick={() => setFilter(key)}
      style={{
        padding: '0.4rem 0.85rem',
        borderRadius: 20,
        border: 'none',
        background: filter === key ? 'var(--accent)' : 'var(--bg-input)',
        color: filter === key ? '#fff' : 'var(--text-secondary)',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label} {count > 0 && `(${count})`}
    </button>
  );

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Lightbulb size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Ideas de Autosustento</span>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Nueva Idea
          </button>
        )}
      </div>

      {/* Clarification callout */}
      <div
        style={{
          background: 'rgba(99,102,241,0.07)',
          borderLeft: '3px solid #6366f1',
          borderRadius: '0 8px 8px 0',
          padding: '0.6rem 0.85rem',
          marginBottom: '0.85rem',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
        }}
      >
        Las Ideas de Autosustento proponen formas de generar ingresos externos para el Tree.{' '}
        <strong style={{ color: 'var(--text-primary)' }}>No compiten con las Necesidades Internas</strong>{' '}
        ni usan Puntos de Necesidad.
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateIdeaForm
          treeId={treeId}
          onCreated={(idea) => {
            setIdeas((prev) => [idea, ...prev]);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Tabs */}
      {!showCreate && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
          {tabBtn('active', 'Activas', activeCount)}
          {tabBtn('closed', 'Cerradas', closedCount)}
          {tabBtn('all', 'Todas', ideas.length)}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
          }}
        >
          {filter === 'active'
            ? 'No hay Ideas de Autosustento activas. ¡Propone la primera!'
            : filter === 'closed'
              ? 'No hay ideas cerradas'
              : 'No hay Ideas de Autosustento todavía'}
        </div>
      ) : (
        filtered.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            isTreeAdmin={isTreeAdmin}
            onRefresh={fetchIdeas}
          />
        ))
      )}
    </div>
  );
}
