import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from 'react-i18next';
import { Wallet, Coins, Sprout, Receipt, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface FiatTree {
  treeId: string;
  treeName: string;
  balance: number;
}

interface BerriesTree {
  treeId: string;
  treeName: string;
  balance: number;
}

interface SubscriptionTree {
  treeId: string;
  treeName: string;
  isPayingMember: boolean;
  financingMode: string;
}

interface Transaction {
  id: string;
  type: 'fiat' | 'berries';
  amount: number;
  description: string;
  treeName?: string;
  createdAt: string;
}

interface WalletData {
  fiatBalance: { total: number; byTree: FiatTree[] };
  berriesBalance: { total: number; byTree: BerriesTree[] };
  subscriptions: { isPayingMember: boolean; trees: SubscriptionTree[] };
  recentTransactions: Transaction[];
}

export default function WalletPage() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterTreeId = searchParams.get('treeId');
  const { t } = useTranslation();
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get('/api/wallet/me')
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.error ?? 'Error al cargar la wallet');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  if (isInitialLoading || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', gap: '0.75rem' }}>
        <AlertCircle size={40} style={{ color: 'var(--accent-danger)' }} />
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  // Filter by treeId if specified
  const filteredFiatByTree = filterTreeId
    ? data.fiatBalance.byTree.filter(t => t.treeId === filterTreeId)
    : data.fiatBalance.byTree;
  const filteredBerriesByTree = filterTreeId
    ? data.berriesBalance.byTree.filter(t => t.treeId === filterTreeId)
    : data.berriesBalance.byTree;
  const filteredSubscriptions = filterTreeId
    ? data.subscriptions.trees.filter(s => s.treeId === filterTreeId)
    : data.subscriptions.trees;
  // For transactions we filter by treeName matching the filtered tree
  const filteredTreeName = filterTreeId
    ? (data.fiatBalance.byTree.find(t => t.treeId === filterTreeId)?.treeName
       || data.berriesBalance.byTree.find(t => t.treeId === filterTreeId)?.treeName
       || data.subscriptions.trees.find(s => s.treeId === filterTreeId)?.treeName)
    : null;
  const filteredTransactions = filterTreeId && filteredTreeName
    ? data.recentTransactions.filter(tx => tx.treeName === filteredTreeName)
    : data.recentTransactions;

  const cardStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 45, 0.6)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    padding: isMobile ? '1.25rem' : '1.5rem',
  };

  const formatFiat = (amount: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount / 100);

  const formatBerries = (amount: number) =>
    new Intl.NumberFormat('es-ES').format(amount);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
        <Wallet size={isMobile ? 24 : 28} style={{ color: 'var(--accent-primary)' }} />
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Wallet
        </h1>
        {filterTreeId && filteredTreeName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'rgba(59,130,246,0.1)', padding: '0.25rem 0.6rem', borderRadius: '100px' }}>
              {filteredTreeName}
            </span>
            <button
              onClick={() => navigate('/wallet')}
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '6px',
              }}
              title="Ver todos los Trees"
            >
              Ver todo
            </button>
          </div>
        )}
      </div>

      {/* Balance Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? '1rem' : '1.5rem',
      }}>
        {/* Fiat Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Coins size={20} style={{ color: 'var(--accent-success)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Fiat
            </span>
          </div>
          <div style={{ fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800, color: 'var(--accent-success)', marginBottom: '0.25rem' }}>
            {formatFiat(data.fiatBalance.total)}
          </div>
          {filteredFiatByTree.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              {filteredFiatByTree.map((t) => (
                <div key={t.treeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.treeName}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: t.balance >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                    {formatFiat(t.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Berries Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sprout size={20} style={{ color: 'var(--accent-warning)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Berries
            </span>
          </div>
          <div style={{ fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800, color: 'var(--accent-warning)', marginBottom: '0.25rem' }}>
            {formatBerries(data.berriesBalance.total)} 🫐
          </div>
          {filteredBerriesByTree.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              {filteredBerriesByTree.map((t) => (
                <div key={t.treeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.treeName}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatBerries(t.balance)} 🫐
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subscriptions */}
      {filteredSubscriptions.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Receipt size={20} style={{ color: 'var(--accent-info)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Suscripciones activas
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredSubscriptions.map((sub) => (
              <div
                key={sub.treeId}
                onClick={() => navigate(`/trees/${sub.treeId}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.65rem 0.85rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {sub.treeName}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {sub.isPayingMember ? 'Miembro de pago' : `Modo: ${sub.financingMode}`}
                  </span>
                </div>
                <ExternalLink size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Receipt size={20} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Últimos movimientos
          </span>
        </div>

        {filteredTransactions.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
            Sin movimientos recientes
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredTransactions.map((tx, i) => (
              <div
                key={tx.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.6rem 0',
                  borderBottom: i < filteredTransactions.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  {tx.type === 'fiat' ? (
                    <Coins size={16} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
                  ) : (
                    <Sprout size={16} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description}
                    </span>
                    {tx.treeName && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{tx.treeName}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: tx.amount >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)',
                  }}>
                    {tx.type === 'fiat' ? formatFiat(tx.amount) : `${formatBerries(tx.amount)} 🫐`}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>
                    {timeAgo(tx.createdAt)}
                  </span>
                </div>
              </div>
            ))}
            <div
              onClick={() => navigate('/wallet/transactions')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                padding: '0.65rem 0 0.2rem',
                color: 'var(--accent-primary)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                borderTop: '1px solid var(--border-color)',
                marginTop: '0.3rem',
              }}
            >
              <ExternalLink size={14} />
              Ver historial completo
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
