import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TreePine, Users, Check, X, ShieldAlert, BookOpen, Layers, GitBranch, ChevronDown, ChevronUp, Save, LayoutTemplate, Settings2 } from 'lucide-react';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTreeStore, defaultTreeSettings } from '../store/treeStore';
import { useAuthStore } from '../store/authStore';
import type { TreeSettings } from '../store/treeStore';

const AVAILABLE_PHASES = [
  { id: 'INVESTIGATION', label: 'Investigación' },
  { id: 'DEVELOPMENT', label: 'Desarrollo' },
  { id: 'PRODUCTION', label: 'Producción' },
  { id: 'DISTRIBUTION', label: 'Distribución' },
  { id: 'MAINTENANCE', label: 'Mantenimiento' },
  { id: 'RECYCLING', label: 'Reciclaje' }
];

export default function CreateTree() {
  const [name, setName] = useState('');
  const [description] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingContacts, setFetchingContacts] = useState(true);
  const [allowHashtags, setAllowHashtags] = useState(true);
  const [allowTraditionalBranches, setAllowTraditionalBranches] = useState(true);
  const [hashtagCreationPolicy, setHashtagCreationPolicy] = useState<'ADMIN_ONLY' | 'USERS_ONLY' | 'ADMIN_AND_USERS'>('ADMIN_AND_USERS');
  const [modoGobierno, setModoGobierno] = useState<'DEMOCRATICO' | 'ADMIN' | 'HIBRIDO'>('DEMOCRATICO');
  const [creacionRamaDirecta, setCreacionRamaDirecta] = useState(false);
  const [creacionRamaComunitaria, setCreacionRamaComunitaria] = useState(true);
  const [capacidadesRaw, setCapacidadesRaw] = useState('');
  
  
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const fromSelection = location.state?.fromSelection || false;
  const initialSelectedIds = location.state?.selectedUserIds || [];

  useEffect(() => {
    if (initialSelectedIds.length > 0) {
      setSelectedContactIds(initialSelectedIds);
    }
  }, []);

  const [settings, setSettings] = useState<TreeSettings>(defaultTreeSettings);
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [admissionPolicy, setAdmissionPolicy] = useState<'OPEN' | 'INVITE_ONLY'>('INVITE_ONLY');

  // Plantillas State
  const { user } = useAuthStore();
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [, setLoadingPlantillas] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inheritedIcon, setInheritedIcon] = useState('🌳');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateIcon, setTemplateIcon] = useState('🌳');
  const [templateIsGlobal, setTemplateIsGlobal] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const updateModule = (modName: keyof TreeSettings['modules'], field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [modName]: {
          ...(prev.modules[modName] as any),
          [field]: value
        }
      }
    }));
  };

  const updateGov = (field: keyof TreeSettings['governance'], value: any) => {
    setSettings(prev => ({ ...prev, governance: { ...prev.governance, [field]: value } }));
  };

  const updateDict = (field: keyof TreeSettings['dictionary'], value: any) => {
    setSettings(prev => ({ ...prev, dictionary: { ...prev.dictionary, [field]: value } }));
  };

  const togglePhase = (phaseId: string) => {
    setSettings(prev => {
      const isActive = prev.phases.includes(phaseId as any);
      return {
        ...prev,
        phases: isActive 
          ? prev.phases.filter(p => p !== phaseId) 
          : [...prev.phases, phaseId as any]
      };
    });
  };

  useEffect(() => {
    fetchContacts();
    fetchPlantillas();
  }, []);

  const fetchContacts = async () => {
    try {
      const { data } = await api.get('/contacts');
      setContacts(data);
    } catch (e) {
      console.error('Error fetching contacts', e);
    } finally {
      setFetchingContacts(false);
    }
  };

  const fetchPlantillas = async () => {
    try {
      const { data } = await api.get('/plantillas');
      setPlantillas(data);
    } catch (e) {
      console.error('Error fetching plantillas', e);
    } finally {
      setLoadingPlantillas(false);
    }
  };

  const loadPlantilla = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    
    const p = plantillas.find(t => t.id === templateId);
    if (!p) return;

    if (p.icono) setInheritedIcon(p.icono);

    if(!p.configuracion) return;
    try {
      const config = typeof p.configuracion === 'string' ? JSON.parse(p.configuracion) : p.configuracion;
      if (config.modoGobierno) setModoGobierno(config.modoGobierno);
      if (config.creacionRamaDirecta !== undefined) setCreacionRamaDirecta(config.creacionRamaDirecta);
      if (config.creacionRamaComunitaria !== undefined) setCreacionRamaComunitaria(config.creacionRamaComunitaria);
      if (config.allowHashtags !== undefined) setAllowHashtags(config.allowHashtags);
      if (config.allowTraditionalBranches !== undefined) setAllowTraditionalBranches(config.allowTraditionalBranches);
      if (config.hashtagCreationPolicy) setHashtagCreationPolicy(config.hashtagCreationPolicy);
      if (config.visibility) setVisibility(config.visibility);
      if (config.admissionPolicy) setAdmissionPolicy(config.admissionPolicy);
      if (config.settings) setSettings(config.settings);
    } catch (e) {
      console.error("Error parsing plantilla config:", e);
    }
  };

  const handleSavePlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    
    const configPayload = {
      modoGobierno,
      creacionRamaDirecta,
      creacionRamaComunitaria,
      allowHashtags,
      allowTraditionalBranches,
      hashtagCreationPolicy,
      visibility,
      admissionPolicy,
      settings
    };

    try {
      const res = await api.post('/plantillas', {
        nombre: templateName,
        descripcion: "Plantilla personalizada.",
        icono: templateIcon,
        configuracion: configPayload,
        guardarComoGlobal: templateIsGlobal
      });
      setPlantillas(prev => [res.data, ...prev]);
      setShowSaveModal(false);
      setTemplateName('');
      setTemplateIsGlobal(false);
    } catch(err: any) {
      alert(err.response?.data?.error || "Error al guardar plantilla");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleToggleContact = (id: string) => {
    setSelectedContactIds(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/trees', { 
        name,
        icono: inheritedIcon,
        description, 
        inviteUserIds: selectedContactIds,
        visibility,
        admissionPolicy,
        allowHashtags,
        allowTraditionalBranches,
        hashtagCreationPolicy,
        modoGobierno,
        creacionRamaDirecta,
        creacionRamaComunitaria,
        capacidades: JSON.stringify(capacidadesRaw.split(',').map(s => s.trim().startsWith('#') ? s.trim() : '#' + s.trim()).filter(s => s.length > 1)),
        settings: JSON.stringify(settings) // Serialize engine configuration
      });
      // Refresh global tree list
      useTreeStore.getState().fetchTrees();
      navigate(`/trees/${data.id}`);
    } catch (e) {
      alert(t('trees.create_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-8" style={{ maxWidth: '800px', paddingBottom: '4rem' }}>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-gradient">
            {fromSelection ? 'Configurar nuevo Árbol' : t('trees.create_title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {fromSelection 
              ? `Estás creando un árbol con ${initialSelectedIds.length} integrantes seleccionados.`
              : t('trees.create_subtitle')}
          </p>
        </div>
        <button onClick={() => navigate('/people')} className="btn btn-outline" style={{ padding: '0.5rem' }}>
           <X size={20} />
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        
        {/* BLOQUE MINIMALISTA PRINCIPAL */}
        <section className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex flex-col gap-6">
            
            {/* HERENCIA DE EMOJI Y NOMBRE */}
            <div className="flex items-start gap-4">
              <div 
                className="flex items-center justify-center shrink-0" 
                style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', fontSize: '2rem' }}
                title="Este icono se hereda de la Plantilla seleccionada"
              >
                {inheritedIcon}
              </div>
              <div className="flex-1">
                <label style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>{t('trees.name_label')}</label>
                <input 
                  type="text" 
                  placeholder={t('trees.name_placeholder')} 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field" 
                  style={{ width: '100%', height: '48px', fontSize: '1.1rem' }}
                  required
                />
              </div>
            </div>

            {/* CAPACIDADES DEL ÁRBOL */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Capacidades Profesionales / Proveedor</label>
              <input 
                type="text" 
                placeholder="#Fontaneria, #Psicologia, #Transporte" 
                value={capacidadesRaw}
                onChange={(e) => setCapacidadesRaw(e.target.value)}
                className="input-field" 
                style={{ width: '100%', height: '48px', fontSize: '1rem' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Esto inscribirá al Árbol en el Buscador Geoespacial. Los usuarios de tu sector podrán solicitarte estas tareas.
              </p>
            </div>

            {/* SELECTOR DE PLANTILLAS */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LayoutTemplate size={16} className="text-gradient" />
                Tipo de Árbol / Plantilla
              </label>
              <select 
                className="input-field w-full" 
                value={selectedTemplateId} 
                onChange={(e) => loadPlantilla(e.target.value)}
                style={{ height: '48px' }}
              >
                <option value="" disabled>Selecciona una plantilla...</option>
                
                {plantillas.filter(p => p.esGlobal).length > 0 && (
                  <optgroup label="Plantillas Oficiales (Globales)">
                    {plantillas.filter(p => p.esGlobal).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}

                {plantillas.filter(p => !p.esGlobal).length > 0 && (
                  <optgroup label="Mis Plantillas (Privadas)">
                    {plantillas.filter(p => !p.esGlobal).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Esto configurará automáticamente las opciones avanzadas y el Icono del Árbol de forma invisible.
              </p>
            </div>

            {/* INTEGRANTES INICIALES */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={16} className="text-blue-400" />
                Integrantes Iniciales (Opcional)
              </label>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {fetchingContacts ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('trees.invites.loading')}</p>
                ) : contacts.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('trees.invites.empty')}</p>
                ) : initialSelectedIds.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ningún contacto seleccionado.</p>
                ) : (
                  contacts
                    .filter(contact => initialSelectedIds.includes(contact.id))
                    .map(contact => (
                      <div 
                        key={contact.id}
                        onClick={() => handleToggleContact(contact.id)}
                        className="hover-lift"
                        style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.5rem 1rem', cursor: 'pointer',
                          background: selectedContactIds.includes(contact.id) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                          border: '1px solid', borderColor: selectedContactIds.includes(contact.id) ? 'var(--accent-primary)' : 'var(--border-color)',
                          borderRadius: 'var(--radius-md)', transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '19px' }}>{contact.username}</span>
                        </div>
                        {selectedContactIds.includes(contact.id) && <Check size={16} color="var(--accent-primary)" />}
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>
        </section>

        {/* BOTÓN TOGGLE ACORDEÓN */}
        <div className="flex items-center gap-4">
           <hr style={{ flex: 1, borderColor: 'var(--border-color)', opacity: 0.5 }} />
           <button 
             type="button" 
             onClick={() => setShowAdvanced(!showAdvanced)}
             className="flex items-center gap-2 px-4 py-2 rounded-full font-medium"
             style={{ background: 'var(--bg-highlight)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
           >
             <Settings2 size={16} />
             {showAdvanced ? 'Ocultar Configuración Avanzada' : '⚙️ Mostrar Configuración Avanzada'}
             {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
           </button>
           <hr style={{ flex: 1, borderColor: 'var(--border-color)', opacity: 0.5 }} />
        </div>

        {/* ACORDEÓN DE CONFIGURACIÓN AVANZADA */}
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }}
              className="flex flex-col gap-8"
            >

        {/* GOBERNANZA */}
        <section className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex items-center gap-2 mb-4">
             <ShieldAlert size={18} stroke="var(--accent-danger)" />
             <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('trees.gov.title')}</h3>
          </div>
          <div className="flex flex-col gap-6">

             {/* CONFIGURACIÓN AVANZADA DE GOBIERNO */}
             <div style={{ padding: '1.25rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>Configuración Avanzada de Gobierno</label>
                <div className="flex flex-col gap-5">
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Modo de Votación de Ramas/Hashtags</label>
                    <select 
                      className="input-field w-full" 
                      value={modoGobierno} 
                      onChange={(e) => setModoGobierno(e.target.value as any)}
                    >
                      <option value="DEMOCRATICO">Democrático (El Quorum decide el valor Oficial)</option>
                      <option value="ADMIN">Administrador (Permite sugerir pero el Admin decide)</option>
                      <option value="HIBRIDO">Híbrido (Depende de si la rama es votable)</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={creacionRamaDirecta} onChange={(e) => setCreacionRamaDirecta(e.target.checked)} style={{ marginTop: '0.25rem' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Admins pueden crear ramas directamente</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Poder absoluto para ignorar la fase de ideación y arrancar una rama de inmediato.</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={creacionRamaComunitaria} onChange={(e) => setCreacionRamaComunitaria(e.target.checked)} style={{ marginTop: '0.25rem' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Creación Comunitaria Habilitada</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Permite a los miembros proponer Necesidades e Ideas libremente. Apágalo si quieres una jerarquía estricta.</div>
                    </div>
                  </label>
                </div>
             </div>

             {/* ESTRUCTURA DE RAMAS */}
             <div style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>Estructura de Trabajo</label>
                <div className="flex flex-col gap-3">
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={allowTraditionalBranches} onChange={(e) => setAllowTraditionalBranches(e.target.checked)} disabled={!allowHashtags && allowTraditionalBranches} />
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Ramas Tradicionales</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Flujo de proyectos con fases de investigación y votación de ideas.</div>
                      </div>
                   </label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={allowHashtags} onChange={(e) => setAllowHashtags(e.target.checked)} disabled={allowHashtags && !allowTraditionalBranches} />
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Hashtags (#) / Tareas Express</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Categorías globales para tareas del día a día sin burocracia.</div>
                      </div>
                   </label>
                </div>
                {!allowHashtags && !allowTraditionalBranches && (
                  <p style={{ color: 'var(--accent-danger)', fontSize: '0.7rem', marginTop: '0.5rem' }}>Debes seleccionar al menos un tipo de rama.</p>
                )}
             </div>

             {/* POLÍTICA DE CREACIÓN DE HASHTAGS (Solo se muestra si hashtags están activos) */}
             {allowHashtags && (
               <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>¿Quién puede crear nuevos Hashtags?</label>
                  <select 
                    className="input-field w-full" 
                    value={hashtagCreationPolicy} 
                    onChange={(e) => setHashtagCreationPolicy(e.target.value as any)}
                  >
                    <option value="ADMIN_AND_USERS">Administradores y Usuarios</option>
                    <option value="ADMIN_ONLY">Solo Administradores</option>
                    <option value="USERS_ONLY">Solo Usuarios (Vía Votación)</option>
                  </select>
               </div>
             )}
             
             {/* VISIBILIDAD */}
             <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>Visibilidad (Lectura)</label>
                <div className="flex gap-4">
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="radio" name="visibility" checked={visibility === 'PUBLIC'} onChange={() => setVisibility('PUBLIC')} />
                      <span style={{ fontSize: '0.9rem' }}>Público (Vitrina de Cristal)</span>
                   </label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="radio" name="visibility" checked={visibility === 'PRIVATE'} onChange={() => setVisibility('PRIVATE')} />
                      <span style={{ fontSize: '0.9rem' }}>Privado (Solo Miembros)</span>
                   </label>
                </div>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                   {visibility === 'PUBLIC' 
                     ? "Cualquiera con el enlace puede ver las tareas y estadísticas globales en modo solo lectura." 
                     : "Solo los miembros inscritos pueden ver la información de este árbol."}
                </p>
             </div>

             {/* POLÍTICA DE INGRESO */}
             <div style={{ padding: '1.25rem', background: 'rgba(234, 179, 8, 0.05)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>Política de Ingreso (Participación)</label>
                <div className="flex gap-4">
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="radio" name="admissionPolicy" checked={admissionPolicy === 'OPEN'} onChange={() => setAdmissionPolicy('OPEN')} />
                      <span style={{ fontSize: '0.9rem' }}>Abierto</span>
                   </label>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="radio" name="admissionPolicy" checked={admissionPolicy === 'INVITE_ONLY'} onChange={() => setAdmissionPolicy('INVITE_ONLY')} />
                      <span style={{ fontSize: '0.9rem' }}>Por Invitación / Aprobación</span>
                   </label>
                </div>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                   {admissionPolicy === 'OPEN' 
                     ? "Cualquier usuario de la red puede presionar Unirse y empezar a participar." 
                     : "Los usuarios requieren una invitación directa de un miembro admin para unirse (o solicitar acceso)."}
                </p>
             </div>

             <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
               <input type="checkbox" checked={!settings.governance.anyoneCanInvite} onChange={(e) => updateGov('anyoneCanInvite', !e.target.checked)} style={{ marginTop: '0.25rem' }} />
               <div>
                 <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t('trees.gov.admin_invite_only')}</div>
                 <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('trees.gov.admin_invite_desc')}</div>
               </div>
             </label>
             
             <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
               <input type="checkbox" checked={!settings.governance.inviterCanDelete} onChange={(e) => updateGov('inviterCanDelete', !e.target.checked)} style={{ marginTop: '0.25rem' }} />
               <div>
                 <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t('trees.gov.admin_delete_only')}</div>
                 <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('trees.gov.admin_delete_desc')}</div>
               </div>
             </label>

             <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>Votación de Necesidades</label>
                <select 
                  className="input-field w-full" 
                  value={settings.governance.needVoting} 
                  onChange={(e) => updateGov('needVoting', e.target.value)}
                >
                  <option value="DEMOCRATIC">Democrático (Requiere Votación)</option>
                  <option value="DIRECT_ACTION">Acción Directa (Conversión Inmediata)</option>
                </select>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                   {settings.governance.needVoting === 'DEMOCRATIC' 
                     ? "Las ideas requieren el apoyo de la comunidad para convertirse en Ramas." 
                     : "Las ideas se convierten en Ramas inmediatamente. Si nadie se une en 7 días, caducan."}
                </p>
             </div>

             {/* HORARIO DE DECAIMIENTO */}
             <div style={{ padding: '1rem', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>Horario de Decaimiento de XP</label>
                <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                   <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', flex: 1, minWidth: '200px' }}>
                      <input
                        type="radio"
                        name="decayMode"
                        checked={settings.governance.decayMode === 'CONTINUOUS'}
                        onChange={() => updateGov('decayMode', 'CONTINUOUS')}
                        style={{ marginTop: '0.25rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Continuo (24/7)</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>El castigo por inactividad se aplica todos los días. Ideal para hogares.</div>
                      </div>
                   </label>
                   <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', flex: 1, minWidth: '200px' }}>
                      <input
                        type="radio"
                        name="decayMode"
                        checked={settings.governance.decayMode === 'WORKDAY'}
                        onChange={() => updateGov('decayMode', 'WORKDAY')}
                        style={{ marginTop: '0.25rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Laboral (Lun–Vie) 🛡️</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>El decaimiento se pausa los fines de semana. Los usuarios siguen ganando XP libremente. Ideal para equipos y colegios.</div>
                      </div>
                   </label>
                </div>
             </div>

             <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.5rem' }}>{t('trees.gov.power_label')}</label>
                <select 
                  className="input-field w-full" 
                  value={settings.governance.powerAssignment} 
                  onChange={(e) => updateGov('powerAssignment', e.target.value)}
                >
                  <option value="EGALITARIAN">{t('trees.gov.power_egalitarian')}</option>
                  <option value="HIERARCHICAL">{t('trees.gov.power_hierarchical')}</option>
                </select>
             </div>

          </div>
        </section>

        {/* FASES */}
        <section className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex items-center gap-2 mb-4">
             <GitBranch size={18} stroke="var(--accent-primary)" />
             <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('trees.phases.title')}</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            {t('trees.phases.subtitle')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {AVAILABLE_PHASES.map(phase => {
              const isActive = settings.phases.includes(phase.id as any);
              return (
                <button
                  key={phase.id}
                  type="button"
                  onClick={() => togglePhase(phase.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '100px',
                    border: '1px solid',
                    background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                    borderColor: isActive ? 'var(--accent-success)' : 'var(--border-color)',
                    color: isActive ? 'var(--accent-success)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.85rem'
                  }}
                >
                  {t(`branches.phases.${phase.id}.name`)}
                </button>
              );
            })}
          </div>
        </section>

        <section className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex items-center gap-2 mb-4">
             <Layers size={18} stroke="var(--accent-success)" />
             <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('trees.modules.title')}</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            {t('trees.modules.subtitle')}
          </p>

          <div className="flex flex-col gap-4">
            {/* XP Module */}
            <ModuleConfig 
               title={t('trees.modules.xp.title')}
               checked={settings.modules.points.enabled}
               onToggle={(c: boolean) => updateModule('points', 'enabled', c)}
            >
              <label>{t('trees.modules.metric_name')}</label>
              <input className="input-field" value={settings.modules.points.name} onChange={(e) => updateModule('points', 'name', e.target.value)} placeholder={t('trees.modules.xp.placeholder')} />
            </ModuleConfig>

            {/* Fiat Module */}
            <ModuleConfig 
               title={t('trees.modules.fiat.title')}
               checked={settings.modules.fiat.enabled}
               onToggle={(c: boolean) => updateModule('fiat', 'enabled', c)}
            >
              <label>{t('trees.modules.metric_name')}</label>
              <input className="input-field" value={settings.modules.fiat.name} onChange={(e) => updateModule('fiat', 'name', e.target.value)} placeholder={t('trees.modules.fiat.placeholder')} />
            </ModuleConfig>

            {/* Levels Module */}
            <ModuleConfig 
               title={t('trees.modules.levels.title')}
               checked={settings.modules.levels.enabled}
               onToggle={(c: boolean) => updateModule('levels', 'enabled', c)}
            >
              <label>{t('trees.modules.metric_name')}</label>
              <input className="input-field" value={settings.modules.levels.name} onChange={(e) => updateModule('levels', 'name', e.target.value)} placeholder={t('trees.modules.levels.placeholder')} />
            </ModuleConfig>

            {/* Effort Module */}
            <ModuleConfig 
               title={t('trees.modules.effort.title')}
               checked={settings.modules.effort.enabled}
               onToggle={(c: boolean) => updateModule('effort', 'enabled', c)}
            >
              <label>{t('trees.modules.metric_name')}</label>
              <input className="input-field mb-4 w-full" value={settings.modules.effort.name} onChange={(e) => updateModule('effort', 'name', e.target.value)} placeholder={t('trees.modules.effort.placeholder')} />
              
              <label>{t('trees.modules.effort.mode_label')}</label>
              <select className="input-field w-full" value={settings.modules.effort.mode} onChange={(e) => updateModule('effort', 'mode', e.target.value)}>
                <option value="DIFFICULTY_AND_TIME">{t('trees.modules.effort.mode_full')}</option>
                <option value="DIFFICULTY_ONLY">{t('trees.modules.effort.mode_diff')}</option>
                <option value="TIME_ONLY">{t('trees.modules.effort.mode_time')}</option>
              </select>
            </ModuleConfig>

            {/* Satisfaction Module */}
            <ModuleConfig 
               title={t('trees.modules.satisfaction.title')}
               checked={settings.modules.satisfaction.enabled}
               onToggle={(c: boolean) => updateModule('satisfaction', 'enabled', c)}
            >
              <label>{t('trees.modules.metric_name')}</label>
              <input className="input-field mb-4 w-full" value={settings.modules.satisfaction.name} onChange={(e) => updateModule('satisfaction', 'name', e.target.value)} placeholder={t('trees.modules.satisfaction.placeholder')} />
              
              <label>{t('trees.modules.satisfaction.eval_label')}</label>
              <select className="input-field w-full" value={settings.modules.satisfaction.evaluators} onChange={(e) => updateModule('satisfaction', 'evaluators', e.target.value)}>
                <option value="EVERYONE">{t('trees.modules.satisfaction.eval_everyone')}</option>
                <option value="NEED_SPONSORS">{t('trees.modules.satisfaction.eval_sponsors')}</option>
                <option value="IDEA_VOTERS">{t('trees.modules.satisfaction.eval_voters')}</option>
                <option value="ASSIGNED_EXPERTS">{t('trees.modules.satisfaction.eval_experts')}</option>
              </select>
            </ModuleConfig>
          </div>
        </section>

        <section className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex items-center gap-2 mb-4">
             <BookOpen size={18} stroke="var(--accent-secondary)" />
             <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('trees.dict.title')}</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
             <div>
               <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('trees.dict.tree_label')}</label>
               <input className="input-field w-full mt-2" value={settings.dictionary.treeName} onChange={(e) => updateDict('treeName', e.target.value)} placeholder={t('trees.dict.tree_placeholder')} />
             </div>
             <div>
               <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('trees.dict.member_label')}</label>
               <input className="input-field w-full mt-2" value={settings.dictionary.memberName} onChange={(e) => updateDict('memberName', e.target.value)} placeholder={t('trees.dict.member_placeholder')} />
             </div>
             <div>
               <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('trees.dict.branch_label')}</label>
               <input className="input-field w-full mt-2" value={settings.dictionary.branchName} onChange={(e) => updateDict('branchName', e.target.value)} placeholder={t('trees.dict.branch_placeholder')} />
             </div>
          </div>
        </section>

            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-4 items-center mt-4">
          <button 
            type="submit" 
            className="btn btn-primary btn-large flex items-center justify-center gap-2 flex-1" 
            disabled={loading || !name.trim()}
            style={{ height: '56px', fontSize: '1.1rem' }}
          >
            <TreePine size={20} />
            {loading ? t('trees.initializing') : t('trees.create_btn', { name: settings.dictionary.treeName })}
          </button>

          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="btn btn-outline flex items-center justify-center gap-2 hover-lift"
            style={{ height: '56px', fontSize: '0.95rem', padding: '0 1.5rem', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            <Save size={18} />
            Guardar Preset
          </button>
        </div>
      </form>

      {/* MODAL GUARDAR PLANTILLA */}
      <AnimatePresence>
        {showSaveModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', padding: '1rem' }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel"
              style={{ padding: '2rem', width: '100%', maxWidth: '420px', background: 'var(--bg-card)', margin: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  <Save size={20} className="text-gradient" />
                  Nueva Plantilla
                </h3>
                <button type="button" onClick={() => setShowSaveModal(false)} className="text-neutral-400 hover:text-white transition-colors"><X size={20} /></button>
              </div>

              <form onSubmit={handleSavePlantilla} className="flex flex-col gap-4">
                <div>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>Nombre de la Plantilla</label>
                  <input type="text" className="input-field w-full" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Ej. Startup, ONG, Familiar" required autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>Icono (Emoji)</label>
                  <input type="text" className="input-field w-full" value={templateIcon} onChange={e => setTemplateIcon(e.target.value)} placeholder="🌳" maxLength={4} required />
                </div>
                
                {user?.role === 'ADMINISTRATOR' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginTop: '0.5rem' }}>
                    <input type="checkbox" checked={templateIsGlobal} onChange={e => setTemplateIsGlobal(e.target.checked)} />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Guardar como Global (Oficial)</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Visible universalmente para todos los usuarios de la red.</div>
                    </div>
                  </label>
                )}

                <button type="submit" className="btn btn-primary mt-4 flex justify-center w-full shadow-lg" disabled={savingTemplate || !templateName.trim()} style={{ height: '48px', fontWeight: 600 }}>
                  {savingTemplate ? 'Validando...' : 'Confirmar y Guardar'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Subcomponent for conditional rendering blocks
function ModuleConfig({ title, checked, onToggle, children }: any) {
  return (
    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', margin: 0 }}>
         <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
         <span style={{ fontWeight: 600, fontSize: '0.95rem', color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{title}</span>
      </label>
      <AnimatePresence>
        {checked && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: 'auto', opacity: 1, marginTop: '1rem' }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingLeft: '2rem', borderLeft: '2px solid var(--border-color)' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
