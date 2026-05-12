import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Wallet, Receipt, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface SubscriptionTree {
  treeId: string;
  treeName: string;
  isPayingMember: boolean;
  financingMode: string;
}

export default function WalletPage() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterTreeId = searchParams.get('treeId');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [subscriptions, setSubscriptions] = useState<SubscriptionTree[]>([]);
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

    api.get('/wallet/me')
      .then((res) => {
        if (!cancelled) {
          const subs: SubscriptionTree[] = res.data?.subscriptions ?? [];
          setSubscriptions(subs);
        }
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

  const filteredSubscriptions = filterTreeId
    ? subscriptions.filter(s => s.treeId === filterTreeId)
    : subscriptions;

  const cardStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 45, 0.6)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    padding: isMobile ? '1.25rem' : '1.5rem',
  };

  const navigateToTree = (treeId: string) => {
    if (isMobile) {
      navigate(`/?treeId=${treeId}&tab=medir`);
    } else {
      navigate(`/trees/${treeId}`);
    }
  };

  const filteredTreeName = filterTreeId
    ? subscriptions.find(s => s.treeId === filterTreeId)?.treeName
    : null;

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
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.25rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s, background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'none';
          }}
        >
          <ArrowLeft size={isMobile ? 20 : 22} />
        </button>
        <Wallet size={isMobile ? 24 : 28} style={{ color: 'var(--accent-primary)' }} />
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Suscripciones
        </h1>
        {filterTreeId && filteredTreeName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'rgba(59,130,246,0.1)', padding: '0.25rem 0.6rem', borderRadius: '100px' }}>
              {filteredTreeName}
            </span>
          </div>
        )}
      </div>

      {/* Subscriptions */}
      {filteredSubscriptions.length > 0 ? (
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
                onClick={() => navigateToTree(sub.treeId)}
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
      ) : (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
            Sin suscripciones activas
          </p>
        </div>
      )}
    </div>
  );
}
