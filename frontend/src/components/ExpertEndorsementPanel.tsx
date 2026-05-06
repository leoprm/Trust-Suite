import { useState, useEffect, useCallback } from 'react';
import { Shield, Award, Ban, X, Check, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

interface BoostStatus {
  activeCount: number;
  boostPct: number;
  isBanned: boolean;
  banUntil: string | null;
}

interface Endorsement {
  id: string;
  expertise: string;
  status: string;
  createdAt: string;
  endorser: { id: string; user: { id: string; username: string } };
  endorsed: { id: string; user: { id: string; username: string } };
  requiredTasks: number;
  completedTasks: number;
}

interface Props {
  treeId: string;
  onClose: () => void;
}

export default function ExpertEndorsementPanel({ treeId, onClose }: Props) {
  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [mode, setMode] = useState<'view' | 'create'>('view');
  const [expertise, setExpertise] = useState('');
  const [endorsedId, setEndorsedId] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bRes, eRes] = await Promise.all([
        api.get(`/expert-endorsements/boost?treeId=${treeId}`),
        api.get(`/expert-endorsements?treeId=${treeId}`),
      ]);
      setBoost(bRes.data);
      setEndorsements(eRes.data);
    } catch { /* best effort */ }
  }, [treeId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setErr(''); setLoading(true);
    try {
      await api.post('/expert-endorsements', { treeId, endorsedMemberId: endorsedId, expertise });
      setMode('view'); setExpertise(''); setEndorsedId('');
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  const handleResolve = async (id: string, status: string) => {
    setErr(''); setLoading(true);
    try {
      await api.post(`/expert-endorsements/${id}/resolve`, { status });
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', background: '#0f1021', border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 480,
        maxHeight: '80vh', overflow: 'auto', color: '#e2e8f0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={18} /> Avales de Experticia
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Boost status */}
        {boost && (
          <div style={{
            padding: '0.75rem', borderRadius: 10, marginBottom: '1rem',
            background: boost.boostPct > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${boost.boostPct > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={16} color={boost.boostPct > 0 ? '#22c55e' : '#64748b'} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Boost XP: +{boost.boostPct}% ({boost.activeCount}/3 avales activos)
              </span>
            </div>
            {boost.isBanned && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f87171', fontSize: '0.75rem' }}>
                <Ban size={13} /> Baneado de avalar hasta {boost.banUntil ? new Date(boost.banUntil).toLocaleDateString('es-ES') : ''}
              </div>
            )}
          </div>
        )}

        {err && <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{err}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setMode('view')} style={{
            padding: '0.4rem 0.8rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: mode === 'view' ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: mode === 'view' ? '#a5b4fc' : '#64748b', fontSize: '0.8rem', fontWeight: 600,
          }}>
            Ver avales
          </button>
          <button onClick={() => setMode('create')} style={{
            padding: '0.4rem 0.8rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: mode === 'create' ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: mode === 'create' ? '#a5b4fc' : '#64748b', fontSize: '0.8rem', fontWeight: 600,
          }}
          disabled={boost?.isBanned}>
            Dar aval
          </button>
        </div>

        {mode === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input
              placeholder="ID del miembro avalado"
              value={endorsedId} onChange={e => setEndorsedId(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.8rem' }}
            />
            <input
              placeholder="@expertise (ej: @Carpintería)"
              value={expertise} onChange={e => setExpertise(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.8rem' }}
            />
            <button onClick={handleCreate} disabled={loading || !endorsedId || !expertise} style={{
              padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', fontWeight: 600, fontSize: '0.8rem',
              opacity: loading ? 0.5 : 1,
            }}>
              Crear aval
            </button>
          </div>
        )}

        {mode === 'view' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {endorsements.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>No hay avales en este árbol.</p>
            )}
            {endorsements.map(e => (
              <div key={e.id} style={{
                padding: '0.6rem', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{e.expertise}</span>
                  <span style={{
                    fontSize: '0.62rem', padding: '0.15rem 0.5rem', borderRadius: 6,
                    background: e.status === 'SUCCESS' ? 'rgba(34,197,94,0.15)' :
                               e.status === 'ACTIVE' ? 'rgba(99,102,241,0.15)' :
                               'rgba(239,68,68,0.15)',
                    color: e.status === 'SUCCESS' ? '#22c55e' :
                           e.status === 'ACTIVE' ? '#a5b4fc' : '#f87171',
                  }}>
                    {e.status === 'SUCCESS' ? 'Éxito' : e.status === 'ACTIVE' ? 'Activo' :
                     e.status === 'FAILED_PERFORMANCE' ? 'Falló' : 'Fraude'}
                  </span>
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Avala: {e.endorser.user.username} → {e.endorsed.user.username}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.15rem' }}>
                  Tareas: {e.completedTasks}/{e.requiredTasks} · {new Date(e.createdAt).toLocaleDateString('es-ES')}
                </div>
                {e.status === 'ACTIVE' && (
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem' }}>
                    <button onClick={() => handleResolve(e.id, 'SUCCESS')} disabled={loading} style={{
                      padding: '0.2rem 0.5rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '0.65rem', fontWeight: 600,
                    }}>
                      <Check size={10} /> Éxito
                    </button>
                    <button onClick={() => handleResolve(e.id, 'FAILED_PERFORMANCE')} disabled={loading} style={{
                      padding: '0.2rem 0.5rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.65rem', fontWeight: 600,
                    }}>
                      <AlertTriangle size={10} /> Falló
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
