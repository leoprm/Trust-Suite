import { useState, useEffect } from 'react';
import { ThumbsUp, Loader2, SkipForward, Check, AlertCircle, TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

interface Need {
  id: string;
  title: string;
  description: string;
  status: string;
  pointsAllocated: number;
  creator: { username: string };
  _count: { fundings: number };
  createdAt: string;
}

interface Props {
  treeId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function StepVoteNeed({ treeId, onComplete, onSkip }: Props) {
  const user = useAuthStore((s) => s.user);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fundingId, setFundingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // User's available points for this tree
  const membership = user?.memberships?.find((m) => m.treeId === treeId);
  const availablePoints = membership?.weeklyNeedPoints ?? 0;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/needs?treeId=${treeId}`);
        // Filter to only OPEN needs
        const open = (data || []).filter((n: Need) => n.status === 'OPEN');
        setNeeds(open);
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Error al cargar necesidades');
      } finally {
        setLoading(false);
      }
    })();
  }, [treeId]);

  const handleFund = async (needId: string) => {
    if (availablePoints <= 0) return;
    setFundingId(needId);
    setError('');
    try {
      await api.post(`/needs/${needId}/fund`, { points: 1 });
      setSuccessId(needId);
      setTimeout(() => {
        setDone(true);
        setTimeout(onComplete, 1200);
      }, 800);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al votar');
      setFundingId(null);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  if (done) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: isMobile ? '2rem 1.5rem' : '3rem 2rem' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--grad-success)', margin: '0 auto 1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={28} color="white" />
        </div>
        <h4 style={{ marginBottom: '0.25rem' }}>¡Voto registrado!</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Redirigiendo…</p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <ThumbsUp size={22} style={{ color: 'var(--accent-primary)' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Votá una necesidad</h3>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Apoyá las necesidades que te parezcan importantes.{' '}
        {availablePoints > 0 ? (
          <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
            Tenés {availablePoints} punto{availablePoints !== 1 ? 's' : ''} disponible{availablePoints !== 1 ? 's' : ''}.
          </span>
        ) : (
          <span style={{ color: 'var(--accent-warning)' }}>
            No tenés puntos disponibles este período.
          </span>
        )}
      </p>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          color: 'var(--accent-danger)', fontSize: '0.8rem',
          marginBottom: '0.75rem', padding: '0.5rem 0.75rem',
          background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)',
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        </div>
      )}

      {!loading && needs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          No hay necesidades abiertas en este equipo.
          <br />
          <span style={{ fontSize: '0.8rem' }}>¡Sé el primero en crear una!</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '340px', overflowY: 'auto', marginBottom: '1rem' }}>
        {needs.slice(0, 15).map((need) => (
          <div
            key={need.id}
            style={{
              padding: '0.85rem 1rem',
              background: successId === need.id ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
              borderRadius: 'var(--radius-md)',
              border: successId === need.id ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 600 }}>{need.title}</h4>
                <p style={{
                  margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {need.description?.slice(0, 80)}{need.description?.length > 80 ? '…' : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span>{need.creator.username}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <TrendingUp size={12} />
                    {need.pointsAllocated || 0} pts
                  </span>
                </div>
              </div>
              {successId === need.id ? (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--accent-success)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Check size={16} color="white" />
                </div>
              ) : (
                <button
                  onClick={() => handleFund(need.id)}
                  disabled={fundingId === need.id || availablePoints <= 0}
                  className="btn btn-primary"
                  style={{
                    padding: '0.4rem 0.8rem', fontSize: '0.78rem',
                    flexShrink: 0, opacity: availablePoints <= 0 ? 0.4 : 1,
                  }}
                  title={availablePoints <= 0 ? 'Sin puntos disponibles' : 'Votar esta necesidad'}
                >
                  {fundingId === need.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <><ThumbsUp size={13} style={{ marginRight: '0.25rem' }} />Votar</>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onSkip}
        style={{
          width: '100%', background: 'none', border: 'none',
          color: 'var(--text-secondary)', cursor: 'pointer',
          fontSize: '0.8rem', padding: '0.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
        }}
      >
        <SkipForward size={14} />
        Omitir
      </button>
    </div>
  );
}
