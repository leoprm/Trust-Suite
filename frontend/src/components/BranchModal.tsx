import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, GitBranch, FlaskConical, Hammer, Factory, Truck, Wrench, Recycle, Check, Plus, Package, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useTreeStore } from '../store/treeStore';
import { TaskCard, TaskForm } from './TaskComponents';

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

interface BranchModalProps {
  branch: any;
  isMember?: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function BranchModal({ branch, isMember = false, onClose, onUpdate }: BranchModalProps) {
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const settings = useTreeStore(state => state.settings);
  
  let activePhases: Phase[] = ['INVESTIGATION'];
  if (branch.activePhasesJson) {
     try { activePhases = JSON.parse(branch.activePhasesJson); } catch (e) {}
  }

  const [currentTab, setCurrentTab] = useState<Phase>(branch.phase as Phase);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [deliverable, setDeliverable] = useState<any>(null);
  const [loadingDeliverable, setLoadingDeliverable] = useState(false);
  const [newDeliverableUrl, setNewDeliverableUrl] = useState('');
  const [ratingValue, setRatingValue] = useState<number>(5.0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [completingPhase, setCompletingPhase] = useState(false);

  const isMemberOfPhase = (phase: Phase) => {
    if (!user) return false;
    const member = branch.members.find((m: any) => m.userId === user.id);
    if (!member) return false;
    try {
      const joined = JSON.parse(member.joinedPhases || '[]');
      return joined.includes(phase);
    } catch { return false; }
  };

  useEffect(() => {
    fetchTasks();
    fetchDeliverable();
    setShowTaskForm(false);
  }, [currentTab]);

  const fetchDeliverable = async () => {
    setLoadingDeliverable(true);
    setNewDeliverableUrl('');
    setRatingValue(5.0);
    try {
      const { data } = await api.get(`/deliverables/branches/${branch.id}/phases/${currentTab}`);
      setDeliverable(data);
    } catch {
      setDeliverable(null);
    } finally {
      setLoadingDeliverable(false);
    }
  };

  const fetchTasks = async () => {
    setLoadingTasks(true);
    try {
      const { data } = await api.get(`/branches/${branch.id}/tasks?phase=${currentTab}`);
      setTasks(data);
    } catch (error) {
       // Silently fail if route doesn't exist yet, we will mock or implement later
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleJoinPhase = async () => {
    setJoining(true);
    try {
      await api.post(`/branches/${branch.id}/phases/${currentTab}/join`);
      onUpdate(); // refresh branch data in parent
    } catch (error) {
      console.error('Failed to join phase', error);
    } finally {
      setJoining(false);
    }
  };

  const memberOfCurrent = isMemberOfPhase(currentTab);

  const handleSubmitDeliverable = async () => {
    if (!newDeliverableUrl.trim()) return;
    try {
      await api.post(`/deliverables/branches/${branch.id}/phases/${currentTab}`, { deliverableUrl: newDeliverableUrl });
      fetchDeliverable();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit deliverable');
    }
  };

  const handleSubmitRating = async () => {
    if (!deliverable) return;
    setSubmittingRating(true);
    try {
      await api.post(`/deliverables/${deliverable.id}/rate`, { rating: ratingValue });
      fetchDeliverable();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to rate deliverable');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleCompletePhase = async () => {
    if (!deliverable) return;
    if (!confirm('Are you sure you want to complete this phase and distribute XP?')) return;
    setCompletingPhase(true);
    try {
      const { data } = await api.post(`/deliverables/${deliverable.id}/complete`);
      alert(`Phase Completed! XP Awarded: ${data.xpAwarded.toFixed(2)}`);
      fetchDeliverable();
      onUpdate();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to complete phase');
    } finally {
      setCompletingPhase(false);
    }
  };

  const userRating = deliverable?.ratings?.find((r: any) => r.userId === user?.id);
  const totalRatings = deliverable?.ratings?.length || 0;
  const averageRating = totalRatings > 0 
    ? (deliverable.ratings.reduce((acc: number, cur: any) => acc + cur.rating, 0) / totalRatings)
    : 0;
  
  const isBranchPhaseCompleted = deliverable?.status === 'COMPLETED';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: 'var(--surface-color)', width: '100%', maxWidth: '800px',
          maxHeight: '90vh', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <GitBranch stroke="var(--accent-success)" />
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{branch.idea.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Phase Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
          {activePhases.map(phase => {
            const Icon = PHASE_ICONS[phase];
            const isActive = currentTab === phase;
            return (
              <button
                key={phase}
                onClick={() => setCurrentTab(phase)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '1rem 1.25rem', background: 'none',
                  border: 'none', borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap'
                }}
              >
                <Icon size={16} />
                {t(`branches.phases.${phase}.name`, phase)}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Phase Hero Action Container */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
             <div>
               <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>{t(`branches.phases.${currentTab}.name`, currentTab)} Phase</h3>
               <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                 {memberOfCurrent ? 'You are a participant in this phase.' : 'Join this phase to create and participate in tasks.'}
               </p>
             </div>
             <div>
               {!memberOfCurrent ? (
                 isMember && (
                   <button onClick={handleJoinPhase} disabled={joining} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     {joining ? '...' : <><Plus size={16} /> Join Phase</>}
                   </button>
                 )
               ) : (
                 <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-success)', fontSize: '0.9rem', fontWeight: 600, padding: '0.5rem 1rem', background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-full)' }}>
                   <Check size={16} /> Joined
                 </span>
               )}
             </div>
          </div>

           {/* Phase Deliverable Section */}
           <div style={{ padding: '1.25rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Package size={16} /> Phase Deliverable
              </h3>
              
              {loadingDeliverable ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading...</p>
              ) : deliverable ? (
                <div>
                   <div style={{ marginBottom: '1rem' }}>
                     <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
                       <strong>Status:</strong> {isBranchPhaseCompleted ? 'Completed' : 'Pending Review'}
                     </p>
                     <p style={{ margin: 0, fontSize: '0.9rem' }}>
                       <strong>Link:</strong> <a href={deliverable.deliverableUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>{deliverable.deliverableUrl}</a>
                     </p>
                   </div>
                   
                   {/* Ratings */}
                   {settings.modules.satisfaction.enabled && (
                     <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                         <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Promedio de {settings.modules.satisfaction.name}:</span>
                         <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-success)' }}>{averageRating.toFixed(1)} / 5.0 ★ ({totalRatings} eval)</span>
                       </div>
                       
                       {!isBranchPhaseCompleted && !memberOfCurrent && (
                          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>{userRating ? 'Update your rating' : 'Rate this deliverable'}</h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <input type="range" min="0" max="5" step="0.1" value={ratingValue} onChange={(e) => setRatingValue(Number(e.target.value))} style={{ flex: 1 }} />
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '40px' }}>{ratingValue.toFixed(1)} ★</span>
                              <button className="btn btn-primary" onClick={handleSubmitRating} disabled={submittingRating} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                                {submittingRating ? '...' : 'Submit'}
                              </button>
                            </div>
                        
                            {userRating && <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>You rated: {userRating.rating.toFixed(1)} ★</p>}
                          </div>
                       )}
 
                       {!isBranchPhaseCompleted && (
                         <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                           <button className="btn btn-outline" onClick={handleCompletePhase} disabled={completingPhase} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: 'var(--accent-success)', color: 'var(--accent-success)' }}>
                             {completingPhase ? '...' : 'Complete & Distribute ' + settings.modules.points.name}
                           </button>
                         </div>
                       )}
                     </div>
                   )}
                </div>
              ) : memberOfCurrent ? (
                <div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Submit the finalized work for this phase.</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="url" 
                      className="input-field" 
                      placeholder="https://link-to-deliverable..." 
                      value={newDeliverableUrl}
                      onChange={(e) => setNewDeliverableUrl(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={handleSubmitDeliverable}>Submit</button>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>No deliverable submitted yet.</p>
              )}
           </div>

           {/* Investments Section */}
           {settings.modules.fiat.enabled && (
             <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Wallet size={16} /> Inversiones en Rama ({settings.modules.fiat.name})
                </h3>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                   {PHASES.map(p => {
                      const phaseInvestments = (branch.fiatTransactions || []).filter((t: any) => t.type === 'INVESTMENT');
                      const total = phaseInvestments.reduce((acc: number, cur: any) => acc + cur.amount, 0);
                      if (total === 0 && p !== currentTab) return null;
  
                      return (
                        <div key={p} className="glass-panel" style={{ padding: '0.75rem 1rem', flex: '1 1 150px', background: p === currentTab ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{p.toLowerCase()}</span>
                          <h4 style={{ margin: '0.1rem 0 0 0', color: total > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)', fontSize: '1rem' }}>
                             ${total.toLocaleString('es-CL')}
                          </h4>
                        </div>
                      );
                   })}
                </div>
             </div>
           )}

          {/* Task List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
               <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Tasks</h3>
               {memberOfCurrent && !showTaskForm && (
                 <button onClick={() => setShowTaskForm(true)} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                   <Plus size={14} /> Create Task
                 </button>
               )}
            </div>

            {showTaskForm && (
              <TaskForm 
                 branchId={branch.id} 
                 phase={currentTab} 
                 onCancel={() => setShowTaskForm(false)}
                 onSubmit={() => {
                   setShowTaskForm(false);
                   fetchTasks();
                 }}
              />
            )}

            {loadingTasks ? (
               <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>Loading tasks...</p>
            ) : tasks.length === 0 && !showTaskForm ? (
               <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)' }}>
                 No tasks in this phase yet.
               </p>
            ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                 {tasks.map(task => (
                    <TaskCard key={task.id} task={task} onUpdate={fetchTasks} />
                 ))}
               </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
