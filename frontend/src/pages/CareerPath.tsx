import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Target,
  Zap,
  DollarSign,
  Scale,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Inbox,
  Network,
} from 'lucide-react';
import api from '../lib/api';
import CareerPathResult from '../components/CareerPathResult';
import CareerPathNetwork from '../components/CareerPathNetwork';
import type { CareerPathData } from '../components/CareerPathResult';

/* ── Types ───────────────────────────────────────────── */
type PathMode = 'fastest' | 'profitable' | 'balanced';

interface SkillOption {
  skillTag: string;
  difficulty?: number;
  avgIncome?: number;
  memberCount?: number;
}

interface GraphData {
  nodes: Array<{
    skillTag: string;
    difficulty: number;
    avgIncome: number;
    memberCount: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    hopsWeight: number;
    profitWeight: number;
    combinedWeight: number;
    transitionCount: number;
  }>;
}

/* ── Mode config ─────────────────────────────────────── */
const MODES: { key: PathMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'fastest', label: 'Más rápido', icon: <Zap size={16} />, desc: 'Menos tareas' },
  { key: 'profitable', label: 'Más rentable', icon: <DollarSign size={16} />, desc: 'Mayor ingreso' },
  { key: 'balanced', label: 'Balanceado', icon: <Scale size={16} />, desc: 'Equilibrio' },
];

