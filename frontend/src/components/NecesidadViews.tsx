import { useState, useEffect } from 'react';
import { Plus, ThumbsUp, BarChart2, Lock, Droplet } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useTreeStore } from '../store/treeStore';
import { OptimizedText } from './OptimizedText';
import { motion, AnimatePresence } from 'framer-motion';
import { useMatrixStore, LEGACY_ENTITY_COLORS, MODERN_ENTITY_COLORS } from '../store/matrixStore';
import { useTranslation } from 'react-i18next';

// ── Magenta accent ──────────────────────────────────────────────────────────────
const Y  = '#01E9FC';
const YL = 'rgba(1,233,252,0.15)';
const YB = 'rgba(1,233,252,0.25)';

// ─────────────────────────────────────────────────────────────────────────────
// CREAR — Proposal form (all trees selected by default)
// ─────────────────────────────────────────────────────────────────────────────
export function NecesidadCrear({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation();
  const colorMode = useMatrixStore((s) => s.colorMode);
  const titleColor = colorMode === 'legacy' ? LEGACY_ENTITY_COLORS.necesidad : MODERN_ENTITY_COLORS.necesidad;
  const { trees } = useTreeStore();
  const [hashtag,     setHashtag]     = useState('');
  const [description, setDescription] = useState('');
  const [isHashtag,   setIsHashtag]   = useState(true);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [showForm,    setShowForm]    = useState(false);

  // All tree IDs the user belongs to
  const allTreeIds = trees.map((t: any) => t.id);

  // Fetch hashtag suggestions from first available tree
  useEffect(() => {
    if (!allTreeIds.length) return;
    api.get(`/needs/hashtag-proposals?treeId=${allTreeIds[0]}`)
      .then(({ data }) => setHashtagSuggestions(data))
      .catch(() => {});
  }, [allTreeIds.length]);

  const canSubmit = allTreeIds.length > 0 && hashtag.trim().length >= 2;

  const normalizedTag = hashtag.trim().startsWith('#')
    ? hashtag.trim().slice(1)
    : hashtag.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true); setError('');
    try {
      await api.post('/needs', {
        title: normalizedTag,
        description: description.trim() || undefined,
        treeIds: allTreeIds,
        proposesHashtag: isHashtag,
      });
      setHashtag(''); setDescription(''); setShowForm(false);
      onCreated?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('m.necesidad.crear.error'));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '6rem' }}>

      {/* Intro */}
      <div style={{ textAlign: 'center', padding: '0.55rem 0.5rem 0.5rem' }}>
        <Droplet size={32} color={titleColor} style={{ marginBottom: 8 }} />
        <OptimizedText text={t('m.necesidad.crear.title')} style={{ fontSize: '0.98rem', fontWeight: 800, color: titleColor }} />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          {t('m.necesidad.crear.subtitle')}
        </p>
      </div>

      {/* Toggle form button — hidden when form is open */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            padding: '0.75rem', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
            fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          {t('m.necesidad.crear.new_need')}
        </button>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            {/* Need name input */}
            <div>
              <label style={labelStyle}>{t('m.necesidad.crear.name_label')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={hashtag.startsWith('#') ? hashtag.slice(1) : hashtag}
                  onChange={e => setHashtag(e.target.value)}
                  placeholder={t('m.necesidad.crear.name_placeholder')}
                  style={inputStyle}
                />
              </div>
              {/* Autocomplete suggestions */}
              {hashtagSuggestions.length > 0 && hashtag.length === 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                  {hashtagSuggestions.slice(0, 8).map(s => (
                    <button
                      key={s.id}
                      onClick={() => setHashtag(s.title)}
                      style={{
                        padding: '0.25rem 0.6rem', borderRadius: 20, border: `1px solid ${Y}55`,
                        background: YL, color: Y, fontSize: '0.72rem', cursor: 'pointer',
                      }}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label style={labelStyle}>{t('m.necesidad.crear.type')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { val: true,  label: t('m.necesidad.crear.express') },
                  { val: false, label: t('m.necesidad.crear.traditional') },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setIsHashtag(opt.val)}
                    style={pillStyle(isHashtag === opt.val)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>{t('m.necesidad.crear.description')}</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('m.necesidad.crear.desc_placeholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'none', lineHeight: '1.5' }}
              />
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>{error}</p>}

            {/* Submit button — inline, always reachable */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.85rem', borderRadius: 14,
                background: canSubmit && !loading ? Y : 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${canSubmit && !loading ? Y : 'rgba(255,255,255,0.1)'}`,
                color: canSubmit && !loading ? '#1a1a1a' : 'var(--text-secondary)',
                fontWeight: 700, fontSize: '0.92rem', cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
                opacity: canSubmit ? 1 : 0.5,
                marginTop: '0.25rem',
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#1a1a1a', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  {t('m.necesidad.crear.creating')}
                </span>
              ) : (
                <>
                  <Plus size={18} />
                  {t('m.necesidad.crear.submit')}
                </>
              )}
            </button>

            {/* Cancel / close form */}
            <button
              onClick={() => { setShowForm(false); setError(''); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0.5rem', borderRadius: 10,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem', cursor: 'pointer',
              }}
            >
              {t('m.necesidad.crear.cancel')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent needs preview when form is closed */}
      {!showForm && <NecesidadMiniList />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini list shown in Crear when form is hidden
// ─────────────────────────────────────────────────────────────────────────────
function NecesidadMiniList() {
  const { t } = useTranslation();
  const [needs, setNeeds] = useState<any[]>([]);
  useEffect(() => {
    api.get('/needs').then(({ data }) => setNeeds(data.slice(0, 5))).catch(() => {});
  }, []);

  if (!needs.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <p style={sectionLabel}>{t('m.necesidad.crear.recent')}</p>
      {needs.map(n => (
        <div key={n.id} style={cardBase}>
          <NeedTag title={n.title} />
          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            {n._count?.fundings ?? 0} {t('m.necesidad.crear.votes')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HACER — Tablón Micelio (all trees, no selector)
// ─────────────────────────────────────────────────────────────────────────────
type SortMode = 'recent' | 'seguidas' | 'urgencia';

export function NecesidadHacer() {
  const { t } = useTranslation();
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();
  const [needs, setNeeds]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sort, setSort]         = useState<SortMode>('recent');
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [localVotes, setLocalVotes] = useState<Record<string, number>>({});

  useEffect(() => {
    api.get('/needs')
      .then(({ data }) => setNeeds(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFollow = (needId: string) => {
    setFollowed(prev => {
      const next = new Set(prev);
      if (next.has(needId)) {
        next.delete(needId);
        setLocalVotes(v => ({ ...v, [needId]: (v[needId] || 0) - 1 }));
      } else {
        next.add(needId);
        setLocalVotes(v => ({ ...v, [needId]: (v[needId] || 0) + 1 }));
      }
      return next;
    });
  };

  const filtered = needs.filter(n => {
    // Relational DNA filter - Only hide items if NOT in selection mode
    if (!isFilterModeActive && linajeActivo.length > 0) {
      return linajeActivo.some(l => {
        if (l.entidad === 'arbol') {
          return n.treeLinks?.some((tl: any) => tl.treeId === l.id);
        }
        if (l.entidad === 'necesidad') {
          return n.id === l.id;
        }
        return false;
      });
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'seguidas') return ((b._count?.fundings || 0) + (localVotes[b.id] || 0)) - ((a._count?.fundings || 0) + (localVotes[a.id] || 0));
    if (sort === 'urgencia') return (b.totalPointsAssigned || 0) - (a.totalPointsAssigned || 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Sort pills */}
      <div style={{ padding: '0.75rem 1rem 0', display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        {([
          { key: 'recent',   label: t('m.necesidad.hacer.sort_recent') },
          { key: 'seguidas', label: t('m.necesidad.hacer.sort_followed') },
          { key: 'urgencia', label: t('m.necesidad.hacer.sort_urgency') },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              padding: '0.25rem 0.65rem', borderRadius: 20,
              background: sort === opt.key ? YB : 'transparent',
              border: `1px solid ${sort === opt.key ? Y : 'rgba(255,255,255,0.1)'}`,
              color: sort === opt.key ? Y : 'var(--text-secondary)',
              fontSize: '0.68rem', fontWeight: sort === opt.key ? 700 : 400, cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.necesidad.hacer.loading')}</p>}

        {!loading && sorted.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '1.75rem' }}>
            <Droplet size={28} color={Y} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.necesidad.hacer.empty')}</p>
          </div>
        )}

        {sorted.map(need => {
          const isFollowed = followed.has(need.id);
          const followCount = (need._count?.fundings || 0) + (localVotes[need.id] || 0);
          const progress = Math.min(100, ((need.totalPointsAssigned || 0) / 100) * 100);
          const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === need.id);

          return (
            <motion.div
              key={need.id}
              onClick={() => {
                if (isFilterModeActive) toggleLinaje(need.id, 'necesidad');
              }}
              style={{ 
                ...cardBase, 
                padding: '0.9rem 1rem', 
                flexDirection: 'column', 
                gap: '0.6rem',
                border: isSelected ? '1.5px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: isSelected ? Y : 'rgba(255,255,255,0.04)',
                cursor: isFilterModeActive ? 'pointer' : 'default',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 8px 32px rgba(234,179,8,0.3)' : 'none',
              }}
            >
              <div style={{ 
                pointerEvents: isFilterModeActive ? 'none' : 'auto', 
                width: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.6rem',
                opacity: isFilterModeActive && !isSelected && linajeActivo.length > 0 ? 0.3 : 1
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <NeedTag title={need.title} color={isSelected ? '#fff' : Y} />
                  {need.proposesHashtag && (
                    <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 10, background: isSelected ? 'rgba(255,255,255,0.2)' : YL, color: isSelected ? '#fff' : Y, fontWeight: 700, flexShrink: 0 }}>Express</span>
                  )}
                  {need.status === 'IN_PROGRESS' && (
                    <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 10, background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(34,197,94,0.15)', color: isSelected ? '#fff' : '#22c55e', fontWeight: 700, flexShrink: 0 }}>{t('m.necesidad.hacer.in_branch')}</span>
                  )}
                </div>

                {need.description && (
                  <OptimizedText text={need.description} style={{ fontSize: '0.78rem', color: isSelected ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)', lineHeight: 1.4 }} />
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {need.treeLinks?.map((tl: any) => (
                    <span key={tl.treeId} style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                      {tl.tree?.name || 'Árbol'}
                    </span>
                  ))}
                </div>

                {need.proposesHashtag && (
                  <div style={{ width: '100%', height: 3, borderRadius: 2, background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)' }}>
                    <div style={{ height: '100%', width: `${progress}%`, borderRadius: 2, background: isSelected ? '#fff' : Y, transition: 'width 0.3s' }} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.65rem', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                    @{need.creator?.username || '?'} · {need._count?.ideas || 0} {t('m.necesidad.hacer.ideas')}
                  </span>
                  <button
                    onClick={() => handleFollow(need.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.3rem 0.7rem', borderRadius: 20, border: 'none',
                      background: isSelected ? 'rgba(255,255,255,0.2)' : (isFollowed ? YL : 'rgba(255,255,255,0.06)'),
                      color: isSelected ? '#fff' : (isFollowed ? Y : 'var(--text-secondary)'),
                      fontSize: '0.72rem', fontWeight: (isFollowed || isSelected) ? 700 : 400, cursor: 'pointer',
                    }}
                  >
                    <ThumbsUp size={12} />
                    {isFollowed ? t('m.necesidad.hacer.following') : t('m.necesidad.hacer.me_too')}
                    <span style={{ opacity: 0.7 }}>({followCount})</span>
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIR — Importance thermometer (all trees, no selector)
// ─────────────────────────────────────────────────────────────────────────────
export function NecesidadMedir() {
  const { t } = useTranslation();
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();
  const user = useAuthStore(s => s.user);
  const [needs, setNeeds]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [votes, setVotes]     = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    api.get('/needs')
      .then(({ data }) => setNeeds(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const myMaxLevel = (() => {
    if (!user?.memberships?.length) return 0;
    return Math.max(...user.memberships.map((m: any) => m.level ?? 0));
  })();
  const canVote = myMaxLevel >= 3;

  const handleVote = async (need: any) => {
    const importance = votes[need.id] ?? 5;
    const treeId = need.treeLinks?.[0]?.treeId;
    if (!treeId) return;
    setSubmitting(need.id);
    try {
      await api.post(`/needs/${need.id}/fund`, { points: Math.round(importance), treeId });
    } catch (e: any) {
      console.warn('Importance vote error:', e?.response?.data?.error);
    } finally { setSubmitting(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        margin: '0.75rem 1rem 0',
        padding: '0.5rem 0.85rem', borderRadius: 10,
        background: canVote ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${canVote ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
      }}>
        {canVote ? <BarChart2 size={14} color="#22c55e" /> : <Lock size={14} color="#ef4444" />}
        <OptimizedText
          text={canVote
            ? t('m.necesidad.medir.can_vote', { level: myMaxLevel })
            : t('m.necesidad.medir.cant_vote', { level: myMaxLevel })}
          style={{ fontSize: '0.72rem', color: canVote ? '#22c55e' : '#ef4444', fontWeight: 600 }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.necesidad.medir.loading')}</p>}
        {!loading && needs.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
            <BarChart2 size={28} color={Y} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.necesidad.medir.empty')}</p>
          </div>
        )}

        {needs.filter(n => {
          // Relational DNA filter - Only hide items if NOT in selection mode
          if (!isFilterModeActive && linajeActivo.length > 0) {
            return linajeActivo.some(l => {
              if (l.entidad === 'arbol') return n.treeLinks?.some((tl: any) => tl.treeId === l.id);
              if (l.entidad === 'necesidad') return n.id === l.id;
              return false;
            });
          }
          return true;
        }).map(need => {
          const sliderVal = votes[need.id] ?? 5;
          const pts = need.totalPointsAssigned || 0;
          const pctFunded = Math.min(100, (pts / 100) * 100);
          const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === need.id);

          return (
            <motion.div 
              key={need.id} 
              onClick={() => {
                if (isFilterModeActive) toggleLinaje(need.id, 'necesidad');
              }}
              style={{ 
                ...cardBase, 
                padding: '1rem', 
                flexDirection: 'column', 
                gap: '0.8rem',
                border: isSelected ? '1.5px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: isSelected ? Y : 'rgba(255,255,255,0.04)',
                cursor: isFilterModeActive ? 'pointer' : 'default',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 8px 32px rgba(234,179,8,0.3)' : 'none',
              }}
            >
              <div style={{ 
                pointerEvents: isFilterModeActive ? 'none' : 'auto', 
                width: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.8rem',
                opacity: isFilterModeActive && !isSelected && linajeActivo.length > 0 ? 0.3 : 1
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <NeedTag title={need.title} color={isSelected ? '#fff' : Y} />
                </div>

                {need.description && (
                  <OptimizedText text={need.description} style={{ fontSize: '0.78rem', color: isSelected ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)', lineHeight: 1.4 }} />
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <OptimizedText text={t('m.necesidad.medir.importance_assigned')} style={{ fontSize: '0.65rem', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }} />
                    <OptimizedText text={`${pts.toFixed(0)} pt`} style={{ fontSize: '0.72rem', color: isSelected ? '#fff' : Y, fontWeight: 800 }} />
                  </div>
                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)' }}>
                    <div style={{ height: '100%', width: `${pctFunded}%`, borderRadius: 2, background: isSelected ? '#fff' : Y, transition: 'width 0.4s' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <OptimizedText
                      text={canVote ? t('m.necesidad.medir.vote_importance', { val: sliderVal }) : t('m.necesidad.medir.requires_level')}
                      style={{ fontSize: '0.72rem', color: isSelected ? '#fff' : (canVote ? 'var(--text-primary)' : 'rgba(255,255,255,0.3)'), fontWeight: canVote ? 600 : 400 }}
                    />
                    {canVote && (
                      <button
                        onClick={() => handleVote(need)}
                        disabled={submitting === need.id}
                        style={{
                          padding: '0.25rem 0.7rem', borderRadius: 10,
                          background: isSelected ? 'rgba(255,255,255,0.2)' : YL, border: `1px solid ${isSelected ? '#fff' : Y}66`,
                          color: isSelected ? '#fff' : Y, fontSize: '0.68rem', fontWeight: 700,
                          cursor: submitting === need.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {submitting === need.id ? '…' : t('m.necesidad.medir.confirm')}
                      </button>
                    )}
                  </div>
                  <input
                    type="range" min={1} max={10} step={1}
                    value={sliderVal}
                    disabled={!canVote}
                    onChange={e => setVotes(prev => ({ ...prev, [need.id]: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      accentColor: isSelected ? '#fff' : (canVote ? Y : 'rgba(255,255,255,0.2)'),
                      cursor: canVote ? 'pointer' : 'not-allowed',
                      opacity: canVote ? 1 : 0.4,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <span key={n} style={{ fontSize: '0.55rem', color: sliderVal === n ? (isSelected ? '#fff' : Y) : 'rgba(255,255,255,0.2)', fontWeight: sliderVal === n ? 800 : 400 }}>
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function NeedTag({ title, color }: { title: string; color?: string }) {
  const tag = title.startsWith('#') ? title.slice(1) : title;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
      <Droplet size={13} color={color || Y} strokeWidth={2.15} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: color || Y, letterSpacing: '-0.01em', lineHeight: 1, minWidth: 0 }}>
        {tag}
      </span>
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.65rem 0.9rem', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
};

const cardBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  padding: '0.65rem 0.85rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-secondary)', fontWeight: 700, margin: '0.25rem 0',
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '0.4rem 0.6rem', borderRadius: 20, border: '1px solid',
    borderColor: active ? Y : 'rgba(255,255,255,0.1)',
    background: active ? YL : 'rgba(255,255,255,0.04)',
    color: active ? Y : 'var(--text-secondary)',
    fontWeight: active ? 700 : 400, fontSize: '0.78rem', cursor: 'pointer',
  };
}
