import { useState, useEffect } from 'react';
import { TreePine, Search, Users, Loader2, Check, ArrowRight, SkipForward, Plus, Globe } from 'lucide-react';
import api from '../../lib/api';
import { useTreeStore } from '../../store/treeStore';

interface Props {
  onChoose: (choice: 'create' | 'join', treeId?: string) => void;
  onSkip: () => void;
}

type View = 'choice' | 'create-form' | 'join-list';

export default function StepTeamChoice({ onChoose, onSkip }: Props) {
  const [view, setView] = useState<View>('choice');
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // ── Create ────────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const capsArr = capabilities
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('#') ? s : `#${s}`));
      const { data } = await api.post('/trees', {
        name: name.trim(),
        visibility: 'PRIVATE',
        admissionPolicy: 'INVITE_ONLY',
        capacidades: JSON.stringify(capsArr),
      });
      useTreeStore.getState().fetchTrees();
      onChoose('create', data.id);
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || 'Error al crear el equipo');
      setCreating(false);
    }
  };

  // ── Join ─────────────────────────────────────────────────────────────────
  const [publicTrees, setPublicTrees] = useState<any[]>([]);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [search, setSearch] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  const loadPublicTrees = async () => {
    setLoadingTrees(true);
    try {
      const { data } = await api.get('/trees/global');
      setPublicTrees(data || []);
    } catch {
      setPublicTrees([]);
    } finally {
      setLoadingTrees(false);
    }
  };

  useEffect(() => {
    if (view === 'join-list') loadPublicTrees();
  }, [view]);

  const handleJoin = async (treeId: string) => {
    setJoining(treeId);
    try {
      await api.post('/trees/join', { treeId });
      useTreeStore.getState().fetchTrees();
      onChoose('join', treeId);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al unirse');
      setJoining(null);
    }
  };

  const filtered = publicTrees.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Choice view ──────────────────────────────────────────────────────────
  if (view === 'choice') {
    return (
      <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
          ¿Qué querés hacer?
        </h3>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexDirection: isMobile ? 'column' : 'row' }}>
          {/* Crear equipo */}
          <button
            onClick={() => setView('create-form')}
            className="glass-panel"
            style={{
              flex: 1, cursor: 'pointer', textAlign: 'center',
              padding: isMobile ? '1.5rem' : '2rem',
              border: '2px solid rgba(59,130,246,0.3)',
              background: 'rgba(59,130,246,0.05)',
              transition: 'all 0.2s',
            }}
          >
            <Plus size={36} style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 600 }}>Crear un equipo</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
              Crea tu propio espacio de trabajo con roles, necesidades y ramas.
            </p>
          </button>

          {/* Unirme */}
          <button
            onClick={() => { setView('join-list'); loadPublicTrees(); }}
            className="glass-panel"
            style={{
              flex: 1, cursor: 'pointer', textAlign: 'center',
              padding: isMobile ? '1.5rem' : '2rem',
              border: '2px solid rgba(16,185,129,0.3)',
              background: 'rgba(16,185,129,0.05)',
              transition: 'all 0.2s',
            }}
          >
            <Globe size={36} style={{ color: 'var(--accent-success)', marginBottom: '0.75rem' }} />
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 600 }}>Unirme a uno</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
              Explora equipos públicos y solicitá unirte.
            </p>
          </button>
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
          Omitir por ahora
        </button>
      </div>
    );
  }

  // ── Create form view ─────────────────────────────────────────────────────
  if (view === 'create-form') {
    return (
      <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button onClick={() => setView('choice')} className="btn btn-outline" style={{ padding: '0.3rem 0.5rem' }}>
            ←
          </button>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Crear equipo</h3>
        </div>

        <div className="input-group">
          <label>Nombre del equipo</label>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: Fontaneros del Sur"
            autoFocus
          />
        </div>

        <div className="input-group">
          <label>Capacidades (separadas por coma)</label>
          <input
            className="input-field"
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            placeholder="#Fontaneria, #Electricidad, #Construccion"
          />
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Esto permite que otros encuentren tu equipo por habilidades.
          </p>
        </div>

        {createError && (
          <p style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{createError}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: '0.5rem' }}
        >
          {creating ? <><Loader2 size={16} className="animate-spin" /> Creando…</> : <><TreePine size={16} /> Crear equipo</>}
        </button>

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

  // ── Join list view ───────────────────────────────────────────────────────
  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setView('choice')} className="btn btn-outline" style={{ padding: '0.3rem 0.5rem' }}>
          ←
        </button>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Equipos públicos</h3>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-secondary)' }} />
        <input
          className="input-field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar equipo…"
          style={{ paddingLeft: '2.2rem', width: '100%' }}
        />
      </div>

      {loadingTrees && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        </div>
      )}

      {!loadingTrees && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {publicTrees.length === 0 ? 'No hay equipos públicos disponibles.' : 'Sin resultados.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
        {filtered.map((tree) => (
          <div
            key={tree.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tree.icono && <span style={{ marginRight: '0.35rem' }}>{tree.icono}</span>}
                {tree.name}
              </div>
              {tree._count?.members && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  <Users size={12} />
                  {tree._count.members} miembros
                </div>
              )}
            </div>
            <button
              onClick={() => handleJoin(tree.id)}
              disabled={joining === tree.id}
              className="btn btn-primary"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', marginLeft: '0.75rem', flexShrink: 0 }}
            >
              {joining === tree.id ? <Loader2 size={14} className="animate-spin" /> : 'Unirse'}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={onSkip}
        style={{
          width: '100%', background: 'none', border: 'none',
          color: 'var(--text-secondary)', cursor: 'pointer',
          fontSize: '0.8rem', padding: '0.75rem 0.5rem 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
        }}
      >
        <SkipForward size={14} />
        Omitir
      </button>
    </div>
  );
}
