import { useState, useEffect, useMemo, useRef } from 'react';
import { Hammer, ChevronDown, ChevronRight, Scale, Hand, CheckCircle2, Star, Hourglass, Globe, Camera, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import GenericVoteModal from './GenericVoteModal';
import TaskCompletionModal from './TaskCompletionModal';
import EstrellaDificultad from './EstrellaDificultad';

async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<Blob> {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
    || file.name.toLowerCase().endsWith('.heic')
    || file.name.toLowerCase().endsWith('.heif');
  if (isHeic) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      );
    });
  } catch {
    return file;
  }
}

const diffHours = (dt1: any, dt2: any) => {
  if (!dt1 || !dt2) return 0;
  return Math.abs(new Date(dt1).getTime() - new Date(dt2).getTime()) / 36e5;
};

export default function GlobalTaskFeed() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [voteModal, setVoteModal] = useState<{
    isOpen: boolean; title: string; description: string; type: 'branch' | 'task'; id: string;
  }>({ isOpen: false, title: '', description: '', type: 'branch', id: '' });
  
  const [completionModal, setCompletionModal] = useState<{ taskId: string; taskName: string; branchId: string; initialData?: any } | null>(null);
  const [userTrees, setUserTrees] = useState<any[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string>('all');
  const [showHistory, setShowHistory] = useState(false);

  // Start-photo modal state
  const [assignModal, setAssignModal] = useState<{ taskId: string; taskName: string } | null>(null);
  const [startPhotoBlob, setStartPhotoBlob] = useState<Blob | null>(null);
  const [startPhotoPreview, setStartPhotoPreview] = useState<string | null>(null);
  const [assignUploading, setAssignUploading] = useState(false);
  const startPhotoInputRef = useRef<HTMLInputElement>(null);

  const user = useAuthStore((state: any) => state.user);
  const isInstallPromptVisible = useAuthStore((state: any) => state.isInstallPromptVisible);

  const fetchTasks = async () => {
    try {
      const { data } = await api.get('/tasks/pending');
      const uniqueData = Array.isArray(data) ? Array.from(new Map(data.map((t: any) => [t.id, t])).values()) : [];
      setTasks(uniqueData);
    } catch (e) {
      console.error('Error fetching tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrees = async () => {
    try {
      const { data } = await api.get('/trees');
      setUserTrees(data || []);
    } catch (e) {
      console.error('Error fetching user trees:', e);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchTrees();
  }, []);

  // Handlers
  const openBranchVote = (e: React.MouseEvent, branchId: string, branchName: string) => {
    e.stopPropagation();
    setVoteModal({
      isOpen: true,
      title: 'Prioridad de Necesidad',
      description: `¿Qué tan necesaria es la rama: ${branchName}?`,
      type: 'branch',
      id: branchId
    });
  };

  const openTaskVote = (taskId: string, taskName: string) => {
    setVoteModal({
      isOpen: true,
      title: 'Dificultad de Tarea',
      description: `Vota la dificultad percibida para: ${taskName}`,
      type: 'task',
      id: taskId
    });
  };

  const handleVoteConfirm = async (value: number) => {
    const { type, id } = voteModal;
    try {
      if (type === 'branch') {
        await api.post(`/branches/${id}/vote`, { score: value });
      } else {
        await api.post(`/tasks/${id}/difficulty-vote`, { score: value });
      }
      setVoteModal({ ...voteModal, isOpen: false });
      fetchTasks();
    } catch (err) {
      alert('Error al registrar el voto');
    }
  };

  const handleAssignTask = (taskId: string, taskName?: string) => {
    setAssignModal({ taskId, taskName: taskName || 'Tarea' });
    setStartPhotoBlob(null);
    setStartPhotoPreview(null);
  };

  const handleStartPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (startPhotoPreview && startPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(startPhotoPreview);
    try {
      const compressed = await compressImage(file);
      setStartPhotoBlob(compressed);
      setStartPhotoPreview(URL.createObjectURL(compressed));
    } catch {
      setStartPhotoBlob(file);
      setStartPhotoPreview(URL.createObjectURL(file));
    }
    if (startPhotoInputRef.current) startPhotoInputRef.current.value = '';
  };

  const confirmAssign = async (withPhoto: boolean) => {
    if (!assignModal) return;
    setAssignUploading(true);
    try {
      let startPhotoUrl: string | undefined;
      if (withPhoto && startPhotoBlob) {
        const formData = new FormData();
        formData.append('file', startPhotoBlob, 'start_evidence.jpg');
        formData.append('visibility', 'TASK_PARTICIPANTS');
        const { data: uploadData } = await api.post(`/tasks/${assignModal.taskId}/evidence`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        startPhotoUrl = uploadData.downloadUrl || uploadData.url;
      }
      await api.post(`/tasks/${assignModal.taskId}/assign`, { startPhotoUrl });
      setAssignModal(null);
      fetchTasks();
    } catch (err) {
      alert('Error al tomar la tarea');
    } finally {
      setAssignUploading(false);
    }
  };

  const openCompletionModal = (taskId: string, taskName: string, branchId: string, initialData?: any) => {
    setCompletionModal({ taskId, taskName, branchId, initialData });
  };

  const handleCompletionSuccess = () => {
    setCompletionModal(null);
    fetchTasks();
  };

  // Internal grouping and sorting logic applied to any task array
  const processGroups = (taskArray: any[]) => {
    return taskArray.reduce((acc: any[], task) => {
      if (!task) return acc;
      const branchId = task.branch?.id || 'other';
      const branchName = (task.branch?.name || task.branch?.idea?.title || 'Otras Tareas').toUpperCase();
      const branchPoints = task.branch?.totalPoints || 0;

      let group = acc.find(g => g.id === branchId);
      if (!group) {
        group = { id: branchId, name: branchName, points: branchPoints, tasks: [] };
        acc.push(group);
      }
      group.tasks.push(task);
      return acc;
    }, [])
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .map(group => ({
      ...group,
      tasks: [...group.tasks].sort((a, b) => 
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      )
    }));
  };

  // Reactive filtering by selected tree
  const filteredTasks = useMemo(() => {
    if (selectedTreeId === 'all') return tasks;
    return tasks.filter((t: any) => {
      if (!t?.branch) return false;
      // 1. Direct treeId in branch (for hashtags)
      if (t.branch.treeId === selectedTreeId) return true;
      // 2. treeId in treeLinks (for traditional branches)
      const links = t.branch.idea?.need?.treeLinks || [];
      return links.some((l: any) => l.treeId === selectedTreeId);
    });
  }, [tasks, selectedTreeId]);

  // Macro-Sections Split
  const splitTasks = useMemo(() => {
    const myTasks: any[] = [];
    const pendingTasks: any[] = [];
    const othersTasks: any[] = [];
    const completedTasks: any[] = [];
    const historyTasks: any[] = [];

    filteredTasks.forEach(t => {
      const isCompleted = t.status === 'COMPLETED';
      const isAudited = t.auditada;
      const daysSinceCompletion = (isCompleted && t.completedAt) ? diffHours(new Date(), t.completedAt) / 24 : 0;
      
      const isHistory = (isCompleted && daysSinceCompletion > 30) || isAudited;

      if (showHistory) {
         if (isHistory) historyTasks.push(t);
      } else {
         if (isHistory) return; // Omitir del feed activo por defecto

         if (isCompleted) {
           completedTasks.push(t);
         } else if (t.assignedTo === user?.id) {
           myTasks.push(t);
         } else if (!t.assignedTo) {
           pendingTasks.push(t);
         } else {
           othersTasks.push(t);
         }
      }
    });

    return {
      my: processGroups(myTasks),
      pending: processGroups(pendingTasks),
      others: processGroups(othersTasks),
      completed: processGroups(completedTasks),
      history: processGroups(historyTasks)
    };
  }, [filteredTasks, user?.id, showHistory]);

  // Auto-expand logic for all groups
  useEffect(() => {
    setExpandedGroups(prev => {
      const next = { ...prev };
      let changed = false;
      const allGroups = [...splitTasks.my, ...splitTasks.pending, ...splitTasks.others, ...splitTasks.completed, ...(splitTasks.history || [])];
      
      allGroups.forEach(group => {
        if (next[group.id] === undefined) {
          next[group.id] = true;
          changed = true;
        }
      });
      
      return changed ? next : prev;
    });
  }, [splitTasks]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  if (loading) return <div className="p-4 text-center" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Actualizando ecosistema...</div>;

  const renderMacroSection = (title: string, groups: any[], bgColor: string, textColor = 'var(--text-secondary)') => {
    if (groups.length === 0) return null;

    return (
      <section style={{ background: bgColor, borderRadius: 'var(--radius-lg)', margin: '0.5rem 0', padding: '0.5rem' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, margin: '0.5rem 0.5rem 0.75rem', color: textColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h3>
        <div className="flex flex-col gap-1">
          {groups.map((group) => {
            const isExpanded = expandedGroups[group.id];
            
            return (
              <div key={group.id} className="flex flex-col">
                <div 
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.6rem 0.5rem', background: 'transparent',
                    border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    {isExpanded ? <ChevronDown size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />}
                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                      {group.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', opacity: 0.6, fontWeight: 600 }}>
                      ({Math.round(group.points || 0)} pts)
                    </span>
                  </div>
                  
                  <button 
                    onClick={(e) => openBranchVote(e, group.id, group.name)}
                    style={{ 
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent-primary)', opacity: 0.6
                    }}
                    title="Votar necesidad de esta rama"
                  >
                    <Scale size={18} strokeWidth={2.5} />
                  </button>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="flex flex-col gap-3 pb-3" style={{ borderLeft: '2px solid rgba(255,255,255,0.05)', marginLeft: '1.1rem', paddingLeft: '0.75rem' }}>
                        {group.tasks.map((task: any) => {
                          if (!task) return null;
                          const isAssignedToMe = task?.assignedTo === user?.id;
                          const isAssignedToOther = task?.assignedTo && task?.assignedTo !== user?.id;
                          const isFree = !task?.assignedTo;
                          const isCompleted = task?.status === 'COMPLETED';

                          return (
                            <div key={task?.id} style={{ display: 'flex', flexDirection: 'column' }}>
                              <div 
                                style={{ 
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  fontSize: '0.85rem', color: isCompleted ? 'rgba(255,255,255,0.4)' : 'var(--text-secondary)',
                                  lineHeight: '1.4'
                                }}
                              >
                                <span style={{ flex: 1, paddingRight: '0.5rem', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                                  {task?.name}
                                </span>

                                {/* Foreign Specialist Badge */}
                                {isCompleted && task?.foreignStatus?.isForeign && (
                                  <span
                                    title={task.foreignStatus.migrations.map((m: any) =>
                                      `${m.hashtag} de ${m.sourceTreeIcon || ''} ${m.sourceTreeName} (${m.tasksCompleted}/${m.tasksRequired})`
                                    ).join('\n')}
                                    style={{
                                      fontSize: '0.5rem', fontWeight: 700,
                                      padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                                      background: 'rgba(249,115,22,0.12)', color: '#f97316',
                                      border: '1px solid rgba(249,115,22,0.25)',
                                      display: 'flex', alignItems: 'center', gap: '0.2rem',
                                    }}
                                  >
                                    <Globe size={9} /> Extranjero
                                  </span>
                                )}

                                {isCompleted && (() => {
                                  const isAuthor = task?.assignedTo === user?.id;
                                  const hours = diffHours(new Date(), task?.completedAt);
                                  const canEdit = isAuthor && hours < 24 && !task?.auditada;
                                  
                                  const treeId = task?.branchId;
                                  const treeMembership = user?.memberships?.find((m: any) => m.treeId === treeId);
                                  const isAuditor = (treeMembership?.level >= 3) || (task?.branch?.tree?.creatorId === user?.id);
                                  const canAudit = !isAuthor && isAuditor;

                                  const handleStarClick = () => {
                                    if (canEdit) {
                                      openCompletionModal(task.id, task.name, task.branchId, task);
                                    } else if (canAudit) {
                                      const foreignInfo = task?.foreignStatus?.isForeign
                                        ? `\n\n⚠️ ESPECIALISTA EXTRANJERO EN PRUEBA\n${task.foreignStatus.migrations.map((m: any) =>
                                            `${m.hashtag} de ${m.sourceTreeIcon || ''} ${m.sourceTreeName} — ${m.tasksCompleted}/${m.tasksRequired} tareas`
                                          ).join('\n')}\nRequiere auditoría estricta.`
                                        : '';
                                      alert(`Auditoría de: ${task.name}\nEvidencia: ${task.completionComment || 'Sin comentario'}${foreignInfo}`);
                                    }
                                  };

                                  return (
                                    <div style={{ marginLeft: 'auto', paddingLeft: '0.5rem', marginRight: '0.6rem' }}>
                                      <EstrellaDificultad 
                                        nota={task.difficulty} 
                                        size={22} 
                                        onClick={(canEdit || canAudit) ? handleStarClick : undefined}
                                      />
                                    </div>
                                  );
                                })()}
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  {!isCompleted && isFree && (
                                    <button onClick={() => handleAssignTask(task.id, task.name)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px' }} title="Tomar tarea">
                                      <Hand size={18} />
                                    </button>
                                  )}
                                  {!isCompleted && isAssignedToMe && (
                                    <button onClick={() => openCompletionModal(task.id, task.name, task.branchId)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', color: 'var(--accent-success)', cursor: 'pointer', padding: '4px', transition: 'transform 0.2s' }} title="Completar tarea">
                                      <CheckCircle2 size={18} />
                                    </button>
                                  )}
                                  {!isCompleted && isAssignedToOther && (
                                    <button onClick={() => openTaskVote(task?.id, task?.name)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', color: 'var(--accent-warning)', cursor: 'pointer', padding: '4px' }} title="Evaluar esfuerzo">
                                      <Star size={18} />
                                    </button>
                                  )}
                                </div>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
        <Hammer size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p style={{ margin: 0, fontWeight: 600 }}>No hay tareas aún.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-2 pb-8" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Tree Selector Dropdown */}
      <div style={{ padding: '0 0.5rem 1rem' }}>
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.75rem', 
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <Star size={16} style={{ color: 'var(--accent-primary)', opacity: 0.8 }} />
          <select 
            value={selectedTreeId}
            onChange={(e) => setSelectedTreeId(e.target.value)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-primary)',
              fontSize: '0.85rem', fontWeight: 700, width: '100%', outline: 'none',
              appearance: 'none', cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            <option value="all" style={{ background: '#1a1a1a', color: 'white' }}>Todos los Árboles</option>
            {userTrees.map(tree => (
              <option key={tree.id} value={tree.id} style={{ background: '#1a1a1a', color: 'white' }}>
                {tree.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} style={{ opacity: 0.4 }} />
        </div>
      </div>

      {showHistory ? (
        renderMacroSection('Historial Consolidado', splitTasks.history || [], 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.5)')
      ) : (
        <>
          {renderMacroSection('Mis Tareas', splitTasks.my, 'transparent')}
          {renderMacroSection('Disponibles / Pendientes', splitTasks.pending, 'rgba(34, 197, 94, 0.08)', 'rgba(34, 197, 94, 0.8)')}
          {renderMacroSection('En Progreso (Otros)', splitTasks.others, 'rgba(255, 170, 0, 0.08)', 'rgba(255, 170, 0, 0.8)')}
          {renderMacroSection('Completadas Recientes', splitTasks.completed, 'rgba(59, 130, 246, 0.08)', 'rgba(59, 130, 246, 0.8)')}
        </>
      )}

      {/* History Floating Button */}
      <div style={{ 
        position: 'fixed', 
        bottom: isInstallPromptVisible ? '10rem' : '5rem', 
        right: '1.5rem', 
        zIndex: 100,
        transition: 'bottom 0.3s ease-in-out'
      }}>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            width: '56px', height: '56px',
            borderRadius: '16px',
            background: showHistory ? 'var(--accent-primary)' : 'var(--surface-color)',
            color: showHistory ? 'white' : 'var(--text-secondary)',
            border: `1px solid ${showHistory ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
          title={showHistory ? 'Ver Tareas Activas' : 'Ver Historial de Tareas'}
        >
          <Hourglass size={24} />
        </button>
      </div>

      <GenericVoteModal 
        isOpen={voteModal.isOpen}
        title={voteModal.title}
        description={voteModal.description}
        onClose={() => setVoteModal({ ...voteModal, isOpen: false })}
        onConfirm={handleVoteConfirm}
      />

      <AnimatePresence>
        {completionModal && (
          <TaskCompletionModal
            taskId={completionModal.taskId}
            taskName={completionModal.taskName}
            initialData={completionModal.initialData}
            onClose={() => setCompletionModal(null)}
            onSuccess={handleCompletionSuccess}
          />
        )}
      </AnimatePresence>

      {/* ── Start Photo Modal (on assign) ──────────────────────────── */}
      <AnimatePresence>
        {assignModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !assignUploading && setAssignModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420,
                background: 'var(--bg-card, #1a1a2e)', borderRadius: '20px 20px 0 0',
                padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  <Hand size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Tomar Tarea
                </h3>
                <button onClick={() => !assignUploading && setAssignModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {assignModal.taskName}
              </p>

              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                ¿Deseas subir una foto del estado inicial? Esta foto se mostrará junto a la evidencia final para que otros puedan comparar el antes y después.
              </p>

              {/* Photo preview */}
              {startPhotoPreview && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={startPhotoPreview}
                    alt="Foto de inicio"
                    style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }}
                  />
                  <button
                    onClick={() => {
                      if (startPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(startPhotoPreview);
                      setStartPhotoBlob(null);
                      setStartPhotoPreview(null);
                    }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'white',
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Upload button */}
              {!startPhotoPreview && (
                <button
                  onClick={() => startPhotoInputRef.current?.click()}
                  style={{
                    padding: '0.75rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px dashed rgba(255,255,255,0.2)',
                    color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <Camera size={18} /> Subir foto de inicio
                </button>
              )}
              <input
                ref={startPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                capture="environment"
                onChange={handleStartPhotoSelect}
                style={{ display: 'none' }}
              />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  disabled={assignUploading}
                  onClick={() => confirmAssign(false)}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.8rem',
                    cursor: assignUploading ? 'not-allowed' : 'pointer',
                    opacity: assignUploading ? 0.5 : 1,
                  }}
                >
                  Saltar
                </button>
                <button
                  disabled={assignUploading}
                  onClick={() => confirmAssign(!!startPhotoBlob)}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12,
                    background: startPhotoBlob ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.15)',
                    border: `1px solid ${startPhotoBlob ? 'rgba(16,185,129,0.4)' : 'rgba(234,179,8,0.3)'}`,
                    color: startPhotoBlob ? '#10b981' : '#eab308', fontWeight: 700, fontSize: '0.8rem',
                    cursor: assignUploading ? 'not-allowed' : 'pointer',
                    opacity: assignUploading ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {assignUploading ? <Loader2 size={16} className="animate-spin" /> : <Hand size={16} />}
                  {assignUploading ? 'Subiendo...' : startPhotoBlob ? 'Tomar con foto' : 'Tomar tarea'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
