import { useState, useEffect } from 'react';
import { X, ThumbsUp, TrendingUp, Sliders } from 'lucide-react';
import api from '../../lib/api';
import type { Need, Idea } from '../../types';
import './NeedDetail.css';

interface NeedDetailProps {
  needId: string | null;
  onClose: () => void;
}

function NeedDetail({ needId, onClose }: NeedDetailProps) {
  const [need, setNeed] = useState<Need | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!needId) {
      setNeed(null);
      setIdeas([]);
      return;
    }

    setLoading(true);
    Promise.all([
      api.get(`/needs/${needId}`).then(({ data }) => setNeed(data.need ?? data)).catch(() => null),
      api.get(`/needs/${needId}/ideas`).then(({ data }) => setIdeas(data.ideas ?? data)).catch(() => []),
    ]).finally(() => setLoading(false));
  }, [needId]);

  const likeIdea = async (ideaId: string) => {
    try {
      const { data } = await api.post(`/ideas/${ideaId}/like`);
      setIdeas((prev) => prev.map((i) => i.id === ideaId ? { ...i, likeCount: data.likeCount ?? i.likeCount + 1, userHasLiked: true } : i));
    } catch {
      // ignore
    }
  };

  if (!needId) return null;

  // Top 3 ideas
  const topIdeas = [...ideas].sort((a, b) => b.likeCount - a.likeCount).slice(0, 3);

  return (
    <aside className="need-detail glass-panel">
      {/* Header */}
      <div className="nd-header">
        <h3 className="nd-title">
          {loading ? 'Loading...' : need?.title ?? 'Need Detail'}
        </h3>
        <button className="nd-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="nd-loading">Loading...</div>
      ) : need ? (
        <div className="nd-body">
          {/* Importance slider (read-only for now) */}
          <div className="nd-section">
            <div className="nd-label">
              <Sliders size={14} />
              Importance
            </div>
            <div className="nd-importance-display">
              <div className="nd-importance-bar">
                <div
                  className="nd-importance-fill"
                  style={{ width: `${((need.importance ?? 0) / 10) * 100}%` }}
                />
              </div>
              <span className="nd-importance-value">{need.importance ?? '—'}/10</span>
            </div>
          </div>

          {/* Description */}
          {need.description && (
            <div className="nd-section">
              <p className="nd-description">{need.description}</p>
            </div>
          )}

          {/* Ideas */}
          <div className="nd-section">
            <div className="nd-label">
              <ThumbsUp size={14} />
              Ideas ({ideas.length})
            </div>
            {ideas.length === 0 ? (
              <p className="nd-empty">No ideas proposed yet.</p>
            ) : (
              <div className="nd-ideas-list">
                {ideas.map((idea) => (
                  <div key={idea.id} className="nd-idea glass-panel">
                    <div className="nd-idea-header">
                      <span className="nd-idea-title">{idea.title}</span>
                      <button
                        className={`nd-idea-like ${idea.userHasLiked ? 'liked' : ''}`}
                        onClick={() => !idea.userHasLiked && likeIdea(idea.id)}
                      >
                        <ThumbsUp size={14} />
                        <span>{idea.likeCount}</span>
                      </button>
                    </div>
                    {idea.description && (
                      <p className="nd-idea-desc">{idea.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top 3 */}
          {topIdeas.length > 0 && (
            <div className="nd-section">
              <div className="nd-label">
                <TrendingUp size={14} />
                Top 3
              </div>
              <ol className="nd-top-list">
                {topIdeas.map((idea, i) => (
                  <li key={idea.id} className="nd-top-item">
                    <span className="nd-top-rank">{i + 1}</span>
                    <span className="nd-top-title">{idea.title}</span>
                    <span className="nd-top-likes">{idea.likeCount} likes</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="nd-empty">Need not found.</div>
      )}
    </aside>
  );
}

export default NeedDetail;
