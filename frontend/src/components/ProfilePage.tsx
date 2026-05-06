import { useState, useEffect, useRef } from 'react';
import {
  User, Award, Star, Shield, Globe,
  TrendingUp, Eye, EyeOff, Zap, Cherry, Ticket, Sprout, Users,
  Clock, ShieldOff, Camera, Lock, ToggleLeft, ToggleRight, ExternalLink, Copy, Briefcase,
} from 'lucide-react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import SkillEndorsementPanel from './SkillEndorsementPanel';
import ExpertEndorsementPanel from './ExpertEndorsementPanel';
import SkillStarChart from './SkillStarChart';

// ── Colors ─────────────────────────────────────────────────────────────────────
const TIER_COLORS = {
  INTERNO:       { bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af', labelKey: 'm.profile.tier_interno' },
  ESPECIALISTA:  { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e', labelKey: 'm.profile.tier_especialista' },
  ELITE:         { bg: 'rgba(234,179,8,0.12)',    border: 'rgba(234,179,8,0.35)',  text: '#eab308', labelKey: 'm.profile.tier_elite' },
  ELITE_DORADO:  { bg: 'rgba(234,179,8,0.18)',    border: 'rgba(234,179,8,0.5)',   text: '#fbbf24', labelKey: 'm.profile.tier_elite_dorado' },
};

function getPretext(level: number, skills: any[], t: (key: string, opts?: any) => string): string {
  const genesisSkill = skills.find((s: any) => s.phase === 'GENESIS');
  if (genesisSkill) {
    const remaining = 10 - (genesisSkill.totalSpecialists || 0);
    return t('m.profile.pretext_genesis', { name: genesisSkill.name, remaining });
  }
  const closest = skills.find((s: any) => s.tier === 'INTERNO' && s.completedTasks >= 4);
  if (closest) {
    return t('m.profile.pretext_specialist', { remaining: 7 - closest.completedTasks, name: closest.name });
  }
  const closestElite = skills.find((s: any) => s.tier === 'ESPECIALISTA');
  if (closestElite) {
    return t('m.profile.pretext_elite', { name: closestElite.name });
  }
  const key = Math.min(level, 5);
  return t(`m.profile.pretext_${key}`);
}

interface ProfilePageProps {
  onClose: () => void;
}

export default function ProfilePage({ onClose: _onClose }: ProfilePageProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTree, setSelectedTree] = useState<string | null>(null);
  const [publicSkills, setPublicSkills] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showEndorsePanel, setShowEndorsePanel] = useState(false);
  const [showExpertEndorsePanel, setShowExpertEndorsePanel] = useState(false);

  useEffect(() => {
    api.get('/users/profile')
      .then(({ data }) => {
        setProfile(data);
        if (data.memberships?.length > 0) {
          setSelectedTree(data.memberships[0].treeId);
        }
      })
      .catch((e) => {
        console.error('[ProfilePage] Error:', e?.response?.status, e?.response?.data || e.message);
        setError(e?.response?.data?.error || e.message || t('m.profile.unknown_error'));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        {t('m.profile.loading')}
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.5rem' }}>
        <span style={{ color: '#ef4444', fontSize: '0.82rem' }}>{t('m.profile.error_loading')}</span>
        {error && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem' }}>{error}</span>}
      </div>
    );
  }

  const currentMembership = profile.memberships?.find((m: any) => m.treeId === selectedTree);
  const activeMigrations = profile.migrations?.filter((m: any) => m.status === 'EN_PRUEBA') || [];
  const approvedMigrations = profile.migrations?.filter((m: any) => m.status === 'APROBADO') || [];

  return (
    <div ref={scrollRef} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CABECERA DE IDENTIDAD                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
        padding: '1rem 0.5rem 0.75rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Avatar */}
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
          border: '2px solid rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <User size={32} color="rgba(255,255,255,0.6)" />
        </div>

        {/* Username */}
        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          {profile.username}
        </span>

        {/* Global stats row */}
        <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Shield size={14} color="#3b82f6" />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>
              {t('m.profile.level', { level: profile.globalLevel })}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <TrendingUp size={14} color="#22c55e" />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#22c55e' }}>
              {Math.round(profile.totalXp)} XP
            </span>
          </div>
        </div>

        {/* Mentoring module — dynamic */}
        {(() => {
          const m = currentMembership?.mentorship;
          if (!m) return null;
          const bonoDaysLeft = m.bonoActivo && m.bonoExpira
            ? Math.max(0, Math.ceil((new Date(m.bonoExpira).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : 0;
          const isBanned = m.avalBanHasta && new Date(m.avalBanHasta) > new Date();
          const banDate = isBanned ? new Date(m.avalBanHasta).toLocaleDateString('es-ES') : '';

          return (
            <>
              {m.bonoActivo && bonoDaysLeft > 0 && (
                <div style={{
                  width: '100%', padding: '0.5rem 0.7rem', borderRadius: 10,
                  background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <Award size={14} color="#8b5cf6" />
                  <span style={{ fontSize: '0.68rem', color: '#8b5cf6', fontWeight: 600 }}>
                    {t('m.profile.mentoring_bonus')}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} /> {t('m.profile.days', { days: bonoDaysLeft })}
                  </span>
                </div>
              )}
              {isBanned && (
                <div style={{
                  width: '100%', padding: '0.5rem 0.7rem', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <ShieldOff size={14} color="#ef4444" />
                  <span style={{ fontSize: '0.62rem', color: '#ef4444', fontWeight: 500, lineHeight: 1.3 }}>
                    {t('m.profile.endorsement_ban', { date: banDate })}
                  </span>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ESTRELLA DE HABILIDADES (Top 6 Skills)                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <SkillStarChart />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SELECTOR DE CONTEXTO (Árboles)                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {profile.memberships?.length > 0 && (
        <div>
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--text-secondary)',
            display: 'block', marginBottom: '0.4rem',
          }}>
            {t('m.profile.tree_context')}
          </span>

          {/* Horizontal scroll carousel */}
          <div style={{
            display: 'flex', gap: '0.4rem', overflowX: 'auto',
            paddingBottom: '0.3rem',
            scrollbarWidth: 'none',
          }}>
            {profile.memberships.map((m: any) => {
              const isActive = selectedTree === m.treeId;
              return (
                <button
                  key={m.treeId}
                  onClick={() => setSelectedTree(m.treeId)}
                  style={{
                    flexShrink: 0,
                    padding: '0.45rem 0.75rem', borderRadius: 10,
                    background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    border: isActive ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    color: isActive ? '#3b82f6' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    fontSize: '0.72rem', fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{m.treeIcon}</span>
                  {m.treeName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MÓDULO DE REPUTACIÓN LOCAL (Dinámico por Árbol)                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {currentMembership && (
          <motion.div
            key={selectedTree}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {/* Local level header */}
            <div style={{
              padding: '0.65rem 0.75rem', borderRadius: 12,
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--text-secondary)',
                  display: 'block', marginBottom: '0.2rem',
                }}>
                  {t('m.profile.reputation_in', { icon: currentMembership.treeIcon, name: currentMembership.treeName })}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#3b82f6' }}>
                    {t('m.profile.local_level', { level: currentMembership.level })}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>
                    {Math.round(currentMembership.xp)} XP
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', position: 'relative' }}
                    title={t('m.profile.decay_tooltip', { balance: Math.round(currentMembership.bayasBalance || 0) })}
                  >
                    <Cherry size={12} color="#a855f7" style={{ opacity: 0.8, filter: 'saturate(0.7)' }} />
                    <span style={{ fontSize: '0.72rem', color: '#a855f7', fontWeight: 600 }}>
                      {Math.round(currentMembership.bayasBalance || 0)}
                    </span>
                    <span style={{
                      fontSize: '0.48rem', color: 'rgba(168,85,247,0.5)', fontWeight: 500,
                      marginLeft: 2,
                    }}>
                      {t('m.profile.decay_rate')}
                    </span>
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '0.6rem', padding: '3px 8px', borderRadius: 8,
                background: currentMembership.role === 'ADMIN' ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.12)',
                color: currentMembership.role === 'ADMIN' ? '#eab308' : '#3b82f6',
                fontWeight: 700,
              }}>
                {currentMembership.role === 'ADMIN' ? t('m.profile.admin') : t('m.profile.member')}
              </span>
            </div>

            {/* XP progress bar to next level */}
            {(() => {
              const nextThreshold = currentMembership.level * 50;
              const prevThreshold = (currentMembership.level - 1) * 50;
              const progress = Math.min(1, (currentMembership.xp - prevThreshold) / Math.max(1, nextThreshold - prevThreshold));
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                      {t('m.profile.progress_to', { level: currentMembership.level + 1 })}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                      {Math.round(currentMembership.xp)}/{nextThreshold} XP
                    </span>
                  </div>
                  <div style={{
                    width: '100%', height: 5, borderRadius: 3,
                    background: 'rgba(255,255,255,0.08)',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${progress * 100}%`,
                      background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
                      transition: 'width 0.4s',
                    }} />
                  </div>
                </div>
              );
            })()}

            {/* Pretext motivational message */}
            <div style={{
              padding: '0.5rem 0.7rem', borderRadius: 10,
              background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)',
            }}>
              <span style={{ fontSize: '0.68rem', color: '#eab308', fontWeight: 500, fontStyle: 'italic', lineHeight: 1.4 }}>
                💬 {getPretext(currentMembership.level, currentMembership.skills || [], t)}
              </span>
            </div>

            {/* ── Gremio y Especialidades ─────────────────────────────── */}
            <div>
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text-secondary)',
                display: 'block', marginBottom: '0.45rem',
              }}>
                {t('m.profile.guild_specialties')}
              </span>

              {(!currentMembership.skills || currentMembership.skills.length === 0) ? (
                <div style={{
                  padding: '0.6rem', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
                  textAlign: 'center',
                }}>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                    {t('m.profile.no_specialties')}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {currentMembership.skills.map((skill: any) => {
                    const tier = TIER_COLORS[skill.tier as keyof typeof TIER_COLORS] || TIER_COLORS.INTERNO;
                    return (
                      <div
                        key={skill.name}
                        style={{
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: tier.bg, border: `1px solid ${tier.border}`,
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          ...(skill.tier === 'ELITE_DORADO' ? { boxShadow: '0 0 12px rgba(251,191,36,0.25)' } : {}),
                        }}
                      >
                        {/* Skill icon */}
                        <div style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: `${tier.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          ...(skill.tier === 'ELITE_DORADO' ? { boxShadow: '0 0 8px rgba(251,191,36,0.5)' } : {}),
                        }}>
                          {skill.tier === 'ELITE_DORADO' ? (
                            <Star size={14} color={tier.text} fill={tier.text} />
                          ) : skill.tier === 'ELITE' ? (
                            <Star size={14} color={tier.text} fill={tier.text} />
                          ) : skill.tier === 'ESPECIALISTA' ? (
                            <Zap size={14} color={tier.text} />
                          ) : (
                            <Award size={14} color={tier.text} />
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Skill name + tier badge */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tier.text }}>
                              {skill.tier === 'ELITE_DORADO' ? `@${skill.name}` : skill.name}
                            </span>
                            <span style={{
                              fontSize: '0.5rem', padding: '1px 6px', borderRadius: 6,
                              background: tier.border, color: '#fff', fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>
                              {t(tier.labelKey)}
                            </span>
                            {/* Genesis Phase badge */}
                            {skill.phase === 'GENESIS' && (
                              <span style={{
                                fontSize: '0.48rem', padding: '1px 5px', borderRadius: 6,
                                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
                                color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2,
                              }}>
                                <Sprout size={8} /> {t('m.profile.genesis', { count: skill.totalSpecialists || 0 })}
                              </span>
                            )}
                          </div>

                          {/* Progress bar for INTERNO */}
                          {skill.tier === 'INTERNO' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                              <div style={{
                                flex: 1, height: 4, borderRadius: 2,
                                background: 'rgba(255,255,255,0.08)',
                              }}>
                                <div style={{
                                  height: '100%', borderRadius: 2,
                                  width: `${(skill.completedTasks / 7) * 100}%`,
                                  background: tier.text,
                                  transition: 'width 0.3s',
                                }} />
                              </div>
                              <span style={{ fontSize: '0.58rem', color: tier.text, fontWeight: 600, flexShrink: 0 }}>
                                {skill.completedTasks}/7
                              </span>
                            </div>
                          )}

                          {/* Task count for everyone */}
                          {skill.tier !== 'INTERNO' && (
                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.15rem', display: 'block' }}>
                              {t('m.profile.tasks_pts', { tasks: skill.completedTasks, pts: skill.accumulatedPoints || 0 })}
                            </span>
                          )}

                          {/* Golden Tickets indicator */}
                          {skill.goldenTickets > 0 && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              marginTop: '0.2rem', padding: '2px 8px', borderRadius: 8,
                              background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                            }}>
                              <Ticket size={11} color="#fbbf24" />
                              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#fbbf24' }}>
                                {t('m.profile.golden_ticket', { count: skill.goldenTickets })}
                              </span>
                            </div>
                          )}
                          {skill.tier === 'ESPECIALISTA' && !skill.goldenTickets && skill.streakProgress > 0 && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              marginTop: '0.15rem',
                            }}>
                              <div style={{
                                flex: 1, height: 3, borderRadius: 2, maxWidth: 80,
                                background: 'rgba(251,191,36,0.15)',
                              }}>
                                <div style={{
                                  height: '100%', borderRadius: 2,
                                  width: `${(skill.streakProgress / 7) * 100}%`,
                                  background: '#fbbf24',
                                  transition: 'width 0.3s',
                                }} />
                              </div>
                              <span style={{ fontSize: '0.5rem', color: 'rgba(251,191,36,0.6)' }}>
                                {t('m.profile.streak', { count: skill.streakProgress })}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Public toggle */}
                        <button
                          onClick={() => setPublicSkills(prev => ({ ...prev, [skill.name]: !prev[skill.name] }))}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '0.2rem', flexShrink: 0,
                          }}
                        >
                          {publicSkills[skill.name] ? (
                            <Eye size={14} color="rgba(255,255,255,0.5)" />
                          ) : (
                            <EyeOff size={14} color="rgba(255,255,255,0.2)" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Propuestas de Habilidad (Fase Génesis / Avales) ───── */}
            {currentMembership.skillProposals?.length > 0 && (
              <div>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: '#10b981',
                  display: 'block', marginBottom: '0.4rem',
                }}>
                  <Sprout size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('m.profile.skills_candidacy')}
                </span>
                {currentMembership.skillProposals.map((p: any) => (
                  <div key={p.id} style={{
                    padding: '0.5rem 0.65rem', borderRadius: 10,
                    background: p.status === 'EN_PRUEBA' ? 'rgba(16,185,129,0.06)' : 'rgba(139,92,246,0.06)',
                    border: `1px solid ${p.status === 'EN_PRUEBA' ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.2)'}`,
                    marginBottom: '0.35rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: p.status === 'EN_PRUEBA' ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {p.status === 'EN_PRUEBA' ? (
                        <Zap size={14} color="#10b981" />
                      ) : (
                        <Users size={14} color="#8b5cf6" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 600, display: 'block',
                        color: p.status === 'EN_PRUEBA' ? '#10b981' : '#8b5cf6',
                      }}>
                        {p.hashtag}
                      </span>
                      {p.status === 'EN_PRUEBA' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                          <div style={{
                            width: 60, height: 4, borderRadius: 2,
                            background: 'rgba(255,255,255,0.1)',
                          }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              width: `${(p.tasksCompleted / 7) * 100}%`,
                              background: '#10b981',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>
                            {t('m.profile.tasks_progress', { done: p.tasksCompleted })}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                          <div style={{
                            width: 40, height: 4, borderRadius: 2,
                            background: 'rgba(255,255,255,0.1)',
                          }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              width: `${(p.endorsementCount / 3) * 100}%`,
                              background: '#8b5cf6',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>
                            {t('m.profile.endorsements_progress', { done: p.endorsementCount })}
                          </span>
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: '0.55rem', fontWeight: 600,
                      color: p.status === 'EN_PRUEBA' ? '#10b981' : '#8b5cf6',
                    }}>
                      {p.status === 'EN_PRUEBA' ? t('m.profile.on_trial') : t('m.profile.pending_endorsements')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Avalar candidaturas de otros ───────────────────────── */}
            {selectedTree && (
              <button
                onClick={() => setShowEndorsePanel(true)}
                style={{
                  width: '100%', padding: '0.45rem', borderRadius: 10,
                  background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                  color: '#8b5cf6', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Users size={13} /> {t('m.profile.view_endorsements')}
              </button>
            )}

            {/* ── Expert Endorsements (Avales de Experticia) ────────── */}
            <button
              onClick={() => { setShowExpertEndorsePanel(true); }}
              style={{
                width: '100%', padding: '0.45rem', borderRadius: 10, marginTop: '0.4rem',
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                color: '#22c55e', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Shield size={13} /> Avales de experticia
            </button>

            {/* ── Migraciones Activas ─────────────────────────────────── */}
            {activeMigrations.length > 0 && (
              <div>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: '#f97316',
                  display: 'block', marginBottom: '0.4rem',
                }}>
                  <Globe size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('m.profile.skills_validation')}
                </span>
                {activeMigrations.map((mig: any) => (
                  <div key={mig.id} style={{
                    padding: '0.5rem 0.65rem', borderRadius: 10,
                    background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
                    marginBottom: '0.35rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <span style={{ fontSize: '0.85rem' }}>{mig.targetTree?.icono || '🌳'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f97316', display: 'block' }}>
                        {mig.hashtag} → {mig.targetTree?.name || ''}
                      </span>
                      <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.35)', display: 'block', marginTop: 1, fontStyle: 'italic' }}>
                        {t('m.profile.foreign_specialist', { icon: mig.sourceTree?.icono || '', name: mig.sourceTree?.name || '' })}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                        <div style={{
                          width: 50, height: 4, borderRadius: 2,
                          background: 'rgba(255,255,255,0.1)',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${(mig.tasksCompleted / 3) * 100}%`,
                            background: '#f97316',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>
                          {t('m.profile.migration_progress', { done: mig.tasksCompleted })}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.55rem', color: '#f97316', fontWeight: 600 }}>
                      {t('m.profile.on_trial')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Migraciones Aprobadas (con pretext de Tratado) ─────── */}
            {approvedMigrations.length > 0 && (
              <div>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: '#22c55e',
                  display: 'block', marginBottom: '0.4rem',
                }}>
                  <Globe size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('m.profile.imported_skills')}
                </span>
                {approvedMigrations.map((mig: any) => (
                  <div key={mig.id} style={{
                    padding: '0.5rem 0.65rem', borderRadius: 10,
                    background: mig.autoApproved ? 'rgba(234,179,8,0.06)' : 'rgba(34,197,94,0.06)',
                    border: `1px solid ${mig.autoApproved ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.15)'}`,
                    marginBottom: '0.35rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <span style={{ fontSize: '0.85rem' }}>{mig.sourceTree?.icono || '🌳'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: mig.autoApproved ? '#fbbf24' : '#22c55e', display: 'block' }}>
                        {mig.hashtag} · {mig.targetTree?.name || ''}
                      </span>
                      <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.35)', display: 'block', marginTop: 1, fontStyle: 'italic' }}>
                        {mig.autoApproved
                          ? t('m.profile.accepted_treaty', { icon: mig.sourceTree?.icono || '', name: mig.sourceTree?.name || '' })
                          : t('m.profile.validated_tasks', { icon: mig.sourceTree?.icono || '', name: mig.sourceTree?.name || '' })
                        }
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.5rem', fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                      background: mig.autoApproved ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                      color: mig.autoApproved ? '#fbbf24' : '#22c55e',
                    }}>
                      {mig.autoApproved ? t('m.profile.treaty_badge') : t('m.profile.validated_badge')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CONSTRUCTOR DE PORTAFOLIO PÚBLICO                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '0.85rem',
        display: 'flex', flexDirection: 'column', gap: '0.6rem',
      }}>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--text-secondary)',
        }}>
          {t('m.profile.public_portfolio')}
        </span>

        {/* Profile Photo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.7rem',
          padding: '0.6rem', borderRadius: 12,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ position: 'relative' }}>
            {profile.profilePic ? (
              <img
                src={`http://${window.location.hostname}:3000${profile.profilePic}`}
                alt="Perfil"
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(59,130,246,0.3)' }}
              />
            ) : (
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)', border: '2px dashed rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Camera size={18} color="rgba(255,255,255,0.3)" />
              </div>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <label
              htmlFor="profile-pic-upload"
              style={{
                fontSize: '0.72rem', fontWeight: 600, color: '#3b82f6', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              <Camera size={12} /> {profile.profilePic ? t('m.profile.change_photo') : t('m.profile.upload_photo')}
            </label>
            <input
              id="profile-pic-upload"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('image', file);
                try {
                  const { data } = await api.post('/users/profile-pic', fd);
                  setProfile((p: any) => ({ ...p, profilePic: data.url }));
                } catch {
                  alert(t('m.profile.photo_error'));
                }
              }}
            />
            {!profile.profilePic && (
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.3 }}>
                {t('m.profile.photo_required')}
              </span>
            )}
          </div>
        </div>

        {/* Identity Warning Pretext */}
        {!profile.profilePic && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
            padding: '0.5rem 0.6rem', borderRadius: 10,
            background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)',
          }}>
            <Lock size={13} color="#eab308" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: '0.6rem', color: 'rgba(234,179,8,0.8)', lineHeight: 1.4 }}>
              {t('m.profile.photo_warning')}
            </span>
          </div>
        )}

        {/* Enable/Disable Toggle */}
        <button
          disabled={!profile.profilePic}
          onClick={async () => {
            try {
              const { data } = await api.put('/users/public-profile', {
                publicProfileEnabled: !profile.publicProfileEnabled,
              });
              setProfile((p: any) => ({ ...p, ...data }));
            } catch {
              alert(t('m.profile.update_error'));
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.55rem 0.65rem', borderRadius: 10,
            background: profile.publicProfileEnabled ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${profile.publicProfileEnabled ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
            cursor: profile.profilePic ? 'pointer' : 'not-allowed',
            opacity: profile.profilePic ? 1 : 0.5,
            width: '100%',
            color: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Globe size={14} color={profile.publicProfileEnabled ? '#22c55e' : 'rgba(255,255,255,0.3)'} />
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: profile.publicProfileEnabled ? '#22c55e' : 'var(--text-secondary)' }}>
              {profile.publicProfileEnabled ? t('m.profile.public_active') : t('m.profile.public_inactive')}
            </span>
          </div>
          {profile.publicProfileEnabled
            ? <ToggleRight size={22} color="#22c55e" />
            : <ToggleLeft size={22} color="rgba(255,255,255,0.2)" />
          }
        </button>

        {/* Visibility Toggles */}
        {profile.publicProfileEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {([
              { key: 'publicShowLevels', label: t('m.profile.show_levels') },
              { key: 'publicShowTreeSize', label: t('m.profile.show_tree_size') },
              { key: 'publicShowTaskHistory', label: t('m.profile.show_task_history') },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={async () => {
                  try {
                    const { data } = await api.put('/users/public-profile', { [key]: !profile[key] });
                    setProfile((p: any) => ({ ...p, ...data }));
                  } catch {
                    alert(t('m.profile.update_error'));
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.45rem 0.6rem', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', width: '100%', color: 'inherit',
                }}
              >
                <span style={{ fontSize: '0.68rem', color: profile[key] ? '#fff' : 'var(--text-secondary)' }}>
                  {label}
                </span>
                {profile[key]
                  ? <ToggleRight size={18} color="#3b82f6" />
                  : <ToggleLeft size={18} color="rgba(255,255,255,0.15)" />
                }
              </button>
            ))}
          </div>
        )}

        {/* Public URL + Copy */}
        {profile.publicProfileEnabled && (
          <div style={{
            padding: '0.5rem 0.65rem', borderRadius: 10,
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <Globe size={12} color="#3b82f6" />
            <span style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 500, flex: 1 }}>
              /p/{profile.sharingCode?.slice(0, 8)}
            </span>
            <button
              onClick={() => {
                const url = `${window.location.origin}/p/${profile.sharingCode?.slice(0, 8)}`;
                navigator.clipboard.writeText(url);
                alert(t('m.profile.url_copied'));
              }}
              style={{
                background: 'rgba(59,130,246,0.15)', border: 'none', borderRadius: 6,
                padding: '0.25rem 0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem',
              }}
            >
              <Copy size={11} color="#3b82f6" />
              <span style={{ fontSize: '0.58rem', color: '#3b82f6', fontWeight: 600 }}>{t('m.profile.copy')}</span>
            </button>
            <button
              onClick={() => window.open(`/p/${profile.sharingCode?.slice(0, 8)}`, '_blank')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem',
              }}
            >
              <ExternalLink size={13} color="rgba(59,130,246,0.5)" />
            </button>
          </div>
        )}

        {/* Recruitment Opt-In Toggle */}
        {profile.publicProfileEnabled && (
          <button
            onClick={async () => {
              try {
                const { data } = await api.put('/users/public-profile', {
                  visibleForRecruitment: !profile.visibleForRecruitment,
                });
                setProfile((p: any) => ({ ...p, ...data }));
              } catch {
                alert(t('m.profile.update_error'));
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.55rem 0.65rem', borderRadius: 10,
              background: profile.visibleForRecruitment ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${profile.visibleForRecruitment ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer', width: '100%', color: 'inherit',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={14} color={profile.visibleForRecruitment ? '#8b5cf6' : 'rgba(255,255,255,0.3)'} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: profile.visibleForRecruitment ? '#8b5cf6' : 'var(--text-secondary)' }}>
                  {t('m.profile.recruitment_visible')}
                </span>
              </div>
              <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginLeft: '1.6rem' }}>
                {t('m.profile.recruitment_hint')}
              </span>
            </div>
            {profile.visibleForRecruitment
              ? <ToggleRight size={22} color="#8b5cf6" />
              : <ToggleLeft size={22} color="rgba(255,255,255,0.2)" />
            }
          </button>
        )}

        {/* Seeking Work Toggle */}
        {profile.visibleForRecruitment && (
          <button
            onClick={async () => {
              try {
                const { data } = await api.put('/users/public-profile', {
                  seekingWork: !profile.seekingWork,
                });
                setProfile((p: any) => ({ ...p, ...data }));
              } catch {
                alert(t('m.profile.update_error'));
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.55rem 0.65rem', borderRadius: 10,
              background: profile.seekingWork ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${profile.seekingWork ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer', width: '100%', color: 'inherit',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Briefcase size={14} color={profile.seekingWork ? '#22c55e' : 'rgba(255,255,255,0.3)'} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: profile.seekingWork ? '#22c55e' : 'var(--text-secondary)' }}>
                  {t('m.profile.seeking_work')}
                </span>
                {profile.seekingWork && (
                  <span style={{
                    fontSize: '0.45rem', fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                    background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                  }}>
                    {t('m.profile.active_badge')}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginLeft: '1.6rem' }}>
                {t('m.profile.seeking_hint')}
              </span>
            </div>
            {profile.seekingWork
              ? <ToggleRight size={22} color="#22c55e" />
              : <ToggleLeft size={22} color="rgba(255,255,255,0.2)" />
            }
          </button>
        )}
      </div>

      {/* ── Endorsement Panel ─────────────────────────────────────── */}
      {showEndorsePanel && selectedTree && (
        <SkillEndorsementPanel treeId={selectedTree} onClose={() => setShowEndorsePanel(false)} />
      )}
      {/* ── Expert Endorsement Panel ───────────────────────────────── */}
      {showExpertEndorsePanel && selectedTree && (
        <ExpertEndorsementPanel treeId={selectedTree} onClose={() => setShowExpertEndorsePanel(false)} />
      )}
    </div>
  );
}
