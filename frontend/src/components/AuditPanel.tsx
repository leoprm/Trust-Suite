import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronDown, ChevronUp, Shield, BarChart3, Users, Clock, TrendingUp, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../lib/api';

interface AuditPanelProps {
  needId: string;
  needTitle: string;
  onClose: () => void;
}

interface AuditData {
  need: any;
  trees: any[];
  phaseA_skillInfluence: { description: string; formula: string; data: any[] };
  phaseB_thresholds: { description: string; relevance: any; quorum: any };
  phaseC_weightedVoting: { description: string; formula: string; ideas: any[]; podium: any };
  phaseD_timeouts: { description: string; ageDays: number; stage: string; policy_14d: string; policy_30d: string; relevanceMetAt: string };
  meta: { generatedAt: string; summary: string };
}

export default function AuditPanel({ needId, needTitle, onClose }: AuditPanelProps) {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>('A');

  useEffect(() => {
    fetchAudit();
  }, [needId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const fetchAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/audit/promotion/${needId}`);
      setData(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar la auditoría');
    } finally {
      setLoading(false);
    }
  };

  const togglePhase = (phase: string) => {
    setExpandedPhase(prev => (prev === phase ? null : phase));
  };

  const phaseLabel = (phase: string) => {
    switch (phase) {
      case 'A': return 'A — Influencia de Habilidades';
      case 'B': return 'B — Umbrales (Relevancia + Quorum)';
      case 'C': return 'C — Votación Ponderada + Podio';
      case 'D': return 'D — Timeouts (14d / 30d)';
      default: return phase;
    }
  };

  const phaseIcon = (phase: string) => {
    switch (phase) {
      case 'A': return <TrendingUp size={16} />;
      case 'B': return <BarChart3 size={16} />;
      case 'C': return <Users size={16} />;
      case 'D': return <Clock size={16} />;
      default: return null;
    }
  };

  const statusPill = (status: string) => ({
    color: status === 'ACTIVE' ? 'var(--accent-warning)' : status === 'IN_PROGRESS' ? 'var(--accent-success)' : 'var(--text-secondary)',
    bg: status === 'ACTIVE' ? 'rgba(245,158,11,0.12)' : status === 'IN_PROGRESS' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
    label: status === 'IN_PROGRESS' ? 'Promovido' : status === 'ACTIVE' ? 'Activo' : status,
  });

  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        key="audit-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '2rem 1.5rem',
          overflowY: 'auto',
        }}
      >
        <motion.div
          key="audit-modal"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="glass-panel"
          style={{ width: '100%', maxWidth: '780px', padding: '2rem', position: 'relative' }}
        >
          {/* Close */}
          <button onClick={onClose} className="btn btn-outline"
            style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}>
            <X size={16} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-2" style={{ marginBottom: '0.2rem' }}>
            <Shield size={20} stroke="var(--accent-indigo)" />
            <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>Auditoría de Promoción</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Necesidad: <span style={{ color: 'var(--text-accent)', fontWeight: 500 }}>{needTitle}</span>
          </p>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-indigo)', marginBottom: '1rem' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Cargando auditoría...</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <XCircle size={32} style={{ color: 'var(--accent-danger)', marginBottom: '0.75rem' }} />
              <p style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{error}</p>
              <button className="btn btn-outline" onClick={fetchAudit}>Reintentar</button>
            </div>
          )}

          {/* Audit content */}
          {!loading && !error && data && (
            <>
              {/* Meta summary */}
              <div style={{
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
              }}>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{data.meta.summary}</p>
              </div>

              {/* Phase accordions */}
              {['A', 'B', 'C', 'D'].map(phase => {
                const isOpen = expandedPhase === phase;
                return (
                  <div key={phase} style={{ marginBottom: '0.6rem' }}>
                    <button
                      onClick={() => togglePhase(phase)}
                      style={{
                        width: '100%', background: isOpen ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isOpen ? 'rgba(99,102,241,0.25)' : 'var(--border-color)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '0.8rem 1rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem',
                        fontWeight: 600, textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                    >
                      {phaseIcon(phase)}
                      <span style={{ flex: 1 }}>{phaseLabel(phase)}</span>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            padding: '1.25rem',
                            border: '1px solid var(--border-color)',
                            borderTop: 'none',
                            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                            fontSize: '0.85rem',
                          }}>
                            {phase === 'A' && <PhaseA data={data.phaseA_skillInfluence} />}
                            {phase === 'B' && <PhaseB data={data.phaseB_thresholds} />}
                            {phase === 'C' && <PhaseC data={data.phaseC_weightedVoting} />}
                            {phase === 'D' && <PhaseD data={data.phaseD_timeouts} />}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {/* Footer */}
              <p style={{
                color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right',
                marginTop: '1rem', marginBottom: 0,
              }}>
                Generado: {new Date(data.meta.generatedAt).toLocaleString()}
              </p>
            </>
          )}

          {/* No data */}
          {!loading && !error && !data && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <Search size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Sin datos de auditoría disponibles.</p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

/* ── Phase A: Skill Influence ──────────────────────────────────────── */
function PhaseA({ data }: { data: { description: string; formula: string; data: any[] } }) {
  if (!data?.data?.length) {
    return <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No hay influencias de habilidades registradas.</p>;
  }

  const byTree = new Map<string, any[]>();
  for (const item of data.data) {
    const key = item.treeId || 'global';
    if (!byTree.has(key)) byTree.set(key, []);
    byTree.get(key)!.push(item);
  }

  return (
    <div>
      <div style={{
        background: 'rgba(16,185,129,0.06)',
        border: '1px solid rgba(16,185,129,0.15)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.6rem 0.85rem',
        marginBottom: '1rem',
        fontSize: '0.8rem', color: 'var(--text-secondary)',
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--accent-success)', marginBottom: '0.3rem' }}>Fórmula</p>
        <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.78rem' }}>{data.formula}</p>
      </div>

      {[...byTree.entries()].map(([treeId, skills]) => (
        <div key={treeId} style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.82rem', color: 'var(--accent-indigo-light)' }}>
            Árbol: {treeId === 'global' ? 'Global' : treeId.substring(0, 8)}...
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Skill</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Green</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Golden</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Final</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Gr Avg Dif</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Go Avg Dif</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>{s.skillTag}</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--accent-green)' }}>{s.greenInfluence}%</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--accent-gold)' }}>{s.goldenInfluence}%</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-indigo-light)' }}>{s.finalInfluence}%</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{s.greenAvgDifficulty ?? '-'}</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{s.goldenAvgDifficulty ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Phase B: Thresholds ───────────────────────────────────────────── */
function PhaseB({ data }: { data: { description: string; relevance: any; quorum: any } }) {
  const { relevance, quorum } = data;
  return (
    <div>
      {/* Relevance */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.88rem', color: 'var(--accent-primary)' }}>Relevancia</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
          <Stat label="Cumplido" value={relevance.met ? <CheckCircle2 size={14} color="var(--accent-success)" /> : <XCircle size={14} color="var(--accent-danger)" />} />
          <Stat label="Equivalente Personas" value={relevance.totalPeopleEquivalent} />
          <Stat label="Puntos Asignados" value={relevance.totalPointsAssigned} />
          <Stat label="Puntos del Árbol" value={relevance.totalTreeWeeklyPoints} />
          <Stat label="10% del Árbol" value={relevance.tenPercentOfTree} />
          <Stat label="Umbral Personas" value={relevance.threshold_people} />
          <Stat label="Umbral Puntos" value={relevance.threshold_points_percent} />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
          {relevance.concentrationMultiplier}
        </div>
        {relevance.metAt && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Alcanzado: {new Date(relevance.metAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Quorum */}
      <div>
        <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.88rem', color: 'var(--accent-purple-light)' }}>Quorum</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
          <Stat label="Cumplido" value={quorum.met ? <CheckCircle2 size={14} color="var(--accent-success)" /> : <XCircle size={14} color="var(--accent-danger)" />} />
          <Stat label="Funders" value={quorum.fundersCount} />
          <Stat label="Votaron" value={quorum.fundersWhoVoted} />
          <Stat label="No votaron" value={quorum.nonVoters} />
          <Stat label="Ratio" value={`${quorum.ratio}%`} />
          <Stat label="Umbral" value={quorum.threshold} />
        </div>
      </div>
    </div>
  );
}

/* ── Phase C: Weighted Voting + Podium ──────────────────────────────── */
function PhaseC({ data }: { data: { description: string; formula: string; ideas: any[]; podium: any } }) {
  const { ideas, podium } = data;
  return (
    <div>
      {/* Podium */}
      <div style={{
        background: 'rgba(139,92,246,0.05)',
        border: '1px solid rgba(139,92,246,0.15)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        marginBottom: '1.25rem',
      }}>
        <h4 style={{ margin: '0 0 0.7rem 0', fontSize: '0.9rem', color: 'var(--accent-secondary)' }}>Podio</h4>
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          {[1, 2, 3].map(pos => {
            const entry = podium[`top${pos}`];
            return (
              <div key={pos} style={{
                flex: '1 1 180px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.7rem',
                border: pos === 1 ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border-color)',
                opacity: entry ? 1 : 0.4,
              }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem', fontWeight: 600 }}>
                  {pos === 1 ? '🥇 1er lugar' : pos === 2 ? '🥈 2do lugar' : '🥉 3er lugar'}
                </div>
                {entry ? (
                  <>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.2rem' }}>{entry.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--accent-indigo-light)', fontWeight: 700 }}>{entry.likesCount} votos</div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Vacío</div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '0.7rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <span>Total top 3: <strong>{podium.top3Total}</strong> — Ratio #1: <strong>{podium.top1Ratio}%</strong> — Umbral: &gt;50%</span>
          <div style={{
            marginTop: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)',
            background: podium.result.includes('promoted') ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
            color: podium.result.includes('promoted') ? 'var(--accent-success)' : 'var(--accent-warning)',
            fontWeight: 600, fontSize: '0.78rem',
          }}>
            Resultado: {podium.result}
          </div>
        </div>
      </div>

      {/* Weighted votes per idea */}
      <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.88rem', color: 'var(--accent-primary)' }}>Votos Ponderados por Idea</h4>

      <div style={{
        background: 'rgba(99,102,241,0.04)',
        border: '1px solid rgba(99,102,241,0.1)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.6rem 0.85rem',
        marginBottom: '1rem',
        fontSize: '0.8rem', color: 'var(--text-secondary)',
      }}>
        <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.76rem' }}>{data.formula}</p>
      </div>

      {ideas.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No hay ideas todavía.</p>
      ) : (
        ideas.map((idea: any) => (
          <div key={idea.id} style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem',
            marginBottom: '0.6rem',
            background: idea.hasBranch ? 'rgba(16,185,129,0.04)' : undefined,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: idea.likes?.length > 0 ? '0.6rem' : 0 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{idea.title}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>por {idea.creator}</span>
                {idea.hasBranch && (
                  <span style={{
                    marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: 700,
                    color: 'var(--accent-success)', background: 'rgba(16,185,129,0.1)',
                    padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                  }}>
                    RAMA CREADA
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-indigo-light)' }}>
                {idea.likesCount} pts
              </span>
            </div>

            {idea.likes?.length > 0 && (
              <div style={{ fontSize: '0.75rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Desglose de votos:</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem', color: 'var(--text-muted)', fontWeight: 500 }}>Votante</th>
                        <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem', color: 'var(--text-muted)', fontWeight: 500 }}>Influencia</th>
                        <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem', color: 'var(--text-muted)', fontWeight: 500 }}>Conc.</th>
                        <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem', color: 'var(--text-muted)', fontWeight: 500 }}>×2</th>
                        <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem', color: 'var(--text-muted)', fontWeight: 500 }}>Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {idea.likes.map((l: any, li: number) => (
                        <tr key={li} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '0.25rem 0.4rem' }}>{l.username}</td>
                          <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right' }}>
                            {l.influenceSkill !== '(none)' ? `${l.influenceSkill} (${l.influenceMultiplier})` : l.influenceMultiplier}
                          </td>
                          <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right' }}>{l.concentrationRatio}%</td>
                          <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right' }}>
                            {l.isConcentrated ? <CheckCircle2 size={12} color="var(--accent-success)" /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right', fontWeight: 600, color: 'var(--accent-indigo-light)' }}>{l.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ── Phase D: Timeouts ──────────────────────────────────────────────── */
function PhaseD({ data }: { data: { description: string; ageDays: number; stage: string; policy_14d: string; policy_30d: string; relevanceMetAt: string } }) {
  const stageConfig = {
    'none': { color: 'var(--accent-success)', bg: 'rgba(16,185,129,0.08)', label: 'Activo — sin presión' },
    '14d_warning': { color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.08)', label: '14d — Aviso a no-votantes enviado' },
    '30d_forced': { color: 'var(--accent-danger)', bg: 'rgba(239,68,68,0.08)', label: '30d — Quorum forzado' },
  };

  const st = stageConfig[data.stage as keyof typeof stageConfig] || stageConfig.none;

  return (
    <div>
      <div style={{
        background: st.bg,
        border: `1px solid ${st.color}33`,
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        marginBottom: '1rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: st.color }}>{data.ageDays}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>días desde relevancia alcanzada</div>
        <div style={{
          marginTop: '0.5rem', fontSize: '0.82rem', fontWeight: 600, color: st.color,
          background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-full)',
          padding: '0.25rem 0.8rem', display: 'inline-block',
        }}>
          {st.label}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
        <div style={{
          background: 'rgba(245,158,11,0.04)',
          border: '1px solid rgba(245,158,11,0.12)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.8rem',
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--accent-warning)', marginBottom: '0.3rem' }}>Política 14 días</div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{data.policy_14d}</p>
        </div>
        <div style={{
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.12)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.8rem',
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--accent-danger)', marginBottom: '0.3rem' }}>Política 30 días</div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{data.policy_30d}</p>
        </div>
      </div>

      {data.relevanceMetAt && (
        <div style={{ marginTop: '0.8rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Relevancia alcanzada: {new Date(data.relevanceMetAt).toLocaleString()}
        </div>
      )}
      {!data.relevanceMetAt && (
        <div style={{ marginTop: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          La relevancia aún no ha sido alcanzada — los timeouts comenzarán cuando se alcance.
        </div>
      )}
    </div>
  );
}

/* ── Reusable stat pill ─────────────────────────────────────────────── */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.5rem 0.7rem',
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}
