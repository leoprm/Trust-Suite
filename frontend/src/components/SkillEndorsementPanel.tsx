import { useState, useEffect } from 'react';
import { Sprout, Users, AlertTriangle, Check, X } from 'lucide-react';
import api from '../lib/api';

interface Props {
  treeId: string;
  onClose: () => void;
}

export default function SkillEndorsementPanel({ treeId, onClose }: Props) {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<any>(null);
  const [endorsing, setEndorsing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const fetchProposals = async () => {
    try {
      const { data } = await api.get(`/skills/proposals?treeId=${treeId}`);
      setProposals(data.filter((p: any) => p.status === 'PENDIENTE_AVALES'));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProposals(); }, [treeId]);

  const handleEndorse = async () => {
    if (!confirmTarget) return;
    setEndorsing(true);
    setFeedback(null);
    try {
      await api.post('/skills/endorse', { proposalId: confirmTarget.id });
      setFeedback({ type: 'ok', msg: `Avalaste a ${confirmTarget.user?.username} en ${confirmTarget.hashtag}. Tu bono de mentoría +5% XP está activo por 3 meses.` });
      setConfirmTarget(null);
      fetchProposals();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'ENDORSEMENT_BANNED') {
        setFeedback({ type: 'err', msg: 'Tu derecho a avalar está suspendido por un apadrinamiento previo fallido.' });
      } else {
        setFeedback({ type: 'err', msg: err?.response?.data?.error || 'Error al avalar' });
      }
    } finally {
      setEndorsing(false);
      setConfirmTarget(null);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9990,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, maxHeight: '80vh',
          background: 'var(--bg-primary, #0a0a0a)', borderRadius: '18px 18px 0 0',
          padding: '1rem', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sprout size={16} color="#10b981" /> Candidaturas pendientes de aval
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {feedback && (
          <div style={{
            padding: '0.5rem 0.6rem', borderRadius: 8, marginBottom: '0.5rem',
            background: feedback.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${feedback.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            fontSize: '0.62rem', color: feedback.type === 'ok' ? '#10b981' : '#ef4444',
          }}>
            {feedback.msg}
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }}>Cargando…</p>
        ) : proposals.length === 0 ? (
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }}>
            No hay candidaturas pendientes de aval en este árbol.
          </p>
        ) : (
          proposals.map(p => (
            <div key={p.id} style={{
              padding: '0.55rem 0.65rem', borderRadius: 10, marginBottom: '0.35rem',
              background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Users size={14} color="#8b5cf6" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b5cf6', display: 'block' }}>
                  {p.user?.username} — {p.hashtag}
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                  {p.endorsements?.length || 0}/3 avales
                </span>
              </div>
              <button
                onClick={() => setConfirmTarget(p)}
                style={{
                  background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: 8, padding: '0.3rem 0.55rem', cursor: 'pointer',
                  fontSize: '0.6rem', fontWeight: 600, color: '#8b5cf6',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Check size={12} /> Avalar
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────── */}
      {confirmTarget && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '90%', maxWidth: 360, zIndex: 9999,
            background: 'var(--bg-primary, #0a0a0a)', borderRadius: 16,
            padding: '1.2rem', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            border: '1px solid rgba(234,179,8,0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.6rem' }}>
            <AlertTriangle size={20} color="#eab308" />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#eab308' }}>
              Confirmar Aval — Skin in the Game
            </span>
          </div>

          <p style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.5rem' }}>
            Estás por avalar a <strong style={{ color: '#8b5cf6' }}>{confirmTarget.user?.username}</strong> en{' '}
            <strong style={{ color: '#10b981' }}>{confirmTarget.hashtag}</strong>.
          </p>

          <div style={{
            background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)',
            borderRadius: 8, padding: '0.45rem 0.6rem', marginBottom: '0.6rem',
          }}>
            <p style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0 }}>
              <strong style={{ color: '#eab308' }}>⚠️ Compromiso:</strong> Dar tu aval es una apuesta personal.
              Si este candidato <strong>falla una tarea de prueba</strong>, <strong style={{ color: '#ef4444' }}>podrías perder tu capacidad
              de recomendar por 6 meses</strong> y tus bonos de XP. a cambio, recibirás un <strong style={{ color: '#10b981' }}>+5% XP durante
              3 meses</strong> por tu labor de mentoría.
            </p>
          </div>

          <p style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.7rem' }}>
            ¿Confirmas que conoces el trabajo de esta persona y confías en su capacidad?
          </p>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setConfirmTarget(null)}
              style={{
                flex: 1, padding: '0.45rem', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-secondary)', fontSize: '0.65rem', fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleEndorse}
              disabled={endorsing}
              style={{
                flex: 1, padding: '0.45rem', borderRadius: 10, cursor: endorsing ? 'wait' : 'pointer',
                background: endorsing ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.2)',
                border: '1px solid rgba(139,92,246,0.4)',
                color: '#8b5cf6', fontSize: '0.65rem', fontWeight: 700,
              }}
            >
              {endorsing ? 'Avalando…' : '✅ Confirmar Aval'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
