import { useState } from 'react';
import { motion } from 'framer-motion';
import { Scale, Send, Loader2, Hash } from 'lucide-react';
import { OptimizedText } from './OptimizedText';
import api from '../lib/api';

interface CivicAuditModalProps {
  auditTask: { id: string; description: string; tags: string[] };
  originalTaskId: string;
  onComplete: (civicBonusXp: number) => void;
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Trivial', 2: 'Muy fácil', 3: 'Fácil', 4: 'Moderada',
  5: 'Normal', 6: 'Exigente', 7: 'Difícil', 8: 'Muy difícil',
  9: 'Extrema', 10: 'Imposible 💀',
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#10b981', 2: '#10b981', 3: '#34d399',
  4: '#6ee7b7', 5: '#f59e0b', 6: '#fb923c',
  7: '#f97316', 8: '#ef4444', 9: '#dc2626', 10: '#991b1b',
};

export default function CivicAuditModal({ auditTask, originalTaskId, onComplete }: CivicAuditModalProps) {
  const [difficulty, setDifficulty] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const diffColor = DIFFICULTY_COLORS[difficulty] || '#f59e0b';

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/tasks/${originalTaskId}/civic-audit`, {
        auditedTaskId: auditTask.id,
        difficultyVote: difficulty,
      });
      onComplete(data.civicBonusXp ?? 0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar auditoría');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000, padding: '1rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.91, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        style={{
          background: 'var(--surface-color, #1a1a2e)',
          width: '100%', maxWidth: 480,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(139,92,246,0.08)',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Scale size={22} stroke="#a78bfa" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e0e0e0' }}>
              Auditoría Cívica
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #9ca3af)' }}>
              Evalúa la dificultad real de esta tarea completada
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '65vh', overflowY: 'auto' }}>

          {/* Explanation */}
          <div style={{
            background: 'rgba(139,92,246,0.08)', borderRadius: 12,
            padding: '0.75rem 1rem',
            border: '1px solid rgba(139,92,246,0.15)',
            fontSize: '0.8rem', color: '#c4b5fd', lineHeight: 1.5,
          }}>
            Has sido seleccionado aleatoriamente para verificar una tarea completada recientemente.
            Evalúa qué tan difícil crees que fue realizar este trabajo.
            <strong style={{ display: 'block', marginTop: 6, color: '#a78bfa' }}>
              Recibirás +2 XP Cívico como recompensa.
            </strong>
          </div>

          {/* Task description (Pretext rendered) */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Descripción de la tarea
            </label>
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 12,
              padding: '0.85rem 1rem',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.88rem', color: '#e0e0e0', lineHeight: 1.6,
            }}>
              <OptimizedText text={auditTask.description} />
            </div>
          </div>

          {/* Tags */}
          {auditTask.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {auditTask.tags.map(tag => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: 'rgba(139,92,246,0.12)', borderRadius: 100,
                  padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                  color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)',
                }}>
                  <Hash size={10} /> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Difficulty Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                ¿Qué dificultad tuvo este trabajo?
              </label>
              <span style={{
                fontSize: '0.8rem', fontWeight: 700, color: diffColor,
                background: `${diffColor}18`, padding: '0.15rem 0.6rem',
                borderRadius: 100, border: `1px solid ${diffColor}33`,
              }}>
                {difficulty}/10 — {DIFFICULTY_LABELS[difficulty]}
              </span>
            </div>
            <input
              type="range" min={1} max={10} step={1}
              value={difficulty}
              onChange={e => setDifficulty(Number(e.target.value))}
              style={{ width: '100%', accentColor: diffColor, cursor: 'pointer', height: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              <span>Trivial</span>
              <span>Imposible</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '0.5rem 0.75rem', borderRadius: 12,
              background: 'rgba(239,68,68,0.15)', color: '#f87171',
              fontSize: '0.78rem',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'center',
        }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '0.85rem',
              borderRadius: 14, border: 'none',
              background: submitting
                ? 'rgba(139,92,246,0.3)'
                : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              color: 'white', fontWeight: 700, fontSize: '0.9rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: submitting ? 'none' : '0 4px 16px rgba(139,92,246,0.35)',
            }}
          >
            {submitting ? (
              <><Loader2 size={18} className="spin" /> Enviando...</>
            ) : (
              <><Send size={18} /> Enviar evaluación</>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
