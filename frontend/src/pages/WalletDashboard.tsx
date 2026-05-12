import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Receipt,
  Sprout, Clock, Loader2, AlertCircle, ChevronRight, ExternalLink,
  Coins, Lock,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface WalletSection {
  availableClp: number;
  lockedClp: number;
  availableBerries: number;
  lockedBerries: number;
}

interface Subscription {
  treeId: string;
  treeName: string;
  financingMode: string;
  subscriptionAmount: number;
  subscriptionCurrency: string;
  isPayingMember: boolean;
  status: string;
}

interface Transaction {
  id: string;
  kind: 'wallet' | 'fiat' | 'berries';
  walletType?: string;
  status?: string;
  amount: number;
  currency?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  treeId?: string;
  treeName?: string;
  fromUserId?: string;
  toUserId?: string;
  type?: string;
  category?: string;
  description?: string;
  createdAt: string;
}

interface WalletData {
  wallet: WalletSection;
  subscriptions: Subscription[];
  recentTransactions: Transaction[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatClp(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatBerries(amount: number): string {
  return new Intl.NumberFormat('es-CL').format(amount);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function txLabel(tx: Transaction): string {
  if (tx.kind === 'wallet') {
    return tx.walletType === 'DEPOSIT' ? 'Depósito' : tx.walletType === 'WITHDRAWAL' ? 'Retiro' : tx.walletType || 'Transferencia';
  }
  if (tx.kind === 'fiat') return tx.description || tx.type || 'Fiat';
  return tx.description || tx.type || 'Berries';
}

function txAmount(tx: Transaction): { value: number; prefix: string } {
  if (tx.kind === 'wallet') {
    const isOut = tx.walletType === 'WITHDRAWAL' || (tx.fromUserId && !tx.toUserId);
    return { value: tx.amount, prefix: isOut ? '-' : '+' };
  }
  if (tx.kind === 'fiat') {
    return { value: tx.amount, prefix: tx.type === 'EXPENSE' ? '-' : '+' };
  }
  return { value: tx.amount, prefix: tx.type === 'DEBIT' || tx.type === 'SPEND' ? '-' : '+' };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function WalletDashboard() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  const fetchWallet = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    api.get('/wallet/me')
      .then((res) => { setData(res.data); })
      .catch((err) => { setError(err?.response?.data?.error ?? 'Error al cargar la wallet'); })
      .finally(() => { setLoading(false); });
  }, [user]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (isInitialLoading || loading) {
    return (
      <div style={centerStyle}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (!user) return null;

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ ...centerStyle, flexDirection: 'column', gap: '0.75rem' }}>
        <AlertCircle size={40} style={{ color: 'var(--accent-danger)' }} />
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{error}</p>
        <button onClick={fetchWallet} className="btn" style={retryBtn}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { wallet, subscriptions, recentTransactions } = data;

  // ── Card style ─────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 45, 0.6)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    padding: isMobile ? '1.25rem' : '1.5rem',
  };

  return (
    <div style={{
      padding: isMobile ? '1rem' : '2rem',
      maxWidth: 860,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? '1rem' : '1.5rem',
      background: '#0D0D1A',
      minHeight: '100%',
    }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Wallet size={isMobile ? 24 : 28} style={{ color: 'var(--accent-primary)' }} />
        <h1 style={{
          margin: 0,
          fontSize: isMobile ? '1.25rem' : '1.5rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}>
          Trust Wallet
        </h1>
      </div>

      {/* ── Balance Cards ─────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? '0.75rem' : '1rem',
      }}>
        {/* CLP Available */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Coins size={18} style={{ color: 'var(--accent-success)' }} />
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              CLP Disponible
            </span>
          </div>
          <div style={{
            fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800,
            color: 'var(--accent-success)',
          }}>
            {formatClp(wallet.availableClp)}
          </div>
        </div>

        {/* CLP Blocked (locked) */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Lock size={18} style={{ color: 'var(--accent-warning)' }} />
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              CLP Bloqueado
            </span>
          </div>
          <div style={{
            fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800,
            color: wallet.lockedClp > 0 ? 'var(--accent-warning)' : 'var(--text-secondary)',
          }}>
            {formatClp(wallet.lockedClp)}
          </div>
        </div>

        {/* Berries Total - full width on both layouts */}
        <div style={{ ...cardStyle, gridColumn: isMobile ? '1' : '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Sprout size={18} style={{ color: '#a78bfa' }} />
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Berries Totales
            </span>
          </div>
          <div style={{
            fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800,
            color: '#a78bfa',
          }}>
            {formatBerries(wallet.availableBerries)} 🫐
          </div>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: isMobile ? '0.5rem' : '0.75rem',
      }}>
        <button onClick={() => navigate('/deposit')} style={actionBtn('#10b981')}>
          <ArrowDownCircle size={isMobile ? 22 : 26} />
          <span>Depositar</span>
        </button>
        <button onClick={() => navigate('/withdraw')} style={actionBtn('#f59e0b')}>
          <ArrowUpCircle size={isMobile ? 22 : 26} />
          <span>Retirar</span>
        </button>
        <button onClick={() => navigate('/transfer')} style={actionBtn('#3b82f6')}>
          <ArrowLeftRight size={isMobile ? 22 : 26} />
          <span>Transferir</span>
        </button>
      </div>

      {/* ── Active Subscriptions ───────────────────────────────────────── */}
      {subscriptions.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Receipt size={18} style={{ color: 'var(--accent-info)' }} />
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Suscripciones activas
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {subscriptions.map((sub) => (
              <div
                key={sub.treeId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.55rem 0.75rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {sub.treeName}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {sub.isPayingMember ? 'Miembro de pago' : `Modo: ${sub.financingMode}`}
                    {sub.subscriptionAmount > 0 && (
                      <> · {new Intl.NumberFormat('es-CL', { style: 'currency', currency: sub.subscriptionCurrency || 'CLP', minimumFractionDigits: 0 }).format(sub.subscriptionAmount)}</>
                    )}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600, color: sub.status === 'ACTIVE' ? 'var(--accent-success)' : 'var(--text-secondary)',
                  padding: '0.15rem 0.5rem', borderRadius: '100px',
                  background: sub.status === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                }}>
                  {sub.status === 'ACTIVE' ? 'Activa' : sub.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Transactions ────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Últimos movimientos
            </span>
          </div>
          {recentTransactions.length > 0 && (
            <button
              onClick={() => navigate('/transactions')}
              style={{
                background: 'none', border: 'none', color: 'var(--accent-primary)',
                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: '0.25rem',
              }}
            >
              Ver todo <ChevronRight size={14} />
            </button>
          )}
        </div>

        {recentTransactions.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
            No hay transacciones aún
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentTransactions.map((tx, i) => {
              const amt = txAmount(tx);
              const isWallet = tx.kind === 'wallet';
              const isPending = tx.status === 'PENDING';
              return (
                <div
                  key={tx.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.55rem 0',
                    borderBottom: i < recentTransactions.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {/* Icon */}
                    {isWallet ? (
                      tx.walletType === 'DEPOSIT'
                        ? <ArrowDownCircle size={16} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
                        : tx.walletType === 'WITHDRAWAL'
                        ? <ArrowUpCircle size={16} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
                        : <ArrowLeftRight size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                    ) : tx.kind === 'berries' ? (
                      <Sprout size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    ) : (
                      <Coins size={16} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{
                        fontSize: '0.85rem', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {txLabel(tx)}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {(tx.treeName || tx.currency || 'CLP')}
                        {isPending && (
                          <span style={{ color: 'var(--accent-warning)', marginLeft: '0.35rem' }}>Pendiente</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.85rem', fontWeight: 600,
                      color: isPending ? 'var(--accent-warning)'
                        : amt.prefix === '+' ? 'var(--accent-success)'
                        : amt.prefix === '-' ? 'var(--accent-danger)'
                        : 'var(--text-primary)',
                    }}>
                      {amt.prefix}{tx.kind === 'berries'
                        ? `${formatBerries(amt.value)} 🫐`
                        : formatClp(amt.value)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>
                      {timeAgo(tx.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
            {recentTransactions.length >= 5 && (
              <div
                onClick={() => navigate('/transactions')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '0.35rem', padding: '0.65rem 0 0.2rem',
                  color: 'var(--accent-primary)', fontSize: '0.8rem',
                  fontWeight: 500, cursor: 'pointer',
                  borderTop: '1px solid var(--border-color)', marginTop: '0.3rem',
                }}
              >
                <ExternalLink size={14} />
                Ver historial completo
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────

const centerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '100%', padding: '2rem',
};

const retryBtn: React.CSSProperties = {
  background: 'var(--accent-primary)', color: '#fff', border: 'none',
  padding: '0.5rem 1.5rem', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
};

function actionBtn(color: string): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1.25rem 0.75rem',
    background: `rgba(${hexToRgb(color)}, 0.1)`,
    border: `1px solid rgba(${hexToRgb(color)}, 0.2)`,
    borderRadius: 'var(--radius-lg)',
    color,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    transition: 'all 0.2s',
  };
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
