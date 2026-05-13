import { useEffect, useState } from 'react';
import {
  Box, Download, Loader2, AlertCircle, CheckCircle2, Clock,
  PlusCircle, X,
} from 'lucide-react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface ModelItem {
  id: string;
  name: string;
  source: string;
  hfRepo: string;
  filename: string;
  sizeBytes: number | null;
  status: 'DOWNLOADING' | 'READY' | 'ERROR';
  downloadedAt: string | null;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'READY':
      return { icon: CheckCircle2, color: 'var(--accent-success)', bg: 'rgba(16,185,129,0.1)', label: 'Listo' };
    case 'DOWNLOADING':
      return { icon: Loader2, color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.1)', label: 'Descargando', spin: true };
    case 'ERROR':
      return { icon: AlertCircle, color: 'var(--accent-danger)', bg: 'rgba(239,68,68,0.1)', label: 'Error' };
    default:
      return { icon: Clock, color: 'var(--text-secondary)', bg: 'rgba(156,163,175,0.1)', label: status };
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDownload, setShowDownload] = useState(false);
  const [hfRepo, setHfRepo] = useState('');
  const [filename, setFilename] = useState('');
  const [modelName, setModelName] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/models');
      setModels(data.models || []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al cargar modelos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModels(); }, []);

  // Poll for status changes while any model is DOWNLOADING
  useEffect(() => {
    const hasDownloading = models.some(m => m.status === 'DOWNLOADING');
    if (!hasDownloading) return;
    const interval = setInterval(fetchModels, 3000);
    return () => clearInterval(interval);
  }, [models.some(m => m.status === 'DOWNLOADING')]);

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hfRepo || !filename) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await api.post('/models/download', {
        hfRepo,
        filename,
        name: modelName || undefined,
      });
      setShowDownload(false);
      setHfRepo('');
      setFilename('');
      setModelName('');
      fetchModels();
    } catch (e: any) {
      setDownloadError(e.response?.data?.error || 'Error al iniciar descarga');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Box size={isMobile ? 22 : 28} color="var(--accent-primary)" />
          <h2 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700 }}>Modelos</h2>
        </div>
        <button
          onClick={() => setShowDownload(!showDownload)}
          className="btn btn-primary"
          style={{ padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem', fontSize: isMobile ? '0.85rem' : '0.95rem' }}
        >
          <Download size={16} />
          Descargar modelo
        </button>
      </div>

      {/* Download form */}
      {showDownload && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem', padding: isMobile ? '1.25rem' : '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Descargar nuevo modelo</h3>
            <button onClick={() => { setShowDownload(false); setDownloadError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleDownload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>Repositorio HuggingFace</label>
              <input
                className="input-field"
                placeholder="ej: TheBloke/Llama-2-7B-GGUF"
                value={hfRepo}
                onChange={e => setHfRepo(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Nombre del archivo</label>
              <input
                className="input-field"
                placeholder="ej: llama-2-7b.Q4_K_M.gguf"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Nombre del modelo (opcional)</label>
              <input
                className="input-field"
                placeholder="Nombre descriptivo"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
              />
            </div>
            {downloadError && (
              <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                {downloadError}
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={downloading} style={{ alignSelf: 'flex-start' }}>
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? 'Iniciando...' : 'Descargar'}
            </button>
          </form>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={24} className="animate-spin" style={{ marginRight: '0.75rem' }} />
          Cargando modelos...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-danger)' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Models grid */}
      {!loading && !error && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '1rem',
        }}>
          {models.map(model => {
            const badge = statusBadge(model.status);
            const Icon = badge.icon;
            return (
              <div
                key={model.id}
                className="glass-panel"
                style={{
                  padding: '1.25rem',
                  cursor: model.status === 'READY' ? 'pointer' : 'default',
                  transition: 'all var(--transition-normal)',
                  opacity: model.status === 'ERROR' ? 0.7 : 1,
                }}
                onClick={() => {
                  if (model.status === 'READY') {
                    window.location.href = `/models/${model.id}/inference`;
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {model.name}
                    </h4>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {model.hfRepo} / {model.filename}
                    </div>
                  </div>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    background: badge.bg,
                    color: badge.color,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    marginLeft: '0.5rem',
                  }}>
                    <Icon size={12} className={badge.spin ? 'animate-spin' : ''} />
                    {badge.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>{formatBytes(model.sizeBytes)}</span>
                  <span>{new Date(model.createdAt).toLocaleDateString('es-CL')}</span>
                  {model.status === 'READY' && (
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>Click → Inferencia</span>
                  )}
                </div>
              </div>
            );
          })}
          {models.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <Box size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '1rem' }}>No hay modelos descargados.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Haz clic en "Descargar modelo" para empezar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
