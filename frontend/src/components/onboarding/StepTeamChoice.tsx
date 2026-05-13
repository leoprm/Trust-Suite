import { Plus, Globe, SkipForward } from 'lucide-react';

interface Props { onChoose: (choice: 'create' | 'join') => void; onSkip: () => void; }

export default function StepTeamChoice({ onChoose, onSkip }: Props) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600 }}>¿Qué querés hacer?</h3>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexDirection: isMobile ? 'column' : 'row' }}>
        <button onClick={() => onChoose('create')} className="glass-panel" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: isMobile ? '1.5rem' : '2rem', border: '2px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)', transition: 'all 0.2s' }}>
          <Plus size={36} style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 600 }}>Crear un árbol</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>Crea tu propio espacio con roles, necesidades y ramas.</p>
        </button>
        <button onClick={() => onChoose('join')} className="glass-panel" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: isMobile ? '1.5rem' : '2rem', border: '2px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)', transition: 'all 0.2s' }}>
          <Globe size={36} style={{ color: 'var(--accent-success)', marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 600 }}>Unirme a un árbol</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>Explora árboles públicos y unite al que quieras.</p>
        </button>
      </div>
      <button onClick={onSkip} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
        <SkipForward size={14} /> Omitir por ahora
      </button>
    </div>
  );
}
