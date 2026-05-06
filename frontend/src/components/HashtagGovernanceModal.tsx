import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Hash, Plus, Check, Send, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface HashtagGovernanceModalProps {
  tree: any;
  currentUser: any;
  onClose: () => void;
  onUpdate: () => void;
}

export default function HashtagGovernanceModal({ tree, currentUser, onClose, onUpdate }: HashtagGovernanceModalProps) {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'VOTE' | 'CREATE'>(
    tree.hashtagCreationPolicy === 'ADMIN_ONLY' ? 'CREATE' : 'VOTE'
  );
  
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.id === tree.creatorId;
  const canCreateDirectly = (tree.hashtagCreationPolicy === 'ADMIN_ONLY' || tree.hashtagCreationPolicy === 'ADMIN_AND_USERS') && isAdmin;
  const canSeeProposals = tree.hashtagCreationPolicy !== 'ADMIN_ONLY' || isAdmin;

  useEffect(() => {
    if (activeTab === 'VOTE') {
      fetchProposals();
    }
  }, [activeTab]);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/needs/hashtag-proposals?treeId=${tree.id}`);
      setProposals(data);
    } catch (e) {
      console.error('Failed to fetch proposals', e);
    } finally {
      setLoading(false);
    }
  };

  const handeDirectCreate = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/branches/hashtag', { treeId: tree.id, name: newName.trim() });
      onUpdate();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al crear hashtag');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (proposalId: string) => {
    try {
      // Default vote: 10 points
      await api.post(`/needs/${proposalId}/fund`, { points: 10, treeId: tree.id });
      fetchProposals();
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Error al votar');
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        style={{
          background: 'var(--surface-color)', width: '100%', maxWidth: '550px',
          borderRadius: 'var(--radius-xl)', overflow: 'hidden',
          border: '1px solid var(--border-color)', position: 'relative',
          display: 'flex', flexDirection: 'column', maxHeight: '85vh'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'var(--accent-warning)', color: 'black', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <Hash size={20} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Gobernanza de Hashtags</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        {canCreateDirectly && canSeeProposals && (
           <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => setActiveTab('VOTE')}
                style={{
                  flex: 1, padding: '1rem', background: 'none', border: 'none', 
                  borderBottom: activeTab === 'VOTE' ? '2px solid var(--accent-warning)' : '2px solid transparent',
                  color: activeTab === 'VOTE' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Votaciones Activas
              </button>
              <button 
                onClick={() => setActiveTab('CREATE')}
                style={{
                  flex: 1, padding: '1rem', background: 'none', border: 'none', 
                  borderBottom: activeTab === 'CREATE' ? '2px solid var(--accent-warning)' : '2px solid transparent',
                  color: activeTab === 'CREATE' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Crear Directamente
              </button>
           </div>
        )}

        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'VOTE' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {loading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando propuestas...</p>
              ) : proposals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                   <Hash size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                   <p style={{ color: 'var(--text-secondary)' }}>No hay votaciones de hashtags activas.</p>
                </div>
              ) : (
                proposals.map(p => (
                  <div key={p.id} style={{ 
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-lg)', padding: '1rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-warning)' }}>{p.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Propuesto por {p.creator.username}</div>
                      <div style={{ marginTop: '0.5rem', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', width: '120px', overflow: 'hidden' }}>
                         <div style={{ height: '100%', background: 'var(--accent-warning)', width: `${Math.min(p.totalPointsAssigned, 100)}%` }} />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                         {p.totalPointsAssigned} / 100 pts para aprobar
                      </div>
                    </div>
                    <button 
                      onClick={() => handleVote(p.id)}
                      style={{ 
                        background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)',
                        color: 'var(--accent-success)', padding: '0.5rem', borderRadius: 'var(--radius-md)',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                      title="Votar (+10 pts)"
                    >
                      <Check size={20} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
               <div style={{ background: 'rgba(245,158,11,0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.85rem' }}>
                  Como administrador, puedes crear el hashtag instantáneamente. Aparecerá en el feed de hashtags al momento.
               </div>
               <div className="input-group">
                  <label>Nombre del Hashtag</label>
                  <div style={{ position: 'relative' }}>
                    <Hash size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      className="input-field" 
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="Ej: diseño-web"
                      value={newName}
                      onChange={e => setNewName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                    />
                  </div>
               </div>
               {error && (
                 <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} /> {error}
                 </div>
               )}
               <button 
                 onClick={handeDirectCreate}
                 disabled={submitting || !newName.trim()}
                 className="btn btn-primary w-full"
                 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--accent-warning)', color: 'black', border: 'none' }}
               >
                 {submitting ? 'Creando...' : <><Send size={18} /> Crear Hashtag</>}
               </button>
            </div>
          )}
        </div>

        {/* Floating Add Proposal Button */}
        {activeTab === 'VOTE' && (
           <motion.button
             whileHover={{ scale: 1.1 }}
             whileTap={{ scale: 0.95 }}
             onClick={() => navigate(`/needs/new?treeId=${tree.id}&hashtag=true`)}
             style={{
               position: 'absolute', bottom: '1.5rem', right: '1.5rem',
               width: '48px', height: '48px', borderRadius: '50%',
               background: 'var(--accent-warning)', color: 'black',
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               boxShadow: '0 4px 12px rgba(0,0,0,0.3)', border: 'none', cursor: 'pointer', zIndex: 10
             }}
             title="Proponer Nuevo Hashtag"
           >
             <Plus size={24} />
           </motion.button>
        )}
      </motion.div>
    </div>
  );
}
