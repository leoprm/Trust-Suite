import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { GitBranch, Check, X, Plus, Edit2, Trash2 } from 'lucide-react';
import { useTreeStore } from '../store/treeStore';
import { OptimizedText } from './OptimizedText';

export default function Feed({ treeId }: { treeId?: string }) {
  const [needs, setNeeds] = useState<any[]>([]);
  const [fundingNeedId, setFundingNeedId] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState<string>('');
  const settings = useTreeStore(state => state.settings);
  const currentUser = useAuthStore(state => state.user);
  
  const getNeedMembership = (need: any) => {
    if (!currentUser?.memberships) return null;
    const needTreeIds = need.treeLinks?.map((tl: any) => tl.treeId) || [];
    if (treeId && needTreeIds.includes(treeId)) {
      return currentUser.memberships.find((m: any) => m.treeId === treeId);
    }
    return currentUser.memberships.find((m: any) => needTreeIds.includes(m.treeId));
  };
  const { t } = useTranslation();

  useEffect(() => {
    fetchNeeds();
  }, [treeId]);

  const fetchNeeds = async () => {
    try {
      const url = treeId ? `/needs?treeId=${treeId}` : '/needs';
      const { data } = await api.get(url);
      setNeeds(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleFund = async (id: string) => {
    if (!fundAmount || isNaN(Number(fundAmount))) return;
    try {
      const need = needs.find(n => n.id === id);
      const treeId = need.treeLinks[0]?.treeId;
      if (!treeId) return;

      await api.post(`/needs/${id}/fund`, { points: Number(fundAmount), treeId });
      setFundingNeedId(null);
      setFundAmount('');
      fetchNeeds();
      useAuthStore.getState().fetchUser();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to assign points');
    }
  };

  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('feed.confirm_delete_need', '¿Estás seguro de que deseas eliminar esta necesidad? Esto devolverá los puntos a todos los usuarios.'))) return;
    try {
      await api.delete(`/needs/${id}`);
      fetchNeeds();
      useAuthStore.getState().fetchUser();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to delete need');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await api.patch(`/needs/${id}`, { title: editTitle, description: editDescription });
      setEditingNeedId(null);
      fetchNeeds();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update need');
    }
  };

  const startEditing = (need: any) => {
    setEditingNeedId(need.id);
    setEditTitle(need.title);
    setEditDescription(need.description);
  };

  return (
    <>
      <div className="flex-col gap-4 w-full">
        {needs.length === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>{t('dashboard.no_needs')}</p>
        )}

        {needs.map((need, idx) => {
          const userMembership = getNeedMembership(need);
          const isNeedMember = !!userMembership;
          const isNeedVerified = userMembership?.status === 'VERIFIED';

          return (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              key={need.id}
              id={`need-${need.id}`}
              className="glass-panel"
              style={{ padding: '1.5rem', marginBottom: '1rem' }}
            >
              {/* Need header */}
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2" style={{ flex: 1 }}>
                  {editingNeedId === need.id ? (
                    <input 
                      className="input-field"
                      style={{ fontSize: '1rem', padding: '0.2rem 0.5rem' }}
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                  ) : (
                    <>
                      <h3 style={{ margin: 0, color: 'var(--text-accent)' }}>{need.title}</h3>
                      {need.status === 'IN_PROGRESS' && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700,
                          color: 'var(--accent-primary)',
                          background: 'rgba(59,130,246,0.12)',
                          borderRadius: 'var(--radius-full)',
                          padding: '0.15rem 0.55rem',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}>
                          {t('branches.in_progress_badge')}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {need.creatorId === currentUser?.id && need.status === 'ACTIVE' && (
                    <div className="flex gap-2">
                      {editingNeedId === need.id ? (
                        <>
                          <button onClick={() => handleUpdate(need.id)} className="btn-icon text-success"><Check size={16} /></button>
                          <button onClick={() => setEditingNeedId(null)} className="btn-icon text-secondary"><X size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditing(need)} className="btn-icon" style={{ opacity: 0.6 }}><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(need.id)} className="btn-icon" style={{ opacity: 0.6, color: 'var(--accent-error)' }}><Trash2 size={16} /></button>
                        </>
                      )}
                    </div>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {t('feed.created_by')} {need.creator?.username}
                  </span>
                </div>
              </div>
              
              {editingNeedId === need.id ? (
                <textarea 
                  className="input-field mt-2"
                  style={{ minHeight: '80px', fontSize: '0.95rem' }}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                />
              ) : (
                <OptimizedText 
                  text={need.description}
                  className="mb-4"
                  style={{ fontSize: '0.95rem' }}
                />
              )}

              {/* Stats + Action buttons */}
              <div className="flex items-center gap-4 mt-4" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div className="flex-col">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('feed.points_assigned')}</span>
                  <span style={{ fontWeight: 600 }}>{need.totalPointsAssigned}</span>
                </div>

                <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
                  {need.branchId && (
                    <a
                      href={`#branch-${need.branchId}`}
                      onClick={e => {
                        e.preventDefault();
                        document.getElementById(`branch-${need.branchId}`)?.scrollIntoView({ behavior: 'smooth' });
                        document.querySelector('.branches-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.8rem', color: 'var(--accent-success)',
                        textDecoration: 'none', fontWeight: 500,
                      }}
                    >
                      <GitBranch size={13} /> Ver {settings.dictionary.branchName}
                    </a>
                  )}

                  {isNeedMember && (
                    <>
                      {isNeedVerified ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                          {t('feed.verified_member')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-warning)', fontStyle: 'italic', marginRight: '0.5rem' }} title="Comunidad requiere validación de identidad (Prueba de Trabajo)">
                          Rito Pendiente ⏳
                        </span>
                      )}

                      <AnimatePresence mode="wait">
                        {fundingNeedId === need.id ? (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.15rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-success)' }}
                          >
                            <input
                              autoFocus
                              type="number"
                              value={fundAmount}
                              onChange={(e) => setFundAmount(e.target.value)}
                              placeholder="Pts"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleFund(need.id);
                                if (e.key === 'Escape') setFundingNeedId(null);
                              }}
                              style={{
                                background: 'none', border: 'none', color: 'var(--text-primary)', width: '60px', padding: '0.25rem 0.5rem', fontSize: '0.85rem', outline: 'none'
                              }}
                            />
                            <button 
                              onClick={() => handleFund(need.id)}
                              style={{ background: 'var(--accent-success)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Check size={14} />
                            </button>
                            <button 
                              onClick={() => { setFundingNeedId(null); setFundAmount(''); }}
                              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: '4px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        ) : (
                          <button
                            className="btn btn-primary"
                            disabled={!isNeedVerified}
                            style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: isNeedVerified ? 1 : 0.5, cursor: isNeedVerified ? 'pointer' : 'not-allowed' }}
                            onClick={() => { setFundingNeedId(need.id); setFundAmount(''); }}
                            title={!isNeedVerified ? 'Debes verificar tu identidad para invertir' : ''}
                          >
                            <Plus size={14} /> {t('feed.fund_button')}
                          </button>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
