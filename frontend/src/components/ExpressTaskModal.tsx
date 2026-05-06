import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Hash, Send, Zap, Search } from 'lucide-react';
import api from '../lib/api';

interface ExpressTaskModalProps {
  treeId?: string; // Optional for global creation
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExpressTaskModal({ treeId: initialTreeId, onClose, onSuccess }: ExpressTaskModalProps) {
  const [selectedTreeId, setSelectedTreeId] = useState(initialTreeId || '');
  const [userTrees, setUserTrees] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assignToMe, setAssignToMe] = useState(true);
  const [hashtags, setHashtags] = useState<any[]>([]);
  const [loadingHashtags, setLoadingHashtags] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHashtag, setSelectedHashtag] = useState<any>(null);
  const [showHashtagList, setShowHashtagList] = useState(false);
  
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fetchUserTrees = async () => {
      try {
        const { data } = await api.get('/trees');
        const hashtagTrees = data.filter((t: any) => t.allowHashtags);
        setUserTrees(hashtagTrees);
        if (!selectedTreeId && hashtagTrees.length === 1) {
          setSelectedTreeId(hashtagTrees[0].id);
        }
      } catch (e) {
        console.error('Failed to fetch user trees', e);
      }
    };
    fetchUserTrees();
  }, [initialTreeId]);

  useEffect(() => {
    if (descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const fetchHashtags = async () => {
      if (!showHashtagList || !selectedTreeId) return;
      setLoadingHashtags(true);
      try {
        const { data } = await api.get(`/branches/hashtags?treeId=${selectedTreeId}&q=${searchQuery}`);
        setHashtags(data);
      } catch (error) {
        console.error('Failed to fetch hashtags', error);
      } finally {
        setLoadingHashtags(false);
      }
    };

    const timer = setTimeout(fetchHashtags, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedTreeId, showHashtagList]);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    if (!selectedHashtag) {
      setShowHashtagList(true);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/tasks/express', {
        branchId: selectedHashtag.id,
        description,
        treeId: selectedTreeId,
        name: description.split('\n')[0].substring(0, 50),
        assignToMe
      });
      onSuccess();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al crear la tarea express');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit();
    }
    if (e.key === '#') {
       setShowHashtagList(true);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        style={{
          background: 'var(--surface-color)', width: '100%', maxWidth: '500px',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Zap size={20} color="var(--accent-warning)" fill="var(--accent-warning)" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Tarea Express</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* TREE SELECTION */}
          {!initialTreeId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                ¿A qué árbol pertenece?
              </label>
              <select 
                value={selectedTreeId} 
                onChange={(e) => {
                  setSelectedTreeId(e.target.value);
                  setSelectedHashtag(null); // Reset hashtag when tree changes
                  setSearchQuery('');
                }}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)', outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="">Selecciona un Árbol...</option>
                {userTrees.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: assignToMe ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.2s' }}>
              {assignToMe ? '¿Qué vas a hacer?' : '¿Qué hay que hacer?'}
            </label>
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escritura rápida... (Ctrl+Enter para enviar)"
              style={{
                width: '100%', minHeight: '120px', background: 'rgba(255,255,255,0.03)',
                border: '1px solid',
                borderColor: assignToMe ? 'rgba(59,130,246,0.5)' : 'var(--border-color)', 
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem', color: 'var(--text-primary)', fontSize: '1rem',
                resize: 'vertical', outline: 'none', transition: 'all 0.3s ease',
                boxShadow: assignToMe ? '0 0 15px rgba(59,130,246,0.15)' : 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                if (assignToMe) e.currentTarget.style.boxShadow = '0 0 20px rgba(59,130,246,0.25)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = assignToMe ? 'rgba(59,130,246,0.5)' : 'var(--border-color)';
                e.currentTarget.style.boxShadow = assignToMe ? '0 0 15px rgba(59,130,246,0.15)' : 'none';
              }}
            />
          </div>

          <div 
            onClick={() => setAssignToMe(!assignToMe)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer',
              padding: '0.5rem', borderRadius: 'var(--radius-md)', 
              background: assignToMe ? 'rgba(59,130,246,0.05)' : 'transparent',
              transition: 'all 0.2s', border: '1px solid',
              borderColor: assignToMe ? 'rgba(59,130,246,0.3)' : 'transparent'
            }}
          >
            <div style={{
              width: '40px', height: '20px', borderRadius: '20px',
              background: assignToMe ? 'var(--accent-primary)' : 'var(--border-color)',
              position: 'relative', transition: 'background 0.2s'
            }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: 'white', position: 'absolute', top: '3px',
                left: assignToMe ? '23px' : '3px', transition: 'left 0.2s'
              }} />
            </div>
            <span style={{ fontSize: '0.9rem', color: assignToMe ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 500 }}>
              Asignarme esta tarea automáticamente
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Hashtag (Etiqueta Global)
            </label>
            
            {selectedHashtag ? (
              <div style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 0.75rem', background: 'rgba(59,130,246,0.1)',
                border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-md)',
                color: 'var(--accent-primary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  <Hash size={16} />
                  {selectedHashtag.name}
                </div>
                <button 
                  onClick={() => setSelectedHashtag(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Buscar hashtag..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowHashtagList(true);
                  }}
                  onFocus={() => setShowHashtagList(true)}
                  style={{
                    width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
                
                <AnimatePresence>
                  {showHashtagList && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        marginTop: '0.5rem', background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
                        maxHeight: '200px', overflowY: 'auto', zIndex: 10,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                      }}
                    >
                      {loadingHashtags ? (
                        <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cargando hashtags...</div>
                      ) : hashtags.length === 0 ? (
                        <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No se encontraron hashtags</div>
                      ) : (
                        hashtags.map(h => (
                          <div
                            key={h.id}
                            onClick={() => {
                              setSelectedHashtag(h);
                              setShowHashtagList(false);
                            }}
                            style={{
                              padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
                              display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem',
                              transition: 'background 0.2s'
                            }}
                            className="hashtag-item"
                          >
                            <Hash size={14} color="var(--text-secondary)" />
                            {h.name}
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'rgba(255,255,255,0.01)' }}>
          <button onClick={onClose} className="btn btn-outline" style={{ padding: '0.5rem 1rem' }}>
            Cancelar
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting || !description.trim() || !selectedTreeId}
            className="btn btn-primary" 
            style={{ 
              padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--accent-warning)', color: 'black', border: 'none',
              opacity: (submitting || !description.trim() || !selectedTreeId) ? 0.6 : 1
            }}
          >
            {submitting ? 'Enviando...' : <><Send size={16} /> Enviar</>}
          </button>
        </div>
      </motion.div>
      <style>{`
        .hashtag-item:hover {
          background: rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  );
}
