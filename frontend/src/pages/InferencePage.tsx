import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Cpu, ArrowLeft, Loader2, AlertCircle, CheckCircle2, XCircle,
  Clock, Play, RotateCcw, Copy, Trash2,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface ModelItem {
  id: string;
  name: string;
  hfRepo: string;
  filename: string;
  status: string;
}

interface InferenceJob {
  id: string;
  modelId: string;
  userId: string;
  input: string;
  output: string | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  priority: number;
  bullmqStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Status badge helper ────────────────────────────────────────────────────

function jobStatusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return { icon: Clock, color: 'var(--text-secondary)', label: 'Pendiente' };
    case 'RUNNING':
      return { icon: Loader2, color: 'var(--accent-warning)', label: 'Ejecutando', spin: true };
    case 'COMPLETED':
      return { icon: CheckCircle2, color: 'var(--accent-success)', label: 'Completado' };
    case 'FAILED':
      return { icon: XCircle, color: 'var(--accent-danger)', label: 'Fallido' };
    default:
      return { icon: Clock, color: 'var(--text-secondary)', label: status };
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InferencePage() {
  const { id: modelId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [model, setModel] = useState<ModelItem | null>(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<InferenceJob | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<InferenceJob[]>([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load model info — check the models list for this ID
  useEffect(() => {
    api.post('/models').then(({ data }) => {
      const found = (data.models || []).find((m: ModelItem) => m.id === modelId);
      if (found) setModel(found);
    }).catch(() => {});
  }, [modelId]);

  // Poll current job status
  useEffect(() => {
    if (!currentJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get(`/inference/jobs/${currentJobId}`);
        if (cancelled) return;
        const job = data.job as InferenceJob;
        setCurrentJob(job);
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          setRunning(false);
          // Add to history
          setHistory(prev => {
            const exists = prev.find(h => h.id === job.id);
            return exists ? prev.map(h => h.id === job.id ? job : h) : [job, ...prev.slice(0, 19)];
          });
        }
      } catch (e) {
        // job might not be ready yet
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [currentJobId]);

  const handleRun = async () => {
    if (!input.trim() || !modelId) return;
    setRunning(true);
    setError('');
    setCurrentJob(null);
    try {
      const { data } = await api.post('/inference/run', { modelId, input: input.trim() });
      setCurrentJobId(data.job.id);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al ejecutar inferencia');
      setRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleRun();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const badge = currentJob ? jobStatusBadge(currentJob.status) : null;
  const BadgeIcon = badge?.icon || Clock;

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/models')}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
        >
          <ArrowLeft size={20} />
        </button>
        <Cpu size={isMobile ? 22 : 28} color="var(--accent-primary)" />
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.4rem', fontWeight: 700 }}>
            Inferencia
          </h2>
          {model && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Modelo: {model.name} <span style={{ opacity: 0.5 }}>({model.hfRepo}/{model.filename})</span>
            </div>
          )}
        </div>
      </div>

      {/* Main layout: input | output */}
      <div style={{ display: 'flex', gap: '1rem', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Input panel */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 500 }}>
            Prompt
          </label>
          <textarea
            ref={inputRef}
            className="input-field"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu prompt aquí... (Ctrl+Enter para ejecutar)"
            style={{
              flex: 1,
              minHeight: isMobile ? '180px' : '250px',
              resize: 'vertical',
              lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
            disabled={running}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleRun}
              disabled={running || !input.trim()}
              style={{ padding: '0.65rem 1.25rem', fontSize: '0.9rem' }}
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {running ? 'Ejecutando...' : 'Ejecutar'}
            </button>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Ctrl+Enter</span>
          </div>
          {error && (
            <div style={{ marginTop: '0.75rem', color: 'var(--accent-danger)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Output panel */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: isMobile ? '200px' : '250px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Resultado</span>
            {currentJob && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)',
                background: badge?.bg || 'rgba(156,163,175,0.1)',
                color: badge?.color || 'var(--text-secondary)',
                fontSize: '0.7rem', fontWeight: 600,
              }}>
                <BadgeIcon size={10} className={badge?.spin ? 'animate-spin' : ''} />
                {badge?.label}
              </span>
            )}
          </div>

          <div style={{
            flex: 1,
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            overflowY: 'auto',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            color: currentJob?.output ? 'var(--text-primary)' : 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            position: 'relative',
            border: '1px solid var(--border-color)',
          }}>
            {!currentJob && !running && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
                <Cpu size={40} style={{ marginBottom: '0.75rem' }} />
                <span>El resultado aparecerá aquí</span>
              </div>
            )}
            {running && !currentJob?.output && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', height: '100%' }}>
                <Loader2 size={16} className="animate-spin" />
                <span>Procesando...</span>
              </div>
            )}
            {currentJob?.status === 'FAILED' && (
              <div style={{ color: 'var(--accent-danger)' }}>
                Error en la ejecución del job.
              </div>
            )}
            {currentJob?.output && (
              <>
                {currentJob.output}
                <button
                  onClick={() => handleCopy(currentJob.output!)}
                  style={{
                    position: 'absolute', top: '0.5rem', right: '0.5rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
                    cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                  title="Copiar resultado"
                >
                  <Copy size={12} /> Copiar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Job history */}
      {history.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Historial reciente</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map(job => {
              const hbadge = jobStatusBadge(job.status);
              const HIcon = hbadge.icon;
              return (
                <div
                  key={job.id}
                  className="glass-panel"
                  style={{
                    padding: isMobile ? '0.75rem' : '0.75rem 1rem',
                    cursor: job.output ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  }}
                  onClick={() => {
                    if (job.output) {
                      setCurrentJobId(job.id);
                      setCurrentJob(job);
                    }
                  }}
                >
                  <HIcon size={14} className={hbadge.spin ? 'animate-spin' : ''} color={hbadge.color} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.input.slice(0, 120)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      {new Date(job.createdAt).toLocaleTimeString('es-CL')} — {job.output ? `${job.output.length} chars` : job.status}
                    </div>
                  </div>
                  {job.output && (
                    <RotateCcw size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} title="Cargar resultado" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
