import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, Loader2, AlertCircle, CheckCircle2, XCircle, Clock,
  PlusCircle, X, Play, ChevronRight,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

type FinetuneStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
type DatasetSource = 'TASKS_EXPORT' | 'MANUAL_UPLOAD';

interface FinetuneJob {
  id: string;
  name: string;
  baseModel: string;
  status: FinetuneStatus;
  datasetSource: DatasetSource;
  taskFilter: any;
  outputModelPath: string | null;
  metricsJson: any;
  startedAt: string | null;
  completedAt: string | null;
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

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'ahora';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FinetunePage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<FinetuneJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Form state
  const [name, setName] = useState('');
  const [baseModel, setBaseModel] = useState('');
  const [datasetSource, setDatasetSource] = useState<DatasetSource>('TASKS_EXPORT');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/finetune/jobs');
      setJobs(Array.isArray(data) ? data : data.jobs || []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al cargar trabajos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  // Poll while any job is RUNNING
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'RUNNING' || j.status === 'QUEUED');
    if (!hasRunning) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs.some(j => j.status === 'RUNNING' || j.status === 'QUEUED')]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !baseModel) return;
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/finetune/create', { name, baseModel, datasetSource });
      setShowCreate(false);
      setName('');
      setBaseModel('');
      setDatasetSource('TASKS_EXPORT');
      fetchJobs();
    } catch (e: any) {
      setCreateError(e.response?.data?.error || 'Error al crear trabajo');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Wrench size={isMobile ? 22 : 28} color="var(--accent-secondary)" />
          <h2 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700 }}>Fine-tuning</h2>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn btn-primary"
          style={{ padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem', fontSize: isMobile ? '0.85rem' : '0.95rem' }}
        >
          <PlusCircle size={16} />
          Nuevo Fine-tune
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem', padding: isMobile ? '1.25rem' : '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Nuevo trabajo de fine-tuning</h3>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Nombre del trabajo</label>
              <input
                className="input-field"
                placeholder="ej: Mi modelo de soporte"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Modelo base (HuggingFace)</label>
              <input
                className="input-field"
                placeholder="ej: unsloth/Llama-3.2-3B"
                value={baseModel}
                onChange={e => setBaseModel(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Fuente del dataset</label>
              <select
                className="input-field"
                value={datasetSource}
                onChange={e => setDatasetSource(e.target.value as DatasetSource)}
                style={{ cursor: 'pointer' }}
              >
                <option value="TASKS_EXPORT">Exportar tareas completadas</option>
                <option value="MANUAL_UPLOAD">Subir manualmente</option>
              </select>
            </div>
            {createError && (
              <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                {createError}
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={creating} style={{ alignSelf: 'flex-start' }}>
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {creating ? 'Creando...' : 'Crear trabajo'}
            </button>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={24} className="animate-spin" style={{ marginRight: '0.75rem' }} />
          Cargando...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-danger)' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {/* Jobs table */}
      {!loading && !error && jobs.length > 0 && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>Nombre</th>
                {!isMobile && <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Modelo base</th>}
                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Estado</th>
                {!isMobile && <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Creado</th>}
                <th style={{ width: '40px', padding: '0.75rem 0.5rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const badge = statusBadge(job.status);
                const Icon = badge.icon;
                return (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/finetune/${job.id}`)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {job.name}
                      {!isMobile && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{job.baseModel}</div>}
                    </td>
                    {!isMobile && (
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.baseModel}
                      </td>
                    )}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)',
                        background: badge.bg, color: badge.color,
                        fontSize: '0.72rem', fontWeight: 600,
                      }}>
                        <Icon size={12} className={badge.spin ? 'animate-spin' : ''} />
                        {badge.label}
                      </span>
                    </td>
                    {!isMobile && (
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        {timeAgo(job.createdAt)}
                      </td>
                    )}
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <ChevronRight size={16} color="var(--text-secondary)" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && jobs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <Wrench size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem' }}>No hay trabajos de fine-tuning.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Crea un nuevo trabajo para entrenar un modelo con datos de Trust Maker.
          </p>
        </div>
      )}
    </div>
  );
}
