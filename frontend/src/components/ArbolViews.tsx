import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, TreePine, TrendingUp, TrendingDown, Wallet, Star, ChevronDown, ChevronRight, ShieldAlert, Siren, Users, Link, Settings2, LayoutTemplate } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useTreeStore, defaultTreeSettings } from '../store/treeStore';
import type { TreeSettings } from '../store/treeStore';
import { OptimizedText } from './OptimizedText';
import { motion, AnimatePresence } from 'framer-motion';
import { useMatrixStore } from '../store/matrixStore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import useOnboardingTooltips from '../hooks/useOnboardingTooltips';


const AVAILABLE_PHASE_IDS = ['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'DISTRIBUTION', 'MAINTENANCE', 'RECYCLING'];

// ─────────────────────────────────────────────────────────────────────────────
// CREAR: Foundation + templates + advanced config
// ─────────────────────────────────────────────────────────────────────────────
export function ArbolCrear({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation();
  // Basic fields
  const [name,          setName]          = useState('');
  const [icono,         setIcono]         = useState('🌳');
  const [description,   setDescription]   = useState('');
  const [capacidadesRaw,setCapacidadesRaw]= useState('');

  // Template
  const [plantillas,          setPlantillas]          = useState<any[]>([]);
  const [loadingPlantillas,   setLoadingPlantillas]   = useState(true);
  const [selectedTemplateId,  setSelectedTemplateId]  = useState('');

  // Advanced settings (same as CreateTree)
  const [settings,           setSettings]           = useState<TreeSettings>(defaultTreeSettings);
  const [visibility,         setVisibility]         = useState<'PRIVATE'|'PUBLIC'>('PRIVATE');
  const [admissionPolicy,    setAdmissionPolicy]    = useState<'OPEN'|'INVITE_ONLY'>('INVITE_ONLY');
  const [modoGobierno,       setModoGobierno]       = useState<'DEMOCRATICO'|'ADMIN'|'HIBRIDO'>('DEMOCRATICO');
  const [creacionRamaDirecta,  setCreacionRamaDirecta]  = useState(false);
  const [creacionRamaComunitaria, setCreacionRamaComunitaria] = useState(true);
  const [allowHashtags,        setAllowHashtags]        = useState(true);
  const [allowTraditionalBranches, setAllowTraditionalBranches] = useState(true);
  const [hashtagCreationPolicy, setHashtagCreationPolicy] = useState<'ADMIN_ONLY'|'USERS_ONLY'|'ADMIN_AND_USERS'>('ADMIN_AND_USERS');

  // Federation
  const [federacion, setFederacion] = useState(false);
  const [parentId,   setParentId]   = useState('');

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const canSubmit = name.trim().length >= 2 && icono.trim().length > 0;

  // Helpers for settings
  const updateGov = (field: keyof TreeSettings['governance'], value: any) =>
    setSettings(prev => ({ ...prev, governance: { ...prev.governance, [field]: value } }));

  const togglePhase = (phaseId: string) =>
    setSettings(prev => ({
      ...prev,
      phases: prev.phases.includes(phaseId as any)
        ? prev.phases.filter(p => p !== phaseId)
        : [...prev.phases, phaseId as any],
    }));


  // Fetch plantillas
  useEffect(() => {
    api.get('/plantillas')
      .then(({ data }) => setPlantillas(data))
      .catch(() => {})
      .finally(() => setLoadingPlantillas(false));
  }, []);

  const loadPlantilla = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const p = plantillas.find(t => t.id === templateId);
    if (!p) return;
    if (p.icono) setIcono(p.icono);
    if (!p.configuracion) return;
    try {
      const config = typeof p.configuracion === 'string' ? JSON.parse(p.configuracion) : p.configuracion;
      if (config.modoGobierno)           setModoGobierno(config.modoGobierno);
      if (config.creacionRamaDirecta !== undefined) setCreacionRamaDirecta(config.creacionRamaDirecta);
      if (config.creacionRamaComunitaria !== undefined) setCreacionRamaComunitaria(config.creacionRamaComunitaria);
      if (config.allowHashtags !== undefined)      setAllowHashtags(config.allowHashtags);
      if (config.allowTraditionalBranches !== undefined) setAllowTraditionalBranches(config.allowTraditionalBranches);
      if (config.hashtagCreationPolicy)  setHashtagCreationPolicy(config.hashtagCreationPolicy);
      if (config.visibility)             setVisibility(config.visibility);
      if (config.admissionPolicy)        setAdmissionPolicy(config.admissionPolicy);
      if (config.settings)               setSettings(config.settings);
    } catch (e) { console.error('Error parsing plantilla', e); }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true); setError('');
    try {
      await api.post('/trees', {
        name: name.trim(),
        icono,
        description,
        visibility,
        admissionPolicy,
        allowHashtags,
        allowTraditionalBranches,
        hashtagCreationPolicy,
        modoGobierno,
        creacionRamaDirecta,
        creacionRamaComunitaria,
        capacidades: JSON.stringify(
          capacidadesRaw.split(',')
            .map(s => s.trim().startsWith('#') ? s.trim() : '#' + s.trim())
            .filter(s => s.length > 1)
        ),
        settings: JSON.stringify(settings),
      });
      // Federation: try to join parent tree
      if (federacion && parentId.trim()) {
        await api.post('/trees/join', { inviteCode: parentId.trim() }).catch(() => {});
      }
      useTreeStore.getState().fetchTrees();
      onCreated?.();
      // Reset
      setName(''); setIcono('🌳'); setDescription(''); setCapacidadesRaw('');
      setSelectedTemplateId(''); setFederacion(false); setParentId('');
      setSettings(defaultTreeSettings); setShowAdvanced(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || t('m.arbol.crear.error_creating'));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '6rem' }}>

      {/* Icon preview */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '3rem', lineHeight: 1 }}>{icono || '🌳'}</span>
        </div>
      </div>

      {/* Plantilla selector */}
      <div>
        <label style={labelStyle}>
          <LayoutTemplate size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
          {t('m.arbol.crear.template_label')}
        </label>
        <select
          value={selectedTemplateId}
          onChange={e => loadPlantilla(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
          disabled={loadingPlantillas}
        >
          <option value="">{t('m.arbol.crear.no_template')}</option>
          {plantillas.filter(p => p.esGlobal).length > 0 && (
            <optgroup label={t('m.arbol.crear.official_templates')}>
              {plantillas.filter(p => p.esGlobal).map(p => (
                <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>
              ))}
            </optgroup>
          )}
          {plantillas.filter(p => !p.esGlobal).length > 0 && (
            <optgroup label={t('m.arbol.crear.my_templates')}>
              {plantillas.filter(p => !p.esGlobal).map(p => (
                <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>
              ))}
            </optgroup>
          )}
        </select>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          {t('m.arbol.crear.template_hint')}
        </p>
      </div>

      {/* Emoji (editable) */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 64px' }}>
          <label style={labelStyle}>{t('m.arbol.crear.icon')}</label>
          <input
            value={icono} onChange={e => setIcono(e.target.value)}
            maxLength={4}
            style={{ ...inputStyle, textAlign: 'center', fontSize: '1.5rem', padding: '0.4rem' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{t('m.arbol.crear.name_label')}</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder={t('m.arbol.crear.name_placeholder')}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Capacidades */}
      <div>
        <label style={labelStyle}>{t('m.arbol.crear.capabilities_label')}</label>
        <input
          value={capacidadesRaw} onChange={e => setCapacidadesRaw(e.target.value)}
          placeholder={t('m.arbol.crear.capabilities_placeholder')}
          style={inputStyle}
        />
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
          {t('m.arbol.crear.capabilities_hint')}
        </p>
      </div>

      {/* Federation toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            <Link size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
            {t('m.arbol.crear.federation')}
          </span>
          <div onClick={() => setFederacion(f => !f)} style={switchStyle(federacion)}>
            <div style={switchKnobStyle(federacion)} />
          </div>
        </div>
        <AnimatePresence>
          {federacion && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <input
                value={parentId} onChange={e => setParentId(e.target.value)}
                placeholder={t('m.arbol.crear.federation_placeholder')}
                style={inputStyle}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

      {/* Avanzado toggle button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.4rem 0.9rem', borderRadius: 20,
            background: showAdvanced ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${showAdvanced ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: showAdvanced ? '#22c55e' : 'var(--text-secondary)',
            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Settings2 size={13} />
          {t('m.arbol.crear.advanced')}
          <motion.div animate={{ rotate: showAdvanced ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={13} />
          </motion.div>
        </button>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      </div>

      {/* Advanced accordion */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {/* Gobernanza */}
            <AdvancedSection label={t('m.arbol.crear.governance')} color="rgba(239,68,68,0.12)">
              <label style={labelStyle}>{t('m.arbol.crear.voting_mode')}</label>
              <select value={modoGobierno} onChange={e => setModoGobierno(e.target.value as any)} style={inputStyle}>
                <option value="DEMOCRATICO">{t('m.arbol.crear.vote_democratic')}</option>
                <option value="ADMIN">{t('m.arbol.crear.vote_admin')}</option>
                <option value="HIBRIDO">{t('m.arbol.crear.vote_hybrid')}</option>
              </select>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <CheckRow label={t('m.arbol.crear.admin_direct_branch')} desc={t('m.arbol.crear.skip_ideation')} checked={creacionRamaDirecta} onChange={setCreacionRamaDirecta} />
                <CheckRow label={t('m.arbol.crear.community_creation')} desc={t('m.arbol.crear.community_creation_desc')} checked={creacionRamaComunitaria} onChange={setCreacionRamaComunitaria} />
                <CheckRow label={t('m.arbol.crear.admin_invite_only')} desc="" checked={!settings.governance.anyoneCanInvite} onChange={v => updateGov('anyoneCanInvite', !v)} />
                <CheckRow label={t('m.arbol.crear.admin_kick_only')} desc="" checked={!settings.governance.inviterCanDelete} onChange={v => updateGov('inviterCanDelete', !v)} />
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <label style={labelStyle}>{t('m.arbol.crear.need_voting')}</label>
                <select value={settings.governance.needVoting} onChange={e => updateGov('needVoting', e.target.value)} style={inputStyle}>
                  <option value="DEMOCRATIC">{t('m.arbol.crear.need_democratic')}</option>
                  <option value="DIRECT_ACTION">{t('m.arbol.crear.need_direct')}</option>
                </select>
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <label style={labelStyle}>{t('m.arbol.crear.xp_decay')}</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['CONTINUOUS', 'WORKDAY'] as const).map(d => (
                    <button key={d} onClick={() => updateGov('decayMode', d)} style={pillStyle(settings.governance.decayMode === d, '#ef4444')}>
                      {d === 'CONTINUOUS' ? '⏱ 24/7' : '🛡️ Lun–Vie'}
                    </button>
                  ))}
                </div>
              </div>
            </AdvancedSection>

            {/* Visibilidad */}
            <AdvancedSection label={t('m.arbol.crear.visibility_access')} color="rgba(59,130,246,0.10)">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['PUBLIC', 'PRIVATE'] as const).map(v => (
                  <button key={v} onClick={() => setVisibility(v)} style={pillStyle(visibility === v, '#3b82f6')}>
                    {v === 'PUBLIC' ? t('m.arbol.crear.public') : t('m.arbol.crear.private')}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {(['OPEN', 'INVITE_ONLY'] as const).map(a => (
                  <button key={a} onClick={() => setAdmissionPolicy(a)} style={pillStyle(admissionPolicy === a, '#3b82f6')}>
                    {a === 'OPEN' ? t('m.arbol.crear.open') : t('m.arbol.crear.invite_only')}
                  </button>
                ))}
              </div>
            </AdvancedSection>

            {/* Estructura de trabajo */}
            <AdvancedSection label={t('m.arbol.crear.work_structure')} color="rgba(16,185,129,0.08)">
              <CheckRow label={t('m.arbol.crear.traditional_branches')} desc={t('m.arbol.crear.traditional_desc')} checked={allowTraditionalBranches} onChange={setAllowTraditionalBranches} />
              <CheckRow label={t('m.arbol.crear.hashtags_express')} desc={t('m.arbol.crear.hashtags_desc')} checked={allowHashtags} onChange={setAllowHashtags} />
              {allowHashtags && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={labelStyle}>{t('m.arbol.crear.who_creates_hashtags')}</label>
                  <select value={hashtagCreationPolicy} onChange={e => setHashtagCreationPolicy(e.target.value as any)} style={inputStyle}>
                    <option value="ADMIN_AND_USERS">{t('m.arbol.crear.everyone')}</option>
                    <option value="ADMIN_ONLY">{t('m.arbol.crear.admin_only')}</option>
                    <option value="USERS_ONLY">{t('m.arbol.crear.users_only')}</option>
                  </select>
                </div>
              )}
            </AdvancedSection>

            {/* Fases */}
            <AdvancedSection label={t('m.arbol.crear.branch_phases')} color="rgba(99,102,241,0.08)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {AVAILABLE_PHASE_IDS.map(phId => (
                  <button key={phId} onClick={() => togglePhase(phId)} style={pillStyle(settings.phases.includes(phId as any), '#6366f1')}>
                    {t(`m.arbol.phases.${phId.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </AdvancedSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <AnimatePresence>
        {canSubmit && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
            onClick={handleSubmit} disabled={loading}
            style={{
              position: 'fixed', bottom: '5rem', right: '1.5rem',
              width: 56, height: 56, borderRadius: '50%',
              background: '#22c55e', color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(34,197,94,0.45)', zIndex: 200,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '…' : <Plus size={26} />}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HACER: Explorer + Admin panel
// ─────────────────────────────────────────────────────────────────────────────
export function ArbolHacer() {
  const { t } = useTranslation();
  const { trees } = useTreeStore();
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();
  const [globalTrees, setGlobalTrees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSector, setFilterSector]   = useState('');
  const [filterCity, setFilterCity]       = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [crisisLoading, setCrisisLoading] = useState(false);
  const user = useAuthStore((s: any) => s.user);
  const { highlightJoinTree, dismiss } = useOnboardingTooltips();

  const fetchGlobal = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/trees/global');
      setGlobalTrees(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchGlobal(); }, [fetchGlobal]);

  const filtered = globalTrees.filter(t => {
    // Basic ghost filters
    const passGhost = (!filterSector  || (t.sector  || '').toLowerCase().includes(filterSector.toLowerCase()))  &&
                      (!filterCity    || (t.city    || '').toLowerCase().includes(filterCity.toLowerCase()))    &&
                      (!filterCountry || (t.country || '').toLowerCase().includes(filterCountry.toLowerCase()));
    
    if (!passGhost) return false;

    // Relational DNA filter - Only hide items if NOT in selection mode
    if (!isFilterModeActive && linajeActivo.length > 0) {
      // OR logic: tree must match AT LEAST ONE selected context
      return linajeActivo.some(l => {
        if (l.entidad === 'arbol') return t.id === l.id;
        if (l.entidad === 'necesidad') {
           // Placeholder for Need -> Arbol relationship
           return true; 
        }
        return false;
      });
    }
    return true;
  });

  const myTreeIds = new Set(trees.map((t: any) => t.id));

  const toggleCrisis = async (treeId: string) => {
    setCrisisLoading(true);
    try { await api.post(`/trees/${treeId}/crisis`); await fetchGlobal(); }
    catch (e) { console.error(e); }
    finally { setCrisisLoading(false); }
  };

  const handleJoin = async (treeId: string) => {
    window.location.href = `/trees/${treeId}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Modifiers: ghost filter row */}
      <div style={{ padding: '0.75rem 1rem 0', display: 'flex', gap: '0.5rem', overflowX: 'auto', flexShrink: 0 }}>
        {[
          { placeholder: t('m.arbol.hacer.sector'), value: filterSector, set: setFilterSector },
          { placeholder: t('m.arbol.hacer.city'),   value: filterCity,   set: setFilterCity },
          { placeholder: t('m.arbol.hacer.country'),value: filterCountry,set: setFilterCountry },
        ].map(f => (
          <input
            key={f.placeholder}
            value={f.value}
            onChange={e => f.set(e.target.value)}
            placeholder={f.placeholder}
            style={{
              flex: '0 0 auto', width: 100, padding: '0.35rem 0.6rem',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 20, color: 'var(--text-primary)', fontSize: '0.72rem',
              outline: 'none',
            }}
          />
        ))}
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.arbol.hacer.loading')}</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.arbol.hacer.empty')}</p>
        )}
        {filtered.map(tree => {
          const isAdmin = tree.creatorId === user?.id;
          const isExpanded = expandedId === tree.id;
          const isMember = myTreeIds.has(tree.id);
          const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === tree.id);

          return (
            <div key={tree.id} 
              onClick={() => {
                if (isFilterModeActive) toggleLinaje(tree.id, 'arbol');
              }}
              style={{
                marginBottom: '0.75rem',
                borderRadius: 14,
                background: isSelected ? '#22c55e' : 'rgba(255,255,255,0.04)',
                backdropFilter: isSelected ? 'none' : 'blur(12px)',
                border: tree.modoCrisis ? '1.5px solid #ef4444' : (isSelected ? '1.5px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)'),
                overflow: 'hidden',
                transition: 'all 0.2s',
                cursor: isFilterModeActive ? 'pointer' : 'default',
                boxShadow: isSelected ? '0 8px 32px rgba(34,197,94,0.4)' : 'none',
              }}
            >
              <div 
                style={{ 
                  pointerEvents: isFilterModeActive ? 'none' : 'auto',
                  opacity: isFilterModeActive && !isSelected && linajeActivo.length > 0 ? 0.3 : 1
                }}
              >
                {/* Card header */}
                <div
                  onClick={() => {
                    if (!isFilterModeActive) {
                      setExpandedId(isExpanded ? null : tree.id);
                    }
                  }}
                  style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                >
                <span style={{ fontSize: '1.6rem' }}>{tree.icono || '🌳'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <OptimizedText text={tree.name} style={{ fontWeight: 700, fontSize: '0.95rem', color: isSelected ? '#ffffff' : 'var(--text-primary)' }} />
                  <p style={{ margin: 0, fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>
                    {[tree.sector, tree.city, tree.country].filter(Boolean).join(' · ')} · {tree._count?.members || 0} {t('m.arbol.hacer.members')}
                  </p>
                </div>
                {tree.modoCrisis && <Siren size={16} color="#ef4444" />}
                <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
                  <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
                </motion.div>
              </div>

              {/* Expanded admin/join panel */}
              <AnimatePresence>
                {isExpanded && !isFilterModeActive && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {!isMember && (
                        <button
                          onClick={() => { dismiss('join_tree'); handleJoin(tree.id); }}
                          className={highlightJoinTree ? 'onboarding-highlight' : ''}
                          style={actionBtnStyle('#22c55e')}
                        >
                          <Users size={14} /> {t('m.arbol.hacer.join')}
                        </button>
                      )}

                      {/* Admin panel */}
                      {isAdmin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontWeight: 700 }}>{t('m.arbol.hacer.admin_panel')}</p>

                          {/* Crisis panic button */}
                          <button
                            onClick={() => toggleCrisis(tree.id)}
                            disabled={crisisLoading}
                            style={actionBtnStyle(tree.modoCrisis ? '#ef4444' : '#f97316')}
                          >
                            <ShieldAlert size={14} />
                            {tree.modoCrisis ? t('m.arbol.hacer.deactivate_crisis') : t('m.arbol.hacer.activate_crisis')}
                          </button>

                          {/* LIFO sliders — only in crisis */}
                          {tree.modoCrisis && (
                            <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              <SliderField label={`${t('m.arbol.hacer.stability_weeks')} ${tree.limiteSemanasEstabilidad ?? 24}`} min={4} max={52} value={tree.limiteSemanasEstabilidad ?? 24} />
                              <SliderField label={`${t('m.arbol.hacer.wear_factor')} ${((tree.factorDesgaste ?? 0.15) * 100).toFixed(0)}%`} min={5} max={50} value={Math.round((tree.factorDesgaste ?? 0.15) * 100)} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIR: Health metrics + expandable cards + DNA visual + full charts
// ─────────────────────────────────────────────────────────────────────────────
export function ArbolMedir() {
  const { t } = useTranslation();
  const { trees, loadingTrees: loading, fetchTrees } = useTreeStore();
  const { isFilterModeActive, linajeActivo, toggleLinaje, toggleFilterMode, focusTreeId, setFocusTreeId } = useMatrixStore();
  const [globalTrees, setGlobalTrees] = useState<any[]>([]);
  const [timeRange, setTimeRange]     = useState('1M');
  const [expandedTreeId, setExpandedTreeId] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<'profit' | 'investment' | 'satisfaction' | null>(null);

  // Long-press to activate filter mode
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const LONG_PRESS_MS = 500;

  const handlePointerDown = (treeId: string) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      // Activate filter mode if not already active
      if (!isFilterModeActive) {
        toggleFilterMode();
      }
      // Select this tree
      const alreadySelected = linajeActivo.some(l => l.id === treeId && l.entidad === 'arbol');
      if (!alreadySelected) {
        toggleLinaje(treeId, 'arbol');
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressFired.current = false;
  };

  useEffect(() => {
    fetchTrees();
    api.get('/trees/global').then(({ data }) => setGlobalTrees(data)).catch(() => {});
  }, [fetchTrees]);

  // Auto-expand tree when navigated from Wallet with ?treeId=X&tab=medir
  useEffect(() => {
    if (focusTreeId) {
      setExpandedTreeId(focusTreeId);
      setFocusTreeId(null); // consume so it doesn't re-trigger
    }
  }, [focusTreeId, setFocusTreeId]);

  const toggleTree = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.metric-toggle')) return;
    setExpandedTreeId(prev => prev === id ? null : id);
    setActiveMetric(null);
  };

  const toggleMetric = (metric: 'profit' | 'investment' | 'satisfaction', e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMetric(prev => prev === metric ? null : metric);
  };

  // Replicate getDynamicBackground from MyTreesList
  const getDynamicBackground = (tree: any) => {
    const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === tree.id);
    if (isSelected) return 'rgba(34,197,94,0.15)';
    const d = tree.healthData;
    const profit = Math.min(100, Math.max(0, (d?.fiatMonthlyProfit || 0) / 10));
    const inv    = Math.min(100, Math.max(0, d?.inversionPct || 0));
    const sat    = Math.min(100, (d?.satisfaction || 0) * 20);
    const r = profit > 50 ? 20 : 60;
    const g = sat > 10 ? 40 : 20;
    const b = Math.round(30 + (inv / 100) * 90);
    return `rgba(${r},${g},${b},0.20)`;
  };

  const prepareChartData = (tree: any) => {
    const rawHistory = tree.history?.[timeRange] || [];
    return rawHistory.map((item: any) => {
      const groupProfit       = item.profit       ? item.profit * 1.5 + 10                   : 15;
      const groupInvestment   = item.inversionPct ? Math.min(100, item.inversionPct * 1.2)   : 20;
      const groupSatisfaction = item.satisfaction ? Math.min(5, item.satisfaction + 0.5)      : 3;
      return {
        ...item,
        investment: item.inversionPct ?? 0,
        groupProfit, groupInvestment, groupSatisfaction,
        profitDiff:  item.profit - groupProfit,
        investDiff:  (item.inversionPct ?? 0) - groupInvestment,
        satDiff:     item.satisfaction - groupSatisfaction,
      };
    });
  };

  const renderCard = (tree: any, isGlobal: boolean) => {
    const data       = isGlobal ? tree.healthData : tree.personalHealthData;
    const hasProfit  = (data?.fiatMonthlyProfit ?? 0) >= 0;
    const isExpanded = expandedTreeId === tree.id;
    const chartData  = prepareChartData(tree);
    const totalMembers   = tree._count?.members || 0;
    const isSovereign    = totalMembers >= 100;
    const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === tree.id);

    // Relational filter check - Only hide items if NOT in selection mode
    if (!isFilterModeActive && linajeActivo.length > 0) {
       // Check if this tree is in the selection OR related to selection
       const match = linajeActivo.some(l => {
         if (l.entidad === 'arbol') return l.id === tree.id;
         return false; // placeholder for other entities
       });
       if (!match) return null;
    }

    return (
      <motion.div
        key={tree.id}
        onPointerDown={() => handlePointerDown(tree.id)}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        onContextMenu={e => e.preventDefault()}
        onClick={() => {
          // If long-press just fired, ignore the click
          if (longPressFired.current) { longPressFired.current = false; return; }
          if (isFilterModeActive) toggleLinaje(tree.id, 'arbol');
        }}
        style={{
          width: '100%', display: 'flex', flexDirection: 'column',
          padding: '1.25rem', background: isSelected ? '#22c55e' : getDynamicBackground(tree),
          borderRadius: '16px', 
          border: isSelected ? '1.5px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.05)',
          backdropFilter: isSelected ? 'none' : 'blur(10px)', 
          boxShadow: isSelected ? '0 8px 32px rgba(34,197,94,0.4)' : '0 8px 32px rgba(0,0,0,0.2)',
          transition: 'all 0.2s',
          cursor: isFilterModeActive ? 'pointer' : 'default',
        }}
      >
        <div style={{ pointerEvents: isFilterModeActive ? 'none' : 'auto' }}>
          {/* Card header — click → expand or select */}
          <div
            onClick={e => {
              if (longPressFired.current) return;
              if (!isFilterModeActive) {
                  toggleTree(tree.id, e);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', cursor: 'pointer' }}
          >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '1.5rem' }}>{tree.icono || '🌳'}</span>
            </div>
            <div>
              <OptimizedText text={tree.name} style={{ fontWeight: 700, fontSize: '1.05rem', color: isSelected ? '#ffffff' : 'var(--text-primary)' }} />
              <div style={{ fontSize: '0.72rem', color: isSelected ? 'rgba(255,255,255,0.8)' : (isGlobal ? 'var(--text-secondary)' : 'var(--accent-primary)'), marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                {isGlobal
                  ? <span style={{ opacity: isSelected ? 1 : 0.6 }}>{t('m.arbol.medir.public_ecosystem')}</span>
                  : <><div style={{ width: 6, height: 6, borderRadius: '50%', background: isSelected ? '#fff' : '#22c55e' }} /> {t('m.arbol.medir.active_member')}</>
                }
                &nbsp;• {totalMembers} p.
                {isSovereign && (
                  <span style={{ marginLeft: 4, fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: 10, background: isSelected ? 'rgba(255,255,255,0.2)' : '#22c55e', color: '#fff' }}>
                    {t('m.arbol.medir.sovereign')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
            <ChevronRight size={20} stroke="rgba(255,255,255,0.2)" />
          </motion.div>
        </div>

        {/* Metric row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Profit */}
          <div
            className="metric-toggle"
            onClick={e => toggleMetric('profit', e)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', padding: 6, borderRadius: 8,
              background: activeMetric === 'profit' ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: activeMetric && activeMetric !== 'profit' ? 0.3 : 1,
              filter: activeMetric && activeMetric !== 'profit' ? 'grayscale(1)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', fontWeight: 600 }}>{t('m.arbol.medir.profitability')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: hasProfit ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
              {hasProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              ${Math.abs(data?.fiatMonthlyProfit || 0).toFixed(1)}
            </div>
          </div>

          {/* Investment */}
          <div
            className="metric-toggle"
            onClick={e => toggleMetric('investment', e)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', padding: 6, borderRadius: 8,
              background: activeMetric === 'investment' ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: activeMetric && activeMetric !== 'investment' ? 0.3 : 1,
              filter: activeMetric && activeMetric !== 'investment' ? 'grayscale(1)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', fontWeight: 600 }}>{t('m.arbol.medir.investment')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700, fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-primary)' }}>
              <Wallet size={14} color={isSelected ? '#fff' : '#38bdf8'} />
              {(data?.inversionPct || 0).toFixed(1)}%
            </div>
            <span style={{ fontSize: '0.58rem', color: isSelected ? '#fff' : '#38bdf8', opacity: 0.7, marginTop: -1 }}>{t('m.arbol.medir.reinvestment')}</span>
          </div>

          {/* Satisfaction */}
          <div
            className="metric-toggle"
            onClick={e => toggleMetric('satisfaction', e)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', padding: 6, borderRadius: 8,
              background: activeMetric === 'satisfaction' ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: activeMetric && activeMetric !== 'satisfaction' ? 0.3 : 1,
              filter: activeMetric && activeMetric !== 'satisfaction' ? 'grayscale(1)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', fontWeight: 600 }}>{t('m.arbol.medir.satisfaction')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: isSelected ? '#fff' : '#fbbf24', fontWeight: 700, fontSize: '0.9rem' }}>
              <Star size={14} fill={isSelected ? '#fff' : '#fbbf24'} stroke="none" />
              {data?.satisfaction || '---'}
            </div>
          </div>
        </div>

        {/* Expanded chart accordion */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {isGlobal ? t('m.arbol.medir.group_synth') : (activeMetric ? `Delta (${activeMetric.toUpperCase()})` : t('m.arbol.medir.stacked_comp'))}
                  </span>
                  {!isGlobal && activeMetric && (
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><div style={{ width: 8, height: 8, background: 'var(--accent-primary)', borderRadius: 2 }} /> {t('m.arbol.medir.personal')}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><div style={{ width: 8, height: 8, background: 'rgba(255,255,255,0.3)', borderRadius: 2 }} /> {t('m.arbol.medir.group')}</span>
                    </div>
                  )}
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', height: !activeMetric && !isGlobal ? 340 : 160 }}>
                  {(!activeMetric && !isGlobal) ? (
                    <>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{ position: 'absolute', top: 0, left: 10, fontSize: '0.6rem', color: 'var(--accent-primary)', zIndex: 10, fontWeight: 700, textTransform: 'uppercase' }}>{t('m.arbol.medir.personal_value')}</span>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 15, right: 0, left: -25, bottom: 0 }}>
                            <defs>
                              <linearGradient id={`gradP-${tree.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="var(--accent-primary)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="transparent"            stopOpacity={0}   />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="name" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.7rem' }} />
                            <Area type="monotone" dataKey="profit" stroke="var(--accent-primary)" fill={`url(#gradP-${tree.id})`} strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{ position: 'absolute', top: 0, left: 10, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', zIndex: 10, fontWeight: 700, textTransform: 'uppercase' }}>{t('m.arbol.medir.group_value')}</span>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 15, right: 0, left: -25, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.7rem' }} />
                            <Area type="monotone" dataKey="groupProfit" stroke="rgba(255,255,255,0.3)" fill="none" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 5 }}>
                        <defs>
                          <linearGradient id={`gradD-${tree.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />

                        {(!activeMetric && isGlobal) && <Area type="monotone" dataKey="groupProfit" stroke="rgba(255,255,255,0.2)" fill="none" strokeWidth={2} />}
                        {activeMetric === 'profit' && <>
                          <Area type="monotone" dataKey="groupProfit"      stroke="rgba(255,255,255,0.3)" fill="none"                          strokeWidth={2} strokeDasharray="4 4" />
                          <Area type="monotone" dataKey="profit"           stroke="#22c55e"               fill={`url(#gradD-${tree.id})`}      strokeWidth={2} />
                        </>}
                        {activeMetric === 'investment' && <>
                          <Area type="monotone" dataKey="groupInvestment"  stroke="rgba(255,255,255,0.3)" fill="none"                          strokeWidth={2} strokeDasharray="4 4" />
                          <Area type="monotone" dataKey="investment"       stroke="#38bdf8"               fill="rgba(56,189,248,0.2)"          strokeWidth={2} />
                        </>}
                        {activeMetric === 'satisfaction' && <>
                          <Area type="monotone" dataKey="groupSatisfaction" stroke="rgba(255,255,255,0.3)" fill="none"                         strokeWidth={2} strokeDasharray="4 4" />
                          <Area type="monotone" dataKey="satisfaction"      stroke="#fbbf24"               fill="rgba(251,191,36,0.2)"         strokeWidth={2} />
                        </>}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Time range selectors */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                  {['1D', '1S', '1M', '1A'].map(range => (
                    <button
                      key={range}
                      onClick={e => { e.stopPropagation(); setTimeRange(range); }}
                      style={{
                        padding: '0.3rem 0.75rem', borderRadius: 100, border: 'none',
                        fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                        background: timeRange === range ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                        color:      timeRange === range ? '#fff'                   : 'var(--text-secondary)',
                      }}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('m.arbol.medir.loading')}</div>;

  return (
    <div style={{ padding: '1rem', paddingBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {trees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          <TreePine size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <OptimizedText text={t('m.arbol.medir.empty')} style={{ fontSize: '0.9rem' }} />
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontWeight: 700, margin: '0.25rem 0' }}>{t('m.arbol.medir.my_active_trees')}</p>
          {trees.map((tree: any) => renderCard(tree, false))}
        </>
      )}

      {globalTrees?.length > 0 && (
        <>
          <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>{t('m.arbol.medir.global_explorer')}</p>
          {globalTrees.map((tree: any) => renderCard(tree, true))}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SliderField({ label, min, max, value }: { label: string; min: number; max: number; value: number }) {
  return (
    <div>
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>{label}</span>
      <input type="range" min={min} max={max} defaultValue={value}
        style={{ width: '100%', accentColor: '#ef4444', cursor: 'pointer' }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.65rem 0.9rem', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none',
};

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    justifyContent: 'center', width: '100%', padding: '0.6rem',
    borderRadius: 10, border: `1px solid ${color}44`,
    background: `${color}15`, color, fontSize: '0.82rem',
    fontWeight: 700, cursor: 'pointer',
  };
}

// ─── Advanced helpers ─────────────────────────────────────────────────────────
function AdvancedSection({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '0.85rem', borderRadius: 12,
      background: color, border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column', gap: '0.6rem',
    }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function CheckRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: '0.15rem', accentColor: '#22c55e' }}
      />
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{desc}</div>}
      </div>
    </label>
  );
}

function pillStyle(active: boolean, color: string): React.CSSProperties {
  return {
    flex: 1, padding: '0.4rem 0.6rem', borderRadius: 20, border: '1px solid',
    borderColor: active ? color : 'rgba(255,255,255,0.1)',
    background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
    color: active ? color : 'var(--text-secondary)',
    fontWeight: active ? 700 : 400, fontSize: '0.78rem', cursor: 'pointer',
  };
}

function switchStyle(on: boolean): React.CSSProperties {
  return {
    width: 40, height: 22, borderRadius: 11,
    background: on ? '#22c55e' : 'rgba(255,255,255,0.15)',
    position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
  };
}

function switchKnobStyle(on: boolean): React.CSSProperties {
  return {
    position: 'absolute', top: 3, left: on ? 20 : 3,
    width: 16, height: 16, borderRadius: '50%',
    background: '#fff', transition: 'left 0.2s',
  };
}
