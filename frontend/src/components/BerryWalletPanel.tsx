import { useEffect, useState, useCallback } from 'react';
import {
  Droplets,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shield,
  Clock,
} from 'lucide-react';
import api from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BerryBalance {
  treeId: string;
  userId: string;
  balance: number;
  lastCycleKey: string | null;
  lastBerriesUpdate: string | null;
}

interface BerryPreview {
  treeId: string;
  userId: string;
  balance: number;
  monthlyFlowRate: number;
  estimatedMonthlyLoss: number;
  balanceAfterFlow: number;
  estimatedMonthlyIncome: number | null;
  projectedBalance: number;
  currentCycleKey: string;
  nextCycleKey: string;
  alreadyAppliedThisCycle: boolean;
  note: string;
}

interface BerryTransaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  cycleKey: string | null;
  sourceType: string | null;
  description: string | null;
  createdAt: string;
}

interface BerryConfig {
  berriesEnabled: boolean;
  monthlyFlowRate: number;
  monthlyFlowDay: number;
}

interface AdminCycle {
  cycleKey: string;
  message: string;
  usersProcessed: number;
  totalDestroyed: number;
  skipped: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function txTypeLabel(type: string): string {
  const map: Record<string, string> = {
    TASK_REWARD:       '+ Tarea completada',
    AUDIT_REWARD:      '+ Auditoría',
    LEVEL_REWARD:      '+ Caudal mensual',
    P2P_TRANSFER_IN:   '+ Transferencia recibida',
    P2P_TRANSFER_OUT:  '− Transferencia enviada',
    MONTHLY_FLOW_LOSS: '− Reducción mensual',
    ADJUSTMENT:        '± Ajuste',
    REVERSAL:          '± Reversión',
  };
  return map[type] ?? type;
}

function txColor(type: string): string {
  if (type === 'MONTHLY_FLOW_LOSS' || type === 'P2P_TRANSFER_OUT') return 'var(--accent-danger, #ef4444)';
  if (type.endsWith('REWARD') || type === 'P2P_TRANSFER_IN') return 'var(--accent-success, #10b981)';
  return 'var(--text-secondary)';
}

function formatBerries(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 10,
      padding: '1rem',
      background: 'rgba(255,255,255,0.03)',
      flex: '1 1 150px',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  treeId: string;
  isAdmin: boolean;
}

type Tab = 'wallet' | 'historial' | 'admin';

export default function BerryWalletPanel({ treeId, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>('wallet');
  const [balance, setBalance] = useState<BerryBalance | null>(null);
  const [preview, setPreview] = useState<BerryPreview | null>(null);
  const [config, setConfig] = useState<BerryConfig | null>(null);
  const [transactions, setTransactions] = useState<BerryTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [showRiverInfo, setShowRiverInfo] = useState(false);
  const [adminCycleKey, setAdminCycleKey] = useState('');
  const [adminResult, setAdminResult] = useState<AdminCycle | null>(null);
  const [adminApplying, setAdminApplying] = useState(false);
  const [adminError, setAdminError] = useState('');

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, previewRes] = await Promise.all([
        api.get(`/trees/${treeId}/berries/me`),
        api.get(`/trees/${treeId}/berries/me/monthly-flow-preview`),
      ]);
      setBalance(balRes.data);
      setPreview(previewRes.data);
    } catch {}
    setLoading(false);
  }, [treeId]);

  const fetchConfig = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get(`/trees/${treeId}/berries/config`);
      setConfig(data);
    } catch {}
  }, [treeId, isAdmin]);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const { data } = await api.get(`/trees/${treeId}/berries/me/transactions?limit=50`);
      setTransactions(data.transactions ?? []);
      setTxTotal(data.total ?? 0);
    } catch {}
    setTxLoading(false);
  }, [treeId]);

  useEffect(() => {
    fetchWallet();
    fetchConfig();
  }, [fetchWallet, fetchConfig]);

  useEffect(() => {
    if (tab === 'historial') fetchTransactions();
  }, [tab, fetchTransactions]);

  // Build default cycleKey for admin apply
  useEffect(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    setAdminCycleKey(`${y}-${m}`);
  }, []);

  async function handleApplyFlow() {
    if (!adminCycleKey) return;
    setAdminApplying(true);
    setAdminError('');
    setAdminResult(null);
    try {
      const { data } = await api.post(`/trees/${treeId}/berries/apply-monthly-flow`, { cycleKey: adminCycleKey });
      setAdminResult(data);
      fetchWallet();
    } catch (err: any) {
      setAdminError(err?.response?.data?.error ?? 'Error al aplicar ciclo');
    }
    setAdminApplying(false);
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        background: 'none', border: 'none', borderRadius: 0,
        borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
        color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
        padding: '0.5rem 0.75rem', cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
        fontSize: '0.85rem',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <Droplets size={22} color="var(--accent-primary)" />
        <h3 style={{ margin: 0 }}>Berries</h3>
        <button
          onClick={() => setShowRiverInfo(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem', marginLeft: 'auto' }}
          title="¿Cómo funcionan las Berries?"
        >
          <Info size={16} />
        </button>
        <button onClick={fetchWallet} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem' }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* River info notice */}
      {showRiverInfo && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 10, padding: '1rem', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Las Berries funcionan como un río, no como un lago.</strong>
          <br /><br />
          Cada mes, al inicio del ciclo, el saldo acumulado pierde un {pct(preview?.monthlyFlowRate ?? 0.10)}. Ese porcentaje <strong>sale de circulación y no va a ningún fondo ni administrador</strong>. Luego, nuevas Berries fluyen hacia quienes contribuyen mediante tareas, auditorías y nivel.
          <br /><br />
          <strong>Fórmula:</strong><br />
          Saldo próximo ciclo = saldo actual − {pct(preview?.monthlyFlowRate ?? 0.10)} + nuevas Berries ganadas
          <br /><br />
          <Shield size={12} style={{ display: 'inline', marginRight: 4 }} />
          <em>Fiat no compra Berries. Berries no compran XP, votos ni autoridad.</em>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '0.25rem' }}>
        {tabBtn('wallet', '🏦 Mi Wallet')}
        {tabBtn('historial', '📋 Historial')}
        {isAdmin && tabBtn('admin', '⚙️ Admin')}
      </div>

      {/* ── WALLET TAB ── */}
      {tab === 'wallet' && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {/* Current balance big display */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(16,185,129,0.08) 100%)',
              border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.4rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>
                Saldo actual
              </div>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0.5rem 0' }}>
                🍓 {formatBerries(balance?.balance ?? 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Berries</div>
              {balance?.lastCycleKey && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                  <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                  Último ciclo aplicado: {balance.lastCycleKey}
                </div>
              )}
            </div>

            {/* Preview stats */}
            {preview && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <StatCard
                    label="Reducción mensual estimada"
                    value={`− ${formatBerries(preview.estimatedMonthlyLoss)}`}
                    sub={`${pct(preview.monthlyFlowRate)} del saldo inicial`}
                    color="var(--accent-danger, #ef4444)"
                  />
                  <StatCard
                    label="Saldo después del ajuste"
                    value={formatBerries(preview.balanceAfterFlow)}
                    sub={`Si no hay caudal nuevo`}
                    color="var(--accent-warning, #f59e0b)"
                  />
                  <StatCard
                    label="Caudal mensual estimado"
                    value={preview.estimatedMonthlyIncome !== null ? `+ ${formatBerries(preview.estimatedMonthlyIncome)}` : '+ ?'}
                    sub="Tareas, auditorías, nivel"
                    color="var(--accent-success, #10b981)"
                  />
                  <StatCard
                    label="Saldo proyectado"
                    value={formatBerries(preview.projectedBalance)}
                    sub={`Ciclo ${preview.nextCycleKey}`}
                  />
                </div>

                {/* Cycle status */}
                {preview.alreadyAppliedThisCycle && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--accent-success, #10b981)' }}>
                    <TrendingDown size={14} />
                    La reducción del ciclo {preview.currentCycleKey} ya fue aplicada a tu saldo.
                  </div>
                )}

                {/* Example */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem', fontSize: '0.8rem', lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Ejemplo de ciclo:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.2rem 1rem', color: 'var(--text-secondary)' }}>
                    <span>Saldo inicial</span>
                    <strong style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{formatBerries(preview.balance)}</strong>
                    <span>Reducción mensual ({pct(preview.monthlyFlowRate)})</span>
                    <strong style={{ color: 'var(--accent-danger, #ef4444)', textAlign: 'right' }}>− {formatBerries(preview.estimatedMonthlyLoss)}</strong>
                    <span>Saldo después del ajuste</span>
                    <strong style={{ color: 'var(--accent-warning, #f59e0b)', textAlign: 'right' }}>{formatBerries(preview.balanceAfterFlow)}</strong>
                    <span>Caudal mensual estimado</span>
                    <strong style={{ color: 'var(--accent-success, #10b981)', textAlign: 'right' }}>
                      {preview.estimatedMonthlyIncome !== null ? `+ ${formatBerries(preview.estimatedMonthlyIncome)}` : '+ (depende de contribución)'}
                    </strong>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Saldo proyectado</span>
                    <strong style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{formatBerries(preview.projectedBalance)}</strong>
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0 0.25rem', lineHeight: 1.6 }}>
                  🛡 El {pct(preview.monthlyFlowRate)} que sale de circulación <strong>no va a ningún fondo ni administrador</strong>. Se destruye. Las Berries no compran XP, votos ni autoridad.
                </div>
              </>
            )}
          </div>
        )
      )}

      {/* ── HISTORIAL TAB ── */}
      {tab === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {txLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', fontSize: '0.85rem' }}>
              Aún no hay transacciones de Berries registradas.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0 0.25rem' }}>
                {txTotal} movimiento{txTotal !== 1 ? 's' : ''} registrado{txTotal !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {transactions.map(tx => (
                  <div key={tx.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '0.75rem 1rem',
                    border: '1px solid var(--border-color)', borderRadius: 8,
                    background: tx.type === 'MONTHLY_FLOW_LOSS' ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: txColor(tx.type) }}>
                        {txTypeLabel(tx.type)}
                      </div>
                      {tx.description && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          {tx.description}
                        </div>
                      )}
                      {tx.cycleKey && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          Ciclo: {tx.cycleKey}
                        </div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                        {new Date(tx.createdAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: txColor(tx.type) }}>
                        {tx.type === 'MONTHLY_FLOW_LOSS' || tx.type === 'P2P_TRANSFER_OUT' ? '−' : '+'} {formatBerries(tx.amount)}
                      </div>
                      {tx.balanceAfter !== null && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          Saldo: {formatBerries(tx.balanceAfter)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADMIN TAB ── */}
      {tab === 'admin' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Config display */}
          {config && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.85rem' }}>Configuración del Tree</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>Berries habilitadas</span><strong style={{ color: config.berriesEnabled ? 'var(--accent-success)' : 'var(--text-secondary)' }}>{config.berriesEnabled ? 'Sí' : 'No'}</strong>
                <span>Tasa de reducción mensual</span><strong style={{ color: 'var(--text-primary)' }}>{pct(config.monthlyFlowRate)}</strong>
                <span>Día del ciclo mensual</span><strong style={{ color: 'var(--text-primary)' }}>{config.monthlyFlowDay}</strong>
              </div>
            </div>
          )}

          {/* Apply cycle manually */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Aplicar ciclo mensual manualmente</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              El cron lo aplica automáticamente el día 1 de cada mes. Puedes aplicarlo aquí para pruebas. La operación es idempotente: si ya fue aplicada para el cicleKey ingresado, no se duplicará.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={adminCycleKey}
                onChange={e => setAdminCycleKey(e.target.value)}
                placeholder="YYYY-MM"
                style={{
                  background: 'var(--input-bg, rgba(255,255,255,0.07))',
                  border: '1px solid var(--border-color)', borderRadius: 6,
                  padding: '0.5rem 0.75rem', color: 'var(--text-primary)',
                  fontSize: '0.85rem', width: 130,
                }}
              />
              <button
                onClick={handleApplyFlow}
                disabled={adminApplying || !adminCycleKey}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
              >
                {adminApplying ? <Loader2 size={14} className="animate-spin" /> : <TrendingDown size={14} />}
                Aplicar reducción
              </button>
            </div>
            {adminError && (
              <div style={{ marginTop: '0.5rem', color: 'var(--accent-danger, #ef4444)', fontSize: '0.78rem' }}>{adminError}</div>
            )}
            {adminResult && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: adminResult.skipped ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${adminResult.skipped ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: 8, fontSize: '0.78rem', lineHeight: 1.7 }}>
                <strong>{adminResult.message}</strong>
                {!adminResult.skipped && (
                  <>
                    <br />Usuarios procesados: {adminResult.usersProcessed}
                    <br />Berries destruidas: {formatBerries(adminResult.totalDestroyed)}
                    <br /><em style={{ color: 'var(--text-secondary)' }}>El monto destruido no fue transferido a nadie.</em>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
