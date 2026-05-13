import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  User, CreditCard, Cpu, TreePine, LogOut, Loader2, AlertCircle,
  Plus, Trash2, ChevronUp, XCircle, ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';

interface MySubscription {
  hasSubscription: boolean;
  status: string;
  id?: string;
  currentPeriodEnd?: string;
}

interface CostData {
  monthlyCost: number;
  currency: string;
}

interface RegisteredAI {
  id: string;
  name: string;
  provider: string;
  status: string;
  monthlySavings: number;
}

interface TreeItem {
  id: string;
  name: string;
  level: number;
  xp: number;
  memberships?: Array<{ role?: string; level?: number; xp?: number }>;
}

type AIProvider = 'OPENAI' | 'DEEPSEEK' | 'ANTHROPIC' | 'CUSTOM';
const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'OPENAI', label: 'OpenAI (GPT-4, etc.)' },
  { value: 'DEEPSEEK', label: 'DeepSeek' },
  { value: 'ANTHROPIC', label: 'Anthropic (Claude)' },
  { value: 'CUSTOM', label: 'Personalizado (API propia)' },
];

function fmt(n: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);
}

function SettingsSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logoutStore = useAuthStore((s) => s.logout);

  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [costData, setCostData] = useState<CostData | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState('');

  const [ais, setAIs] = useState<RegisteredAI[]>([]);
  const [aisLoading, setAisLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [byoName, setByoName] = useState('');
  const [byoProvider, setByoProvider] = useState<AIProvider>('OPENAI');
  const [byoApiKey, setByoApiKey] = useState('');
  const [byoEndpoint, setByoEndpoint] = useState('');
  const [addingAI, setAddingAI] = useState(false);
  const [addError, setAddError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [trees, setTrees] = useState<TreeItem[]>([]);
  const [treesLoading, setTreesLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    setSubLoading(true);
    try { const { data } = await api.get('/billing/subscription'); setMySub(data); }
    catch { /* ignore */ }
    finally { setSubLoading(false); }
  }, []);

  const fetchCost = useCallback(async () => {
    try { const { data } = await api.get('/billing/current-cost'); setCostData(data); }
    catch { /* ignore */ }
  }, []);

  const fetchAIs = useCallback(async () => {
    setAisLoading(true);
    try { const { data } = await api.get('/byo/my-ais'); setAIs(data.ais || []); }
    catch { /* ignore */ }
    finally { setAisLoading(false); }
  }, []);

  const fetchTrees = useCallback(async () => {
    setTreesLoading(true);
    try { const { data } = await api.get('/trees'); setTrees(data || []); }
    catch { /* ignore */ }
    finally { setTreesLoading(false); }
  }, []);

  useEffect(() => { fetchSubscription(); fetchCost(); fetchAIs(); fetchTrees(); },
    [fetchSubscription, fetchCost, fetchAIs, fetchTrees]);

  const handleCancelSub = async () => {
    if (!confirm('¿Cancelar tu suscripción? Perderás acceso premium al final del período.')) return;
    setCancelling(true); setCancelMsg('');
    try { await api.post('/billing/cancel-subscription'); setCancelMsg('Suscripción cancelada. Acceso continúa hasta fin del período.'); fetchSubscription(); }
    catch (err: any) { setCancelMsg(err?.response?.data?.error || 'Error al cancelar'); }
    finally { setCancelling(false); }
  };

  const handleAddAI = async (e: React.FormEvent) => {
    e.preventDefault(); setAddError('');
    if (!byoName.trim() || !byoApiKey.trim()) { setAddError('Completa todos los campos obligatorios'); return; }
    setAddingAI(true);
    try {
      await api.post('/byo/register', { name: byoName.trim(), provider: byoProvider, apiKey: byoApiKey, endpoint: byoProvider === 'CUSTOM' ? byoEndpoint : undefined });
      setByoName(''); setByoApiKey(''); setByoEndpoint(''); setByoProvider('OPENAI'); setShowAddForm(false); fetchAIs();
    } catch (err: any) { setAddError(err?.response?.data?.error || 'Error al registrar IA'); }
    finally { setAddingAI(false); }
  };

  const handleDeleteAI = async (id: string) => { setDeletingId(id); try { await api.delete(`/byo/${id}`); fetchAIs(); } catch { /* ignore */ } finally { setDeletingId(null); } };

  const handleLogout = () => { logoutStore(); navigate('/login'); };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(1rem, 3vw, 2rem)', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: isMobile ? '5rem' : '2rem' }}>
      <div>
        <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Configuración</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Gestiona tu perfil, suscripción, IAs y equipos</p>
      </div>

      <SettingsSection icon={<User size={20} style={{ color: 'var(--accent-primary)' }} />} title="Perfil">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label>Username</label>
            <input className="input-field" value={user?.username || ''} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label>Email</label>
            <input className="input-field" value={user?.email || '—'} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection icon={<CreditCard size={20} style={{ color: 'var(--accent-secondary)' }} />} title="Suscripción">
        {subLoading ? (
          <div style={{ textAlign: 'center', padding: '1.5rem' }}><Loader2 className="animate-spin" size={20} style={{ color: 'var(--text-secondary)' }} /></div>
        ) : !mySub?.hasSubscription ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <ShieldCheck size={18} style={{ color: 'var(--accent-success)', flexShrink: 0, marginTop: '0.1rem' }} />
            <div><div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Acceso gratuito</div><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>No tienes suscripción activa.</div></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ background: mySub.status === 'ACTIVE' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: mySub.status === 'ACTIVE' ? 'var(--accent-success)' : 'var(--accent-warning)', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 600 }}>
                {mySub.status === 'ACTIVE' ? 'Activa' : mySub.status}
              </span>
              {costData && <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{fmt(costData.monthlyCost, costData.currency)}<span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>/mes</span></span>}
            </div>
            {mySub.status === 'ACTIVE' && (
              <button onClick={handleCancelSub} disabled={cancelling} className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', alignSelf: 'flex-start', color: 'var(--accent-danger)', borderColor: 'rgba(239,68,68,0.3)' }}>
                {cancelling ? <><Loader2 className="animate-spin" size={14} /> Cancelando…</> : <><XCircle size={14} /> Cancelar suscripción</>}
              </button>
            )}
            {cancelMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', background: cancelMsg.includes('cancelada') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${cancelMsg.includes('cancelada') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, color: cancelMsg.includes('cancelada') ? 'var(--accent-success)' : 'var(--accent-danger)', fontSize: '0.8rem' }}>
                <AlertCircle size={14} /> {cancelMsg}
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection icon={<Cpu size={20} style={{ color: 'var(--accent-primary)' }} />} title="Tus IAs (BYO)">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{ais.length} IA{ais.length !== 1 ? 's' : ''} registrada{ais.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}>
            {showAddForm ? <><ChevronUp size={14} /> Cancelar</> : <><Plus size={14} /> Agregar</>}
          </button>
        </div>
        {showAddForm && (
          <form onSubmit={handleAddAI} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', padding: '1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {addError && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-danger)', fontSize: '0.8rem' }}><AlertCircle size={14} /> {addError}</div>}
            <div className="input-group" style={{ margin: 0 }}><label>Nombre *</label><input className="input-field" type="text" placeholder="Ej: Mi DeepSeek Pro" value={byoName} onChange={(e) => setByoName(e.target.value)} required /></div>
            <div className="input-group" style={{ margin: 0 }}><label>Proveedor *</label><select className="input-field" value={byoProvider} onChange={(e) => setByoProvider(e.target.value as AIProvider)} style={{ cursor: 'pointer' }}>{PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            {byoProvider === 'CUSTOM' && <div className="input-group" style={{ margin: 0 }}><label>Endpoint (URL)</label><input className="input-field" type="url" placeholder="https://tu-api.com/v1" value={byoEndpoint} onChange={(e) => setByoEndpoint(e.target.value)} /></div>}
            <div className="input-group" style={{ margin: 0 }}><label>API Key *</label><input className="input-field" type="password" placeholder="sk-..." value={byoApiKey} onChange={(e) => setByoApiKey(e.target.value)} required /></div>
            <button type="submit" className="btn btn-primary" disabled={addingAI} style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', alignSelf: 'flex-start' }}>{addingAI ? <><Loader2 className="animate-spin" size={14} /> Registrando…</> : 'Registrar'}</button>
          </form>
        )}
        {aisLoading ? <div style={{ textAlign: 'center', padding: '1.5rem' }}><Loader2 className="animate-spin" size={18} style={{ color: 'var(--text-secondary)' }} /></div>
          : ais.length === 0 ? <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>No tenés IAs registradas.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {ais.map((ai) => (
                <div key={ai.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ai.name}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 500, padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', background: 'rgba(139,92,246,0.12)', color: 'var(--accent-secondary)' }}>{ai.provider}</span>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', background: ai.status === 'ACTIVE' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: ai.status === 'ACTIVE' ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{ai.status}</span>
                  </div>
                  <button onClick={() => handleDeleteAI(ai.id)} disabled={deletingId === ai.id} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', padding: '0.3rem 0.45rem', cursor: 'pointer', color: 'var(--accent-danger)', opacity: deletingId === ai.id ? 0.5 : 1 }}>
                    {deletingId === ai.id ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>}
      </SettingsSection>

      <SettingsSection icon={<TreePine size={20} style={{ color: 'var(--accent-success)' }} />} title="Mis árboles">
        {treesLoading ? <div style={{ textAlign: 'center', padding: '1.5rem' }}><Loader2 className="animate-spin" size={18} style={{ color: 'var(--text-secondary)' }} /></div>
          : trees.length === 0 ? <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No pertenecés a ningún árbol todavía.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {trees.map((tree) => {
                const m = tree.memberships?.[0];
                const level = m?.level ?? 0;
                const xp = m?.xp ?? 0;
                return (
                  <div key={tree.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => navigate(`/trees/${tree.id}`)}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tree.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Nivel {level}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: 'var(--radius-full)', background: 'rgba(59,130,246,0.12)', color: 'var(--accent-primary)' }}>{xp} XP</span>
                    </div>
                  </div>
                );
              })}
            </div>}
      </SettingsSection>

      <button onClick={handleLogout} className="btn btn-outline" style={{ padding: '0.65rem 1rem', fontSize: '0.9rem', color: 'var(--accent-danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
        <LogOut size={16} /> Cerrar sesión
      </button>
    </div>
  );
}
