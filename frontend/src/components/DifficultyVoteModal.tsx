import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface DifficultyVoteModalProps {
  taskId: string;
  taskName: string;
  initialScore?: number;
  initialComment?: string;
  onClose: () => void;
  onSuccess: (newDifficulty: number) => void;
}

export default function DifficultyVoteModal({ taskId, taskName, initialScore, initialComment, onClose, onSuccess }: DifficultyVoteModalProps) {
  const [score, setScore] = useState(initialScore || 5);
  const [comment, setComment] = useState(initialComment || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/tasks/${taskId}/difficulty-vote`, { score, comment });
      onSuccess(data.newDifficulty);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar el voto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <motion.div 
        className="modal-content"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        style={{ maxWidth: '400px', padding: '1.5rem', position: 'relative' }}
      >
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Votar Dificultad</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          ¿Qué tan difícil es la tarea: <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{taskName}</span>?
        </p>

        {error && (
          <div style={{ 
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', 
            padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontSize: '0.85rem'
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Score Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Puntuación: {score}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>1 (Fácil) - 10 (Épica)</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="10" 
            step="1" 
            value={score} 
            onChange={(e) => setScore(parseInt(e.target.value))}
            style={{ 
              width: '100%', cursor: 'pointer', height: '6px', borderRadius: '3px',
              accentColor: 'var(--accent-primary)'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.2rem' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <span key={n} style={{ fontSize: '0.65rem', color: score === n ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: score === n ? 700 : 400 }}>
                {n}
              </span>
            ))}
          </div>
        </div>

        {/* Justification */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Justificación (opcional)</label>
          <textarea 
            placeholder="¿Por qué esta nota? Ayuda a la comunidad a entender tu perspectiva."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={{ 
              width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.03)', 
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
              padding: '0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
              resize: 'vertical'
            }}
          />
        </div>

        <button 
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          {loading ? 'Enviando...' : <><Send size={16} /> Enviar Voto</>}
        </button>
      </motion.div>
    </div>
  );
}
