import { useState, useEffect } from 'react';
import { Search, Users, Loader2, Globe, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useTreeStore } from '../../store/treeStore';

interface Props { onSkip: () => void; }

export default function StepJoinTree({ onSkip }: Props) {
  const navigate = useNavigate();
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [publicTrees, setPublicTrees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const { data } = await api.get('/trees/global'); setPublicTrees(data || []); }
      catch { setPublicTrees([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleJoin = async (treeId: string) => {
    setJoining(treeId);
    try {
      await api.post('/trees/join', { treeId });
      useTreeStore.getState().fetchTrees();
      setJoined(true);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err: any) { alert(err?.response?.data?.error || 'Error al unirse'); setJoining(null); }
  };

  const filtered = publicTrees.filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  if (joined) {
    return (
      <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--grad-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(16,185,129,0.4)' }}><Sparkles size={28} color="white" /></div>
        <div><h4 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 600 }}>¡Te uniste al árbol!</h4><p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Redirigiendo al chat…</p></div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Globe size={22} style={{ color: 'var(--accent-success)' }} />
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Unirse a un árbol</h3>
      </div>
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-secondary)' }} />
        <input className="input-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar árbol…" style={{ paddingLeft: '2.2rem', width: '100%' }} />
      </div>
      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} /></div>}
      {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{publicTrees.length === 0 ? 'No hay árboles públicos disponibles.' : 'Sin resultados.'}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto', marginBottom: '1rem' }}>
        {filtered.map((tree) => (
          <div key={tree.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tree.name}</div>
              {tree.description && <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tree.description}</div>}
              {tree._count?.members !== undefined && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}><Users size={12} /> {tree._count.members} miembros</div>}
            </div>
            <button onClick={() => handleJoin(tree.id)} disabled={joining === tree.id} className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', marginLeft: '0.75rem', flexShrink: 0 }}>
              {joining === tree.id ? <Loader2 size={14} className="animate-spin" /> : 'Unirse'}
            </button>
          </div>
        ))}
      </div>
      <button onClick={onSkip} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>Omitir</button>
    </div>
  );
}
