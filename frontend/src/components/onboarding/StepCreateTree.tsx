import { useState } from 'react';
import { TreePine, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useTreeStore } from '../../store/treeStore';

interface Props { onSkip: () => void; }

export default function StepCreateTree({ onSkip }: Props) {
  const navigate = useNavigate();
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true); setError('');
    try {
      const { data } = await api.post('/trees', { name: name.trim(), description: description.trim() || undefined, visibility: 'PRIVATE', admissionPolicy: 'INVITE_ONLY' });
      useTreeStore.getState().fetchTrees();
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err: any) { setError(err?.response?.data?.error || 'Error al crear el árbol'); setCreating(false); }
  };

  if (done) {
    return (
      <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--grad-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(16,185,129,0.4)' }}><Sparkles size={28} color="white" /></div>
        <div><h4 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 600 }}>¡Árbol creado!</h4><p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Redirigiendo al chat…</p></div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: isMobile ? '1.5rem' : '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <TreePine size={22} style={{ color: 'var(--accent-primary)' }} />
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Crear tu árbol</h3>
      </div>
      <div className="input-group"><label>Nombre del árbol *</label><input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="ej: Fontaneros del Sur" autoFocus /></div>
      <div className="input-group"><label>Descripción</label><textarea className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿De qué trata este árbol?" rows={3} style={{ resize: 'vertical' }} /></div>
      {error && <p style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>}
      <button onClick={handleCreate} disabled={creating || !name.trim()} className="btn btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }}>
        {creating ? <><Loader2 size={16} className="animate-spin" /> Creando…</> : <><TreePine size={16} /> Crear árbol</>}
      </button>
      <button onClick={onSkip} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>Omitir</button>
    </div>
  );
}
