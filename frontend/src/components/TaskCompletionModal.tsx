import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Loader2, AlertCircle, Camera, ImageIcon } from 'lucide-react';
import api from '../lib/api';
import CivicAuditModal from './CivicAuditModal';

interface TaskCompletionModalProps {
  taskId: string;
  taskName: string;
  onClose: () => void;
  onSuccess: (xpAwarded: number) => void;
  initialData?: any;
}

// Compress image client-side using canvas (no extra deps)
async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<Blob> {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
    || file.name.toLowerCase().endsWith('.heic')
    || file.name.toLowerCase().endsWith('.heif');

  if (isHeic) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      );
    });
  } catch {
    return file;
  }
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Trivial', 2: 'Muy fácil', 3: 'Fácil', 4: 'Moderada',
  5: 'Normal', 6: 'Exigente', 7: 'Difícil', 8: 'Muy difícil',
  9: 'Extrema', 10: 'Imposible 💀'
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#10b981', 2: '#10b981', 3: '#34d399',
  4: '#6ee7b7', 5: '#f59e0b', 6: '#fb923c',
  7: '#f97316', 8: '#ef4444', 9: '#dc2626', 10: '#991b1b'
};

export default function TaskCompletionModal({ taskId, taskName, onClose, onSuccess, initialData }: TaskCompletionModalProps) {
  console.log('[TaskCompletionModal] Mounting with initialData:', initialData);
  const [difficulty, setDifficulty] = useState(
    (initialData?.difficulty !== undefined && initialData?.difficulty !== null) 
      ? Math.round(initialData.difficulty) 
      : 5
  );
  
  const getFullImageUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('http')) return url;
    return `http://${window.location.hostname}:3000${url}`;
  };

  // Parse JSON array or single URL stored in completionPhotoUrl
  const parsePhotoUrls = (val: string | null | undefined): string[] => {
    if (!val) return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch { return [val]; }
  };

  interface PhotoEntry { id: string; blob: Blob | null; preview: string; isExisting: boolean }
  const makeId = () => Math.random().toString(36).slice(2);

  const buildInitialPhotos = (data: any): PhotoEntry[] => {
    const urls = parsePhotoUrls(data?.completionPhotoUrl);
    return urls.map(u => ({ id: makeId(), blob: null, preview: getFullImageUrl(u) || u, isExisting: true }));
  };

  const [comment, setComment] = useState(initialData?.completionComment || '');
  const [visibility, setVisibility] = useState<'TASK_PARTICIPANTS' | 'TREE_ONLY' | 'PRIVATE'>('PRIVATE');
  const [photos, setPhotos] = useState<PhotoEntry[]>(() => buildInitialPhotos(initialData));
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [auditTask, setAuditTask] = useState<{ id: string; description: string; tags: string[] } | null>(null);
  const [pendingXp, setPendingXp] = useState(0);

  const MAX_PHOTOS = 5;

  useEffect(() => {
    if (initialData) {
      if (initialData.difficulty !== undefined && initialData.difficulty !== null) {
        setDifficulty(Math.round(initialData.difficulty));
      }
      setComment(initialData.completionComment || '');
      setPhotos(buildInitialPhotos(initialData));
    }
  }, [initialData]);

  const diffColor = DIFFICULTY_COLORS[difficulty] || '#f59e0b';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = files.slice(0, remaining);
    const newEntries: PhotoEntry[] = [];
    for (const file of toAdd) {
      try {
        const compressed = await compressImage(file);
        newEntries.push({ id: makeId(), blob: compressed, preview: URL.createObjectURL(compressed), isExisting: false });
      } catch {
        newEntries.push({ id: makeId(), blob: file, preview: URL.createObjectURL(file), isExisting: false });
      }
    }
    setPhotos(prev => [...prev, ...newEntries]);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const entry = prev.find(p => p.id === id);
      if (entry && !entry.isExisting && entry.preview.startsWith('blob:')) URL.revokeObjectURL(entry.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      setUploading(true);
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        if (photo.blob) {
          const formData = new FormData();
          formData.append('file', photo.blob, 'evidence.jpg');
          formData.append('visibility', visibility);
          const { data: uploadData } = await api.post(`/tasks/${taskId}/evidence`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          uploadedUrls.push(uploadData.downloadUrl || uploadData.url);
        } else if (photo.isExisting) {
          // Keep existing URL (strip full hostname to relative path for storage)
          const rel = photo.preview.replace(/^https?:\/\/[^/]+/, '');
          uploadedUrls.push(rel);
        }
      }
      setUploading(false);

      const payload: any = { difficulty, comment: comment.trim(), photoUrls: uploadedUrls };

      const { data } = await api.post(`/tasks/${taskId}/complete`, payload);

      if (data.auditRequired && data.auditTask) {
        setPendingXp(data.xpAwarded ?? 0);
        setAuditTask(data.auditTask);
        return;
      }

      onSuccess(data.xpAwarded ?? 0);
    } catch (err: any) {
      setUploading(false);
      setError(err.response?.data?.error || 'Error al completar la tarea');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Civic Audit Mode ────────────────────────────────────────────
  if (auditTask) {
    return (
      <CivicAuditModal
        auditTask={auditTask}
        originalTaskId={taskId}
        onComplete={(civicBonusXp) => {
          onSuccess(pendingXp + civicBonusXp);
        }}
      />
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: '1rem'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.91, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.91, y: 16 }}
        style={{
          background: 'var(--surface-color, #1a1a2e)',
          width: '100%', maxWidth: '480px',
          borderRadius: 'var(--radius-xl, 20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(16, 185, 129, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle2 size={20} stroke="var(--accent-success, #10b981)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {initialData ? 'Editar Dificultad' : 'Completar Tarea'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #9ca3af)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {taskName}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Difficulty Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Dificultad real percibida</label>
              <span style={{
                fontSize: '0.8rem', fontWeight: 700, color: diffColor,
                background: `${diffColor}18`, padding: '0.15rem 0.6rem',
                borderRadius: '100px', border: `1px solid ${diffColor}33`
              }}>
                {difficulty}/10 — {DIFFICULTY_LABELS[difficulty]}
              </span>
            </div>
            <input
              type="range" min={1} max={10} step={1}
              value={difficulty}
              onChange={e => setDifficulty(Number(e.target.value))}
              style={{ width: '100%', accentColor: diffColor, cursor: 'pointer', height: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              <span>Trivial</span>
              <span>Imposible</span>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
              Comentario{' '}
              <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>(opcional)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="¿Cómo fue la ejecución? ¿Alguna nota relevante?"
              maxLength={500}
              rows={3}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '0.75rem',
                color: 'var(--text-primary, white)', fontSize: '0.875rem',
                resize: 'vertical', outline: 'none', fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Photo Evidence */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Fotos de evidencia{' '}
                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>(opcional, máx. 5)</span>
              </label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{photos.length}/5</span>
            </div>

            {/* Photo grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', gap: 8 }}>
              {photos.map(photo => (
                <div key={photo.id} style={{ position: 'relative', width: 80, height: 80 }}>
                  <img
                    src={photo.preview} alt="evidencia"
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button
                    onClick={() => removePhoto(photo.id)}
                    style={{
                      position: 'absolute', top: 3, right: 3,
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.75)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'white',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    onClick={() => { if (fileInputRef.current) { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); } }}
                    style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.2)',
                      cursor: 'pointer', color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Cámara"
                  ><Camera size={16} /></button>
                  <button
                    onClick={() => { if (fileInputRef.current) { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); } }}
                    style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.2)',
                      cursor: 'pointer', color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Galería"
                  ><ImageIcon size={16} /></button>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef} type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              multiple
              onChange={handleFileSelect} style={{ display: 'none' }}
            />
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.68rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
              No subas datos sensibles innecesarios. La evidencia queda registrada con hash y visible solo segun permisos de la tarea.
            </p>
          </div>

          {/* Visibility Selector */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
              Visibilidad de la evidencia
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {([
                { value: 'PRIVATE', label: 'Solo yo', desc: 'Nadie más ve esta evidencia' },
                { value: 'TASK_PARTICIPANTS', label: 'Equipo', desc: 'Visible para participantes de la tarea y auditores' },
                { value: 'TREE_ONLY', label: 'Tree', desc: 'Visible para todo el Tree' },
              ] as const).map(opt => {
                const active = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    style={{
                      flex: 1, padding: '0.55rem 0.45rem', borderRadius: 10, textAlign: 'center',
                      border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      background: active ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#93c5fd' : '#fff', marginBottom: '0.15rem' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.25 }}>
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '10px', padding: '0.75rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  color: '#ef4444', fontSize: '0.85rem'
                }}
              >
                <AlertCircle size={16} /> {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem 1.25rem',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '0.75rem'
        }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
              color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              flex: 2, padding: '0.75rem',
              background: submitting ? 'rgba(16,185,129,0.4)' : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none', borderRadius: '10px',
              color: 'white', cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.9rem',
              boxShadow: submitting ? 'none' : '0 4px 16px rgba(16,185,129,0.3)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                {uploading ? 'Subiendo foto...' : (initialData ? 'Guardando...' : 'Procesando...')}
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                {initialData ? 'Guardar Cambios' : 'Confirmar y Completar'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
