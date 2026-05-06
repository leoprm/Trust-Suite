import { useState, useEffect } from 'react';
import { UserCheck, UserX, Search, ArrowRight, Clock } from 'lucide-react';
import api from '../lib/api';

type Candidate = {
  id: string;
  name: string;
  email?: string;
  skills: string;
  experience?: string;
  status: string;
  evaluatorIds: string;
  evaluatorMode?: string;
  auditLevel: number;
  appliedAt: string;
  reviewedAt?: string;
  provisionalAt?: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  APPLIED: { label: 'Aplicó', color: '#60a5fa' },
  UNDER_REVIEW: { label: 'En revisión', color: '#fbbf24' },
  EVALUATORS_ASSIGNED: { label: 'Evaluadores asignados', color: '#a78bfa' },
  PROVISIONAL: { label: 'Provisional', color: '#34d399' },
  IN_PRACTICAL_TEST: { label: 'Prueba práctica', color: '#f472b6' },
  VALIDATED: { label: 'Validado ✓', color: '#22c55e' },
  REJECTED: { label: 'Rechazado', color: '#ef4444' },
};

export default function ExternalCandidatePanel({ treeId }: { treeId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async () => {
    try {
      const { data } = await api.get(`/external-candidates?treeId=${treeId}`);
      setCandidates(data);
    } catch (e) {
      setError('Error cargando candidatos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCandidates(); }, [treeId]);

  const doAction = async (id: string, action: string, body?: any) => {
    setActionLoading(id);
    setError(null);
    try {
      await api.post(`/external-candidates/${id}/${action}`, body || {});
      await fetchCandidates();
      if (selected?.id === id) {
        const { data } = await api.get(`/external-candidates/${id}`);
        setSelected(data);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error en la acción');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div style={{ color: '#888', padding: '1rem' }}>Cargando candidatos...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Validación de Candidatos Externos</h3>
        <span style={{ fontSize: '0.7rem', color: '#888' }}>{candidates.length} candidatos</span>
      </div>

      {error && (
        <div style={{ padding: '0.5rem', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {candidates.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>
          No hay candidatos externos aún. Los candidatos aplican mediante el enlace de postulación externa.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {candidates.map((c) => {
            const statusInfo = STATUS_LABELS[c.status] || { label: c.status, color: '#888' };
            const skills = JSON.parse(c.skills || '[]');
            const isLoading = actionLoading === c.id;

            return (
              <div
                key={c.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: 10,
                  background: selected?.id === c.id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected?.id === c.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer',
                }}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>{c.name}</strong>
                    {c.email && <span style={{ fontSize: '0.7rem', color: '#888', marginLeft: '0.5rem' }}>{c.email}</span>}
                  </div>
                  <span style={{
                    fontSize: '0.62rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: 10,
                    background: `${statusInfo.color}22`,
                    color: statusInfo.color,
                    fontWeight: 600,
                  }}>
                    {statusInfo.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  {skills.map((s: string) => (
                    <span key={s} style={{
                      fontSize: '0.6rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: 6,
                      background: 'rgba(59,130,246,0.12)',
                      color: '#93c5fd',
                    }}>
                      @{s}
                    </span>
                  ))}
                </div>

                {/* Expanded actions */}
                {selected?.id === c.id && (
                  <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {c.experience && (
                      <p style={{ fontSize: '0.7rem', color: '#999', margin: '0 0 0.5rem' }}>{c.experience}</p>
                    )}

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {c.status === 'APPLIED' && (
                        <ActionBtn onClick={() => doAction(c.id, 'review')} disabled={isLoading} color="#fbbf24">
                          <Search size={14} /> Revisar
                        </ActionBtn>
                      )}
                      {c.status === 'UNDER_REVIEW' && (
                        <>
                          <ActionBtn onClick={() => doAction(c.id, 'assign-evaluators')} disabled={isLoading} color="#a78bfa">
                            <UserCheck size={14} /> Asignar evaluadores
                          </ActionBtn>
                          <ActionBtn onClick={() => doAction(c.id, 'reject', { reason: 'No cumple requisitos iniciales' })} disabled={isLoading} color="#ef4444">
                            <UserX size={14} /> Rechazar
                          </ActionBtn>
                        </>
                      )}
                      {c.status === 'EVALUATORS_ASSIGNED' && (
                        <ActionBtn onClick={() => doAction(c.id, 'promote', { notes: 'Evaluación positiva' })} disabled={isLoading} color="#34d399">
                          <ArrowRight size={14} /> Promover a Provisional
                        </ActionBtn>
                      )}
                      {c.status === 'PROVISIONAL' && (
                        <ActionBtn onClick={() => doAction(c.id, 'start-test', {
                          testDesign: JSON.stringify({ criteria: 'Tarea práctica supervisada', risk: 'bajo', evidence: 'foto/archivo' })
                        })} disabled={isLoading} color="#f472b6">
                          <Clock size={14} /> Iniciar prueba
                        </ActionBtn>
                      )}
                      {c.status === 'IN_PRACTICAL_TEST' && (
                        <>
                          <ActionBtn onClick={() => doAction(c.id, 'complete-test', { passed: true, testResult: 'Prueba superada' })} disabled={isLoading} color="#22c55e">
                            ✓ Aprobó
                          </ActionBtn>
                          <ActionBtn onClick={() => doAction(c.id, 'complete-test', { passed: false, testResult: 'No alcanzó el nivel requerido' })} disabled={isLoading} color="#ef4444">
                            ✗ No aprobó
                          </ActionBtn>
                        </>
                      )}
                    </div>

                    {c.evaluatorMode && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.62rem', color: '#666' }}>
                        Evaluadores: {c.evaluatorMode} · Auditoría: {c.auditLevel}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, disabled, color, children }: {
  onClick: () => void;
  disabled: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.3rem 0.6rem',
        borderRadius: 7,
        border: `1px solid ${color}33`,
        background: `${color}14`,
        color,
        fontSize: '0.7rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
