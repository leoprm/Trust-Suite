import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  CreditCard, ShieldCheck, Plus, Trash2, Loader2, AlertCircle,
  WalletCards, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import PaymentStatusBadge from '../components/PaymentStatusBadge';
import CostBreakdownChart from '../components/CostBreakdownChart';
import type { BreakdownItem } from '../components/CostBreakdownChart';
import AIProviderBadge from '../components/AIProviderBadge';
import SavingsCard from '../components/SavingsCard';

// ── Types ──────────────────────────────────────────────────────────────────

interface CostData {
  monthlyCost: number;
  currency: string;
  breakdown: {
    infraCost: number;
    aiCost: number;
    growthPct: number;
    totalUsers: number;
  };
  calculatedAt: string;
}

interface MySubscription {
  hasSubscription: boolean;
  status: string;
  id?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  canceledAt?: string | null;
}

interface RegisteredAI {
  id: string;
  name: string;
  provider: string;
  status: string;
  endpoint?: string | null;
  monthlySavings: number;
  totalPayout: number;
  createdAt: string;
}

interface SavingsData {
  month: string;
  monthlySavings: number;
  estimatedSavings: number;
  allTimePayout: number;
  subscriptionCost: number;
  payoutEligible: boolean;
  payoutAmount: number;
  ais: { name: string; provider: string; monthlySavings: number }[];
}

type AIProvider = 'OPENAI' | 'DEEPSEEK' | 'ANTHROPIC' | 'CUSTOM';
const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'OPENAI', label: 'OpenAI (GPT-4, etc.)' },
  { value: 'DEEPSEEK', label: 'DeepSeek' },
  { value: 'ANTHROPIC', label: 'Anthropic (Claude)' },
  { value: 'CUSTOM', label: 'Personalizado (API propia)' },
];

