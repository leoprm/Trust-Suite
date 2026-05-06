import { useState, useEffect } from 'react';
import { Search, Star, Shield, MapPin, Users, Lock, Zap, X, Filter, Briefcase, Send, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';

const API_BASE = `http://${window.location.hostname}:3000`;

const TIER_BADGE: Record<string, { bg: string; border: string; text: string; labelKey: string }> = {
  INTERNO:      { bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af', labelKey: 'm.talent.tier_interno' },
  ESPECIALISTA: { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e', labelKey: 'm.talent.tier_especialista' },
  ELITE_DORADO: { bg: 'rgba(234,179,8,0.18)',   border: 'rgba(234,179,8,0.5)',   text: '#fbbf24', labelKey: 'm.talent.tier_elite_dorado' },
};

interface FilterOptions {
  countries: string[];
  cities: string[];
  sectors: string[];
  skills: string[];
}

interface SearchResult {
  id: string;
  username: string;
  profilePic: string | null;
  publicCode: string;
  seekingWork: boolean;
  maxLevel: number;
  totalPopulation: number;
  locations: { country: string; city: string; sector: string }[];
  trees: { name: string; icon: string; population: number }[];
  topSkills: { name: string; points: number; tasks: number; isElite: boolean; tier: string }[];
}

export default function TalentHunter() {
  const { t } = useTranslation();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pretext, setPretext] = useState('');
  const [populationInfo, setPopulationInfo] = useState<{ totalOnboardedUsers: number; criticalMassThreshold: number; isLaunchPhase?: boolean } | null>(null);

  // Filters
  const [skill, setSkill] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [sector, setSector] = useState('');
  const [eliteOnly, setEliteOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [minTreeSize, setMinTreeSize] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ countries: [], cities: [], sectors: [], skills: [] });

  // Sales modal
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // Invitation modal
  const [inviteTarget, setInviteTarget] = useState<SearchResult | null>(null);
  const [inviteMessage, setInviteMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/recruitment/filters').then(({ data }) => setFilterOptions(data)).catch(() => {});
  }, []);

  useEffect(() => {
    doSearch(1);
  }, []);

  const doSearch = async (pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Multi-hashtag: comma-separated skills
      const trimmedSkill = skill.trim();
      if (trimmedSkill.includes(',')) {
        params.set('skills', trimmedSkill);
      } else if (trimmedSkill) {
        params.set('skill', trimmedSkill);
      }
      if (country) params.set('country', country);
      if (city) params.set('city', city);
      if (sector) params.set('sector', sector);
      if (eliteOnly) params.set('eliteOnly', 'true');
      if (availableOnly) params.set('availableOnly', 'true');
      if (minTreeSize) params.set('minTreeSize', minTreeSize);
      params.set('page', String(pg));

      const { data } = await api.get(`/recruitment/search?${params}`);

      if (data.locked) {
        setLocked(true);
        setShowSalesModal(true);
        setResults([]);
        setPretext(data.pretext || '');
        setPopulationInfo(data.populationInfo || null);
      } else {
        setLocked(false);
        setResults(data.results);
        setTotal(data.total);
        setPage(pg);
        setPretext(data.pretext || '');
        setPopulationInfo(data.populationInfo || null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handlePurchasePass = async () => {
    setPurchasing(true);
    try {
      await api.post('/recruitment/purchase-pass');
      setShowSalesModal(false);
      setLocked(false);
      doSearch(1);
    } catch {
      alert(t('m.talent.error_pass'));
    } finally {
      setPurchasing(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteTarget || !inviteMessage.trim()) return;
    setSendingInvite(true);
    try {
      await api.post('/recruitment/invite', {
        recipientId: inviteTarget.id,
        message: inviteMessage.trim(),
      });
      setInviteSent(prev => new Set(prev).add(inviteTarget.id));
      setInviteTarget(null);
      setInviteMessage('');
    } catch (err: any) {
      alert(err?.response?.data?.error || t('m.talent.error_invite'));
    } finally {
      setSendingInvite(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.8rem',
      padding: '0.8rem', maxWidth: 600, margin: '0 auto',
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={18} color="#8b5cf6" />
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
            {t('m.talent.title')}
          </h1>
        </div>
        <p style={{
          margin: 0, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          {pretext || (populationInfo?.isLaunchPhase ? t('m.talent.pretext_launch') : t('m.talent.pretext_default'))}
        </p>
        {populationInfo && populationInfo.totalOnboardedUsers < populationInfo.criticalMassThreshold && (
          <span style={{ fontSize: '0.58rem', color: 'rgba(251,191,36,0.8)', fontWeight: 600 }}>
            {t('m.talent.specialists_progress', { current: populationInfo.totalOnboardedUsers.toLocaleString(), threshold: populationInfo.criticalMassThreshold.toLocaleString() })}
          </span>
        )}
      </div>

      {/* ── Search + Filters ────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {/* Search bar */}
        <div style={{
          display: 'flex', gap: '0.4rem', alignItems: 'center',
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.45rem 0.6rem', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <Search size={14} color="rgba(255,255,255,0.3)" />
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch(1)}
              placeholder={t('m.talent.search_placeholder')}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#fff', fontSize: '0.75rem', fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '0.45rem', borderRadius: 10,
              background: showFilters ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showFilters ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            <Filter size={16} color={showFilters ? '#8b5cf6' : 'rgba(255,255,255,0.4)'} />
          </button>
          <button
            onClick={() => doSearch(1)}
            style={{
              padding: '0.45rem 0.8rem', borderRadius: 10,
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              cursor: 'pointer', color: '#8b5cf6', fontWeight: 600, fontSize: '0.72rem',
              fontFamily: 'inherit',
            }}
          >
            {t('m.talent.search_btn')}
          </button>
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem',
                padding: '0.5rem', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                {/* Country */}
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">{t('m.talent.country')}</option>
                  {filterOptions.countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* City */}
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">{t('m.talent.city')}</option>
                  {filterOptions.cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Sector */}
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">{t('m.talent.sector')}</option>
                  {filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Min Tree Size */}
                <select
                  value={minTreeSize}
                  onChange={(e) => setMinTreeSize(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">{t('m.talent.tree_scale')}</option>
                  <option value="5">{t('m.talent.members_5')}</option>
                  <option value="10">{t('m.talent.members_10')}</option>
                  <option value="20">{t('m.talent.members_20')}</option>
                  <option value="50">{t('m.talent.members_50')}</option>
                </select>

                {/* Elite toggle */}
                <button
                  onClick={() => setEliteOnly(!eliteOnly)}
                  style={{
                    ...selectStyle,
                    cursor: 'pointer',
                    background: eliteOnly ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${eliteOnly ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: eliteOnly ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                  }}
                >
                  <Star size={12} /> {t('m.talent.elite_only')}
                </button>

                {/* Available toggle */}
                <button
                  onClick={() => setAvailableOnly(!availableOnly)}
                  style={{
                    ...selectStyle,
                    cursor: 'pointer',
                    background: availableOnly ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${availableOnly ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: availableOnly ? '#22c55e' : 'rgba(255,255,255,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                  }}
                >
                  <Briefcase size={12} /> {t('m.talent.available_only')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Results ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
          {t('m.talent.searching')}
        </div>
      ) : results.length === 0 && !locked ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
          {t('m.talent.no_results')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {!locked && (
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
              {t('m.talent.results_count', { count: total })}
            </span>
          )}

          {results.map((r) => (
            <div
              key={r.id}
              style={{
                padding: '0.7rem', borderRadius: 12,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
            >
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'start' }}>
                {/* Avatar */}
                {r.profilePic ? (
                  <img src={`${API_BASE}${r.profilePic}`} alt={r.username}
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(139,92,246,0.12)', border: '2px solid rgba(139,92,246,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Users size={18} color="rgba(139,92,246,0.5)" />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name + Level + Availability badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                      {r.username}
                    </span>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.2rem',
                      padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(59,130,246,0.1)',
                    }}>
                      <Shield size={10} color="#3b82f6" />
                      <span style={{ fontSize: '0.55rem', fontWeight: 600, color: '#60a5fa' }}>
                        {t('m.talent.level', { level: r.maxLevel })}
                      </span>
                    </div>
                    {r.seekingWork && (
                      <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                        background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                        color: '#22c55e',
                      }}>
                        {t('m.talent.available_badge')}
                      </span>
                    )}
                    {r.topSkills.some(s => s.isElite) && (
                      <span style={{
                        fontSize: '0.5rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                        background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)',
                        color: '#fbbf24',
                      }}>
                        {t('m.talent.elite_badge')}
                      </span>
                    )}
                  </div>

                  {/* Location */}
                  {r.locations.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                      <MapPin size={10} color="rgba(255,255,255,0.3)" />
                      <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                        {[r.locations[0].sector, r.locations[0].city, r.locations[0].country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Trees with population */}
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                    {r.trees.slice(0, 3).map((t, i) => (
                      <span key={i} style={{
                        fontSize: '0.55rem', padding: '1px 5px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)',
                      }}>
                        {t.icon} {t.name} ({t.population})
                      </span>
                    ))}
                  </div>

                  {/* Top Skills */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {r.topSkills.map((s, i) => {
                      const badge = TIER_BADGE[s.tier] || TIER_BADGE.INTERNO;
                      return (
                        <span key={i} style={{
                          fontSize: '0.55rem', fontWeight: 600,
                          padding: '2px 6px', borderRadius: 5,
                          background: badge.bg, color: badge.text,
                          border: `1px solid ${badge.border}`,
                        }}>
                          @{s.name}{s.isElite ? ' ✨' : ''} · {s.points}pts
                        </span>
                      );
                    })}
                  </div>

                  {/* Invite button */}
                  <div style={{ marginTop: '0.4rem' }}>
                    {inviteSent.has(r.id) ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.6rem', color: '#22c55e',
                      }}>
                        <CheckCircle size={12} /> {t('m.talent.invite_sent')}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setInviteTarget(r); setInviteMessage(''); }}
                        style={{
                          padding: '0.3rem 0.6rem', borderRadius: 8,
                          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                          cursor: 'pointer', color: '#8b5cf6', fontSize: '0.6rem', fontWeight: 600,
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem',
                        }}
                      >
                        <Send size={11} /> {t('m.talent.invite_interview')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', padding: '0.3rem 0' }}>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  onClick={() => doSearch(pg)}
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: 'none',
                    background: pg === page ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: pg === page ? '#8b5cf6' : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.7rem', fontFamily: 'inherit',
                  }}
                >
                  {pg}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SALES MODAL — Paywall for non-tree users                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showSalesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1rem',
            }}
            onClick={() => setShowSalesModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 380,
                background: 'rgba(15,18,28,0.97)',
                border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 20, padding: '1.5rem',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setShowSalesModal(false)}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem',
                }}
              >
                <X size={18} color="rgba(255,255,255,0.3)" />
              </button>

              {/* Header */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', margin: '0 auto 0.7rem',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lock size={24} color="#8b5cf6" />
                </div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  {t('m.talent.sales_title')}
                </h2>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                  {t('m.talent.sales_subtitle')}
                </p>
                {populationInfo && populationInfo.totalOnboardedUsers < populationInfo.criticalMassThreshold && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.6rem', color: '#fbbf24', lineHeight: 1.5 }}>
                    {t('m.talent.sales_disabled')}
                  </p>
                )}
              </div>

              {/* Option 1: Search pass */}
              <button
                onClick={handlePurchasePass}
                disabled={purchasing}
                style={{
                  padding: '0.8rem', borderRadius: 12,
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                  cursor: 'pointer', width: '100%', color: 'inherit',
                  display: 'flex', flexDirection: 'column', gap: '0.3rem',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={16} color="#8b5cf6" />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#8b5cf6' }}>
                    {t('m.talent.pass_title')}
                  </span>
                </div>
                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                  {t('m.talent.pass_desc')}
                </span>
              </button>

              {/* Option 2: Digitalize */}
              <button
                onClick={() => {
                  setShowSalesModal(false);
                  window.location.href = '/trees/new';
                }}
                style={{
                  padding: '0.8rem', borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(59,130,246,0.08))',
                  border: '1px solid rgba(34,197,94,0.2)',
                  cursor: 'pointer', width: '100%', color: 'inherit',
                  display: 'flex', flexDirection: 'column', gap: '0.3rem',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={16} color="#22c55e" />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#22c55e' }}>
                    {t('m.talent.digitalize_title')}
                  </span>
                  <span style={{
                    fontSize: '0.5rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                  }}>
                    {t('m.talent.digitalize_free')}
                  </span>
                </div>
                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                  {t('m.talent.digitalize_desc')}
                </span>
              </button>

              {/* Pretext */}
              <p style={{
                margin: 0, textAlign: 'center', fontSize: '0.55rem',
                color: 'rgba(255,255,255,0.25)', fontStyle: 'italic',
              }}>
                {t('m.talent.sales_footer')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* INTERVIEW INVITATION MODAL                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {inviteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1001,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1rem',
            }}
            onClick={() => setInviteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 380,
                background: 'rgba(15,18,28,0.97)',
                border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 20, padding: '1.5rem',
                display: 'flex', flexDirection: 'column', gap: '0.8rem',
              }}
            >
              <button
                onClick={() => setInviteTarget(null)}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem',
                }}
              >
                <X size={18} color="rgba(255,255,255,0.3)" />
              </button>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', margin: '0 auto 0.5rem',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Send size={20} color="#8b5cf6" />
                </div>
                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                  {t('m.talent.invite_modal_title')}
                </h2>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>
                  {t('m.talent.invite_modal_subtitle')} <strong style={{ color: '#8b5cf6' }}>{inviteTarget.username}</strong>
                </p>
              </div>

              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder={t('m.talent.invite_placeholder')}
                maxLength={500}
                rows={4}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 10, resize: 'none',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: '0.7rem', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', textAlign: 'right' }}>
                {inviteMessage.length}/500
              </span>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setInviteTarget(null)}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem',
                    fontWeight: 600, fontFamily: 'inherit',
                  }}
                >
                  {t('m.talent.cancel')}
                </button>
                <button
                  onClick={handleSendInvite}
                  disabled={sendingInvite || !inviteMessage.trim()}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: 10,
                    background: inviteMessage.trim() ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${inviteMessage.trim() ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: inviteMessage.trim() ? 'pointer' : 'not-allowed',
                    color: inviteMessage.trim() ? '#8b5cf6' : 'rgba(255,255,255,0.2)',
                    fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                  }}
                >
                  <Send size={13} /> {sendingInvite ? t('m.talent.sending') : t('m.talent.send_invitation')}
                </button>
              </div>

              <p style={{
                margin: 0, textAlign: 'center', fontSize: '0.5rem',
                color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
              }}>
                {t('m.talent.invite_footer')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '0.4rem', borderRadius: 8, fontSize: '0.65rem',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit',
  outline: 'none', cursor: 'pointer',
};
