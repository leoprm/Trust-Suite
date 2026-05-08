import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Wallet, Activity, GitBranch, LogOut, ArrowLeft, X, UserPlus, PlusCircle, Link, Copy, Check, AlertTriangle, Download, BriefcaseBusiness, UserCheck, FileDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useTreeStore } from '../store/treeStore';
import api from '../lib/api';
import FinancialDashboard from '../components/FinancialDashboard';
import ExternalNeedsPanel from '../components/ExternalNeedsPanel';
import AutosustentoPanel from '../components/AutosustentoPanel';
import Feed from '../components/Feed';
import BranchFeed from '../components/BranchFeed';
import InvitationModal from '../components/InvitationModal';
import PendingEvidenceList from '../components/PendingEvidenceList';
import ExpressTaskModal from '../components/ExpressTaskModal';
import HashtagGovernanceModal from '../components/HashtagGovernanceModal';
import { Zap, Hash, Droplets, Telescope } from 'lucide-react';
import { downloadJsonExport, downloadPdfExport } from '../lib/downloadExport';
import BerryWalletPanel from '../components/BerryWalletPanel';
import InsightPanel from '../components/InsightPanel';
import ExternalCandidatePanel from '../components/ExternalCandidatePanel';

export default function TreeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, fetchUser } = useAuthStore();
  const { setActiveTree, settings } = useTreeStore();
  const { t } = useTranslation();
  const [isMobile] = useState(window.innerWidth <= 768);
  const [tree, setTree] = useState<any>(null);
  const membership = currentUser?.memberships?.find((m: any) => m.treeId === id);
  const isMember = !!membership;
  const isVerified = membership?.status === 'VERIFIED';
  const isTreeAdmin = isMember && ((membership as any)?.role === 'ADMIN' || tree?.creatorId === currentUser?.id);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'FINANCES' | 'AUTOSUSTENTO' | 'EXTERNAL_NEEDS' | 'MEMBERS' | 'BERRIES' | 'INSIGHT' | 'CANDIDATES'>('DASHBOARD');
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showInvitationGateway, setShowInvitationGateway] = useState(false);
  const [showExpressModal, setShowExpressModal] = useState(false);
  const [showHashtagGovModal, setShowHashtagGovModal] = useState(false);
  const [guestLink, setGuestLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [refreshBranches, setRefreshBranches] = useState(0);
  const [exportingTree, setExportingTree] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    fetchTree();
    fetchUser();
    if (id) {
      localStorage.setItem('lastVisitedTreeId', id);
    }
    return () => setActiveTree(null);
  }, [id]);

  useEffect(() => {
    if (activeTab === 'MEMBERS') {
      fetchMembers();
      fetchContacts();
    }
  }, [activeTab]);

  useEffect(() => {
    // Show invitation if not verified, not creator and hasn't accepted yet locally
    if (tree && currentUser && !isVerified && tree.creatorId !== currentUser.id) {
       const hasAccepted = localStorage.getItem(`acceptedTree_${tree.id}`);
       if (!hasAccepted) {
         setShowInvitationGateway(true);
       }
    }
  }, [tree, currentUser, isVerified]);

  const fetchTree = async () => {
    try {
      const { data } = await api.get(`/trees/${id}`);
      setTree(data);
      setActiveTree(data);
    } catch (error) {
      console.error('Failed to fetch tree details', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const { data } = await api.get(`/trees/${id}/members`);
      setMembers(data);
    } catch (error) {
      console.error('Failed to fetch members', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const { data } = await api.get('/users/contacts');
      setContacts(data);
    } catch (error) {
      console.error('Failed to fetch contacts', error);
    }
  };

  const handleInvite = async (userId: string) => {
    try {
      await api.post(`/trees/${id}/invite`, { userId });
      setShowInviteModal(false);
      fetchMembers();
    } catch (error) {
      alert('Error al invitar al miembro');
    }
  };

  const handleGenerateGuestLink = async () => {
    try {
      const { data } = await api.post(`/trees/${id}/guest-token`);
      const fullLink = `${window.location.origin}/join/${data.token}`;
      setGuestLink(fullLink);
    } catch(e) {
      alert('Error generando el enlace temporal.');
    }
  };

  const wrapCopyGuestLink = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(guestLink);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = guestLink;
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(textArea);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleAddContact = async (contactId: string, username: string) => {
    try {
      await api.post('/users/contacts', { contactId });
      fetchContacts();
      alert(`${username} añadido a tus Personas`);
    } catch (error) {
      alert('Error al añadir a la persona');
    }
  };

  const handleRemove = async (userId: string, username: string) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${username} y a todos sus invitados de este Árbol?`)) return;
    try {
      await api.delete(`/trees/${id}/members/${userId}`);
      fetchMembers();
    } catch (error) {
      alert('Error al eliminar al miembro');
    }
  };

  const handleRefreshBranches = () => {
    fetchTree();
    setRefreshBranches(prev => prev + 1);
  };

  const handleLeaveTree = async () => {
    if (!confirm(`¿Estás seguro de que deseas abandonar el Árbol "${tree.name}"?`)) return;
    try {
      await api.delete(`/trees/${id}/leave`);
      
      // Clear persistence for the explorer
      if (localStorage.getItem('lastVisitedTreeId') === id) {
        localStorage.removeItem('lastVisitedTreeId');
      }
      localStorage.removeItem(`acceptedTree_${id}`);

      await useTreeStore.getState().fetchTrees();
      navigate('/trees');
    } catch (error) {
      alert('Error al abandonar el Árbol');
    }
  };

  const handleToggleCrisis = async () => {
    const action = tree.modoCrisis ? "DESACTIVAR" : "ACTIVAR";
    if (!confirm(`¿Estás seguro de que deseas ${action} el ESTADO DE EXCEPCIÓN (LIFO)?\n\nSi se activa, todas las colas de recursos ignorarán la antigüedad de los miembros y tareas y priorizarán exclusivamente a la Tarea con la Nota de Necesidad más alta.`)) return;
    try {
      const { data } = await api.post(`/trees/${id}/crisis`);
      setTree({ ...tree, modoCrisis: data.modoCrisis });
      setActiveTree({ ...tree, modoCrisis: data.modoCrisis });
    } catch (e) {
      alert("Error al alternar el estado de crisis. Verificar consolas.");
    }
  };

  const handleExportTree = async () => {
    if (!id) return;
    setExportingTree(true);
    try {
      await downloadJsonExport(`/exports/tree/${id}`);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'No se pudo exportar el Tree.');
    } finally {
      setExportingTree(false);
    }
  };

  const handleExportPdf = async () => {
    if (!id) return;
    setExportingPdf(true);
    try {
      await downloadPdfExport(`/exports/tree/${id}/pdf`);
      // Brief toast-like feedback (set a brief state)
      setExportingPdf(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'No se pudo generar el PDF.';
      alert(msg);
      setExportingPdf(false);
    }
  };

  const isAlreadyContact = (userId: string) => contacts.some(c => c.id === userId);

  if (loading) return <div className="container mt-8">Cargando...</div>;
  if (!tree) return <div className="container mt-8">Árbol no encontrado</div>;

  return (
    <div className="container mt-8" style={{ paddingBottom: '4rem', maxWidth: '1000px' }}>
      
      {showInvitationGateway && (
        <InvitationModal 
          tree={tree}
          settings={settings}
          healthData={tree.healthData}
          onAccept={() => {
            localStorage.setItem(`acceptedTree_${tree.id}`, 'true');
            setShowInvitationGateway(false);
          }}
          onReject={async () => {
            try {
              await api.delete(`/trees/${id}/leave`);
              
              // Clear persistence
              if (localStorage.getItem('lastVisitedTreeId') === id) {
                localStorage.removeItem('lastVisitedTreeId');
              }
              localStorage.removeItem(`acceptedTree_${id}`);

              await useTreeStore.getState().fetchTrees();
              navigate('/trees');
            } catch (e) {
              alert('Error al rechazar invitación');
            }
          }}
        />
      )}

      {tree.modoCrisis && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--accent-error)',
            color: 'white',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.5)'
          }}
        >
          <AlertTriangle size={32} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase' }}>ESTADO DE EXCEPCIÓN ACTIVO</h2>
            <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
              La Roca Madre ha sido suspendida. Todos los algoritmos operan en LIFO estricto para {
                 tree.crisisSubjects && JSON.parse(tree.crisisSubjects).length > 0 
                  ? <strong>{JSON.parse(tree.crisisSubjects).join(', ')}</strong> 
                  : "todas las Ramas"
              }.
            </p>
            {tree.crisisExpiresAt && (
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>
                Vence: {new Date(tree.crisisExpiresAt).toLocaleString()}
              </div>
            )}
          </div>
        </motion.div>
      )}

      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {!isMobile && (
            <button 
              onClick={() => navigate('/trees')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              className="desktop-only"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>{tree.name}</h1>
            
            {/* Stats Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem', marginBottom: '0' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.8rem', 
                background: 'rgba(255,255,255,0.03)', 
                padding: '0.35rem 0.9rem', 
                borderRadius: '100px', 
                border: '1px solid var(--border-color)',
                backdropFilter: 'blur(10px)'
              }}>
                {settings.modules.levels.enabled && (
                  <>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {settings.modules.levels.name} <span style={{ color: 'var(--accent-primary)' }}>{membership?.level || 1}</span>
                    </span>
                    <div style={{ width: '1px', height: '12px', background: 'var(--border-color)' }} />
                  </>
                )}
                {settings.modules.points.enabled && (
                  <>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {membership?.xp ? Math.floor(membership.xp) : 0} <span style={{ color: 'var(--text-accent)' }}>{settings.modules.points.name}</span>
                    </span>
                    <div style={{ width: '1px', height: '12px', background: 'var(--border-color)' }} />
                  </>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {currentUser?.memberships?.find((m: any) => m.treeId === id)?.weeklyNeedPoints || 0} <span style={{ color: 'var(--accent-success)' }}>{t('nav.pts', 'Pts')}</span>
                </span>
              </div>
            </div>

          </div>
        </div>

        {isMember ? (
          <div className="flex items-center gap-3">
            {((membership as any)?.role === 'ADMIN' || tree?.creatorId === currentUser?.id) && (
              <>
                <button
                  onClick={handleExportTree}
                  disabled={exportingTree}
                  className="btn btn-outline"
                  style={{
                    color: '#bfdbfe',
                    borderColor: 'rgba(59,130,246,0.28)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: exportingTree ? 0.65 : 1,
                    cursor: exportingTree ? 'not-allowed' : 'pointer',
                  }}
                  title="Descarga JSON versionado sin archivos crudos ni secretos"
                >
                  <Download size={18} /> {exportingTree ? 'Exportando...' : 'Exportar Tree'}
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="btn btn-outline"
                  style={{
                    color: '#fef3c7',
                    borderColor: 'rgba(245,158,11,0.28)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: exportingPdf ? 0.65 : 1,
                    cursor: exportingPdf ? 'not-allowed' : 'pointer',
                    minWidth: isMobile ? '44px' : undefined,
                    minHeight: isMobile ? '44px' : undefined,
                  }}
                  title="Descargar reporte financiero en PDF"
                >
                  {exportingPdf ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <FileDown size={18} />
                  )}{' '}
                  {exportingPdf ? 'Generando...' : 'Exportar PDF'}
                </button>
                <button
                  onClick={handleToggleCrisis}
                  className="btn btn-outline"
                  style={{
                    color: tree.modoCrisis ? 'var(--text-primary)' : '#fca5a5',
                    background: tree.modoCrisis ? 'var(--accent-error)' : 'transparent',
                    borderColor: 'var(--accent-error)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: tree.modoCrisis ? '0 0 10px rgba(239, 68, 68, 0.4)' : 'none'
                  }}
                >
                  <AlertTriangle size={18} /> {tree.modoCrisis ? 'Apagar Alarma' : 'B. Pánico'}
                </button>
              </>
            )}
            <button 
              onClick={handleLeaveTree}
              className="btn btn-outline"
              style={{ 
                color: 'var(--accent-error)', 
                borderColor: 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <LogOut size={18} /> Abandonar
            </button>
          </div>
        ) : (
          tree.admissionPolicy === 'OPEN' ? (
            <button 
              onClick={async () => {
                if (!currentUser) {
                   localStorage.setItem('redirectAfterLogin', `/trees/${id}`);
                   navigate('/login');
                } else {
                   try {
                     await api.post('/trees/join', { treeId: id });
                     useTreeStore.getState().fetchTrees();
                     fetchUser();
                     fetchTree();
                     if (activeTab === 'MEMBERS') fetchMembers();
                   } catch (e) {
                     alert('Error al unirse al árbol');
                   }
                }
              }}
              className="btn btn-primary"
            >
              Unirse al Árbol
            </button>
          ) : (
            <button disabled className="btn btn-outline" style={{ cursor: 'not-allowed', opacity: 0.7 }}>
              Requiere Invitación
            </button>
          )
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-4 mb-8" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        <button 
          onClick={() => setActiveTab('DASHBOARD')}
          className="btn"
          style={{ 
            background: 'none', border: 'none', 
            borderBottom: activeTab === 'DASHBOARD' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: activeTab === 'DASHBOARD' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderRadius: 0, padding: '1rem 0.5rem'
          }}
        >
          <Activity size={18} /> Resumen
        </button>
        {settings.modules.fiat.enabled && isMember && (
          <button 
            onClick={() => setActiveTab('FINANCES')}
            className="btn"
            style={{ 
              background: 'none', border: 'none', 
              borderBottom: activeTab === 'FINANCES' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'FINANCES' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRadius: 0, padding: '1rem 0.5rem'
            }}
          >
            <Wallet size={18} /> Finanzas
          </button>
        )}
        {isMember && (
          <button
            onClick={() => setActiveTab('AUTOSUSTENTO')}
            className="btn"
            style={{
              background: 'none', border: 'none',
              borderBottom: activeTab === 'AUTOSUSTENTO' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'AUTOSUSTENTO' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRadius: 0, padding: '1rem 0.5rem'
            }}
          >
            <BriefcaseBusiness size={18} /> Autosustento
          </button>
        )}
        {isMember && (
          <button
            onClick={() => setActiveTab('EXTERNAL_NEEDS')}
            className="btn"
            style={{
              background: 'none', border: 'none',
              borderBottom: activeTab === 'EXTERNAL_NEEDS' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'EXTERNAL_NEEDS' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRadius: 0, padding: '1rem 0.5rem'
            }}
          >
            <BriefcaseBusiness size={18} /> Externas
          </button>
        )}
        {isTreeAdmin && (
          <button
            onClick={() => setActiveTab('CANDIDATES')}
            className="btn"
            style={{
              background: 'none', border: 'none',
              borderBottom: activeTab === 'CANDIDATES' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'CANDIDATES' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRadius: 0, padding: '1rem 0.5rem'
            }}
          >
            <UserCheck size={18} /> Candidatos
          </button>
        )}
        <button 
          onClick={() => setActiveTab('MEMBERS')}
          className="btn"
          style={{ 
            background: 'none', border: 'none', 
            borderBottom: activeTab === 'MEMBERS' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: activeTab === 'MEMBERS' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderRadius: 0, padding: '1rem 0.5rem'
          }}
        >
          <Users size={18} /> {settings.dictionary.memberName || 'Miembros'}
        </button>
        {isMember && (
          <button
            onClick={() => setActiveTab('BERRIES')}
            className="btn"
            style={{
              background: 'none', border: 'none',
              borderBottom: activeTab === 'BERRIES' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'BERRIES' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRadius: 0, padding: '1rem 0.5rem'
            }}
          >
            <Droplets size={18} /> Berries
          </button>
        )}
        {isMember && (
          <button
            onClick={() => setActiveTab('INSIGHT')}
            className="btn"
            style={{
              background: 'none', border: 'none',
              borderBottom: activeTab === 'INSIGHT' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'INSIGHT' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRadius: 0, padding: '1rem 0.5rem'
            }}
          >
            <Telescope size={18} /> Insight
          </button>
        )}
      </div>

      {activeTab === 'DASHBOARD' && (
        <div className="flex flex-col gap-8">
          {isMember && isVerified && (
            <PendingEvidenceList treeId={id!} onUpdate={fetchMembers} />
          )}
          <section className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity stroke="var(--accent-success)" />
                <h3 style={{ margin: 0 }}>Necesidades Activas</h3>
              </div>
              {isMember ? (
                isVerified ? (
                  <button 
                    onClick={() => navigate(`/needs/new?treeId=${id}`)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--accent-success)', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      borderRadius: '50%',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(110, 231, 183, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    title="Nueva Necesidad"
                  >
                    <PlusCircle size={24} />
                  </button>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-warning)', fontStyle: 'italic' }} title="Debes completar tu Rito de Iniciación para crear Necesidades">
                    Rito Pendiente
                  </span>
                )
              ) : null}
            </div>
            <Feed treeId={id} />
          </section>

          <section className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GitBranch stroke="var(--accent-primary)" />
                <h3 style={{ margin: 0 }}>Ramas en Desarrollo</h3>
              </div>
              
              {!isMobile && tree.allowHashtags && (
                <button 
                  onClick={() => setShowHashtagGovModal(true)}
                  style={{ 
                    background: 'none', border: '1px solid var(--border-color)', 
                    color: 'var(--accent-warning)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '4px 10px', borderRadius: '100px', fontSize: '0.8rem',
                    fontWeight: 600, transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-warning)';
                    e.currentTarget.style.background = 'rgba(245,158,11,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  <Hash size={14} /> Gestionar
                </button>
              )}
            </div>
            <BranchFeed treeId={id} isTreeAdmin={isMember && ((membership as any)?.role === 'ADMIN' || tree?.creatorId === currentUser?.id)} refreshTrigger={refreshBranches} />
          </section>
        </div>
      )}

      {activeTab === 'FINANCES' && (
        <FinancialDashboard treeId={id!} isTreeAdmin={isTreeAdmin} />
      )}

      {activeTab === 'AUTOSUSTENTO' && (
        <AutosustentoPanel treeId={id!} isTreeAdmin={isTreeAdmin} />
      )}

      {activeTab === 'BERRIES' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <BerryWalletPanel treeId={id!} isAdmin={isTreeAdmin} />
        </div>
      )}

      {activeTab === 'INSIGHT' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <InsightPanel treeId={id!} isAdmin={isTreeAdmin} />
        </div>
      )}

      {activeTab === 'CANDIDATES' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <ExternalCandidatePanel treeId={id!} />
        </div>
      )}

      {activeTab === 'EXTERNAL_NEEDS' && (
        <ExternalNeedsPanel treeId={id!} isTreeAdmin={isTreeAdmin} />
      )}

      {activeTab === 'MEMBERS' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex justify-between items-center mb-6">
            <h3 style={{ margin: 0 }}>Colaboradores del Árbol</h3>
            {isMember && isVerified && (
              <button 
                onClick={() => setShowInviteModal(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <UserPlus size={18} /> Invitar
              </button>
            )}
          </div>
          
          {loadingMembers ? (
            <p>Cargando miembros...</p>
          ) : members.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron miembros.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {members.map(member => (
                <div key={member.userId} style={{ 
                  background: 'rgba(255,255,255,0.03)', 
                  padding: '1.25rem', 
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '1rem',
                  position: 'relative'
                }}>
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '50%', 
                    background: member.isCreator ? 'var(--accent-warning)' : 'var(--accent-primary)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: 'white',
                    flexShrink: 0
                  }}>
                    {member.username.substring(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{member.username}</div>
                      {member.isCreator && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)', padding: '0 0.4rem', borderRadius: '4px' }}>CREADOR</span>
                      )}
                      
                      {/* Add Contact Icon */}
                      {currentUser && currentUser.id !== member.userId && !isAlreadyContact(member.userId) && (
                        <button
                          onClick={() => handleAddContact(member.userId, member.username)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-success)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.6,
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                          title="Añadir a Personas"
                        >
                          <UserPlus size={16} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                        Nivel {member.level}
                      </div>

                      {settings.governance.powerAssignment === 'HIERARCHICAL' && tree.creatorId === currentUser?.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Puntos:</span>
                          <input 
                            type="number" 
                            defaultValue={member.weeklyNeedPoints}
                            onBlur={async (e) => {
                               if(Number(e.target.value) !== member.weeklyNeedPoints) {
                                  try {
                                    await api.patch(`/trees/${id}/members/${member.userId}/power`, { points: Number(e.target.value) });
                                    fetchMembers();
                                  } catch(e) { alert('Error al asignar poder'); }
                               }
                            }}
                            style={{ 
                              width: '60px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', 
                              color: 'var(--text-primary)', borderRadius: '4px', padding: '0.15rem 0.3rem', fontSize: '0.75rem',
                              outline: 'none'
                            }} 
                           />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Poder:</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{member.weeklyNeedPoints} pts</span>
                        </div>
                      )}
                    </div>
                    
                    {member.invitedByUsername && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                        Invitado por {member.invitedByUsername}
                      </div>
                    )}

                    {member.otherTrees && member.otherTrees.length > 1 && (
                      <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {member.otherTrees
                            .filter((t: any) => t.id !== id)
                            .slice(0, 2)
                            .map((t: any) => (
                              <span key={t.id} style={{ 
                                fontSize: '0.6rem', 
                                background: 'rgba(255,255,255,0.05)', 
                                padding: '0.1rem 0.4rem', 
                                borderRadius: '100px',
                                border: '1px solid var(--border-color)',
                                whiteSpace: 'nowrap',
                                color: 'var(--text-secondary)'
                              }}>
                                {t.name}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {member.canRemove && (
                    <button 
                      onClick={() => handleRemove(member.userId, member.username)}
                      style={{ 
                        position: 'absolute', 
                        top: '0.6rem', 
                        right: '0.6rem',
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid var(--border-color)', 
                        color: 'var(--text-secondary)',
                        cursor: 'pointer', 
                        opacity: 0.7,
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'all 0.2s ease',
                        zIndex: 10
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.7';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                      title="Eliminar del Árbol"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      <AnimatePresence>
        {showHashtagGovModal && (
          <HashtagGovernanceModal 
            tree={tree}
            currentUser={currentUser}
            onClose={() => setShowHashtagGovModal(false)}
            onUpdate={handleRefreshBranches}
          />
        )}
        {showInviteModal && (
          <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel p-6 w-full max-w-md"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Invitar Miembros</h3>
                <button 
                  onClick={() => { setShowInviteModal(false); setGuestLink(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Botón de Generación de Enlace Temporal */}
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                {guestLink ? (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--accent-primary)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>Enlace Temporal (1 Uso)</div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        value={guestLink} 
                        readOnly 
                        className="input-field" 
                        style={{ flex: 1, fontSize: '0.85rem' }}
                      />
                      <button 
                        onClick={wrapCopyGuestLink}
                        className={linkCopied ? "btn btn-primary" : "btn btn-outline"} 
                        style={{ padding: '0.5rem', minWidth: '40px', display: 'flex', justifyContent: 'center' }}
                      >
                        {linkCopied ? <Check size={16} /> : <Copy size={16} color="var(--accent-primary)" />}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: 0 }}>
                      Este enlace expirará en 24 horas y solo puede ser usado una vez.
                    </p>
                  </div>
                ) : (
                  <button 
                    onClick={handleGenerateGuestLink}
                    className="btn btn-outline w-full"
                    style={{ padding: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
                  >
                    <Link size={18} /> Generar Enlace Temporal (1 uso)
                  </button>
                )}
              </div>

              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>O invitar desde Contactos</h4>

              <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto pr-2">
                {(() => {
                  const nonMemberContacts = contacts.filter(c => !members.some(m => m.userId === c.id));
                  if (nonMemberContacts.length === 0) {
                    return (
                      <div className="text-center py-8 text-secondary italic">
                        {contacts.length === 0 
                          ? 'No tienes contactos agregados. Agrégalos en "Personas" primero.' 
                          : 'Todos tus contactos ya son miembros de este Árbol.'}
                      </div>
                    );
                  }
                  return nonMemberContacts.map(contact => (
                    <div key={contact.id} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      padding: '0.75rem', borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)'
                    }}>
                      <div className="flex items-center gap-3">
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {contact.username[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{contact.username}</span>
                      </div>
                      <button 
                        onClick={() => handleInvite(contact.id)}
                        className="btn btn-primary"
                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        Invitar
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Express Task Modal */}
      <AnimatePresence>
        {showExpressModal && (
          <ExpressTaskModal 
            treeId={id!} 
            onClose={() => setShowExpressModal(false)}
            onSuccess={() => {
              setShowExpressModal(false);
              setActiveTab('DASHBOARD');
              handleRefreshBranches();
            }}
          />
        )}
      </AnimatePresence>

      {/* Floating Action Button - Desktop only for Tree Detail */}
      {isMember && tree.allowHashtags && !isMobile && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowExpressModal(true)}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--accent-warning)',
            color: 'black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(245, 158, 11, 0.4)',
            border: 'none',
            cursor: 'pointer',
            zIndex: 90
          }}
          title="Tarea Express"
        >
          <Zap size={28} fill="black" />
        </motion.button>
      )}
    </div>
  );
}