function fmt(n: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// ── Page Component ─────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { user } = useAuthStore();

  // Cost
  const [costData, setCostData] = useState<CostData | null>(null);
  const [costLoading, setCostLoading] = useState(true);

  // My subscription
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  // BYO AIs
  const [ais, setAIs] = useState<RegisteredAI[]>([]);
  const [aisLoading, setAisLoading] = useState(true);

  // Savings
  const [savings, setSavings] = useState<SavingsData | null>(null);
  const [savingsLoading, setSavingsLoading] = useState(true);

  // BYO Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [byoName, setByoName] = useState('');
  const [byoProvider, setByoProvider] = useState<AIProvider>('OPENAI');
  const [byoApiKey, setByoApiKey] = useState('');
  const [byoEndpoint, setByoEndpoint] = useState('');
  const [addingAI, setAddingAI] = useState(false);
  const [addError, setAddError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchCost(),
      fetchMySubscription(),
      fetchAIs(),
      fetchSavings(),
    ]);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── API calls ────────────────────────────────────────────────────────────

  const fetchCost = async () => {
    setCostLoading(true);
    try {
      const { data } = await api.get('/billing/current-cost');
      setCostData(data);
    } catch (e) {
      console.error('[Subscription] fetchCost error:', e);
    } finally {
      setCostLoading(false);
    }
  };

  const fetchMySubscription = async () => {
    setSubLoading(true);
    try {
      const { data } = await api.get('/billing/subscription');
      setMySub(data);
    } catch (e) {
      console.error('[Subscription] fetchMySubscription error:', e);
    } finally {
      setSubLoading(false);
    }
  };

  const fetchAIs = async () => {
    setAisLoading(true);
    try {
      const { data } = await api.get('/byo/my-ais');
      setAIs(data.ais || []);
    } catch (e) {
      console.error('[Subscription] fetchAIs error:', e);
    } finally {
      setAisLoading(false);
    }
  };

  const fetchSavings = async () => {
    setSavingsLoading(true);
    try {
      const { data } = await api.get('/byo/savings');
      setSavings(data);
    } catch (e) {
      console.error('[Subscription] fetchSavings error:', e);
    } finally {
      setSavingsLoading(false);
    }
  };

  const handleAddAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!byoName.trim() || !byoApiKey.trim()) {
      setAddError('Completa todos los campos obligatorios');
      return;
    }
    setAddingAI(true);
    try {
      await api.post('/byo/register', {
        name: byoName.trim(),
        provider: byoProvider,
        apiKey: byoApiKey,
        endpoint: byoProvider === 'CUSTOM' ? byoEndpoint : undefined,
      });
      setByoName('');
      setByoApiKey('');
      setByoEndpoint('');
      setByoProvider('OPENAI');
      setShowAddForm(false);
      await Promise.all([fetchAIs(), fetchSavings()]);
    } catch (e: any) {
      setAddError(e?.response?.data?.error || 'Error al registrar IA');
    } finally {
      setAddingAI(false);
    }
  };

  const handleDeleteAI = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/byo/${id}`);
      await Promise.all([fetchAIs(), fetchSavings()]);
    } catch (e: any) {
      console.error('[Subscription] deleteAI error:', e);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Memoize breakdown ────────────────────────────────────────────────────

  const breakdownItems: BreakdownItem[] | null = costData?.breakdown
    ? [
        {
          label: 'Infraestructura',
          amount: costData.breakdown.infraCost,
          icon: 'infra' as const,
          percentage: 0,
        },
        {
          label: 'IA',
          amount: costData.breakdown.aiCost,
          icon: 'ai' as const,
          percentage: 0,
        },
        {
          label: `Crecimiento (${costData.breakdown.growthPct}%)`,
          amount: Math.round((costData.breakdown.infraCost + costData.breakdown.aiCost) * (costData.breakdown.growthPct / 100)),
          icon: 'growth' as const,
          percentage: 0,
        },
        {
          label: `Entre ${costData.breakdown.totalUsers} usuarios`,
          amount: costData.monthlyCost,
          icon: 'users' as const,
          percentage: 0,
        },
      ]
    : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      maxWidth: 'var(--max-width)',
      margin: '0 auto',
      padding: 'clamp(1rem, 3vw, 2rem)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      paddingBottom: '6rem',
    }}>
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
          Suscripción
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          Gestiona tu suscripción, costos y tus IAs registradas
        </p>
      </div>

      {/* ── Subscription Status Card ─────────────────────────────────────── */}
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Estado de suscripción</h2>
          </div>
          {!subLoading && mySub && (
            <PaymentStatusBadge
              status={mySub.status === 'NONE' ? 'ACTIVE' : mySub.status as any}
            />
          )}
        </div>

        {subLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--text-secondary)' }} />
          </div>
        ) : !mySub?.hasSubscription ? (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '1rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
          }}>
            <ShieldCheck size={18} style={{ color: 'var(--accent-success)', flexShrink: 0, marginTop: '0.1rem' }} />
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Acceso gratuito</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Estás usando Trust Maker con acceso gratuito. Suscríbete para desbloquear todas las funcionalidades.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.75rem',
            }}>
              <DetailCard label="Estado" value={mySub.status === 'ACTIVE' ? 'Activa' : mySub.status} />
              <DetailCard label="Inicio del período" value={formatDate(mySub.currentPeriodStart)} />
              <DetailCard label="Fin del período" value={formatDate(mySub.currentPeriodEnd)} />
              {mySub.canceledAt && (
                <DetailCard label="Cancelada el" value={formatDate(mySub.canceledAt)} />
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Current Cost Card ────────────────────────────────────────────── */}
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <WalletCards size={20} style={{ color: 'var(--accent-secondary)' }} />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Costo actual de suscripción</h2>
        </div>

        {costLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--text-secondary)' }} />
          </div>
        ) : costData ? (
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-secondary)', marginBottom: '0.25rem' }}>
              {fmt(costData.monthlyCost, costData.currency)}
              <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
                /mes por usuario
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Calculado el {formatDate(costData.calculatedAt)}
            </div>

            {breakdownItems && (
              <CostBreakdownChart
                items={breakdownItems}
                total={costData.monthlyCost * costData.breakdown.totalUsers}
                currency={costData.currency}
              />
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}>
            <AlertCircle size={16} />
            No se pudo cargar la información de costos
          </div>
        )}
      </section>

      {/* ── BYO AI Section ───────────────────────────────────────────────── */}
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Tus IAs registradas</h2>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            {showAddForm ? (
              <><ChevronUp size={16} /> Cancelar</>
            ) : (
              <><Plus size={16} /> Agregar IA</>
            )}
          </button>
        </div>

        {/* Add AI Form */}
        {showAddForm && (
          <form onSubmit={handleAddAI} style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            padding: '1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            {addError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 0.75rem',
                background: 'rgba(239, 68, 68, 0.08)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--accent-danger)',
                fontSize: '0.8rem',
              }}>
                <AlertCircle size={14} />
                {addError}
              </div>
            )}

            <div className="input-group" style={{ margin: 0 }}>
              <label>Nombre de la IA *</label>
              <input
                className="input-field"
                type="text"
                placeholder="Ej: Mi DeepSeek Pro"
                value={byoName}
                onChange={(e) => setByoName(e.target.value)}
                required
              />
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label>Proveedor *</label>
              <select
                className="input-field"
                value={byoProvider}
                onChange={(e) => setByoProvider(e.target.value as AIProvider)}
                style={{ cursor: 'pointer' }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {byoProvider === 'CUSTOM' && (
              <div className="input-group" style={{ margin: 0 }}>
                <label>Endpoint (URL)</label>
                <input
                  className="input-field"
                  type="url"
                  placeholder="https://tu-api.com/v1"
                  value={byoEndpoint}
                  onChange={(e) => setByoEndpoint(e.target.value)}
                />
              </div>
            )}

            <div className="input-group" style={{ margin: 0 }}>
              <label>API Key *</label>
              <input
                className="input-field"
                type="password"
                placeholder="sk-..."
                value={byoApiKey}
                onChange={(e) => setByoApiKey(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={addingAI}
              style={{ padding: '0.65rem 1rem', fontSize: '0.9rem', alignSelf: 'flex-start' }}
            >
              {addingAI ? (
                <><Loader2 className="animate-spin" size={16} /> Registrando...</>
              ) : (
                'Registrar IA'
              )}
            </button>
          </form>
        )}

        {/* AI List */}
        {aisLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--text-secondary)' }} />
          </div>
        ) : ais.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '1rem',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            No tienes IAs registradas. Agrega una para comenzar a ahorrar en costos de suscripción.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ais.map((ai) => (
              <div
                key={ai.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{ai.name}</span>
                  <AIProviderBadge
                    provider={ai.provider}
                    status={ai.status as any}
                    monthlySavings={ai.monthlySavings}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {ai.monthlySavings > 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-success)', fontWeight: 600 }}>
                      {fmtUSD(ai.monthlySavings)}/mes
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteAI(ai.id)}
                    disabled={deletingId === ai.id}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.35rem 0.5rem',
                      cursor: 'pointer',
                      color: 'var(--accent-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: deletingId === ai.id ? 0.5 : 1,
                    }}
                  >
                    {deletingId === ai.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Savings Card ─────────────────────────────────────────────────── */}
      <SavingsCard
        monthlySavings={savings?.monthlySavings ?? 0}
        subscriptionCost={savings?.subscriptionCost ?? 20}
        payoutEligible={savings?.payoutEligible ?? false}
        payoutAmount={savings?.payoutAmount ?? 0}
        ais={savings?.ais ?? []}
        loading={savingsLoading}
      />
    </div>
  );
}

// ── Helper component ───────────────────────────────────────────────────────

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-color)',
      padding: '0.65rem 0.75rem',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