/* ── Page ─────────────────────────────────────────────── */
export default function CareerPath() {
  const { treeId } = useParams<{ treeId: string }>();
  const navigate = useNavigate();

  /* State */
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillOption[]>([]);
  const [targetSkill, setTargetSkill] = useState('');
  const [mode, setMode] = useState<PathMode>('balanced');
  const [result, setResult] = useState<CareerPathData | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Fetch user skills + available skills + graph ──── */
  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. User profile → membership skills for this tree
        const { data: profile } = await api.get('/users/profile');
        if (cancelled) return;

        const membership = profile?.memberships?.find((m: any) => m.treeId === treeId);
        const mySkills: string[] = membership?.skills
          ? (typeof membership.skills === 'string'
              ? JSON.parse(membership.skills)
              : membership.skills)
          : [];
        setUserSkills(mySkills);

        // 2. Available skills for dropdown
        const { data: skillsData } = await api.get(`/career-path/skills/${treeId}`);
        if (cancelled) return;

        // skillsData could be { skills: [...] } or an array
        const skillsList: SkillOption[] = Array.isArray(skillsData)
          ? skillsData
          : skillsData?.skills || [];
        setAvailableSkills(skillsList);

        // 3. Graph data
        try {
          const { data: graphData } = await api.get(`/career-path/graph/${treeId}`);
          if (!cancelled) setGraph(graphData);
        } catch {
          // graph is optional — just don't show it if it fails
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.error || 'Error al cargar datos del árbol.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [treeId]);

  /* ── Filter skills for dropdown (exclude already owned) ── */
  const targetOptions = availableSkills.filter(
    (s) => !userSkills.includes(s.skillTag)
  );

  /* ── Search path ────────────────────────────────────── */
  const handleSearch = useCallback(async () => {
    if (!treeId || !targetSkill) return;

    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await api.post('/career-path/find', {
        treeId,
        targetSkill,
        mode,
        maxHops: 10,
      });

      setResult(data);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || 'Error al buscar la ruta. Intenta con otro skill.'
      );
    } finally {
      setSearching(false);
    }
  }, [treeId, targetSkill, mode]);

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '1rem',
        maxWidth: 'var(--max-width)',
        margin: '0 auto',
      }}
    >
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          cursor: 'pointer',
          marginBottom: '1rem',
          padding: '0.4rem 0',
          fontWeight: 500,
        }}
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      {/* ── Loading ──────────────────────────────────── */}
      {loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1rem',
            gap: '1rem',
          }}
        >
          <div
            className="spinner"
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--border-color)',
              borderTopColor: 'var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Cargando datos del árbol...
          </span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────── */}
      {!loading && error && !result && (
        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <AlertTriangle size={36} style={{ color: 'var(--accent-warning)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{error}</p>
          <button
            className="btn btn-outline"
            onClick={() => navigate('/')}
            style={{ fontSize: '0.85rem' }}
          >
            Volver al inicio
          </button>
        </div>
      )}

      {/* ── Empty: no skills ─────────────────────────── */}
      {!loading && !error && availableSkills.length === 0 && (
        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <Inbox size={36} style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            Este árbol no tiene habilidades registradas aún.
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Se necesitan miembros con skills para generar el grafo de carrera.
          </p>
        </div>
      )}

      {/* ── Main content ─────────────────────────────── */}
      {!loading && !error && availableSkills.length > 0 && (
        <AnimatePresence mode="wait">
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          >
            {/* ── Header ───────────────────────────── */}
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                <Network size={22} style={{ verticalAlign: 'middle', marginRight: '0.4rem', color: 'var(--accent-primary)' }} />
                Career Path
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Traza tu ruta de aprendizaje hacia un nuevo skill.
              </p>
            </div>

            {/* ── My skills ─────────────────────────── */}
            {userSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Mis skills:
                </span>
                {userSkills.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: 'rgba(16,185,129,0.12)',
                      color: 'var(--accent-success)',
                      border: '1px solid rgba(16,185,129,0.25)',
                    }}
                  >
                    #{s}
                  </span>
                ))}
              </div>
            )}

            {/* ── Controls card ─────────────────────── */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              {/* Target skill dropdown */}
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Target size={14} style={{ color: 'var(--accent-warning)' }} />
                  Skill objetivo
                </label>
                <select
                  className="input-field"
                  value={targetSkill}
                  onChange={(e) => setTargetSkill(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Selecciona un skill...</option>
                  {targetOptions.map((s) => (
                    <option key={s.skillTag} value={s.skillTag}>
                      #{s.skillTag}
                      {s.difficulty != null ? ` (dif ${s.difficulty.toFixed(1)})` : ''}
                      {s.memberCount != null ? ` — ${s.memberCount} miembros` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode selector */}
              <div className="input-group">
                <label>Modo de búsqueda</label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  {MODES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      style={{
                        flex: '1 1 auto',
                        minWidth: 120,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.65rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border:
                          mode === m.key
                            ? '1px solid var(--accent-primary)'
                            : '1px solid var(--border-color)',
                        background:
                          mode === m.key
                            ? 'rgba(59,130,246,0.12)'
                            : 'transparent',
                        color:
                          mode === m.key
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: mode === m.key ? 600 : 400,
                        fontSize: '0.82rem',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      {m.icon}
                      <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                        <div>{m.label}</div>
                        <div style={{ fontSize: '0.68rem', opacity: 0.7 }}>
                          {m.desc}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Search button */}
              <button
                className="btn btn-primary w-full"
                onClick={handleSearch}
                disabled={!targetSkill || searching}
                style={{
                  width: '100%',
                  marginTop: '0.5rem',
                  opacity: !targetSkill || searching ? 0.5 : 1,
                }}
              >
                {searching ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Buscando ruta...
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    BUSCAR RUTA
                  </>
                )}
              </button>

              {/* Search error */}
              {error && result === null && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: 'var(--accent-danger)',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <AlertTriangle size={14} />
                  {error}
                </div>
              )}
            </div>

            {/* ── Results ───────────────────────────── */}
            {result && (
              <CareerPathResult
                result={result}
                onSelectAlternative={() => {}}
              />
            )}

            {/* ── Graph ─────────────────────────────── */}
            {graph && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  <Network size={16} />
                  Grafo de habilidades
                </div>
                <CareerPathNetwork
                  graph={graph}
                  highlightedPath={result?.path?.map((s) => s.skillTag)}
                />
              </div>
            )}

            {/* ── Empty result state (after search) ─── */}
            {!result && !searching && !error && (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                <Target size={40} style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Selecciona un skill objetivo y elige un modo para encontrar tu ruta óptima.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
