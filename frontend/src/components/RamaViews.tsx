import { useState, useEffect, useCallback } from 'react';
import {
  Plus, GitBranch, Leaf, Sparkles, Recycle, Heart, Zap,
  Lock, DollarSign, Cherry, BarChart2, Star,
  ChevronRight, AlertTriangle, Users, TrendingUp, Globe, Percent,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useTreeStore } from '../store/treeStore';
import { OptimizedText } from './OptimizedText';
import { motion, AnimatePresence } from 'framer-motion';
import { useMatrixStore, LEGACY_ENTITY_COLORS, MODERN_ENTITY_COLORS } from '../store/matrixStore';
import { useTranslation } from 'react-i18next';

// ── Blue accent ───────────────────────────────────────────────────────────────
const B  = '#5869FD';
const BL = 'rgba(88,105,253,0.15)';
const BB = 'rgba(88,105,253,0.25)';

// ── Bonus icons mapping ──────────────────────────────────────────────────────
const BONUS_ICONS: Record<string, { icon: typeof Leaf; label: string; color: string }> = {
  '%Ecológico':   { icon: Leaf,      label: 'Ecológico',   color: '#22c55e' },
  '%Sostenible':  { icon: Recycle,   label: 'Sostenible',  color: '#06b6d4' },
  '%Social':      { icon: Heart,     label: 'Social',      color: '#ec4899' },
  '%Innovador':   { icon: Sparkles,  label: 'Innovador',   color: '#f59e0b' },
  '%Educativo':   { icon: Zap,       label: 'Educativo',   color: '#8b5cf6' },
  '%Comunitario': { icon: Users,     label: 'Comunitario', color: '#14b8a6' },
};

const normalizeBonusTag = (tag: string) => `%${(tag || '').trim().replace(/^[#%]/, '').trim()}`;

