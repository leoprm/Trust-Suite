import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wrench, Loader2, AlertCircle, CheckCircle2, XCircle, Clock,
  Play, Database, Cpu, BarChart3, Calendar, Hash,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

type FinetuneStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

interface FinetuneJob {
  id: string;
  name: string;
  baseModel: string;
  status: FinetuneStatus;
  datasetSource: string;
  taskFilter: any;
  outputModelPath: string | null;
  metricsJson: any;
  startedAt: string | null;
  completedAt: string | null;
  createdById: string;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: FinetuneStatus) {
  switch (status) {
    case 'QUEUED':
      return { icon: Clock, color: 'var(--text-secondary)', bg: 'rgba(156,163,175,0.1)', label: 'En cola' };
    case 'RUNNING':
      return { icon: Loader2, color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.1)', label: 'Ejecutando', spin: true };
    case 'COMPLETED':
      return { icon: CheckCircle2, color: 'var(--accent-success)', bg: 'rgba(16,185,129,0.1)', label: 'Completado' };
    case 'FAILED':
      return { icon: XCircle, color: 'var(--accent-danger)', bg: 'rgba(239,68,68,0.1)', label: 'Fallido' };
  }
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FinetuneDetail() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<FinetuneJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchJob = async () => {
    try {
      const { data } = await api.get(`/finetune/jobs/${jobId}`);
      setJob(data);
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al cargar el trabajo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJob(); }, [jobId]);

  // Poll if active
  useEffect(() => {
    if (!job || (job.status !== 'QUEUED' && job.status !== 'RUNNING')) return;
    const interval = setInterval(fetchJob, 5000);
    return () => clearInterval(interval);
  }, [job?.status]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
        <Loader2 size={28} className="animate-spin" style={{ marginRight: '1rem' }} />
        Cargando...
      </div>
    );
  }

  if (error || !job) {
    return (
      <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
        <button onClick={() => navigate('/finetune')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
          <ArrowLeft size={20} /> <span style={{ marginLeft: '0.25rem' }}>Volver</span>
        </button>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-danger)' }}>
          <AlertCircle size={20} /> {error || 'Trabajo no encontrado'}
        </div>
      </div>
    );
  }

  const badge = statusBadge(job.status);
  const Icon = badge.icon;
  const metrics = job.metricsJson;

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
      {/* Back + header */}
      <button
        onClick={() => navigate('/finetune')}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', marginBottom: '1rem', padding: '0.25rem' }}
      >
        <ArrowLeft size={20} /> <span style={{ marginLeft: '0.25rem', fontSize: '0.85rem' }}>Fine-tuning</span>
      </button>

      {/* Title card */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700 }}>{job.name}</h2>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={12} /> {job.baseModel}
              </span>
              <span style={{ opacity: 0.3 }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Database size={12} /> {job.datasetSource === 'TASKS_EXPORT' ? 'Export tareas' : 'Manual'}
              </span>
            </div>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '0.3rem 0.75rem', borderRadius: 'var(--radius-full)',
            background: badge.bg, color: badge.color,
            fontSize: '0.8rem', fontWeight: 600,
          }}>
            <Icon size={14} className={badge.spin ? 'animate-spin' : ''} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Calendar size={20} color="var(--accent-primary)" />
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Creado</div>
            <div style={{ fontSize: '0.85rem' }}>{formatDate(job.createdAt)}</div>
          </div>
        </div>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={20} color="var(--accent-warning)" />
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>
              {job.status === 'COMPLETED' ? 'Completado' : job.status === 'RUNNING' ? 'Iniciado' : 'Inicio'}
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              {job.status === 'COMPLETED' ? formatDate(job.completedAt) : job.status === 'RUNNING' ? formatDate(job.startedAt) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Output model path */}
      {job.outputModelPath && (
        <div className="glass-panel" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Cpu size={18} color="var(--accent-success)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Modelo entrenado</div>
            <code style={{ fontSize: '0.8rem', wordBreak: 'break-all', color: 'var(--text-primary)' }}>{job.outputModelPath}</code>
          </div>
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="glass-panel" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <BarChart3 size={18} color="var(--accent-primary)" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Métricas</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {typeof metrics === 'object' && metrics !== null ? (
              Object.entries(metrics).map(([key, value]) => (
                <div key={key} style={{
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                    {key}
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {typeof value === 'number' ? value.toFixed(4) : String(value)}
                  </div>
                </div>
              ))
            ) : (
              <pre style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(metrics, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Task filter */}
      {job.taskFilter && typeof job.taskFilter === 'object' && Object.keys(job.taskFilter).length > 0 && (
        <div className="glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Hash size={16} color="var(--text-secondary)" />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Filtro de tareas</h3>
          </div>
          <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(job.taskFilter, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
