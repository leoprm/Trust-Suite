import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { UserPlus, Trash2, Copy, Check, Users, Eye, EyeOff, ChevronDown, ChevronUp, Camera, Search, TreePine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import QRScanner from '../components/QRScanner';
import { useTreeStore } from '../store/treeStore';

export default function People() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<any[]>([]);
  const [myTrees, setMyTrees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingCodeInput, setSharingCodeInput] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const longPressTimer = useRef<any>(null);
  const isLongPress = useRef(false);

  const toggleSelect = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handlePressStart = (id: string) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (selectedUserIds.size > 0) {
        // If already in selection mode, long press any contact to exit and clear all
        setSelectedUserIds(new Set());
      } else {
        // If not in mode, enter mode and select current contact
        toggleSelect(id);
      }
      if (window.navigator.vibrate) window.navigator.vibrate(50);
    }, 600);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  useEffect(() => {
    fetchContacts();
    fetchMyTrees();
  }, []);

  const fetchContacts = async () => {
    try {
      const { data } = await api.get('/contacts');
      setContacts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyTrees = async () => {
    try {
      const { data } = await api.get('/trees');
      setMyTrees(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingCodeInput.trim()) return;
    setAddingContact(true);
    try {
      const { data } = await api.post('/contacts/add', { sharingCode: sharingCodeInput.trim().toUpperCase() });
      setContacts([...contacts, data]);
      setSharingCodeInput('');
      useTreeStore.getState().fetchTrees();
      alert(t('people.add_success', 'Persona añadida correctamente'));
    } catch (e: any) {
      alert(e.response?.data?.error || 'Error al añadir persona');
    } finally {
      setAddingContact(false);
    }
  };

  const handleRemoveContact = async (id: string, username: string) => {
    if (!confirm(`¿Eliminar a ${username} de tus personas?`)) return;
    try {
      await api.delete(`/contacts/${id}`);
      setContacts(contacts.filter(c => c.id !== id));
      if (expandedContactId === id) setExpandedContactId(null);
    } catch (e) {
      alert('Error al eliminar persona');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedContactId(expandedContactId === id ? null : id);
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure context (local network IP)
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sharingCode = user?.sharingCode || user?.id?.substring(0, 6).toUpperCase() || '......';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${sharingCode}`;

  return (
    <div className="container mt-8" style={{ paddingBottom: '4rem', maxWidth: '800px' }}>
      <header className="mb-8">
        <h1 className="text-gradient">Personas</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Gestiona tus contactos y añade nuevas personas para colaborar en Árboles.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* My Sharing Info */}
        <section className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <h3 className="mb-4">Mi Código</h3>
          <div style={{ 
            background: 'white', 
            padding: '1rem', 
            borderRadius: 'var(--radius-lg)', 
            display: 'inline-block',
            marginBottom: '1.5rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
          }}>
            <img src={qrUrl} alt="QR Code" style={{ width: '160px', height: '160px' }} />
          </div>
          
          <div 
            onClick={() => copyToClipboard(sharingCode)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem', 
              background: 'rgba(255,255,255,0.05)', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius-md)', 
              border: copied ? '1px solid var(--accent-success)' : '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{ 
              fontSize: '1.25rem', 
              fontWeight: 700, 
              letterSpacing: '2px', 
              color: copied ? 'var(--accent-success)' : 'var(--accent-primary)',
              fontFamily: 'monospace'
            }}>
              {showCode 
                ? sharingCode
                : '••••••'
              }
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCode(!showCode);
                }} 
                className="btn btn-outline" 
                style={{ padding: '0.4rem' }}
              >
                {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <div 
                className="btn btn-outline" 
                style={{ 
                  padding: '0.4rem', 
                  borderColor: copied ? 'var(--accent-success)' : 'inherit',
                  color: copied ? 'var(--accent-success)' : 'inherit'
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
            Comparte este código o el QR para que otros te añadan a sus Personas.
          </p>
        </section>

        {/* Add Contact Form */}
        <section className="glass-panel">
          <h3 className="mb-4">Añadir Persona</h3>
          <form onSubmit={handleAddContact} className="flex flex-col gap-4">
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>
                Código de Compartir
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <input 
                  type="text" 
                  placeholder="Ej: A1B2C3" 
                  value={sharingCodeInput}
                  onChange={(e) => setSharingCodeInput(e.target.value)}
                  className="input-field"
                  style={{ flex: 1, minWidth: 0, textTransform: 'uppercase' }}
                />
                <button 
                  type="button" 
                  onClick={() => setShowScanner(true)}
                  className="btn btn-outline" 
                  style={{ padding: '0.6rem', flexShrink: 0, borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                  title="Escanear QR"
                >
                  <Camera size={18} />
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary flex items-center justify-center gap-2" disabled={addingContact}>
              <UserPlus size={18} />
              {addingContact ? 'Añadiendo...' : 'Añadir a mis Personas'}
            </button>
          </form>

          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users size={18} stroke="var(--accent-primary)" />
                  <h4 style={{ margin: 0 }}>Mis Personas ({contacts.length})</h4>
                </div>
                <button 
                  className="btn btn-outline" 
                  onClick={() => navigate('/trees/new', { 
                    state: { 
                      selectedUserIds: Array.from(selectedUserIds),
                      fromSelection: selectedUserIds.size > 0
                    } 
                  })}
                  title={selectedUserIds.size > 0 ? "Crear Árbol con seleccionados" : "Crear nuevo Árbol"}
                  style={{ 
                    padding: '0.4rem', 
                    color: 'var(--accent-success)', 
                    background: selectedUserIds.size > 0 ? 'rgba(74, 122, 128, 0.15)' : 'transparent',
                    borderColor: selectedUserIds.size > 0 ? 'var(--accent-success)' : 'rgba(74, 122, 128, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <TreePine size={20} />
                </button>
             </div>

             {/* Search Bar */}
             <div style={{ position: 'relative', marginBottom: '1rem' }}>
               <Search size={18} style={{ 
                 position: 'absolute', 
                 left: '12px', 
                 top: '50%', 
                 transform: 'translateY(-50%)',
                 color: 'var(--text-secondary)',
                 opacity: 0.5
               }} />
               <input 
                 type="text"
                 placeholder="Buscar por nombre..."
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 style={{
                   width: '100%',
                   padding: '0.6rem 1rem 0.6rem 2.5rem',
                   background: 'rgba(255,255,255,0.05)',
                   border: '1px solid var(--border-color)',
                   borderRadius: 'var(--radius-md)',
                   color: 'var(--text-primary)',
                   fontSize: '0.9rem'
                 }}
               />
             </div>
             
             <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {loading ? (
                  <p>Cargando...</p>
                ) : contacts.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aún no has añadido a nadie.</p>
                ) : (
                  contacts
                    .filter(c => c.username.toLowerCase().includes(searchTerm.toLowerCase()))
                    .sort((a, b) => {
                      const aName = a.username.toLowerCase();
                      const bName = b.username.toLowerCase();
                      const search = searchTerm.toLowerCase();
                      
                      const aStarts = aName.startsWith(search);
                      const bStarts = bName.startsWith(search);

                      if (aStarts && !bStarts) return -1;
                      if (!aStarts && bStarts) return 1;
                      
                      return aName.localeCompare(bName);
                    })
                    .map(contact => {
                    const isExpanded = expandedContactId === contact.id;
                    const commonTrees = contact.memberships?.filter((m: any) => myTrees.some(t => t.id === m.id)) || [];
                    const otherTrees = contact.memberships?.filter((m: any) => !myTrees.some(t => t.id === m.id)) || [];

                    const isSelected = selectedUserIds.has(contact.id);

                    return (
                      <motion.div 
                        key={contact.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onMouseDown={() => handlePressStart(contact.id)}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                        onTouchStart={() => handlePressStart(contact.id)}
                        onTouchEnd={handlePressEnd}
                        onContextMenu={(e) => {
                          if (isLongPress.current) e.preventDefault();
                        }}
                        style={{ 
                          display: 'flex', 
                          flexDirection: 'column',
                          background: isSelected ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.03)',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '1px solid var(--accent-success)' : '1px solid var(--border-color)',
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'background-color 0.3s ease, border-color 0.3s ease'
                        }}
                      >
                        <div 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            padding: '0.75rem 0.75rem 1.25rem 0.75rem',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            if (isLongPress.current) return;
                            if (selectedUserIds.size > 0) {
                              toggleSelect(contact.id);
                            } else {
                              toggleExpand(contact.id);
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '21px', color: 'var(--text-primary)' }}>
                              {contact.username}
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveContact(contact.id, contact.username);
                              }}
                              className="btn btn-outline" 
                              style={{ padding: '0.4rem', color: 'var(--accent-error)', borderColor: 'rgba(239,68,68,0.2)', height: '32px', width: '32px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {/* Expansion Indicator - Bottom Center */}
                          <div style={{
                            position: 'absolute',
                            bottom: '2px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '20px'
                          }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              key="expanded-content"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ 
                                height: 'auto', 
                                opacity: 1,
                                transition: { height: { duration: 0.4 }, opacity: { duration: 0.3, delay: 0.1 } }
                              }}
                              exit={{ height: 0, opacity: 0 }}
                              style={{ 
                                overflow: 'hidden',
                                borderTop: '1px solid rgba(255,255,255,0.05)',
                                background: 'rgba(0,0,0,0.1)'
                              }}
                            >
                              <div style={{ 
                                padding: '1.25rem 1rem 1.25rem 1rem', 
                                marginLeft: '3.5rem',
                                minHeight: '80px',
                                display: 'flex',
                                flexDirection: 'column'
                              }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>
                                  Árboles:
                                </div>
                                {(!contact.memberships || contact.memberships.length === 0) ? (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    No pertenece a ningún árbol.
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {commonTrees.map((tree: any) => (
                                      <div key={tree.id} style={{ color: '#4ade80', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem', lineHeight: '1.2' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 10px rgba(74, 222, 128, 0.5)' }} />
                                        <span>{tree.name}</span>
                                      </div>
                                    ))}
                                    {otherTrees.map((tree: any) => (
                                      <div key={tree.id} style={{ color: '#ffffff', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.75rem', lineHeight: '1.2' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', border: '1px solid white', flexShrink: 0 }} />
                                        <span>{tree.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })
                )}
             </div>
          </div>
        </section>
      </div>
      {showScanner && (
        <QRScanner 
          onScanSuccess={(code) => {
            setSharingCodeInput(code.toUpperCase());
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