// ─────────────────────────────────────────────────────────────────────────────
// CREAR — Sub-Switch: Hashtag | Normal
// ─────────────────────────────────────────────────────────────────────────────
export function RamaCrear({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation();
  const colorMode = useMatrixStore((s) => s.colorMode);
  const titleColor = colorMode === 'legacy' ? LEGACY_ENTITY_COLORS.rama : MODERN_ENTITY_COLORS.rama;
  const { trees } = useTreeStore();
  const user = useAuthStore((s) => s.user);

  // Sub-switch state
  const [modoRama, setModoRama] = useState<'hashtag' | 'normal'>('hashtag');

  // Shared fields
  const [selectedTreeId, setSelectedTreeId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Normal mode: need selector
  const [needs, setNeeds] = useState<any[]>([]);
  const [selectedNeedId, setSelectedNeedId] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  // ── Crear Bono state ──
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusHashtag, setBonusHashtag] = useState('');
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusError, setBonusError] = useState('');
  const [existingBonuses, setExistingBonuses] = useState<any[]>([]);

  // Auto-select first tree
  useEffect(() => {
    if (trees.length > 0 && !selectedTreeId) {
      setSelectedTreeId(trees[0].id);
    }
  }, [trees, selectedTreeId]);

  // Load needs for the selected tree (Normal mode)
  useEffect(() => {
    if (modoRama !== 'normal' || !selectedTreeId) return;
    api.get(`/needs?treeId=${selectedTreeId}`)
      .then(({ data }) => setNeeds(data.filter((n: any) => n.status === 'ACTIVE')))
      .catch(() => setNeeds([]));
  }, [modoRama, selectedTreeId]);

  // Determine if user is admin for the selected tree
  const selectedTree = trees.find((t: any) => t.id === selectedTreeId);
  const isAdmin = selectedTree?.creatorId === user?.id ||
    user?.memberships?.some((m: any) => m.treeId === selectedTreeId && m.role === 'ADMIN');

  const canSubmitHashtag = selectedTreeId && name.trim().length >= 2;
  const canSubmitNormal = selectedTreeId && selectedNeedId && name.trim().length >= 2;
  const canSubmit = modoRama === 'hashtag' ? canSubmitHashtag : canSubmitNormal;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      if (modoRama === 'hashtag') {
        if (isAdmin) {
          // Admin creates directly
          await api.post('/branches/hashtag', {
            treeId: selectedTreeId,
            name: name.trim(),
          });
        } else {
          // Member creates a proposal (Need → will be voted)
          await api.post('/needs', {
            title: `#${name.trim().replace(/^#/, '')}`,
            description: description.trim() || `${t('m.rama.crear.auto_desc')} #${name.trim().replace(/^#/, '')}`,
            treeIds: [selectedTreeId],
            proposesHashtag: true,
          });
        }
      } else {
        // Normal branch — create via direct branch endpoint associated to a need
        await api.post('/branches/direct', {
          treeId: selectedTreeId,
          name: name.trim(),
          isHashtag: false,
          activePhases: ['INVESTIGATION'],
        });
      }
      setName('');
      setDescription('');
      setSelectedNeedId('');
      setShowForm(false);
      onCreated?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('m.rama.crear.error'));
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch existing bonuses for the selected tree ──
  useEffect(() => {
    if (!selectedTreeId) { setExistingBonuses([]); return; }
    api.get(`/bonus?treeId=${selectedTreeId}`)
      .then(({ data }) => setExistingBonuses(data))
      .catch(() => setExistingBonuses([]));
  }, [selectedTreeId]);

  const handleCreateBonus = async () => {
    const tag = bonusHashtag.trim();
    if (!tag || !selectedTreeId) return;
    setBonusLoading(true);
    setBonusError('');
    try {
      await api.post('/bonus', { treeId: selectedTreeId, hashtag: normalizeBonusTag(tag) });
      setBonusHashtag('');
      setShowBonusForm(false);
      // Refresh list
      const { data } = await api.get(`/bonus?treeId=${selectedTreeId}`);
      setExistingBonuses(data);
    } catch (e: any) {
      setBonusError(e?.response?.data?.error || t('m.rama.crear.bonus_error'));
    } finally {
      setBonusLoading(false);
    }
  };

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '6rem' }}>

      {/* Intro */}
      <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem 0.5rem' }}>
        <GitBranch size={32} color={titleColor} style={{ marginBottom: 8 }} />
        <OptimizedText text={t('m.rama.crear.title')} style={{ fontSize: '0.98rem', fontWeight: 800, color: titleColor }} />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          {t('m.rama.crear.subtitle')}
        </p>
      </div>

      {/* Sub-Switch: Hashtag | Normal */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {([
          { key: 'hashtag', label: t('m.rama.crear.hashtag_tab'), desc: t('m.rama.crear.hashtag_desc') },
          { key: 'normal', label: t('m.rama.crear.normal_tab'), desc: t('m.rama.crear.normal_desc') },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setModoRama(opt.key)}
            style={{
              flex: 1, padding: '0.6rem 0.5rem', borderRadius: 14,
              border: `1.5px solid ${modoRama === opt.key ? B : 'rgba(255,255,255,0.1)'}`,
              background: modoRama === opt.key ? BB : 'rgba(255,255,255,0.04)',
              color: modoRama === opt.key ? B : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}
          >
            <span>{opt.label}</span>
            <span style={{ fontSize: '0.62rem', opacity: 0.7, fontWeight: 400 }}>{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Toggle form */}
      <button
        onClick={() => setShowForm(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '0.75rem', borderRadius: 14,
          background: showForm ? BB : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${showForm ? B : 'rgba(255,255,255,0.1)'}`,
          color: showForm ? B : 'var(--text-secondary)',
          fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
        }}
      >
        <Plus size={16} />
        {modoRama === 'hashtag'
          ? (isAdmin ? t('m.rama.crear.create_hashtag') : t('m.rama.crear.propose_hashtag'))
          : t('m.rama.crear.create_normal')}
      </button>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            {/* Pretext: explain mode */}
            <div style={{
              padding: '0.6rem 0.85rem', borderRadius: 10,
              background: BL, border: `1px solid ${B}44`,
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            }}>
              <AlertTriangle size={14} color={B} style={{ flexShrink: 0, marginTop: 2 }} />
              <OptimizedText
                text={modoRama === 'hashtag'
                  ? (isAdmin
                    ? t('m.rama.crear.admin_info')
                    : t('m.rama.crear.member_info'))
                  : t('m.rama.crear.normal_info')}
                style={{ fontSize: '0.72rem', color: B, lineHeight: 1.4 }}
              />
            </div>

            {/* Tree selector */}
            <div>
              <label style={labelStyle}>{t('m.rama.crear.tree_label')}</label>
              <select
                value={selectedTreeId}
                onChange={e => setSelectedTreeId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">{t('m.rama.crear.tree_placeholder')}</option>
                {trees.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.icono || '🌳'} {t.name}</option>
                ))}
              </select>
            </div>

            {/* Need selector (Normal mode only) */}
            {modoRama === 'normal' && (
              <div>
                <label style={labelStyle}>{t('m.rama.crear.need_label')}</label>
                <select
                  value={selectedNeedId}
                  onChange={e => setSelectedNeedId(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">{t('m.rama.crear.need_placeholder')}</option>
                  {needs.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </select>
                {needs.length === 0 && selectedTreeId && (
                  <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    {t('m.rama.crear.no_needs')}
                  </p>
                )}
              </div>
            )}

            {/* Name */}
            <div>
              <label style={labelStyle}>
                {modoRama === 'hashtag' ? t('m.rama.crear.hashtag_name') : t('m.rama.crear.branch_name')}
              </label>
              <div style={{ position: 'relative' }}>
                {modoRama === 'hashtag' && (
                  <span style={{
                    position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    color: B, fontWeight: 800, fontSize: '1rem',
                  }}>
                    #
                  </span>
                )}
                <input
                  value={name.startsWith('#') ? name.slice(1) : name}
                  onChange={e => setName(e.target.value)}
                  placeholder={modoRama === 'hashtag' ? t('m.rama.crear.hashtag_placeholder') : t('m.rama.crear.branch_placeholder')}
                  style={{ ...inputStyle, ...(modoRama === 'hashtag' ? { paddingLeft: '1.75rem' } : {}) }}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>{t('m.rama.crear.description')}</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('m.rama.crear.desc_placeholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'none', lineHeight: '1.5' }}
              />
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent branches preview when form is closed */}
      {!showForm && <RamaMiniList treeId={selectedTreeId} />}

      {/* ── Crear Bono section ──────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '1rem', marginTop: '0.5rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Percent size={16} color={B} />
          <OptimizedText
            text={t('m.rama.crear.bonuses')}
            style={{ fontSize: '0.88rem', fontWeight: 800, color: B }}
          />
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
          {t('m.rama.crear.bonuses_desc')}
        </p>

        {/* Existing bonuses preview */}
        {existingBonuses.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {existingBonuses.map((b: any) => (
              <span key={b.id} style={{
                padding: '0.25rem 0.6rem', borderRadius: 20,
                background: BL, border: `1px solid ${B}33`,
                fontSize: '0.7rem', fontWeight: 600, color: B,
              }}>
                {normalizeBonusTag(b.hashtag)} — {(b.porcentajeActual * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        )}

        {/* Toggle create bonus form */}
        <button
          onClick={() => setShowBonusForm(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            padding: '0.6rem', borderRadius: 12,
            background: showBonusForm ? BB : 'rgba(255,255,255,0.04)',
            border: `1.5px solid ${showBonusForm ? B : 'rgba(255,255,255,0.1)'}`,
            color: showBonusForm ? B : 'var(--text-secondary)',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          <Plus size={14} /> {t('m.rama.crear.create_bonus')}
        </button>

        <AnimatePresence>
          {showBonusForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            >
              <div style={{
                padding: '0.6rem 0.85rem', borderRadius: 10,
                background: BL, border: `1px solid ${B}44`,
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              }}>
                <AlertTriangle size={14} color={B} style={{ flexShrink: 0, marginTop: 2 }} />
                <OptimizedText
                  text={t('m.rama.crear.bonus_info')}
                  style={{ fontSize: '0.72rem', color: B, lineHeight: 1.4 }}
                />
              </div>

              <div>
                <label style={labelStyle}>{t('m.rama.crear.bonus_name')}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    color: B, fontWeight: 800, fontSize: '1rem',
                  }}>
                    %
                  </span>
                  <input
                    value={bonusHashtag}
                    onChange={e => setBonusHashtag(e.target.value)}
                    placeholder={t('m.rama.crear.bonus_placeholder')}
                    style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                  />
                </div>
              </div>

              {bonusError && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: 0 }}>{bonusError}</p>}

              <button
                onClick={handleCreateBonus}
                disabled={!bonusHashtag.trim() || !selectedTreeId || bonusLoading}
                style={{
                  padding: '0.65rem', borderRadius: 12,
                  background: bonusHashtag.trim() && selectedTreeId ? B : 'rgba(255,255,255,0.06)',
                  border: 'none', color: '#fff',
                  fontWeight: 700, fontSize: '0.85rem',
                  cursor: bonusLoading ? 'not-allowed' : 'pointer',
                  opacity: (!bonusHashtag.trim() || !selectedTreeId) ? 0.5 : 1,
                }}
              >
                {bonusLoading ? '…' : t('m.rama.crear.create_bonus_btn')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FAB */}
      <AnimatePresence>
        {showForm && canSubmit && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={handleSubmit}
            disabled={loading}
            style={{
              position: 'fixed', bottom: '5rem', right: '1.5rem',
              width: 56, height: 56, borderRadius: '50%',
              background: B, color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(59,130,246,0.5)', zIndex: 200,
              opacity: loading ? 0.7 : 1, fontWeight: 800,
            }}
          >
            {loading ? '…' : <Plus size={26} />}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini list — shown when Crear form is closed
// ─────────────────────────────────────────────────────────────────────────────
function RamaMiniList({ treeId }: { treeId: string }) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<any[]>([]);
  useEffect(() => {
    if (!treeId) return;
    api.get(`/branches?treeId=${treeId}`)
      .then(({ data }) => setBranches(data.slice(0, 5)))
      .catch(() => {});
  }, [treeId]);

  if (!branches.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <p style={sectionLabel}>{t('m.rama.crear.recent')}</p>
      {branches.map(b => (
        <div key={b.id} style={cardBase}>
          <BranchTag name={b.name || b.idea?.title || 'Rama'} isHashtag={b.isHashtag} />
          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            {b.valorOficial?.toFixed(0) || 0} pts
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HACER — Sub-Switch: Necesidad (Gobernanza) | Deseo (Crowdfunding)
// ─────────────────────────────────────────────────────────────────────────────
export function RamaHacer() {
  const { t } = useTranslation();
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();
  const user = useAuthStore((s) => s.user);

  // Sub-switch: necesidad vs deseo
  const [vista, setVista] = useState<'necesidad' | 'deseo'>('necesidad');
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Voting state (Necesidad view)
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Crowdfunding injection state
  const [injectModal, setInjectModal] = useState<{ branchId: string; treeId: string; type: 'fiat' | 'berry' } | null>(null);
  const [injectAmount, setInjectAmount] = useState('');
  const [injecting, setInjecting] = useState(false);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/branches');
      setBranches(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  // User's max level for slider gating
  const myMaxLevel = (() => {
    if (!user?.memberships?.length) return 0;
    return Math.max(...user.memberships.map((m: any) => m.level ?? 0));
  })();
  const canVote = myMaxLevel >= 3;

  // Split branches: Necesidad (non-desire) vs Deseo
  const necesidadBranches = branches.filter(b => !b.isDesire);
  const deseoBranches = branches.filter(b => b.isDesire);

  const activeBranches = vista === 'necesidad' ? necesidadBranches : deseoBranches;

  // Filter by relational DNA
  const filtered = activeBranches.filter(b => {
    if (!isFilterModeActive && linajeActivo.length > 0) {
      return linajeActivo.some(l => {
        if (l.entidad === 'arbol') {
          const bTreeId = b.treeId || b.idea?.need?.treeLinks?.[0]?.treeId;
          return bTreeId === l.id;
        }
        if (l.entidad === 'necesidad') {
          return b.idea?.need?.id === l.id;
        }
        if (l.entidad === 'rama') return b.id === l.id;
        return false;
      });
    }
    return true;
  });

  const handleVote = async (branchId: string) => {
    const score = votes[branchId] ?? 5;
    setSubmitting(branchId);
    try {
      await api.post(`/branches/${branchId}/vote`, { score: Math.round(score) });
    } catch (e: any) {
      console.warn('Branch vote error:', e?.response?.data?.error);
    } finally {
      setSubmitting(null);
    }
  };

  const handleInject = async () => {
    if (!injectModal || !injectAmount) return;
    setInjecting(true);
    try {
      if (injectModal.type === 'fiat') {
        // Fiat promise -> external ledger only. It does not affect XP, level, votes or authority.
        await api.post(`/trees/${injectModal.treeId}/fiat-ledger/transactions`, {
          branchId: injectModal.branchId,
          amount: parseFloat(injectAmount),
          type: 'INCOME',
          category: 'MONEY',
          description: `${t('m.rama.hacer.fiat_auto_desc')}`,
        });
      } else {
        // Berry injection → deduct from member balance, add to branch bayasFund
        await api.post(`/branches/${injectModal.branchId}/inject-berries`, {
          amount: parseFloat(injectAmount),
        });
      }
      setInjectModal(null);
      setInjectAmount('');
      fetchBranches();
    } catch (e: any) {
      console.warn('Injection error:', e?.response?.data?.error);
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Sub-Switch: Necesidad | Deseo */}
      <div style={{ padding: '0.75rem 1rem 0', display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        {([
          { key: 'necesidad', label: t('m.rama.hacer.need_tab'), desc: t('m.rama.hacer.need_tab_desc') },
          { key: 'deseo',     label: t('m.rama.hacer.desire_tab'),     desc: t('m.rama.hacer.desire_tab_desc') },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setVista(opt.key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              padding: '0.4rem 0.5rem', borderRadius: 14,
              background: vista === opt.key ? BB : 'transparent',
              border: `1px solid ${vista === opt.key ? B : 'rgba(255,255,255,0.1)'}`,
              color: vista === opt.key ? B : 'var(--text-secondary)',
              fontSize: '0.75rem', fontWeight: vista === opt.key ? 700 : 400, cursor: 'pointer',
            }}
          >
            <span>{opt.label}</span>
            <span style={{ fontSize: '0.58rem', opacity: 0.6, fontWeight: 400 }}>{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Level gate banner (Necesidad view only) */}
      {vista === 'necesidad' && (
        <div style={{
          margin: '0.5rem 1rem 0',
          padding: '0.5rem 0.85rem', borderRadius: 10,
          background: canVote ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${canVote ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
        }}>
          {canVote ? <BarChart2 size={14} color="#22c55e" /> : <Lock size={14} color="#ef4444" />}
          <OptimizedText
            text={canVote
              ? t('m.rama.hacer.can_vote')
              : t('m.rama.hacer.cant_vote')}
            style={{ fontSize: '0.72rem', color: canVote ? '#22c55e' : '#ef4444', fontWeight: 600 }}
          />
        </div>
      )}

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.rama.hacer.loading')}</p>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
            <GitBranch size={28} color={B} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {vista === 'necesidad' ? t('m.rama.hacer.empty_governance') : t('m.rama.hacer.empty_desire')}
            </p>
          </div>
        )}

        {filtered.map(branch => {
          const branchName = branch.name || branch.idea?.title || 'Rama';
          const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === branch.id);
          const sliderVal = votes[branch.id] ?? 5;
          const pts = branch.valorOficial || 0;
          const bayasFund = branch.bayasFund || 0;
          const branchTreeId = branch.treeId || branch.idea?.need?.treeLinks?.[0]?.treeId || '';
          const canManageFiatLedger = user?.memberships?.some((m: any) => m.treeId === branchTreeId && m.role === 'ADMIN');

          // Active bonus tags from branch name / capabilities
          const activeBonuses = Object.entries(BONUS_ICONS).filter(([tag]) =>
            branchName.toLowerCase().includes(tag.toLowerCase().replace('#', ''))
          );

          return (
            <motion.div
              key={branch.id}
              onClick={() => {
                if (isFilterModeActive) toggleLinaje(branch.id, 'rama');
              }}
              style={{
                ...cardBase,
                padding: '0.9rem 1rem',
                flexDirection: 'column',
                gap: '0.6rem',
                border: isSelected ? `1.5px solid rgba(255,255,255,0.4)` : '1px solid rgba(255,255,255,0.08)',
                background: isSelected ? B : 'rgba(255,255,255,0.04)',
                cursor: isFilterModeActive ? 'pointer' : 'default',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 8px 32px rgba(59,130,246,0.3)' : 'none',
              }}
            >
              <div style={{
                pointerEvents: isFilterModeActive ? 'none' : 'auto',
                width: '100%',
                display: 'flex', flexDirection: 'column', gap: '0.6rem',
                opacity: isFilterModeActive && !isSelected && linajeActivo.length > 0 ? 0.3 : 1,
              }}>
                {/* Header: name + bonus icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <BranchTag name={branchName} isHashtag={branch.isHashtag} color={isSelected ? '#fff' : B} />
                  {branch.isDesire && (
                    <span style={{
                      fontSize: '0.62rem', padding: '1px 6px', borderRadius: 10,
                      background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(245,158,11,0.15)',
                      color: isSelected ? '#fff' : '#f59e0b', fontWeight: 700,
                    }}>
                      Deseo
                    </span>
                  )}
                  {/* Bonus merit icons */}
                  {activeBonuses.map(([tag, info]) => {
                    const Icon = info.icon;
                    return (
                      <span key={tag} title={info.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <Icon size={13} color={isSelected ? '#fff' : info.color} />
                      </span>
                    );
                  })}
                </div>

                {/* Description (from need/idea) */}
                {branch.idea?.need?.title && (
                  <OptimizedText
                    text={`${t('m.rama.hacer.need_prefix')} ${branch.idea.need.title}`}
                    style={{
                      fontSize: '0.72rem',
                      color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                  />
                )}

                {/* ── Necesidad View: Importance Slider ──────────────────────── */}
                {vista === 'necesidad' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <OptimizedText
                        text={t('m.rama.hacer.importance')}
                        style={{
                          fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
                        }}
                      />
                      <OptimizedText
                        text={`${pts.toFixed(0)} pt`}
                        style={{ fontSize: '0.72rem', color: isSelected ? '#fff' : B, fontWeight: 800 }}
                      />
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      width: '100%', height: 4, borderRadius: 2,
                      background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                    }}>
                      <div style={{
                        height: '100%', width: `${Math.min(100, (pts / 10) * 100)}%`,
                        borderRadius: 2, background: isSelected ? '#fff' : B,
                        transition: 'width 0.4s',
                      }} />
                    </div>

                    {/* Slider */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <OptimizedText
                          text={canVote ? t('m.rama.hacer.vote_importance', { val: sliderVal }) : t('m.rama.hacer.requires_level')}
                          style={{
                            fontSize: '0.72rem', fontWeight: canVote ? 600 : 400,
                            color: isSelected ? '#fff' : (canVote ? 'var(--text-primary)' : 'rgba(255,255,255,0.3)'),
                          }}
                        />
                        {canVote && (
                          <button
                            onClick={() => handleVote(branch.id)}
                            disabled={submitting === branch.id}
                            style={{
                              padding: '0.25rem 0.7rem', borderRadius: 10,
                              background: isSelected ? 'rgba(255,255,255,0.2)' : BL,
                              border: `1px solid ${isSelected ? '#fff' : B}66`,
                              color: isSelected ? '#fff' : B, fontSize: '0.68rem', fontWeight: 700,
                              cursor: submitting === branch.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {submitting === branch.id ? '…' : t('m.rama.hacer.confirm')}
                          </button>
                        )}
                      </div>
                      <input
                        type="range" min={1} max={10} step={1}
                        value={sliderVal}
                        disabled={!canVote}
                        onChange={e => setVotes(prev => ({ ...prev, [branch.id]: Number(e.target.value) }))}
                        style={{
                          width: '100%',
                          accentColor: isSelected ? '#fff' : (canVote ? B : 'rgba(255,255,255,0.2)'),
                          cursor: canVote ? 'pointer' : 'not-allowed',
                          opacity: canVote ? 1 : 0.4,
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <span key={n} style={{
                            fontSize: '0.55rem',
                            color: sliderVal === n ? (isSelected ? '#fff' : B) : 'rgba(255,255,255,0.2)',
                            fontWeight: sliderVal === n ? 800 : 400,
                          }}>
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Deseo View: Pozo Creciente + Injection ─────────────────── */}
                {vista === 'deseo' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {/* Growing Pool */}
                    <div style={{
                      padding: '0.6rem 0.85rem', borderRadius: 10,
                      background: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.06)',
                      border: `1px solid ${isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.15)'}`,
                    }}>
                      <OptimizedText
                        text={t('m.rama.hacer.growing_pool')}
                        style={{
                          fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
                          marginBottom: '0.4rem', display: 'block',
                        }}
                      />
                      {/* XP pool bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <TrendingUp size={13} color={isSelected ? '#fff' : '#22c55e'} />
                        <div style={{ flex: 1 }}>
                          <div style={{
                            width: '100%', height: 6, borderRadius: 3,
                            background: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(34,197,94,0.12)',
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(100, (branch.xpPool || 0) / Math.max(1, (branch.valorOficial || 100)) * 100)}%`,
                              borderRadius: 3, background: isSelected ? '#fff' : '#22c55e',
                              transition: 'width 0.4s',
                            }} />
                          </div>
                        </div>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700,
                          color: isSelected ? '#fff' : '#22c55e',
                        }}>
                          {(branch.xpPool || 0).toFixed(0)} XP
                        </span>
                      </div>
                      {/* Berries bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Cherry size={13} color={isSelected ? '#fff' : '#a855f7'} />
                        <div style={{ flex: 1 }}>
                          <div style={{
                            width: '100%', height: 6, borderRadius: 3,
                            background: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(168,85,247,0.12)',
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(100, bayasFund / Math.max(1, (branch.valorOficial || 100)) * 100)}%`,
                              borderRadius: 3, background: isSelected ? '#fff' : '#a855f7',
                              transition: 'width 0.4s',
                            }} />
                          </div>
                        </div>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700,
                          color: isSelected ? '#fff' : '#a855f7',
                        }}>
                          {bayasFund.toFixed(0)} 🍒
                        </span>
                      </div>
                    </div>

                    {/* Injection buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {canManageFiatLedger && (
                        <button
                          onClick={() => setInjectModal({ branchId: branch.id, treeId: branchTreeId, type: 'fiat' })}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                            padding: '0.55rem', borderRadius: 12,
                            background: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(34,197,94,0.08)',
                            border: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(34,197,94,0.25)'}`,
                            color: isSelected ? '#fff' : '#22c55e',
                            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          <DollarSign size={14} /> {t('m.rama.hacer.inject_fiat')}
                        </button>
                      )}
                      <button
                        onClick={() => setInjectModal({ branchId: branch.id, treeId: branch.treeId || '', type: 'berry' })}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                          padding: '0.55rem', borderRadius: 12,
                          background: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(168,85,247,0.08)',
                          border: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(168,85,247,0.25)'}`,
                          color: isSelected ? '#fff' : '#a855f7',
                          fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <Cherry size={14} /> {t('m.rama.hacer.inject_berries')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Injection Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {injectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setInjectModal(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 999, padding: '1rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 360, borderRadius: 20,
                background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)',
                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                {injectModal.type === 'fiat'
                  ? <DollarSign size={28} color="#22c55e" />
                  : <Cherry size={28} color="#a855f7" />}
                <OptimizedText
                  text={injectModal.type === 'fiat' ? t('m.rama.hacer.inject_fiat_title') : t('m.rama.hacer.inject_berries_title')}
                  style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.5rem', display: 'block' }}
                />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {injectModal.type === 'fiat'
                    ? t('m.rama.hacer.fiat_info')
                    : t('m.rama.hacer.berries_info')}
                </p>
              </div>

              <div>
                <label style={labelStyle}>{t('m.rama.hacer.amount')}</label>
                <input
                  type="number"
                  value={injectAmount}
                  onChange={e => setInjectAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setInjectModal(null)}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  }}
                >
                  {t('m.rama.hacer.cancel')}
                </button>
                <button
                  onClick={handleInject}
                  disabled={!injectAmount || parseFloat(injectAmount) <= 0 || injecting}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12,
                    background: injectModal.type === 'fiat' ? '#22c55e' : '#a855f7',
                    border: 'none', color: '#fff',
                    fontWeight: 700, fontSize: '0.85rem',
                    cursor: injecting ? 'not-allowed' : 'pointer',
                    opacity: (!injectAmount || parseFloat(injectAmount) <= 0) ? 0.5 : 1,
                  }}
                >
                  {injecting ? '…' : t('m.rama.hacer.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIR — Bonos Éticos + Métricas + Beneficiarios
// ─────────────────────────────────────────────────────────────────────────────
export function RamaMedir() {
  const { t } = useTranslation();
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();
  const user = useAuthStore((s) => s.user);
  const { trees } = useTreeStore();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Beneficiary rating state
  const [rating, setRating] = useState<Record<string, number>>({});

  // Foreign specialist state (per branch member)
  const [foreignMembers, setForeignMembers] = useState<Record<string, any[]>>({}); // branchId → migrations[]

  // ── Bonus Pool state (standalone section below branches) ──
  // Grouped by tree: { treeId, treeName, treeIcon, isCreator, bonuses[] }[]
  const [bonusGroups, setBonusGroups] = useState<{
    treeId: string; treeName: string; treeIcon: string; isCreator: boolean; bonuses: any[];
  }[]>([]);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [myBonusVotes, setMyBonusVotes] = useState<Record<string, number>>({}); // bonusPoolId → score
  const [votingId, setVotingId] = useState<string | null>(null);

  // Derive which tree(s) to show bonuses for:
  // - If funnel filter has tree(s) selected → only those
  // - Else → ALL user's trees
  const filteredTreeIds = linajeActivo.filter(l => l.entidad === 'arbol').map(l => l.id);
  const bonusTreeIds: string[] = filteredTreeIds.length > 0
    ? filteredTreeIds
    : trees.map((t: any) => t.id);
  const isSingleTreeMode = bonusTreeIds.length === 1;

  // User's max level for bonus voting gate
  const myMaxLevel = (() => {
    if (!user?.memberships?.length) return 0;
    return Math.max(...user.memberships.map((m: any) => m.level ?? 0));
  })();

  // Per-tree creator check helper
  const isCreatorOf = (treeId: string) => {
    const t = trees.find((tr: any) => tr.id === treeId);
    return t?.creatorId === user?.id;
  };

  // Global canVoteBonus (at least one tree where user is creator OR level >= 3)
  const canVoteBonusGlobal = myMaxLevel >= 3 || bonusTreeIds.some(tid => isCreatorOf(tid));

  // Per-tree voting permission
  const canVoteBonusForTree = (treeId: string) => myMaxLevel >= 3 || isCreatorOf(treeId);

  useEffect(() => {
    api.get('/branches')
      .then(({ data }) => setBranches(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch foreign specialist status when a branch is expanded
  useEffect(() => {
    if (!expandedId) return;
    const branch = branches.find(b => b.id === expandedId);
    if (!branch?.members?.length) return;
    const treeId = branch.treeId || branch.idea?.need?.treeLinks?.[0]?.treeId;
    if (!treeId) return;

    Promise.all(
      branch.members.map((m: any) =>
        api.get(`/migration/foreign-status/${m.userId}?targetTreeId=${treeId}`)
          .then(({ data }) => ({ userId: m.userId, ...data }))
          .catch(() => ({ userId: m.userId, isForeign: false, migrations: [] }))
      )
    ).then(results => {
      const foreignOnes = results.filter((r: any) => r.isForeign);
      setForeignMembers(prev => ({ ...prev, [expandedId]: foreignOnes }));
    });
  }, [expandedId, branches]);

  // ── Fetch bonus pools for all relevant trees ──
  const fetchBonuses = useCallback(async () => {
    if (bonusTreeIds.length === 0) { setBonusGroups([]); return; }
    setBonusLoading(true);
    try {
      const groups: typeof bonusGroups = [];
      const allVotes: Record<string, number> = {};

      await Promise.all(bonusTreeIds.map(async (treeId) => {
        try {
          const { data } = await api.get(`/bonus?treeId=${treeId}`);
          const tree = trees.find((t: any) => t.id === treeId);
          // Collect user's existing votes
          for (const bonus of data) {
            const myVote = bonus.votes?.find((v: any) => v.userId === user?.id);
            if (myVote) allVotes[bonus.id] = myVote.score;
          }
          if (data.length > 0) {
            groups.push({
              treeId,
              treeName: tree?.name || 'Árbol',
              treeIcon: tree?.icono || '🌳',
              isCreator: tree?.creatorId === user?.id,
              bonuses: data,
            });
          }
        } catch { /* skip tree on error */ }
      }));

      // Sort groups to keep consistent order
      groups.sort((a, b) => a.treeName.localeCompare(b.treeName));
      setBonusGroups(groups);
      setMyBonusVotes(prev => ({ ...prev, ...allVotes }));
    } catch {
      setBonusGroups([]);
    } finally {
      setBonusLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonusTreeIds.join(','), user?.id]);

  useEffect(() => { fetchBonuses(); }, [fetchBonuses]);

  // Handle bonus vote (refresh only the tree that contains the voted bonus)
  const handleBonusVote = async (bonusPoolId: string, score: number, treeId: string) => {
    setVotingId(bonusPoolId);
    try {
      await api.post(`/bonus/${bonusPoolId}/vote`, { score });
      setMyBonusVotes(prev => ({ ...prev, [bonusPoolId]: score }));
      // Refresh only the affected tree's bonuses
      const { data } = await api.get(`/bonus?treeId=${treeId}`);
      setBonusGroups(prev => prev.map(g =>
        g.treeId === treeId ? { ...g, bonuses: data } : g
      ));
    } catch (e: any) {
      console.warn('Bonus vote error:', e?.response?.data?.error);
    } finally {
      setVotingId(null);
    }
  };

  // Filter by relational DNA
  const filtered = branches.filter(b => {
    if (!isFilterModeActive && linajeActivo.length > 0) {
      return linajeActivo.some(l => {
        if (l.entidad === 'arbol') {
          const bTreeId = b.treeId || b.idea?.need?.treeLinks?.[0]?.treeId;
          return bTreeId === l.id;
        }
        if (l.entidad === 'necesidad') return b.idea?.need?.id === l.id;
        if (l.entidad === 'rama') return b.id === l.id;
        return false;
      });
    }
    return true;
  });

  // Check if user is a beneficiary
  const isBeneficiary = (branch: any) => {
    return branch.members?.some((m: any) => m.userId === user?.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingBottom: '5rem' }}>
        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.rama.medir.loading')}</p>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
            <BarChart2 size={28} color={B} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.rama.medir.empty')}</p>
          </div>
        )}

        {/* ── Branch cards ─────────────────────────────────────────────── */}
        {filtered.map(branch => {
          const branchName = branch.name || branch.idea?.title || 'Rama';
          const isExpanded = expandedId === branch.id;
          const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === branch.id);
          const pts = branch.valorOficial || 0;
          const xpPool = branch.xpPool || 0;
          const bayasFund = branch.bayasFund || 0;
          const goal = branch.valorOficial || 100;
          const xpAllocated = branch.xpPool || 0;
          const gap = Math.max(0, goal - xpAllocated);

          const beneficiary = isBeneficiary(branch);
          const myRating = rating[branch.id] ?? 0;

          return (
            <motion.div
              key={branch.id}
              onClick={() => {
                if (isFilterModeActive) {
                  toggleLinaje(branch.id, 'rama');
                } else {
                  setExpandedId(isExpanded ? null : branch.id);
                }
              }}
              style={{
                ...cardBase,
                padding: '1rem',
                flexDirection: 'column',
                gap: '0.8rem',
                border: isSelected ? '1.5px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: isSelected ? B : 'rgba(255,255,255,0.04)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 8px 32px rgba(59,130,246,0.3)' : 'none',
              }}
            >
              <div style={{
                pointerEvents: isFilterModeActive ? 'none' : 'auto',
                width: '100%',
                display: 'flex', flexDirection: 'column', gap: '0.8rem',
                opacity: isFilterModeActive && !isSelected && linajeActivo.length > 0 ? 0.3 : 1,
              }}>
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BranchTag name={branchName} isHashtag={branch.isHashtag} color={isSelected ? '#fff' : B} />
                  <div style={{ marginLeft: 'auto' }}>
                    <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
                      <ChevronRight size={16} color={isSelected ? '#fff' : 'rgba(255,255,255,0.3)'} />
                    </motion.div>
                  </div>
                </div>

                {/* Metrics row */}
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <MiniMetric
                    label={t('m.rama.medir.importance')}
                    value={`${pts.toFixed(0)}`}
                    icon={<BarChart2 size={12} />}
                    color={isSelected ? '#fff' : B}
                    isSelected={isSelected}
                  />
                  <MiniMetric
                    label={t('m.rama.medir.pool_xp')}
                    value={`${xpPool.toFixed(0)}`}
                    icon={<TrendingUp size={12} />}
                    color={isSelected ? '#fff' : '#22c55e'}
                    isSelected={isSelected}
                  />
                  <MiniMetric
                    label={t('m.rama.medir.berries')}
                    value={`${bayasFund.toFixed(0)}`}
                    icon={<Cherry size={12} />}
                    color={isSelected ? '#fff' : '#a855f7'}
                    isSelected={isSelected}
                  />
                </div>

                {/* Expanded accordion: XP allocation gap + Beneficiary Rating */}
                <AnimatePresence>
                  {isExpanded && !isFilterModeActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
                    >
                      {/* ── XP allocation gap ───────────────────────────────── */}
                      <div style={{
                        padding: '0.75rem', borderRadius: 10,
                        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
                      }}>
                        <OptimizedText
                          text={t('m.rama.medir.financial_goal')}
                          style={{
                            fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {t('m.rama.medir.goal')} {goal.toFixed(0)} XP
                          </span>
                          <span style={{ fontSize: '0.72rem', color: gap > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                            {gap > 0 ? `${t('m.rama.medir.gap')} ${gap.toFixed(0)} XP` : t('m.rama.medir.goal_reached')}
                          </span>
                        </div>
                        <div style={{
                          width: '100%', height: 6, borderRadius: 3,
                          background: 'rgba(255,255,255,0.08)',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, (xpAllocated / goal) * 100)}%`,
                            borderRadius: 3,
                            background: gap > 0 ? B : '#22c55e',
                            transition: 'width 0.4s',
                          }} />
                        </div>
                      </div>

                      {/* ── Especialistas Extranjeros en Prueba ────────────── */}
                      {(foreignMembers[branch.id]?.length ?? 0) > 0 && (
                        <div style={{
                          padding: '0.75rem', borderRadius: 10,
                          background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.25)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                            <Globe size={14} color="#f97316" />
                            <OptimizedText
                              text={t('m.rama.medir.foreign_specialists')}
                              style={{
                                fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.06em', color: '#f97316', display: 'block',
                              }}
                            />
                          </div>
                          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                            {t('m.rama.medir.foreign_info')}
                          </p>
                          {foreignMembers[branch.id].map((fm: any) => (
                            fm.migrations?.map((mig: any) => (
                              <div key={mig.id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.4rem 0.6rem', borderRadius: 8,
                                background: 'rgba(249,115,22,0.08)', marginBottom: '0.35rem',
                              }}>
                                <span style={{ fontSize: '0.85rem' }}>{mig.sourceTree?.icono || '🌳'}</span>
                                <div style={{ flex: 1 }}>
                                  <OptimizedText
                                    text={`${mig.hashtag} — de ${mig.sourceTree?.name || 'Otro Árbol'}`}
                                    style={{ fontSize: '0.72rem', color: '#f97316', fontWeight: 600 }}
                                  />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                                    <div style={{
                                      width: 60, height: 4, borderRadius: 2,
                                      background: 'rgba(255,255,255,0.1)',
                                    }}>
                                      <div style={{
                                        height: '100%', borderRadius: 2,
                                        width: `${(mig.tasksCompleted / 3) * 100}%`,
                                        background: '#f97316',
                                        transition: 'width 0.3s',
                                      }} />
                                    </div>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                                      {mig.tasksCompleted}/3 tareas
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))
                          ))}
                        </div>
                      )}

                      {/* ── Beneficiary Satisfaction Rating ─────────────────── */}
                      {beneficiary && (
                        <div style={{
                          padding: '0.75rem', borderRadius: 10,
                          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
                        }}>
                          <OptimizedText
                            text={t('m.rama.medir.beneficiary_eval')}
                            style={{
                              fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.06em', color: '#fbbf24', marginBottom: '0.5rem', display: 'block',
                            }}
                          />
                          <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
                            {t('m.rama.medir.beneficiary_info')}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                onClick={() => setRating(prev => ({ ...prev, [branch.id]: n }))}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem',
                                }}
                              >
                                <Star
                                  size={22}
                                  fill={myRating >= n ? '#fbbf24' : 'none'}
                                  stroke={myRating >= n ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
                                />
                              </button>
                            ))}
                            <span style={{
                              fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', marginLeft: '0.5rem',
                            }}>
                              {myRating > 0 ? `${myRating}/5` : '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ── BOLSA DE VALORES ÉTICOS — Standalone Section ────────────── */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: '1.25rem', marginTop: '0.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.85rem',
        }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Percent size={18} color={B} />
            <OptimizedText
              text={t('m.rama.medir.bonuses')}
              style={{ fontSize: '1rem', fontWeight: 800, color: B }}
            />
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {t('m.rama.medir.filter_hint')}
          </p>

          {/* Global level gate */}
          <div style={{
            padding: '0.5rem 0.85rem', borderRadius: 10,
            background: canVoteBonusGlobal ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${canVoteBonusGlobal ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            {canVoteBonusGlobal ? <BarChart2 size={14} color="#22c55e" /> : <Lock size={14} color="#ef4444" />}
            <OptimizedText
              text={canVoteBonusGlobal
                ? t('m.rama.medir.can_vote_bonus', { level: myMaxLevel })
                : t('m.rama.medir.cant_vote_bonus', { level: myMaxLevel })}
              style={{ fontSize: '0.72rem', color: canVoteBonusGlobal ? '#22c55e' : '#ef4444', fontWeight: 600 }}
            />
          </div>

          {/* Loading */}
          {bonusLoading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('m.rama.medir.loading_bonuses')}</p>}

          {/* No trees at all */}
          {!bonusLoading && bonusTreeIds.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0.5rem 0' }}>
              {t('m.rama.medir.join_tree')}
            </p>
          )}

          {/* All trees fetched but no bonuses anywhere */}
          {!bonusLoading && bonusTreeIds.length > 0 && bonusGroups.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', paddingTop: '1rem' }}>
              {t(isSingleTreeMode ? 'm.rama.medir.no_bonuses_tree' : 'm.rama.medir.no_bonuses_all')} {t('m.rama.medir.create_hint')}
            </p>
          )}

          {/* ── Per-tree bonus groups ─────────────────────────────────── */}
          {bonusGroups.map((group, gIdx) => {
            const canVoteThisTree = canVoteBonusForTree(group.treeId);
            const treeTotalPuntos = group.bonuses.reduce((s: number, b: any) => s + (b.puntosImportanciaTotal || 0), 0);

            return (
              <div key={group.treeId} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {/* Tree divider header */}
                {(!isSingleTreeMode || bonusGroups.length > 1) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.55rem 0.85rem', borderRadius: 10,
                    background: 'rgba(59,130,246,0.06)', border: `1px solid rgba(59,130,246,0.12)`,
                    ...(gIdx > 0 ? { marginTop: '0.5rem', borderTop: '2px solid rgba(59,130,246,0.2)' } : {}),
                  }}>
                    <span style={{ fontSize: '1rem' }}>{group.treeIcon}</span>
                    <OptimizedText
                      text={group.treeName}
                      style={{ fontSize: '0.82rem', fontWeight: 800, color: B }}
                    />
                    {filteredTreeIds.length > 0 && (
                      <span style={{
                        fontSize: '0.55rem', padding: '2px 6px', borderRadius: 8,
                        background: 'rgba(59,130,246,0.15)', color: B, fontWeight: 600,
                      }}>
                        vía filtro
                      </span>
                    )}
                    {group.isCreator && (
                      <span style={{
                        fontSize: '0.55rem', padding: '2px 6px', borderRadius: 8,
                        background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 600,
                      }}>
                        Creador
                      </span>
                    )}
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600,
                    }}>
                      {group.bonuses.length} {group.bonuses.length !== 1 ? t('m.rama.medir.bonuses_plural') : t('m.rama.medir.bonus_singular')}
                    </span>
                  </div>
                )}

                {/* Per-tree creator exempt banner (only if not level 3+ but is creator) */}
                {group.isCreator && myMaxLevel < 3 && (
                  <div style={{
                    padding: '0.35rem 0.75rem', borderRadius: 8,
                    background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                  }}>
                    <BarChart2 size={12} color="#22c55e" />
                    <span style={{ fontSize: '0.65rem', color: '#22c55e', fontWeight: 600 }}>
                      Creador — Exento del requisito Nivel 3+
                    </span>
                  </div>
                )}

                {/* Bonus cards for this tree */}
                {group.bonuses.map((bonus: any) => {
                  const pct = (bonus.porcentajeActual || 0) * 100;
                  const myScore = myBonusVotes[bonus.id] ?? 0;
                  const isVoting = votingId === bonus.id;
                  const totalVotes = bonus.votes?.length ?? 0;
                  const normalizedBonusTag = normalizeBonusTag(bonus.hashtag);

                  const iconEntry = Object.entries(BONUS_ICONS).find(([tag]) =>
                    tag.toLowerCase() === normalizedBonusTag.toLowerCase()
                  );
                  const IconComponent = iconEntry ? iconEntry[1].icon : Sparkles;
                  const iconColor = iconEntry ? iconEntry[1].color : B;

                  return (
                    <div key={bonus.id} style={{
                      padding: '0.85rem', borderRadius: 14,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', flexDirection: 'column', gap: '0.6rem',
                    }}>
                      {/* Bonus header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <IconComponent size={18} color={iconColor} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {normalizedBonusTag}
                        </span>
                        <span style={{
                          marginLeft: 'auto',
                          fontSize: '0.88rem', fontWeight: 800, color: iconColor,
                        }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Percentage bar */}
                      <div style={{
                        width: '100%', height: 6, borderRadius: 3,
                        background: 'rgba(255,255,255,0.08)',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, pct)}%`,
                          borderRadius: 3,
                          background: iconColor,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>

                      {/* Info row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                          {(bonus.puntosImportanciaTotal || 0).toFixed(0)} {t('m.rama.medir.total_points')} · {totalVotes} {t('m.rama.medir.votes')}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                          {t('m.rama.medir.xp_mult')} ×{(1 + (bonus.porcentajeActual || 0)).toFixed(2)}
                        </span>
                      </div>

                      {/* Voting slider */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <OptimizedText
                            text={canVoteThisTree
                              ? t('m.rama.medir.your_vote', { val: myScore || '—' })
                              : t('m.rama.medir.requires_level')}
                            style={{
                              fontSize: '0.72rem', fontWeight: canVoteThisTree ? 600 : 400,
                              color: canVoteThisTree ? 'var(--text-primary)' : 'rgba(255,255,255,0.3)',
                            }}
                          />
                          {canVoteThisTree && myScore > 0 && (
                            <button
                              onClick={() => handleBonusVote(bonus.id, myScore, group.treeId)}
                              disabled={isVoting}
                              style={{
                                padding: '0.2rem 0.6rem', borderRadius: 10,
                                background: BL, border: `1px solid ${B}66`,
                                color: B, fontSize: '0.65rem', fontWeight: 700,
                                cursor: isVoting ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isVoting ? '…' : t('m.rama.medir.confirm')}
                            </button>
                          )}
                        </div>
                        <input
                          type="range" min={1} max={10} step={1}
                          value={myScore || 5}
                          disabled={!canVoteThisTree}
                          onChange={e => setMyBonusVotes(prev => ({ ...prev, [bonus.id]: Number(e.target.value) }))}
                          style={{
                            width: '100%',
                            accentColor: canVoteThisTree ? iconColor : 'rgba(255,255,255,0.2)',
                            cursor: canVoteThisTree ? 'pointer' : 'not-allowed',
                            opacity: canVoteThisTree ? 1 : 0.4,
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <span key={n} style={{
                              fontSize: '0.55rem',
                              color: (myScore || 0) === n ? iconColor : 'rgba(255,255,255,0.2)',
                              fontWeight: (myScore || 0) === n ? 800 : 400,
                            }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Per-tree pie summary */}
                {group.bonuses.length > 0 && (
                  <div style={{
                    padding: '0.75rem', borderRadius: 12,
                    background: 'rgba(59,130,246,0.04)', border: `1px solid rgba(59,130,246,0.1)`,
                    display: 'flex', flexDirection: 'column', gap: '0.4rem',
                  }}>
                    <OptimizedText
                      text={isSingleTreeMode ? t('m.rama.medir.distribution_title') : `${t('m.rama.medir.distribution_tree')} ${group.treeName}`}
                      style={{
                        fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block',
                      }}
                    />

                    {/* Stacked bar */}
                    <div style={{ display: 'flex', width: '100%', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                      {group.bonuses.map((bonus: any) => {
                        const pct = (bonus.porcentajeActual || 0) * 100;
                        const normalizedBonusTag = normalizeBonusTag(bonus.hashtag);
                        const iconEntry = Object.entries(BONUS_ICONS).find(([tag]) =>
                          tag.toLowerCase() === normalizedBonusTag.toLowerCase()
                        );
                        const bgColor = iconEntry ? iconEntry[1].color : B;
                        return (
                          <div key={bonus.id} title={`${normalizedBonusTag}: ${pct.toFixed(1)}%`} style={{
                            width: `${Math.max(pct, 0.5)}%`,
                            background: bgColor,
                            transition: 'width 0.6s ease',
                          }} />
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {group.bonuses.map((bonus: any) => {
                        const pct = (bonus.porcentajeActual || 0) * 100;
                        const normalizedBonusTag = normalizeBonusTag(bonus.hashtag);
                        const iconEntry = Object.entries(BONUS_ICONS).find(([tag]) =>
                          tag.toLowerCase() === normalizedBonusTag.toLowerCase()
                        );
                        const dotColor = iconEntry ? iconEntry[1].color : B;
                        return (
                          <span key={bonus.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: '0.62rem', color: 'var(--text-secondary)',
                          }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                            {normalizedBonusTag} {pct.toFixed(0)}%
                          </span>
                        );
                      })}
                    </div>

                    {/* Total */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.3rem',
                    }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {t('m.rama.medir.total_distributed')}
                      </span>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 800,
                        color: treeTotalPuntos > 0 ? '#22c55e' : 'var(--text-secondary)',
                      }}>
                        {group.bonuses.reduce((s: number, b: any) => s + ((b.porcentajeActual || 0) * 100), 0).toFixed(0)}% / 100%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function BranchTag({ name, isHashtag, color }: { name: string; isHashtag?: boolean; color?: string }) {
  const display = isHashtag && !name.startsWith('#') ? `#${name}` : name;
  return (
    <span style={{
      fontSize: '0.9rem', fontWeight: 800,
      color: color || B,
      letterSpacing: '-0.01em', lineHeight: 1,
    }}>
      {display}
    </span>
  );
}

function MiniMetric({ label, value, icon, color, isSelected }: {
  label: string; value: string; icon: React.ReactNode; color: string; isSelected: boolean;
}) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
      padding: '0.35rem 0.5rem', borderRadius: 8,
      background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
    }}>
      <span style={{
        fontSize: '0.55rem', textTransform: 'uppercase', fontWeight: 600,
        color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
        letterSpacing: '0.04em',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color, fontWeight: 700, fontSize: '0.82rem' }}>
        {icon} {value}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
