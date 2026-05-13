import { useState } from 'react';
import { Lightbulb, Loader2, SkipForward, Check } from 'lucide-react';
import api from '../../lib/api';

interface Props {
  treeId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function StepCreateNeed({ treeId, onComplete, onSkip }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/needs', {
        title: title.trim(),
        description: description.trim(),
        treeId,
      });
      setDone(true);
      setTimeout(onComplete, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al crear necesidad');
      setLoading(false);
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
        <h4 style={{ marginBottom: '0.25rem' }}>¡Necesidad creada!</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Redirigiendo…</p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Lightbulb size={22} style={{ color: 'var(--accent-warning)' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Creá tu primera necesidad</h3>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Las necesidades son el punto de partida. Definen qué hace falta en tu equipo.
      </p>

      <div className="input-group">
        <label>Título</label>
        <input
          className="input-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ej: Reparar filtración en baño común"
          autoFocus
        />
      </div>

      <div className="input-group">
        <label>Descripción</label>
        <textarea
          className="input-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe qué se necesita, por qué, y cualquier detalle relevante…"
          style={{ minHeight: '100px', resize: 'vertical' }}
        />
      </div>

      {error && (
        <p style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>
      )}

      <button
        onClick={handleCreate}
        disabled={loading || !title.trim() || !description.trim()}
        className="btn btn-primary"
        style={{ width: '100%', marginBottom: '0.5rem' }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Creando…</> : 'Publicar necesidad'}
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
