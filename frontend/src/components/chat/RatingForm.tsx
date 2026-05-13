import { useState, useEffect, useRef } from 'react';
import { Star, Send, Check, X } from 'lucide-react';
import api from '../../lib/api';
import './RatingForm.css';

interface RatingRole {
  key: string;
  label: string;
  description: string;
}

const ROLES: RatingRole[] = [
  { key: 'claridad', label: 'Claridad', description: '¿Fue clara y fácil de entender la respuesta?' },
  { key: 'utilidad', label: 'Utilidad', description: '¿Resolvió tu necesidad o te ayudó a avanzar?' },
  { key: 'precision', label: 'Precisión', description: '¿La información fue precisa y relevante?' },
  { key: 'velocidad', label: 'Velocidad', description: '¿Respondió con agilidad?' },
];

interface RatingFormProps {
  agentId: string;
  treeId: string;
  taskId: string;
  onComplete: (result: RatingResult | null) => void;
  onCancel: () => void;
}

interface RatingResult {
  agentId: string;
  treeId: string;
  beforeLevel: number;
  beforeXp: number;
  afterLevel: number;
  afterXp: number;
  xpGained: number;
  leveledUp: boolean;
}

function RatingForm({ agentId, treeId, taskId, onComplete, onCancel }: RatingFormProps) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RatingResult | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  const setRating = (role: string, stars: number) => {
    setRatings((prev) => ({ ...prev, [role]: stars }));
  };

  const allRated = ROLES.every((r) => ratings[r.key] >= 1);

  const submit = async () => {
    if (!allRated || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const ratingArray = ROLES.map((r) => ({
        role: r.key,
        stars: ratings[r.key],
      }));

      const { data } = await api.post('/ratings', {
        agentId,
        treeId,
        taskId,
        ratings: ratingArray,
      });

      setResult(data);
      onComplete(data);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Error submitting rating';
      setError(msg);
      onComplete(null);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (role: string) => {
    const current = ratings[role] || 0;
    const hovering = hovered[role] || 0;
    const display = hovering || current;

    return (
      <div
        className="rating-stars"
        onMouseLeave={() => setHovered((h) => ({ ...h, [role]: 0 }))}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
          <button
            key={star}
            type="button"
            className={`rating-star ${star <= display ? 'rating-star--active' : ''}`}
            onClick={() => setRating(role, star)}
            onMouseEnter={() => setHovered((h) => ({ ...h, [role]: star }))}
            aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
          >
            <Star size={18} fill={star <= display ? 'currentColor' : 'none'} />
          </button>
        ))}
        <span className="rating-star-value">{current > 0 ? current : '—'}/10</span>
      </div>
    );
  };

  // Show result after successful submission
  if (result) {
    return (
      <div className="rating-form glass-panel" ref={formRef}>
        <div className="rating-result">
          <Check size={32} className="rating-result-icon" />
          <h3>¡Gracias por tu evaluación!</h3>
          <div className="rating-result-stats">
            <div className="rating-result-stat">
              <span className="rating-result-label">XP ganado</span>
              <span className="rating-result-value">+{result.xpGained}</span>
            </div>
            <div className="rating-result-stat">
              <span className="rating-result-label">Nivel</span>
              <span className="rating-result-value">
                {result.beforeLevel} → {result.afterLevel}
                {result.leveledUp && <span className="rating-level-up"> ⬆</span>}
              </span>
            </div>
          </div>
          {result.leveledUp && (
            <p className="rating-level-up-msg">
              ¡El agente subió de nivel {result.beforeLevel} a {result.afterLevel}!
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rating-form glass-panel" ref={formRef}>
      <div className="rating-form-header">
        <h3 className="rating-form-title">Evalúa al agente</h3>
        <button className="rating-form-close" onClick={onCancel} aria-label="Cancelar">
          <X size={18} />
        </button>
      </div>

      <p className="rating-form-subtitle">
        Califica del 1 al 10 en cada categoría
      </p>

      <div className="rating-roles">
        {ROLES.map((role) => (
          <div key={role.key} className="rating-role">
            <div className="rating-role-header">
              <span className="rating-role-label">{role.label}</span>
              <span className="rating-role-desc">{role.description}</span>
            </div>
            {renderStars(role.key)}
          </div>
        ))}
      </div>

      {error && <div className="rating-error">{error}</div>}

      <button
        className="rating-submit"
        onClick={submit}
        disabled={!allRated || submitting}
      >
        {submitting ? (
          <>Enviando...</>
        ) : (
          <>
            <Send size={16} />
            Enviar evaluación
          </>
        )}
      </button>
    </div>
  );
}

export default RatingForm;
