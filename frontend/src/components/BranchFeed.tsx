import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, Lightbulb, ArrowRight, FlaskConical, Hammer, Factory, Truck, Wrench, Recycle, ChevronRight, Check, Trash2, ChevronDown, ThumbsUp, MessageSquare, CheckCircle2, Scale } from 'lucide-react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { useTreeStore } from '../store/treeStore';
import { useAuthStore } from '../store/authStore';
import BranchModal from './BranchModal';
import DifficultyVoteModal from './DifficultyVoteModal';
import TaskCompletionModal from './TaskCompletionModal';
import EstrellaDificultad from './EstrellaDificultad';
import GenericVoteModal from './GenericVoteModal';

const diffHours = (dt1: any, dt2: any) => {
  if (!dt1 || !dt2) return 0;
  return Math.abs(new Date(dt1).getTime() - new Date(dt2).getTime()) / 36e5;
};

interface Branch {
  id: string;
  name?: string; // For independent hashtag branches
  xpPool: number;
  isDesire: boolean;
  isHashtag?: boolean;
  type?: string;
  phase: string;
  activePhasesJson?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  members: { userId: string }[];
  idea: {
    id: string;
    title: string;
    likesCount: number;
    need: { id: string; title: string; totalPointsAssigned: number; status: string };
  } | null;
  tree?: { id: string; creatorId: string | null };
  tasks?: any[];
}

