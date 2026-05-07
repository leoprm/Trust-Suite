import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, Clock, Tag, FileText } from 'lucide-react';
import api from '../lib/api';

type AnonCandidate = {
  id: string;
  anonRef: string;
  skills: string[];
  experience: string | null;
  status: string;
  evaluatorMode: string | null;
  auditLevel: number;
  testDesign: string | null;
  testPassed: boolean | null;
  appliedAt: string;
  treeName: string;
  total?: number;
  submitted?: number;
  passed?: number;
  failed?: number;
  pending?: number;
};

type EvalVote = {
  evaluatorId: string;
  passed: boolean;
  notes: string | null;
  submittedAt: string;
};

export default function EvaluatorDashboard() {
  const [candidates, setCandidates] = useState<AnonCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const fetchEvaluations = async () => {
    try {
      const { data } = await api.get('/evaluations/mine');
      setCandidates(data);
    } catch (e: any) {
      if (e?.response?.status !== 404) {
        setError('No se pudieron cargar las evaluaciones');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvaluations(); }, []);

  const handleEvaluate = async (id: string, passed: boolean) => {
    setSubmitting(id);
    setError(null);
    try {
      await api.post(`/external-candidates/${id}/evaluate`, { passed, notes: notes || undefined });
      setNotes('');
      await fetchEvaluations();
      setExpanded(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al enviar evaluación');
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', color: '#888', fontSize: '0.8rem' }}>
        Cargando evaluaciones pendientes…
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>
        <EyeOff size={24} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
        <p>No tienes evaluaciones pendientes.</p>
        <p style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>
          Cuando te asignen como evaluador, los candidatos aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>
          <Eye size={16} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
          Mis Evaluaciones ({candidates.length})
        </h3>
      </div>

      {error && (
        <div style={{
          padding: '0.5rem', borderRadius: 8,
          background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
          fontSize: '0.75rem',
        }}>
          {error}
        </div>
      )}

      {candidates.map((c) => {
        const isExpanded = expanded === c.id;
        const hasVoted = c.pending !== undefined && c.submitted !== undefined && c.pending === 0;

        return (
          <div
            key={c.id}
            style={{
              padding: '0.75rem',
              borderRadius: 10,
              background: isExpanded ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isExpanded ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer',
              opacity: hasVoted ? 0.6 : 1,
            }}
            onClick={() => setExpanded(isExpanded ? null : c.id)}
          >
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#93c5fd',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 5,
                    background: 'rgba(59,130,246,0.12)',
                  }}>
                    {c.anonRef}
                  </span>
                  {hasVoted && (
                    <span style={{ fontSize: '0.6rem', color: '#4ade80', fontWeight: 600 }}>
                      ✓ Evaluado
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.62rem', color: '#666' }}>
                  {c.treeName}
                </span>
              </div>
            </div>

            {/* Skills */}
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              {c.skills.map((s: string) => (
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

            {/* Vote progress */}
            {c.total !== undefined && (
              <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', fontSize: '0.6rem', color: '#888' }}>
                <span>✓ {c.passed || 0}</span>
                <span>✗ {c.failed || 0}</span>
                <span>⏳ {c.pending || 0} pendientes</span>
                <span style={{ color: '#666' }}>de {c.total}</span>
              </div>
            )}

            {/* Expanded: details + evaluation form */}
            {isExpanded && (
              <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Anonymized experience */}
                {c.experience && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '0.2rem' }}>
                      <FileText size={12} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />
                      Experiencia
                    </div>
                    <p style={{ fontSize: '0.72rem', color: '#ccc', margin: 0, lineHeight: 1.4 }}>
                      {c.experience}
                    </p>
                  </div>
                )}

                {/* Test design (if in practical test) */}
                {c.testDesign && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '0.2rem' }}>
                      <Tag size={12} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />
                      Diseño de prueba
                    </div>
                    <pre style={{
                      fontSize: '0.68rem', color: '#aaa', margin: 0,
                      padding: '0.35rem 0.5rem',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '8rem', overflowY: 'auto',
                    }}>
                      {(() => { try { return JSON.stringify(JSON.parse(c.testDesign), null, 2); } catch { return c.testDesign; } })()}
                    </pre>
                  </div>
                )}

                {/* Audit notice */}
                <div style={{
                  fontSize: '0.58rem', color: '#555', marginBottom: '0.6rem',
                  padding: '0.25rem 0.5rem', borderRadius: 5,
                  background: 'rgba(251,191,36,0.06)',
                  border: '1px solid rgba(251,191,36,0.1)',
                }}>
                  <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />
                  Esta es una vista anónima. No verás el nombre ni datos personales del candidato.
                  Auditoría activa al {c.auditLevel}%.
                </div>

                {/* Evaluation form (if not already voted) */}
                {!hasVoted ? (
                  <div>
                    <textarea
                      placeholder="Notas de evaluación (opcional, visible para administradores)…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        minHeight: '3rem',
                        padding: '0.4rem 0.5rem',
                        borderRadius: 7,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#ccc',
                        fontSize: '0.7rem',
                        resize: 'vertical',
                        marginBottom: '0.5rem',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEvaluate(c.id, true); }}
                        disabled={submitting === c.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          padding: '0.3rem 0.65rem',
                          borderRadius: 7,
                          border: '1px solid rgba(34,197,94,0.2)',
                          background: 'rgba(34,197,94,0.08)',
                          color: '#4ade80',
                          fontSize: '0.7rem', fontWeight: 600,
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          opacity: submitting ? 0.5 : 1,
                        }}
                      >
                        <Check size={14} /> Aprobar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEvaluate(c.id, false); }}
                        disabled={submitting === c.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          padding: '0.3rem 0.65rem',
                          borderRadius: 7,
                          border: '1px solid rgba(239,68,68,0.2)',
                          background: 'rgba(239,68,68,0.08)',
                          color: '#fca5a5',
                          fontSize: '0.7rem', fontWeight: 600,
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          opacity: submitting ? 0.5 : 1,
                        }}
                      >
                        <X size={14} /> Rechazar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 600 }}>
                    ✓ Ya enviaste tu evaluación para este candidato.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
