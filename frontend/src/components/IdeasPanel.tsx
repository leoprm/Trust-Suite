import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronDown, ChevronUp, Loader2, Lightbulb, Users, DollarSign, Package, Wrench } from 'lucide-react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';

interface Idea {
  id: string;
  title: string;
  description: string;
  likesCount: number;
  hasLiked: boolean;
  creator: { username: string };
  requiredPeople?: number;
  requiredSkills?: string[];
  estimatedMaterials?: string;
  estimatedFiatCost?: number;
}

interface IdeasPanelProps {
  needId: string;
}

export default function IdeasPanel({ needId }: IdeasPanelProps) {
  const { t } = useTranslation();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  useEffect(() => { fetchIdeas(); }, [needId]);

  const fetchIdeas = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/ideas/need/${needId}`);
      setIdeas(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleLike = async (e: React.MouseEvent, ideaId: string) => {
    e.stopPropagation();
    if (likingId) return;
    setLikingId(ideaId);
    setIdeas(prev =>
      prev.map(idea =>
        idea.id === ideaId
          ? { ...idea, hasLiked: !idea.hasLiked, likesCount: idea.hasLiked ? idea.likesCount - 1 : idea.likesCount + 1 }
          : idea
      ).sort((a, b) => b.likesCount - a.likesCount)
    );
    try {
      await api.post(`/ideas/${ideaId}/like`);
    } catch {
      fetchIdeas();
    } finally {
      setLikingId(null);
    }
  };

  const toggleIdeaExpand = (ideaId: string) => {
    setExpandedIdeaId(prev => (prev === ideaId ? null : ideaId));
  };

  const hasResources = (idea: Idea) =>
    idea.requiredPeople || (idea.requiredSkills && idea.requiredSkills.length > 0) || idea.estimatedMaterials || idea.estimatedFiatCost != null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
        {loading ? (
          <div className="flex items-center justify-center" style={{ padding: '1.5rem 0', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.9rem' }}>{t('ideas_panel.loading')}</span>
          </div>
        ) : ideas.length === 0 ? (
          <div className="flex items-center gap-2" style={{ padding: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <Lightbulb size={16} />
            <span>{t('ideas_panel.empty')}</span>
          </div>
        ) : (
          <div className="flex-col" style={{ gap: '0.5rem' }}>
            {ideas.map((idea, idx) => (
              <motion.div key={idea.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onClick={() => toggleIdeaExpand(idea.id)}
              >
                {/* Idea Header Row */}
                <div className="flex items-center gap-3" style={{ padding: '0.75rem 1rem' }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, width: '1.2rem', textAlign: 'center', flexShrink: 0,
                    color: idx === 0 ? 'var(--accent-warning)' : idx === 1 ? 'var(--text-secondary)' : idx === 2 ? '#cd7f32' : 'var(--text-secondary)',
                  }}>#{idx + 1}</span>

                  <button onClick={e => toggleLike(e, idea.id)} disabled={likingId === idea.id}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      color: idea.hasLiked ? '#ef4444' : 'var(--text-secondary)',
                      padding: '0.25rem', borderRadius: 'var(--radius-sm)', flexShrink: 0,
                      transition: 'color var(--transition-fast), transform var(--transition-fast)',
                      transform: likingId === idea.id ? 'scale(0.85)' : 'scale(1)',
                    }}
                    title={idea.hasLiked ? t('ideas_panel.liked') : t('ideas_panel.like')}
                  >
                    <Heart size={16} fill={idea.hasLiked ? '#ef4444' : 'none'} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '1rem' }}>{idea.likesCount}</span>
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontWeight: 500, fontSize: '0.95rem', color: 'var(--text-primary)',
                      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: expandedIdeaId === idea.id ? 'normal' : 'nowrap',
                    }}>{idea.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t('ideas_panel.by')} {idea.creator.username}
                      </span>
                      {/* Resource quick-view pills */}
                      {idea.requiredPeople && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Users size={10} /> {idea.requiredPeople}
                        </span>
                      )}
                      {idea.estimatedFiatCost != null && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <DollarSign size={10} /> {idea.estimatedFiatCost}
                        </span>
                      )}
                      {idea.requiredSkills && idea.requiredSkills.length > 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Wrench size={10} /> {idea.requiredSkills.slice(0, 2).join(', ')}{idea.requiredSkills.length > 2 ? ` +${idea.requiredSkills.length - 2}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {expandedIdeaId === idea.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </div>

                {/* Expanded detail drawer */}
                <AnimatePresence>
                  {expandedIdeaId === idea.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: 'hidden' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ padding: '0.75rem 1rem 1rem 3.5rem', borderTop: '1px solid var(--border-color)' }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                          {idea.description}
                        </p>

                        {/* Resource details */}
                        {hasResources(idea) && (
                          <div style={{
                            marginTop: '0.85rem',
                            padding: '0.75rem',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            display: 'flex', flexDirection: 'column', gap: '0.4rem',
                          }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {t('ideas_panel.resources.title')}
                            </span>
                            {idea.requiredPeople && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                <Users size={13} stroke="var(--text-secondary)" />
                                <span>{t('ideas_panel.resources.people')}: <strong>{idea.requiredPeople}</strong></span>
                              </div>
                            )}
                            {idea.requiredSkills && idea.requiredSkills.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.82rem' }}>
                                <Wrench size={13} stroke="var(--text-secondary)" style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                  {idea.requiredSkills.map(s => (
                                    <span key={s} style={{
                                      background: 'rgba(59,130,246,0.15)', color: 'var(--accent-primary)',
                                      borderRadius: 'var(--radius-full)', padding: '0.1rem 0.5rem', fontSize: '0.75rem'
                                    }}>{s}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {idea.estimatedFiatCost != null && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                <DollarSign size={13} stroke="var(--text-secondary)" />
                                <span>{t('ideas_panel.resources.fiat')}: <strong>${idea.estimatedFiatCost.toLocaleString()}</strong></span>
                              </div>
                            )}
                            {idea.estimatedMaterials && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                <Package size={13} stroke="var(--text-secondary)" style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                                <span>{idea.estimatedMaterials}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