const PHASES = ['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'DISTRIBUTION', 'MAINTENANCE', 'RECYCLING'] as const;
type Phase = typeof PHASES[number];

const PHASE_ICONS: Record<Phase, React.ElementType> = {
  INVESTIGATION: FlaskConical,
  DEVELOPMENT: Hammer,
  PRODUCTION: Factory,
  DISTRIBUTION: Truck,
  MAINTENANCE: Wrench,
  RECYCLING: Recycle,
};

const PHASE_COLORS: Record<Phase, { bg: string; border: string; text: string }> = {
  INVESTIGATION: { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.35)',  text: '#60a5fa' },
  DEVELOPMENT:   { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.35)',  text: '#c084fc' },
  PRODUCTION:    { bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.35)',  text: '#fb923c' },
  DISTRIBUTION:  { bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.35)',   text: '#facc15' },
  MAINTENANCE:   { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.35)',  text: '#34d399' },
  RECYCLING:     { bg: 'rgba(20,184,166,0.1)',  border: 'rgba(20,184,166,0.35)',  text: '#2dd4bf' },
};

function PhaseTimeline({ currentPhase, activePhases }: { currentPhase: string, activePhases: string[] }) {
  const { t } = useTranslation();
  const idx = activePhases.indexOf(currentPhase);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginTop: '0.85rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
      {activePhases.map((phaseStr, i) => {
        const phase = phaseStr as Phase;
        const Icon = PHASE_ICONS[phase];
        const color = PHASE_COLORS[phase];
        const isCurrent = i === idx;
        const isPast = i < idx;

        return (
          <div key={phase} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div
              title={t(`branches.phases.${phase}.name`)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                padding: '0.35rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                background: isCurrent ? color.bg : isPast ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: isCurrent ? `1px solid ${color.border}` : '1px solid transparent',
                transition: 'all 0.2s',
                minWidth: '52px',
              }}
            >
              <Icon
                size={14}
                stroke={isCurrent ? color.text : isPast ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)'}
              />
              <span style={{
                fontSize: '0.6rem', fontWeight: isCurrent ? 700 : 400, textAlign: 'center',
                color: isCurrent ? color.text : isPast ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)',
                letterSpacing: isCurrent ? '0.03em' : 0,
                lineHeight: 1.2,
              }}>
                {t(`branches.phases.${phase}.short`)}
              </span>
            </div>
            {i < activePhases.length - 1 && (
              <ChevronRight size={11} stroke={i < idx ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BranchPhaseConfigurator({ branchId, onConfigured }: { branchId: string, onConfigured: () => void }) {
  const { t } = useTranslation();
  const settings = useTreeStore(state => state.settings);
  const [selected, setSelected] = useState<Set<Phase>>(new Set(['INVESTIGATION']));
  const [loading, setLoading] = useState(false);

  const togglePhase = (phase: Phase) => {
    if (phase === 'DEVELOPMENT') return; // Cannot be untoggled
    const next = new Set(selected);
    if (next.has(phase)) next.delete(phase);
    else next.add(phase);
    setSelected(next);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.patch(`/branches/${branchId}/active_phases`, { activePhases: Array.from(selected) });
      onConfigured();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(255,255,255,0.1)' }}>
      <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
        {t('branches.configure_phases_title', 'Define Required Phases')}
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        {t('branches.configure_phases_desc', 'Select which phases will be required for this branch. Not all ideas require every phase.')}
      </p>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {settings.phases.map((phaseStr) => {
          const phase = phaseStr as Phase;
          const isSelected = selected.has(phase);
          const isRequired = phase === 'INVESTIGATION';
          const Icon = PHASE_ICONS[phase];
          return (
            <button
              key={phase}
              type="button"
              onClick={() => togglePhase(phase)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-full)',
                color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '0.75rem', fontWeight: isSelected ? 600 : 400,
                cursor: isRequired ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={12} />
              {t(`branches.phases.${phase}.short`)}
              {isSelected && !isRequired && <Check size={12} />}
            </button>
          );
        })}
      </div>
      
      <button 
        className="btn btn-primary" 
        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? '...' : t('branches.save_phases', 'Save Phases')}
      </button>
    </div>
  );
}

export default function BranchFeed({ treeId, isTreeAdmin = false, refreshTrigger = 0 }: { treeId?: string, isTreeAdmin?: boolean, refreshTrigger?: number }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [fetchingTasks, setFetchingTasks] = useState<string | null>(null);
  const [votingTask, setVotingTask] = useState<{ id: string, name: string, score?: number, comment?: string } | null>(null);
  const [completionModal, setCompletionModal] = useState<{ taskId: string; taskName: string; branchId: string; initialData?: any } | null>(null);
  const [voteModal, setVoteModal] = useState<{isOpen: boolean, branchId: string, title: string, description: string}>({
    isOpen: false, branchId: '', title: '', description: ''
  });
  const settings = useTreeStore(state => state.settings);
  const currentUser = useAuthStore((state: any) => state.user);
  const isMember = treeId ? currentUser?.memberships?.some((m: any) => m.treeId === treeId) : !!currentUser;
  const { t } = useTranslation();

  const openBranchVote = (e: React.MouseEvent, branchId: string, name: string) => {
    e.stopPropagation();
    setVoteModal({ 
      isOpen: true, 
      branchId, 
      title: t('branches.vote_priority_title', { name: name.replace(/^#/, '') }),
      description: t('branches.vote_priority_desc', 'Asigna del 1 al 10 qué tan necesaria es esta rama para el éxito del Árbol.')
    });
  };

  const handleVoteConfirm = async (value: number) => {
    try {
      await api.post(`/branches/${voteModal.branchId}/vote`, { points: value });
      setVoteModal({ ...voteModal, isOpen: false });
      fetchBranches();
    } catch (e) {
      console.error(e);
    }
  };

  // Refresh when treeId changes OR when specifically requested from parent
  useEffect(() => { fetchBranches(); }, [treeId, refreshTrigger]);

  // Sync: Close voting modal if the accordion is closed or changed
  useEffect(() => {
    setVotingTask(null);
  }, [expandedBranchId]);

  const fetchBranches = async () => {
    try {
      const url = treeId ? `/branches?treeId=${treeId}` : '/branches';
      const { data } = await api.get(url);
      setBranches(data.filter((branch: Branch) => branch.type !== 'AUTOSUSTENTO'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (e: React.MouseEvent, branchId: string) => {
    e.stopPropagation();
    if (expandedBranchId === branchId) {
      setExpandedBranchId(null);
      return;
    }

    setExpandedBranchId(branchId);
    
    // Check if tasks already loaded
    const branch = branches.find(b => b.id === branchId);
    if (branch && !branch.tasks) {
      setFetchingTasks(branchId);
      try {
        const { data } = await api.get(`/branches/${branchId}/tasks`);
        setBranches(prev => prev.map(b => b.id === branchId ? { ...b, tasks: data } : b));
      } catch (err) {
        console.error('Error fetching branch tasks:', err);
      } finally {
        setFetchingTasks(null);
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, branchId: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`¿Estás seguro de que quieres eliminar la rama #${name}?`)) return;
    try {
      await api.delete(`/branches/${branchId}`);
      fetchBranches();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al eliminar la rama');
    }
  };

  const handleLikeVote = async (e: React.MouseEvent, voteId: string, taskId: string, branchId: string) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/tasks/difficulty-votes/${voteId}/like`);
      // Update local state
      setBranches(prev => prev.map(b => {
        if (b.id !== branchId) return b;
        return {
          ...b,
          tasks: b.tasks?.map(t => {
            if (t.id !== taskId) return t;
            return {
              ...t,
              difficultyVotes: t.difficultyVotes.map((v: any) => {
                if (v.id !== voteId) return v;
                return {
                  ...v,
                  isLikedByMe: data.liked,
                  likesCount: data.liked ? v.likesCount + 1 : v.likesCount - 1
                };
              })
            };
          })
        };
      }));
    } catch (err) {
      console.error('Error liking vote:', err);
    }
  };

  const handleCompleteTask = (e: React.MouseEvent, taskId: string, taskName: string, branchId: string) => {
    e.stopPropagation();
    setCompletionModal({ taskId, taskName, branchId });
  };

  const handleCompletionSuccess = (branchId: string, taskId: string, xpAwarded: number) => {
    // Update task status locally
    setBranches(prev => prev.map(b => {
      if (b.id !== branchId) return b;
      return {
        ...b,
        tasks: b.tasks?.map(t => t.id === taskId ? { ...t, status: 'COMPLETED' } : t)
      };
    }));
    setCompletionModal(null);
    if (xpAwarded > 0) {
      // Brief notification via console — parent can show a toast if needed
      console.log(`[BranchFeed] +${xpAwarded} XP otorgado`);
    }
  };

  if (loading) return null;

  if (branches.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        {t('branches.empty')}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {branches.map((branch, idx) => {
        const phase = branch.phase as Phase;
        const color = PHASE_COLORS[phase] || PHASE_COLORS.INVESTIGATION;
        const PhaseIcon = PHASE_ICONS[phase] || FlaskConical;
        
        let activePhases = settings.phases.slice();
        if (branch.activePhasesJson) {
           try { activePhases = JSON.parse(branch.activePhasesJson); } catch (e) {}
        }

        const isConfigured = !!branch.activePhasesJson;
        const showConfigurator = branch.phase === 'INVESTIGATION' && !isConfigured;

        return (
          <motion.div
            key={branch.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="glass-panel"
            style={{
              padding: '1.5rem',
              marginBottom: '1rem',
              border: branch.expiresAt && (new Date(branch.expiresAt).getTime() - new Date().getTime() < 24 * 60 * 60 * 1000) 
                 ? '2px solid var(--accent-danger)' 
                 : undefined,
            }}
          >
            {/* Expiration Badge */}
            {branch.expiresAt && (new Date(branch.expiresAt).getTime() - new Date().getTime() < 24 * 60 * 60 * 1000) && (
              <div style={{ 
                background: 'var(--accent-danger)', color: 'white', 
                padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)', 
                fontSize: '0.7rem', fontWeight: 700, marginBottom: '0.75rem',
                display: 'inline-block', alignSelf: 'flex-start'
              }}>
                EXPIRA PRONTO: Menos de 24h
              </div>
            )}
            {/* Top row: title + branch badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                < GitBranch size={15} stroke="var(--accent-success)" />
                <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>{branch.name || branch.idea?.title}</h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                  color: branch.isHashtag ? 'var(--accent-warning)' : 'var(--accent-success)', 
                  background: branch.isHashtag ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                  borderRadius: 'var(--radius-full)', padding: '0.18rem 0.55rem', letterSpacing: '0.05em',
                }}>
                  {branch.isHashtag ? 'HASHTAG' : settings.dictionary.branchName}
                </span>

                {isMember && (
                  <button 
                    onClick={(e) => openBranchVote(e, branch.id, branch.name || branch.idea?.title || '')}
                    style={{ 
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px', display: 'flex', alignItems: 'center',
                      color: 'var(--accent-primary)', opacity: 0.6
                    }}
                    title="Votar necesidad de esta rama"
                  >
                    <Scale size={18} strokeWidth={2.5} />
                  </button>
                )}

                {branch.isHashtag && isTreeAdmin && (
                  <button
                    onClick={(e) => handleDelete(e, branch.id, (branch.name || branch.idea?.title || '').replace(/^#/, ''))}
                    style={{
                      background: 'none', border: 'none', color: 'var(--accent-danger)',
                      cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                      opacity: 0.6, transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                    title="Eliminar Hashtag"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Originated from need */}
            {!branch.isHashtag && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                <Lightbulb size={11} stroke="var(--text-secondary)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {t('branches.originated_from')}:{' '}
                  <span style={{ color: 'var(--text-accent)', fontWeight: 500 }}>{branch.idea?.need?.title || 'N/A'}</span>
                </span>
              </div>
            )}

            {/* Current phase pill */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              background: color.bg, border: `1px solid ${color.border}`,
              borderRadius: 'var(--radius-full)', padding: '0.3rem 0.75rem',
              marginBottom: '0.25rem',
            }}>
              <PhaseIcon size={13} stroke={color.text} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: color.text }}>
                {t(`branches.phases.${phase}.name`)}
              </span>
            </div>

            {/* Phase description */}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0.5rem 0', lineHeight: 1.55 }}>
              {t(`branches.phases.${phase}.desc`)}
            </p>

            {/* Timeline or Configurator */}
            {showConfigurator && isMember ? (
              <BranchPhaseConfigurator branchId={branch.id} onConfigured={fetchBranches} />
            ) : (
              <PhaseTimeline currentPhase={branch.phase} activePhases={activePhases} />
            )}

            {/* Stats + link row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1.5rem',
              borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem', marginTop: '0.85rem',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t('branches.members')}</span>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{branch.members.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t('branches.xp_pool')}</span>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent-warning)' }}>
                  {Math.floor(branch.xpPool)} XP
                </span>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                {branch.idea && (
                  <a
                    href={`#need-${branch.idea.need?.id}`}
                    onClick={e => {
                      e.preventDefault();
                      const id = branch.idea?.need?.id;
                      if (id) document.getElementById(`need-${id}`)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      fontSize: '0.78rem', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500,
                    }}
                  >
                    {t('branches.view_need')} <ArrowRight size={12} />
                  </a>
                )}
              </div>
            </div>

            {/* Centered Expansion Toggle at Bottom */}
            <div style={{ 
              display: 'flex', justifyContent: 'center', padding: '0.4rem 0', 
              marginTop: '0.25rem', borderTop: '1px solid rgba(255,255,255,0.03)'
            }}>
              <div 
                onClick={(e) => toggleExpand(e, branch.id)}
                style={{ 
                  cursor: 'pointer', padding: '0.2rem', borderRadius: '50%', 
                  background: expandedBranchId === branch.id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px'
                }}
              >
                <motion.div
                  animate={{ rotate: expandedBranchId === branch.id ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown size={20} stroke={expandedBranchId === branch.id ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
                </motion.div>
              </div>
            </div>

            {/* Accordion content */}
            <AnimatePresence>
              {expandedBranchId === branch.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ 
                    padding: '1rem 0', borderTop: '1px solid rgba(255,255,255,0.06)', 
                    display: 'flex', flexDirection: 'column', gap: '0.75rem' 
                  }}>
                    <h5 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      Tareas de la Rama
                    </h5>
                    
                    {fetchingTasks === branch.id ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cargando tareas...</p>
                    ) : branch.tasks && branch.tasks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {branch.tasks.map((task: any) => (
                          <div 
                             key={task.id} 
                             style={{ 
                               display: 'flex', flexDirection: 'column', gap: '0.5rem',
                               padding: '0.75rem', background: 'rgba(255,255,255,0.03)',
                               borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)'
                             }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {/* Replaced old difficulty circle with the interactive star next to the name */}
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', flex: 1, fontWeight: 500, textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none' }}>
                                {task.name}
                              </span>

                              {task.status === 'COMPLETED' && (() => {
                                const isAuthor = task.assignedTo === currentUser?.id;
                                const hours = diffHours(new Date(), task.completedAt);
                                const canEdit = isAuthor && hours < 24 && !task.auditada;
                                
                                const treeMembership = currentUser?.memberships?.find((m: any) => m.treeId === treeId);
                                const isAuditor = (treeMembership?.level >= 3) || (branch.tree?.creatorId === currentUser?.id);
                                const canAudit = !isAuthor && isAuditor;

                                const handleStarClick = () => {
                                  if (canEdit) {
                                    setCompletionModal({ taskId: task.id, taskName: task.name, branchId: branch.id, initialData: task });
                                  } else if (canAudit) {
                                    // TODO: Implement Audit/Evidence View Modal
                                    alert(`Visto de evidencia para: ${task.name}\nComentario: ${task.completionComment || 'Sin comentario'}`);
                                  }
                                };

                                return (
                                  <div style={{ marginLeft: 'auto', paddingLeft: '0.6rem', marginRight: '0.8rem' }}>
                                    <EstrellaDificultad 
                                      nota={task.difficulty} 
                                      size={24} 
                                      onClick={(canEdit || canAudit) ? handleStarClick : undefined}
                                    />
                                  </div>
                                );
                              })()}
                              <span style={{ 
                                fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)',
                                padding: '0.15rem 0.6rem', borderRadius: 'var(--radius-full)', border: '1px solid rgba(255,255,255,0.08)'
                              }}>
                                {task.status}
                              </span>
                              
                              {/* Complete Task Button (Desktop Only) */}
                              {isMember && task.status !== 'COMPLETED' && (
                                <button
                                  className="desktop-only"
                                  onClick={(e) => handleCompleteTask(e, task.id, task.name, branch.id)}
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.2)',
                                    color: 'var(--accent-success)',
                                    padding: '0.35rem',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                                  title="Marcar como Completada"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                            </div>

                            {/* Anonymous Comments Feed */}
                            {task.difficultyVotes && task.difficultyVotes.length > 0 && (
                              <div style={{ 
                                marginTop: '0.4rem', padding: '0.5rem 0.75rem', 
                                background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)',
                                display: 'flex', flexDirection: 'column', gap: '0.6rem'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.65rem', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  <MessageSquare size={10} /> Feedback de la Comunidad
                                </div>
                                {task.difficultyVotes.filter((v: any) => v.comment).map((vote: any) => (
                                  <div key={vote.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Usuario Anónimo: </span>
                                        {vote.comment}
                                      </p>
                                    </div>
                                    <button
                                      onClick={(e) => handleLikeVote(e, vote.id, task.id, branch.id)}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                                        background: vote.isLikedByMe ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                                        border: '1px solid',
                                        borderColor: vote.isLikedByMe ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                                        borderRadius: 'var(--radius-full)', padding: '0.15rem 0.5rem',
                                        color: vote.isLikedByMe ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        fontSize: '0.7rem', cursor: 'pointer', transition: 'all 0.2s'
                                      }}
                                    >
                                      <ThumbsUp size={10} fill={vote.isLikedByMe ? 'currentColor' : 'none'} />
                                      {vote.likesCount}
                                    </button>
                                  </div>
                                ))}
                                {task.difficultyVotes.every((v: any) => !v.comment) && (
                                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    Votos emitidos sin comentarios.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No hay tareas aún.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
      
      <AnimatePresence>
        {selectedBranch && (
          <BranchModal 
             branch={selectedBranch} 
             isMember={isMember}
             onClose={() => setSelectedBranch(null)} 
             onUpdate={() => {
               fetchBranches();
               setSelectedBranch(null); 
             }} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {votingTask && (
          <DifficultyVoteModal
            taskId={votingTask.id}
            taskName={votingTask.name}
            initialScore={votingTask.score}
            onClose={() => setVotingTask(null)}
            onSuccess={(_newDifficulty) => {
              // Refresh tasks for the specific branch to see the new consensus and vote
              if (expandedBranchId) {
                api.get(`/branches/${expandedBranchId}/tasks`).then(({ data }) => {
                  setBranches(prev => prev.map(b => b.id === expandedBranchId ? { ...b, tasks: data } : b));
                });
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {completionModal && (
          <TaskCompletionModal
            taskId={completionModal.taskId}
            taskName={completionModal.taskName}
            initialData={completionModal.initialData}
            onClose={() => setCompletionModal(null)}
            onSuccess={(xpAwarded) => handleCompletionSuccess(completionModal.branchId, completionModal.taskId, xpAwarded)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voteModal.isOpen && (
          <GenericVoteModal
            isOpen={voteModal.isOpen}
            title={voteModal.title}
            description={voteModal.description}
            onClose={() => setVoteModal({ ...voteModal, isOpen: false })}
            onConfirm={handleVoteConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
