import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus, Hammer, Hand, CheckCircle2, Clock, Camera, Image as ImageIcon,
  ChevronDown, ChevronRight, Hourglass, Shield, Award, Sparkles,
  AlertTriangle, User, X, Loader2, Tag, Send, Eye, ThumbsUp, Lock, Star,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useMatrixStore, LEGACY_ENTITY_COLORS, MODERN_ENTITY_COLORS } from '../store/matrixStore';
import { useTranslation } from 'react-i18next';
import { OptimizedText } from './OptimizedText';
import EstrellaDificultad from './EstrellaDificultad';
import { motion, AnimatePresence } from 'framer-motion';
import CivicAuditModal from './CivicAuditModal';
import { isProtectedFileUrl, openProtectedFile } from '../lib/files';

// ── Red accent ────────────────────────────────────────────────────────────────
const R  = '#FE78CD';
const RL = 'rgba(254,120,205,0.12)';
const RB = 'rgba(254,120,205,0.25)';

// ── Compress image (reused from TaskCompletionModal) ──────────────────────────
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

const getFullImageUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith('blob:') || url.startsWith('http')) return url;
  return `http://${window.location.hostname}:3000${url}`;
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#10b981', 2: '#10b981', 3: '#34d399', 4: '#6ee7b7',
  5: '#f59e0b', 6: '#fb923c', 7: '#f97316', 8: '#ef4444',
  9: '#dc2626', 10: '#991b1b'
};

const diffHours = (d1: any, d2: any) => {
  if (!d1 || !d2) return 0;
  return Math.abs(new Date(d1).getTime() - new Date(d2).getTime()) / 36e5;
};

const parsePhotoUrls = (val?: string | null): string[] => {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [val];
  } catch { return [val]; }
};

function EvidencePreview({ url, label, width }: { url: string; label: string; width: string }) {
  if (isProtectedFileUrl(url)) {
    return (
      <button
        type="button"
        onClick={() => openProtectedFile(url)}
        style={{
          width,
          minHeight: 72,
          borderRadius: 8,
          border: '1px solid rgba(34,197,94,0.28)',
          background: 'rgba(34,197,94,0.08)',
          color: '#22c55e',
          fontSize: '0.68rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Evidencia registrada
      </button>
    );
  }
  return <img src={getFullImageUrl(url)!} alt={label} style={{ width, borderRadius: 8, maxHeight: 140, objectFit: 'cover' }} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREAR — Formulario de creación de tarea
// ═══════════════════════════════════════════════════════════════════════════════
export function TareaCrear({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation();
  const { linajeActivo, colorMode } = useMatrixStore();
  const titleColor = colorMode === 'legacy' ? LEGACY_ENTITY_COLORS.tarea : MODERN_ENTITY_COLORS.tarea;

  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requiredHours, setRequiredHours] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Start photos state (up to 5)
  const [startPhotoBlobs, setStartPhotoBlobs] = useState<Blob[]>([]);
  const [startPhotoPreviews, setStartPhotoPreviews] = useState<string[]>([]);
  const startPhotoInputRef = useRef<HTMLInputElement>(null);
  const MAX_START_PHOTOS = 5;

  // ── Load branches from user's trees ────────────────────────────────
  useEffect(() => {
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const { data: trees } = await api.get('/trees');
        const allBranches: any[] = [];

        for (const tree of trees) {
          try {
            const { data } = await api.get(`/branches?treeId=${tree.id}`);
            (data || []).forEach((b: any) => {
              allBranches.push({ ...b, treeName: tree.name, treeId: tree.id });
            });
          } catch {}
        }

        setBranches(allBranches);

        // Auto-select branch from filter if available
        if (linajeActivo.length > 0) {
          const ramaFilter = linajeActivo.find(l => l.entidad === 'rama');
          if (ramaFilter && allBranches.some(b => b.id === ramaFilter.id)) {
            setSelectedBranchId(ramaFilter.id);
          }
        }
      } catch {
        setBranches([]);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [linajeActivo]);

  const addTag = () => {
    const t = tagInput.trim().replace(/^@/, '');
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const handleStartPhotoSelectCrear = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_START_PHOTOS - startPhotoBlobs.length;
    const toAdd = files.slice(0, remaining);
    const newBlobs: Blob[] = [];
    const newPreviews: string[] = [];
    for (const file of toAdd) {
      try {
        const compressed = await compressImage(file);
        newBlobs.push(compressed);
        newPreviews.push(URL.createObjectURL(compressed));
      } catch {
        newBlobs.push(file);
        newPreviews.push(URL.createObjectURL(file));
      }
    }
    setStartPhotoBlobs(prev => [...prev, ...newBlobs]);
    setStartPhotoPreviews(prev => [...prev, ...newPreviews]);
    if (startPhotoInputRef.current) startPhotoInputRef.current.value = '';
  };

  const canSubmit = selectedBranchId && name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const { data: createdTask } = await api.post('/tasks', {
        branchId: selectedBranchId,
        name: name.trim(),
        description: description.trim() || undefined,
        requiredHours: requiredHours ? parseFloat(requiredHours) : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      for (const blob of startPhotoBlobs) {
        const formData = new FormData();
        formData.append('file', blob, 'start_evidence.jpg');
        formData.append('visibility', 'TASK_PARTICIPANTS');
        await api.post(`/tasks/${createdTask.id}/evidence`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      setName('');
      setDescription('');
      setRequiredHours('');
      setTags([]);
      startPhotoPreviews.forEach(p => { if (p.startsWith('blob:')) URL.revokeObjectURL(p); });
      setStartPhotoBlobs([]);
      setStartPhotoPreviews([]);
      setShowForm(false);
      onCreated?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('m.tarea.crear.error'));
    } finally {
      setLoading(false);
    }
  };

  // ── Filter branches by linaje if active ─────────────────────────────
  const filteredBranches = useMemo(() => {
    if (linajeActivo.length === 0) return branches;
    return branches.filter(b => {
      return linajeActivo.some(l => {
        if (l.entidad === 'rama') return b.id === l.id;
        if (l.entidad === 'arbol') return b.treeId === l.id;
        return false;
      });
    });
  }, [branches, linajeActivo]);

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '6rem' }}>

      {/* Intro */}
      <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem 0.5rem' }}>
        <Hammer size={32} color={titleColor} style={{ marginBottom: 8 }} />
        <OptimizedText text={t('m.tarea.crear.title')} style={{ fontSize: '0.98rem', fontWeight: 800, color: titleColor }} />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          {t('m.tarea.crear.subtitle')}
        </p>
      </div>

      {/* Toggle form button */}
      <button
        onClick={() => setShowForm(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '0.75rem', borderRadius: 14,
          background: showForm ? RB : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${showForm ? R : 'rgba(255,255,255,0.1)'}`,
          color: showForm ? R : 'var(--text-secondary)',
          fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
        }}
      >
        <Plus size={16} />
        {showForm ? t('m.tarea.crear.close_form') : t('m.tarea.crear.new_task')}
      </button>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {/* Branch selector */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                {t('m.tarea.crear.branch_label')}
              </label>
              {loadingBranches ? (
                <div style={{ padding: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('m.tarea.crear.loading_branches')}</div>
              ) : (
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  style={{
                    width: '100%', padding: '0.65rem 0.75rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="" style={{ background: '#1a1a1a' }}>{t('m.tarea.crear.branch_placeholder')}</option>
                  {filteredBranches.map(b => (
                    <option key={b.id} value={b.id} style={{ background: '#1a1a1a' }}>
                      {b.isHashtag ? '#' : '📋 '}{b.name} — {b.treeName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Task name */}
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('m.tarea.crear.name_placeholder')}
              style={{
                width: '100%', padding: '0.65rem 0.75rem', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
                fontFamily: 'inherit',
              }}
            />

            {/* Description */}
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('m.tarea.crear.desc_placeholder')}
              rows={3}
              style={{
                width: '100%', padding: '0.65rem 0.75rem', borderRadius: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
                fontFamily: 'inherit', resize: 'vertical',
              }}
            />

            {/* Required hours */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {t('m.tarea.crear.hours_label')}
              </label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={requiredHours}
                onChange={e => setRequiredHours(e.target.value)}
                placeholder="ej. 4"
                style={{
                  width: '100%', padding: '0.65rem 0.75rem', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Tags / Skills */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                <Tag size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {t('m.tarea.crear.skills_label')}
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder={t('m.tarea.crear.skills_placeholder')}
                  style={{
                    flex: 1, padding: '0.5rem 0.75rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  style={{
                    padding: '0.5rem 0.75rem', borderRadius: 12, border: 'none',
                    background: tagInput.trim() ? R : 'rgba(255,255,255,0.05)',
                    color: tagInput.trim() ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem',
                  }}
                >
                  +
                </button>
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                  {tags.map(tag => (
                    <span
                      key={tag}
                      onClick={() => removeTag(tag)}
                      style={{
                        padding: '0.2rem 0.6rem', borderRadius: 20,
                        background: RL, color: R, fontSize: '0.72rem', fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      @{tag} <X size={10} />
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Start photos (up to 5 optional "before" evidence) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <Camera size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Fotos de inicio (opcional)
                </label>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{startPhotoPreviews.length}/5</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', gap: 8 }}>
                {startPhotoPreviews.map((preview, i) => (
                  <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                    <img src={preview} alt="inicio" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <button
                      onClick={() => {
                        if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
                        setStartPhotoPreviews(prev => prev.filter((_, j) => j !== i));
                        setStartPhotoBlobs(prev => prev.filter((_, j) => j !== i));
                      }}
                      style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
                    ><X size={12} /></button>
                  </div>
                ))}
                {startPhotoPreviews.length < MAX_START_PHOTOS && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      onClick={() => { if (startPhotoInputRef.current) { startPhotoInputRef.current.setAttribute('capture', 'environment'); startPhotoInputRef.current.click(); } }}
                      style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Cámara"
                    ><Camera size={16} /></button>
                    <button
                      onClick={() => { if (startPhotoInputRef.current) { startPhotoInputRef.current.removeAttribute('capture'); startPhotoInputRef.current.click(); } }}
                      style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Galería"
                    ><ImageIcon size={16} /></button>
                  </div>
                )}
              </div>
              <input ref={startPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={handleStartPhotoSelectCrear} style={{ display: 'none' }} />
              <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: '4px 0 0', opacity: 0.7 }}>
                Se compararán con las fotos finales al evaluar la tarea
              </p>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '0.5rem 0.75rem', borderRadius: 12, background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {/* FAB Publish */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem' }}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
                style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  background: canSubmit ? R : 'rgba(255,255,255,0.1)',
                  color: '#fff', border: 'none', cursor: canSubmit ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: canSubmit ? '0 4px 16px rgba(239,68,68,0.4)' : 'none',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? <Loader2 size={24} className="spin" /> : <Send size={22} />}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HACER — Feed LIFO con Asumir → En Proceso → Completar
// ═══════════════════════════════════════════════════════════════════════════════
export function TareaHacer() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);

  // Completion modal state
  const [completionTask, setCompletionTask] = useState<any>(null);
  const [difficulty, setDifficulty] = useState(5);
  const [comment, setComment] = useState('');
  const [photoBlobs, setPhotoBlobs] = useState<Blob[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInstallPromptVisible = useAuthStore((s: any) => s.isInstallPromptVisible);

  // XP result toast
  const [xpToast, setXpToast] = useState<{ xp: number; bonusXp: number } | null>(null);
  const [civicAuditTask, setCivicAuditTask] = useState<{ id: string; description: string; tags: string[] } | null>(null);
  const [civicOriginalTaskId, setCivicOriginalTaskId] = useState<string | null>(null);
  const [civicPendingXp, setCivicPendingXp] = useState(0);

  // Start-photo modal state (for assign)
  const [assignModal, setAssignModal] = useState<{ taskId: string; taskName: string } | null>(null);
  const [startPhotoBlob, setStartPhotoBlob] = useState<Blob | null>(null);
  const [startPhotoPreview, setStartPhotoPreview] = useState<string | null>(null);
  const [assignUploading, setAssignUploading] = useState(false);
  const startPhotoInputRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks/pending');
      const unique = Array.isArray(data) ? Array.from(new Map(data.map((t: any) => [t.id, t])).values()) : [];
      setTasks(unique);
    } catch (e) {
      console.error('Error fetching tasks:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── Filter by linaje ────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply relational filter when not in selection mode
    if (!isFilterModeActive && linajeActivo.length > 0) {
      result = result.filter(t => {
        return linajeActivo.some(l => {
          if (l.entidad === 'arbol') {
            if (t.branch?.treeId === l.id) return true;
            return t.branch?.idea?.need?.treeLinks?.some((tl: any) => tl.treeId === l.id);
          }
          if (l.entidad === 'rama') return t.branch?.id === l.id || t.branchId === l.id;
          if (l.entidad === 'necesidad') return t.branch?.idea?.needId === l.id;
          if (l.entidad === 'tarea') return t.id === l.id;
          return false;
        });
      });
    }

    return result;
  }, [tasks, isFilterModeActive, linajeActivo]);

  // ── Split into sections ────────────────────────────────────────────
  const splitTasks = useMemo(() => {
    const myTasks: any[] = [];
    const pending: any[] = [];
    const others: any[] = [];
    const completed: any[] = [];
    const history: any[] = [];

    filteredTasks.forEach(t => {
      const isCompleted = t.status === 'COMPLETED';
      const isAudited = t.auditada;
      const daysSinceCompletion = isCompleted && t.completedAt ? diffHours(new Date(), t.completedAt) / 24 : 0;
      const isHistory = (isCompleted && daysSinceCompletion > 30) || isAudited;

      if (showHistory) {
        if (isHistory) history.push(t);
      } else {
        if (isHistory) return;
        if (isCompleted) completed.push(t);
        else if (t.assignedTo === user?.id) myTasks.push(t);
        else if (!t.assignedTo) pending.push(t);
        else others.push(t);
      }
    });

    const groupBy = (arr: any[]) => {
      const groups: any[] = [];
      arr.forEach(t => {
        const bId = t.branch?.id || 'other';
        const bName = (t.branch?.name || 'Otras').toUpperCase();
        let g = groups.find(x => x.id === bId);
        if (!g) { g = { id: bId, name: bName, tasks: [] }; groups.push(g); }
        g.tasks.push(t);
      });
      // LIFO: most recent first within each group
      groups.forEach(g => g.tasks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      return groups;
    };

    return { my: groupBy(myTasks), pending: groupBy(pending), others: groupBy(others), completed: groupBy(completed), history: groupBy(history) };
  }, [filteredTasks, user?.id, showHistory]);

  // Auto-expand groups
  useEffect(() => {
    setExpandedGroups(prev => {
      const next = { ...prev };
      let changed = false;
      [...splitTasks.my, ...splitTasks.pending, ...splitTasks.others, ...splitTasks.completed, ...splitTasks.history].forEach(g => {
        if (next[g.id] === undefined) { next[g.id] = true; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [splitTasks]);

  const toggleGroup = (id: string) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Assign task ────────────────────────────────────────────────────
  const [eliteBlockMsg, setEliteBlockMsg] = useState<string | null>(null);
  const [eliteBlockType, setEliteBlockType] = useState<'guild' | 'critical'>('guild');
  const [eliteCache, setEliteCache] = useState<Record<string, { allowed: boolean; tier?: string; goldenTickets?: number; phase?: string; specialistCount?: number; hashtag?: string }>>({});
  // Pre-check elite status for high-difficulty tasks
  useEffect(() => {
    const criticalTasks = tasks.filter((t: any) => (t.difficulty || 0) >= 9 && !t.assignedTo && t.status === 'OPEN');
    criticalTasks.forEach(async (t: any) => {
      if (eliteCache[t.id]) return;
      try {
        const { data } = await api.get(`/tasks/${t.id}/elite-check`);
        setEliteCache(prev => ({ ...prev, [t.id]: data }));
      } catch { /* ignore */ }
    });
  }, [tasks]);

  const handleAssign = async (taskId: string, taskName?: string) => {
    // Open the start-photo modal instead of assigning directly
    setAssignModal({ taskId, taskName: taskName || 'Tarea' });
    setStartPhotoBlob(null);
    setStartPhotoPreview(null);
  };

  const handleStartPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (startPhotoPreview && startPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(startPhotoPreview);
    try {
      const compressed = await compressImage(file);
      setStartPhotoBlob(compressed);
      setStartPhotoPreview(URL.createObjectURL(compressed));
    } catch {
      setStartPhotoBlob(file);
      setStartPhotoPreview(URL.createObjectURL(file));
    }
    if (startPhotoInputRef.current) startPhotoInputRef.current.value = '';
  };

  const confirmAssign = async (withPhoto: boolean) => {
    if (!assignModal) return;
    setAssignUploading(true);
    try {
      let startPhotoUrl: string | undefined;
      if (withPhoto && startPhotoBlob) {
        const formData = new FormData();
        formData.append('file', startPhotoBlob, 'start_evidence.jpg');
        formData.append('visibility', 'TASK_PARTICIPANTS');
        const { data: uploadData } = await api.post(`/tasks/${assignModal.taskId}/evidence`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        startPhotoUrl = uploadData.downloadUrl || uploadData.url;
      }
      await api.post(`/tasks/${assignModal.taskId}/assign`, { startPhotoUrl });
      setAssignModal(null);
      fetchTasks();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const msg = e?.response?.data?.error || t('m.tarea.hacer.error_assume');
      if (code === 'GENESIS_BLOCKED' || code === 'ELITE_REQUIRED') {
        setEliteBlockType(code === 'GENESIS_BLOCKED' ? 'guild' : 'critical');
        setEliteBlockMsg(msg);
        setTimeout(() => setEliteBlockMsg(null), 6000);
      } else {
        alert(msg);
      }
      setAssignModal(null);
    } finally {
      setAssignUploading(false);
    }
  };

  // ── Open completion modal ──────────────────────────────────────────
  const openCompletion = (task: any) => {
    setCompletionTask(task);
    setDifficulty(task.difficulty ? Math.round(task.difficulty) : 5);
    setComment(task.completionComment || '');
    // Populate existing photos
    const existingUrls = parsePhotoUrls(task.completionPhotoUrl);
    setPhotoPreviews(existingUrls.map((u: string) => getFullImageUrl(u) || u));
    setPhotoBlobs([]);
    setCompletionError('');
  };

  const closeCompletion = () => {
    setCompletionTask(null);
    photoPreviews.filter(p => p.startsWith('blob:')).forEach(p => URL.revokeObjectURL(p));
    setPhotoPreviews([]);
    setPhotoBlobs([]);
    setComment('');
    setCompletionError('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 5 - photoBlobs.length;
    const toAdd = files.slice(0, remaining);
    const newBlobs: Blob[] = [];
    const newPreviews: string[] = [];
    for (const file of toAdd) {
      const compressed = await compressImage(file).catch(() => file);
      newBlobs.push(compressed);
      newPreviews.push(URL.createObjectURL(compressed));
    }
    setPhotoBlobs(prev => [...prev, ...newBlobs]);
    setPhotoPreviews(prev => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleComplete = async () => {
    if (!completionTask) return;
    setSubmitting(true);
    setCompletionError('');

    try {
      // Upload all new blobs, preserve existing previews as relative URLs
      const uploadedUrls: string[] = [];
      // Distinguish existing (non-blob) previews from new ones
      const existingCount = photoPreviews.length - photoBlobs.length;
      for (let i = 0; i < photoPreviews.length; i++) {
        if (i < existingCount) {
          // Existing photo — convert back to relative URL
          const rel = photoPreviews[i].replace(/^https?:\/\/[^/]+/, '');
          uploadedUrls.push(rel);
        } else {
          const blob = photoBlobs[i - existingCount];
          const formData = new FormData();
          formData.append('file', blob, 'evidence.jpg');
          formData.append('visibility', 'TASK_PARTICIPANTS');
          const { data: uploadData } = await api.post(`/tasks/${completionTask.id}/evidence`, formData);
          uploadedUrls.push(uploadData.downloadUrl || uploadData.url);
        }
      }

      const { data } = await api.post(`/tasks/${completionTask.id}/complete`, {
        difficulty,
        comment: comment.trim() || undefined,
        photoUrls: uploadedUrls,
      });

      // Check if civic audit is required (20% chance)
      if (data.auditRequired && data.auditTask) {
        setCivicPendingXp(data.xpAwarded || 0);
        setCivicOriginalTaskId(completionTask.id);
        setCivicAuditTask(data.auditTask);
        closeCompletion();
        return;
      }

      // Show XP toast
      if (data.xpAwarded !== undefined) {
        setXpToast({ xp: data.xpAwarded || 0, bonusXp: data.bonusXp || 0 });
        setTimeout(() => setXpToast(null), 4000);
      }

      closeCompletion();
      fetchTasks();
    } catch (e: any) {
      setCompletionError(e?.response?.data?.error || t('m.tarea.hacer.error_complete'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render task card ────────────────────────────────────────────────
  const renderTaskCard = (task: any, _section: 'my' | 'pending' | 'others' | 'completed' | 'history') => {
    const isAssignedToMe = task.assignedTo === user?.id;
    const isFree = !task.assignedTo;
    const isCompleted = task.status === 'COMPLETED';
    const hoursLeft = task.deadlineAt ? Math.max(0, (new Date(task.deadlineAt).getTime() - Date.now()) / 36e5) : null;

    // Filter mode: mark as selected or allow toggling
    const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === task.id && l.entidad === 'tarea');

    return (
      <motion.div
        key={task.id}
        layout
        onClick={() => { if (isFilterModeActive) toggleLinaje(task.id, 'tarea'); }}
        style={{
          padding: '0.6rem 0.75rem', borderRadius: 12,
          background: isSelected ? RB : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isSelected ? R : 'rgba(255,255,255,0.06)'}`,
          display: 'flex', flexDirection: 'column', gap: '0.3rem',
          cursor: isFilterModeActive ? 'pointer' : 'default',
          opacity: isFilterModeActive && !isSelected && linajeActivo.some(l => l.entidad === 'tarea') ? 0.3 : 1,
          transition: 'all 0.15s',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            flex: 1, fontSize: '0.85rem', fontWeight: 700,
            color: isCompleted ? 'rgba(255,255,255,0.4)' : 'var(--text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
          }}>
            {task.name}
          </span>

          {/* Status badge */}
          {isCompleted && task.auditada && (
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '2px 6px', borderRadius: 8 }}>
              {t('m.tarea.hacer.audited')}
            </span>
          )}
          {isCompleted && !task.auditada && (
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#eab308', background: 'rgba(234,179,8,0.15)', padding: '2px 6px', borderRadius: 8 }}>
              {t('m.tarea.hacer.pending_audit')}
            </span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            {task.description.length > 100 ? task.description.slice(0, 100) + '…' : task.description}
          </p>
        )}

        {/* Tags */}
        {task.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
            {task.tags.map((t: any) => (
              <span key={t.skillName} style={{ fontSize: '0.62rem', fontWeight: 700, color: R, background: RL, padding: '1px 6px', borderRadius: 10 }}>
                @{t.skillName}
              </span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          {task.requiredHours && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} /> {task.requiredHours}h
            </span>
          )}
          {task.difficulty > 0 && (
            <EstrellaDificultad nota={task.difficulty} size={24} />
          )}
          {isAssignedToMe && hoursLeft !== null && !isCompleted && (
            <span style={{ color: hoursLeft < 2 ? '#ef4444' : '#eab308', fontWeight: 700 }}>
              ⏱ {hoursLeft.toFixed(1)}h {t('m.tarea.hacer.remaining')}
            </span>
          )}
        </div>

        {/* Actions */}
        {!isFilterModeActive && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            {/* Pendiente → Asumir */}
            {isFree && !isCompleted && (
              (() => {
                const diff = task.difficulty || 0;
                const isEliteLocked = diff >= 9;
                const check = eliteCache[task.id];
                const hasTicket = check?.tier === 'GOLDEN_TICKET' && (check?.goldenTickets || 0) > 0;
                const isEliteDorado = check?.tier === 'ELITE_DORADO';
                const isGenesisBlocked = check?.phase === 'GENESIS' && !check?.allowed;

                let btnLabel = t('m.tarea.hacer.assume');
                let btnIcon = <Hand size={14} />;
                let isDisabled = false;
                if (isEliteLocked) {
                  if (isGenesisBlocked) {
                    btnLabel = `🔒 ${t('m.tarea.hacer.guild_forming')} (${check?.specialistCount || 0}/10)`;
                    btnIcon = <Lock size={14} />;
                    isDisabled = true;
                  } else if (isEliteDorado) {
                    btnLabel = t('m.tarea.hacer.assume_elite');
                    btnIcon = <Star size={14} />;
                  } else if (hasTicket) {
                    btnLabel = `🎫 Ticket (${check!.goldenTickets})`;
                    btnIcon = <Lock size={14} />;
                  } else if (check && !check.allowed) {
                    btnLabel = t('m.tarea.hacer.golden_arroba');
                    btnIcon = <Lock size={14} />;
                    isDisabled = true;
                  } else {
                    btnLabel = t('m.tarea.hacer.golden_arroba');
                    btnIcon = <Lock size={14} />;
                  }
                }

                return (
                  <motion.button
                    whileTap={isDisabled ? {} : { scale: 0.92 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDisabled && isGenesisBlocked) {
                        setEliteBlockType('guild');
                        setEliteBlockMsg(check?.hashtag
                          ? t('m.tarea.hacer.guild_blocked_msg', { hashtag: check.hashtag, count: check.specialistCount || 0 })
                          : t('m.tarea.hacer.guild_blocked_generic'));
                        setTimeout(() => setEliteBlockMsg(null), 6000);
                        return;
                      }
                      if (isDisabled) return;
                      handleAssign(task.id, task.name);
                    }}
                    style={{
                      flex: 1, padding: '0.45rem', borderRadius: 10,
                      background: isGenesisBlocked ? 'rgba(16,185,129,0.08)' : isEliteLocked ? 'rgba(251,191,36,0.10)' : 'rgba(234,179,8,0.15)',
                      border: `1px solid ${isGenesisBlocked ? 'rgba(16,185,129,0.35)' : isEliteLocked ? 'rgba(251,191,36,0.4)' : 'rgba(234,179,8,0.3)'}`,
                      color: isGenesisBlocked ? '#10b981' : isEliteLocked ? '#fbbf24' : '#eab308', fontWeight: 700, fontSize: '0.78rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.7 : 1,
                      ...(isEliteLocked && !isGenesisBlocked ? { boxShadow: '0 0 8px rgba(251,191,36,0.15)' } : {}),
                    }}
                  >
                    {btnIcon}
                    {btnLabel}
                  </motion.button>
                );
              })()
            )}

            {/* En Proceso → Completar */}
            {isAssignedToMe && !isCompleted && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={(e) => { e.stopPropagation(); openCompletion(task); }}
                style={{
                  flex: 1, padding: '0.45rem', borderRadius: 10,
                  background: 'rgba(34,197,94,0.15)', border: `1px solid rgba(34,197,94,0.3)`,
                  color: '#22c55e', fontWeight: 700, fontSize: '0.78rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  cursor: 'pointer',
                }}
              >
                <CheckCircle2 size={14} /> {t('m.tarea.hacer.complete')}
              </motion.button>
            )}

            {/* Completed — 24h edit window for author */}
            {isCompleted && isAssignedToMe && !task.auditada && diffHours(new Date(), task.completedAt) < 24 && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={(e) => { e.stopPropagation(); openCompletion(task); }}
                style={{
                  flex: 1, padding: '0.45rem', borderRadius: 10,
                  background: 'rgba(59,130,246,0.15)', border: `1px solid rgba(59,130,246,0.3)`,
                  color: '#3b82f6', fontWeight: 700, fontSize: '0.78rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Sparkles size={14} /> {t('m.tarea.hacer.edit_24h')}
              </motion.button>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  // ── Render section ─────────────────────────────────────────────────
  const renderSection = (title: string, groups: any[], bgColor: string, textColor: string, section: 'my' | 'pending' | 'others' | 'completed' | 'history') => {
    if (groups.length === 0) return null;
    return (
      <section style={{ background: bgColor, borderRadius: 'var(--radius-lg)', margin: '0.5rem 0', padding: '0.5rem' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, margin: '0.5rem 0.5rem 0.75rem', color: textColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h3>
        {groups.map(group => (
          <div key={group.id}>
            <div
              onClick={() => toggleGroup(group.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)',
              }}
            >
              {expandedGroups[group.id] ? <ChevronDown size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />}
              <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{group.name}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>({group.tasks.length})</span>
            </div>
            <AnimatePresence>
              {expandedGroups[group.id] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '1.5rem', paddingBottom: '0.5rem' }}>
                    {group.tasks.map((t: any) => renderTaskCard(t, section))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </section>
    );
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.tarea.hacer.loading')}</div>;

  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        <Hammer size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p style={{ margin: 0, fontWeight: 600 }}>{t('m.tarea.hacer.empty')}</p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', opacity: 0.7 }}>{t('m.tarea.hacer.empty_hint')}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem', paddingBottom: '6rem' }}>

      {showHistory ? (
        renderSection(t('m.tarea.hacer.history'), splitTasks.history, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.5)', 'history')
      ) : (
        <>
          {renderSection(t('m.tarea.hacer.my_tasks'), splitTasks.my, 'transparent', R, 'my')}
          {renderSection(t('m.tarea.hacer.available'), splitTasks.pending, 'rgba(234,179,8,0.06)', 'rgba(234,179,8,0.8)', 'pending')}
          {renderSection(t('m.tarea.hacer.in_progress'), splitTasks.others, 'rgba(59,130,246,0.06)', 'rgba(59,130,246,0.8)', 'others')}
          {renderSection(t('m.tarea.hacer.completed_recent'), splitTasks.completed, 'rgba(34,197,94,0.06)', 'rgba(34,197,94,0.8)', 'completed')}
        </>
      )}

      {/* History FAB */}
      <div style={{
        position: 'fixed',
        bottom: isInstallPromptVisible ? '10rem' : '5rem',
        right: '1.5rem', zIndex: 100,
        transition: 'bottom 0.3s ease-in-out',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowHistory(!showHistory)}
          style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: showHistory ? R : 'var(--bg-card)',
            color: showHistory ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${showHistory ? R : 'var(--border-color)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer',
          }}
          title={showHistory ? t('m.tarea.hacer.view_active') : t('m.tarea.hacer.view_history')}
        >
          <Hourglass size={22} />
        </motion.button>
      </div>

      {/* ── Completion Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {completionTask && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeCompletion}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420, maxHeight: '85vh',
                background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
                padding: '1.25rem', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: R }}>
                  {t('m.tarea.hacer.complete_title')}
                </h3>
                <button onClick={closeCompletion} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{completionTask.name}</p>

              {/* Difficulty slider */}
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  {t('m.tarea.hacer.difficulty')} <span style={{ color: DIFFICULTY_COLORS[difficulty], fontWeight: 800 }}>{difficulty} — {t(`m.difficulty.${difficulty}`)}</span>
                </label>
                <input
                  type="range"
                  min={1} max={10} step={1}
                  value={difficulty}
                  onChange={e => setDifficulty(Number(e.target.value))}
                  style={{ width: '100%', accentColor: DIFFICULTY_COLORS[difficulty] }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  <span>{t('m.tarea.medir.trivial')}</span><span>{t('m.tarea.medir.impossible')}</span>
                </div>
              </div>

              {/* Comment */}
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={t('m.tarea.hacer.comment_placeholder')}
                rows={3}
                style={{
                  width: '100%', padding: '0.65rem 0.75rem', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />

              {/* Photo evidence — multi (up to 5) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    <Camera size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {t('m.tarea.hacer.photo_evidence')}
                  </label>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{photoPreviews.length}/5</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', gap: 8 }}>
                  {photoPreviews.map((preview, i) => (
                    <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                      <img src={preview} alt="evidencia" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
                      <button
                        onClick={() => {
                          if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
                          const existingCount = photoPreviews.length - photoBlobs.length;
                          if (i >= existingCount) setPhotoBlobs(prev => prev.filter((_, j) => j !== (i - existingCount)));
                          setPhotoPreviews(prev => prev.filter((_, j) => j !== i));
                        }}
                        style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
                      ><X size={12} /></button>
                    </div>
                  ))}
                  {photoPreviews.length < 5 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        onClick={() => { if (fileInputRef.current) { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); } }}
                        style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={t('m.tarea.hacer.camera')}
                      ><Camera size={16} /></button>
                      <button
                        onClick={() => { if (fileInputRef.current) { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); } }}
                        style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={t('m.tarea.hacer.gallery')}
                      ><ImageIcon size={16} /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {completionError && (
                <div style={{ padding: '0.5rem', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> {completionError}
                </div>
              )}

              {/* Submit */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleComplete}
                disabled={submitting}
                style={{
                  padding: '0.85rem', borderRadius: 14,
                  background: R, color: '#fff', fontWeight: 800, fontSize: '0.92rem',
                  border: 'none', cursor: 'pointer',
                  opacity: submitting ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {submitting ? <Loader2 size={18} className="spin" /> : <CheckCircle2 size={18} />}
                {submitting ? t('m.tarea.hacer.submitting') : t('m.tarea.hacer.confirm_complete')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Civic Audit Modal ─────────────────────────────────────── */}
      {civicAuditTask && civicOriginalTaskId && (
        <CivicAuditModal
          auditTask={civicAuditTask}
          originalTaskId={civicOriginalTaskId}
          onComplete={(civicBonusXp) => {
            setCivicAuditTask(null);
            setCivicOriginalTaskId(null);
            setXpToast({ xp: civicPendingXp, bonusXp: civicBonusXp });
            setTimeout(() => setXpToast(null), 4000);
            fetchTasks();
          }}
        />
      )}

      {/* ── XP Toast ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {xpToast && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              zIndex: 10000, background: 'var(--bg-card)', borderRadius: 20,
              padding: '1.5rem 2rem', textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: `2px solid ${R}`,
            }}
          >
            <Award size={40} color="#eab308" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22c55e' }}>
              {t('m.tarea.hacer.xp_base_toast', { xp: xpToast.xp })}
            </div>
            {xpToast.bonusXp > 0 && (
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
                {t('m.tarea.hacer.xp_bonus_toast', { xp: xpToast.bonusXp })}
              </div>
            )}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 8, margin: 0 }}>
              {t('m.tarea.hacer.good_job')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Elite / Genesis Block Toast ─────────────────────────────── */}
      <AnimatePresence>
        {eliteBlockMsg && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            onClick={() => setEliteBlockMsg(null)}
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              zIndex: 10000, background: 'var(--bg-card)', borderRadius: 20,
              padding: '1.5rem 1.5rem', textAlign: 'center', maxWidth: '85vw',
              boxShadow: eliteBlockType === 'guild'
                ? '0 0 24px rgba(16,185,129,0.3)' : '0 0 24px rgba(251,191,36,0.3)',
              border: eliteBlockType === 'guild'
                ? '2px solid rgba(16,185,129,0.5)' : '2px solid rgba(251,191,36,0.5)',
              cursor: 'pointer',
            }}
          >
            <Lock size={36} color={eliteBlockType === 'guild' ? '#10b981' : '#fbbf24'} style={{ marginBottom: 8 }} />
            <div style={{
              fontSize: '0.9rem', fontWeight: 800, marginBottom: 6,
              color: eliteBlockType === 'guild' ? '#10b981' : '#fbbf24',
            }}>
              {eliteBlockType === 'guild' ? t('m.tarea.hacer.guild_forming_toast') : t('m.tarea.hacer.critical_task_toast')}
            </div>
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>
              {eliteBlockMsg}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Start Photo Modal (on assign) ──────────────────────────── */}
      <AnimatePresence>
        {assignModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !assignUploading && setAssignModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420,
                background: 'var(--bg-card, #1a1a2e)', borderRadius: '20px 20px 0 0',
                padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  <Hand size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  {t('m.tarea.hacer.assume')}
                </h3>
                <button onClick={() => !assignUploading && setAssignModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {assignModal.taskName}
              </p>

              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                ¿Deseas subir una foto del estado inicial? Esta foto se mostrará junto a la evidencia final para que otros puedan comparar el antes y después.
              </p>

              {startPhotoPreview && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={startPhotoPreview}
                    alt="Foto de inicio"
                    style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }}
                  />
                  <button
                    onClick={() => {
                      if (startPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(startPhotoPreview);
                      setStartPhotoBlob(null);
                      setStartPhotoPreview(null);
                    }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'white',
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {!startPhotoPreview && (
                <button
                  onClick={() => startPhotoInputRef.current?.click()}
                  style={{
                    padding: '0.75rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px dashed rgba(255,255,255,0.2)',
                    color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <Camera size={18} /> Subir foto de inicio
                </button>
              )}
              <input
                ref={startPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                capture="environment"
                onChange={handleStartPhotoSelect}
                style={{ display: 'none' }}
              />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  disabled={assignUploading}
                  onClick={() => confirmAssign(false)}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.8rem',
                    cursor: assignUploading ? 'not-allowed' : 'pointer',
                    opacity: assignUploading ? 0.5 : 1,
                  }}
                >
                  Saltar
                </button>
                <button
                  disabled={assignUploading}
                  onClick={() => confirmAssign(!!startPhotoBlob)}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12,
                    background: startPhotoBlob ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.15)',
                    border: `1px solid ${startPhotoBlob ? 'rgba(16,185,129,0.4)' : 'rgba(234,179,8,0.3)'}`,
                    color: startPhotoBlob ? '#10b981' : '#eab308', fontWeight: 700, fontSize: '0.8rem',
                    cursor: assignUploading ? 'not-allowed' : 'pointer',
                    opacity: assignUploading ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {assignUploading ? <Loader2 size={16} className="animate-spin" /> : <Hand size={16} />}
                  {assignUploading ? 'Subiendo...' : startPhotoBlob ? 'Tomar con foto' : 'Tomar tarea'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIR — Auditoría, XP Desglose, Perfil
// ═══════════════════════════════════════════════════════════════════════════════
export function TareaMedir() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const { isFilterModeActive, linajeActivo, toggleLinaje } = useMatrixStore();

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [auditModal, setAuditModal] = useState<any>(null);
  const [auditNote, setAuditNote] = useState(5);
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [auditError, setAuditError] = useState('');
  const isInstallPromptVisible = useAuthStore((s: any) => s.isInstallPromptVisible);

  const fetchTasks = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks/pending');
      const unique = Array.isArray(data) ? Array.from(new Map(data.map((t: any) => [t.id, t])).values()) : [];
      setTasks(unique);
    } catch (e) {
      console.error('Error fetching tasks:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── User's level per tree ──────────────────────────────────────────
  const getUserLevel = (treeId: string) => {
    const m = user?.memberships?.find((m: any) => m.treeId === treeId);
    return m?.level || 1;
  };

  // ── Resolve task treeId ────────────────────────────────────────────
  const getTaskTreeId = (task: any): string | null => {
    if (task.branch?.treeId) return task.branch.treeId;
    return task.branch?.idea?.need?.treeLinks?.[0]?.treeId || null;
  };

  // ── Filter by linaje ──────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (!isFilterModeActive && linajeActivo.length > 0) {
      result = result.filter(t => {
        return linajeActivo.some(l => {
          if (l.entidad === 'arbol') {
            if (t.branch?.treeId === l.id) return true;
            return t.branch?.idea?.need?.treeLinks?.some((tl: any) => tl.treeId === l.id);
          }
          if (l.entidad === 'rama') return t.branch?.id === l.id || t.branchId === l.id;
          if (l.entidad === 'necesidad') return t.branch?.idea?.needId === l.id;
          if (l.entidad === 'tarea') return t.id === l.id;
          return false;
        });
      });
    }
    return result;
  }, [tasks, isFilterModeActive, linajeActivo]);

  // ── Split: completadas awaiting audit vs audited ──────────────────
  const { awaitingAudit, audited } = useMemo(() => {
    const awaiting: any[] = [];
    const done: any[] = [];

    filteredTasks.forEach(t => {
      if (t.status !== 'COMPLETED') return;

      const daysSince = t.completedAt ? diffHours(new Date(), t.completedAt) / 24 : 0;

      if (showHistory) {
        if (t.auditada || daysSince > 30) done.push(t);
      } else {
        if (t.auditada) return; // Skip audited from main view
        if (daysSince > 30) return; // Auto-validated by time
        awaiting.push(t);
      }
    });

    // LIFO for awaiting
    awaiting.sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
    done.sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

    return { awaitingAudit: awaiting, audited: done };
  }, [filteredTasks, showHistory]);

  // ── Submit audit ──────────────────────────────────────────────────
  const handleAuditSubmit = async () => {
    if (!auditModal) return;
    setAuditSubmitting(true);
    setAuditError('');
    try {
      await api.post(`/tasks/${auditModal.id}/audit`, { notaSugerida: auditNote });
      setAuditModal(null);
      fetchTasks();
    } catch (e: any) {
      setAuditError(e?.response?.data?.error || t('m.tarea.medir.error_audit'));
    } finally {
      setAuditSubmitting(false);
    }
  };

  // ── Determine if user can audit a task ─────────────────────────────
  const canAuditTask = (task: any): boolean => {
    if (task.assignedTo === user?.id) return false; // Can't audit own task
    const treeId = getTaskTreeId(task);
    if (!treeId) return false;
    
    // Check if tree creator
    const isCreator = task.branch?.tree?.creatorId === user?.id;
    if (isCreator) return true;

    // Check level 3+
    const level = getUserLevel(treeId);
    return level >= 3;
  };

  // ── Profile section (from highest-level tree) ──────────────────────
  const bestMembership = user?.memberships?.reduce((best: any, m: any) => {
    if (!best || m.level > best.level) return m;
    if (m.level === best.level && m.xp > best.xp) return m;
    return best;
  }, null);

  const levelProgress = bestMembership ? ((bestMembership.xp % 50) / 50) * 100 : 0;

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('m.tarea.medir.loading')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', paddingBottom: '6rem' }}>

      {/* ── Profile Card ─────────────────────────────────────────────── */}
      <div style={{
        background: RL, borderRadius: 16, padding: '1rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        border: `1px solid ${RB}`,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: RB, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={24} color={R} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            {user?.username || t('m.tarea.medir.anonymous')}
          </div>
          {bestMembership && (
            <>
              <div style={{ fontSize: '0.72rem', color: R, fontWeight: 700 }}>
                {t('m.tarea.medir.level_xp', { level: bestMembership.level, xp: bestMembership.xp })}
              </div>
              {/* Progress bar */}
              <div style={{
                marginTop: 4, height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: R, width: `${levelProgress}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('m.tarea.medir.xp_progress', { current: bestMembership.xp % 50, next: bestMembership.level + 1 })}
              </div>
            </>
          )}
        </div>
        <Shield size={24} color={R} style={{ opacity: 0.5 }} />
      </div>

      {/* ── Level gate notice ────────────────────────────────────────── */}
      {bestMembership && bestMembership.level < 3 && (
        <div style={{
          padding: '0.75rem', borderRadius: 14,
          background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#eab308', fontSize: '0.78rem', fontWeight: 600,
        }}>
          <AlertTriangle size={16} />
          {t('m.tarea.medir.level_gate')}
        </div>
      )}

      {/* ── Section Title ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Shield size={18} color={R} />
        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: R }}>
          {showHistory ? t('m.tarea.medir.history') : t('m.tarea.medir.pending_title')}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          ({showHistory ? audited.length : awaitingAudit.length})
        </span>
      </div>

      {/* ── Task list ────────────────────────────────────────────────── */}
      {(showHistory ? audited : awaitingAudit).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
          <Eye size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>
            {showHistory ? t('m.tarea.medir.no_history') : t('m.tarea.medir.no_pending')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {(showHistory ? audited : awaitingAudit).map(task => {
            const treeId = getTaskTreeId(task);
            const canAudit = canAuditTask(task);
            const isAuthor = task.assignedTo === user?.id;
            const daysSince = task.completedAt ? diffHours(new Date(), task.completedAt) / 24 : 0;
            const autoValidateIn = Math.max(0, 30 - daysSince);
            const isSelected = isFilterModeActive && linajeActivo.some(l => l.id === task.id && l.entidad === 'tarea');

            return (
              <motion.div
                key={task.id}
                layout
                onClick={() => { if (isFilterModeActive) toggleLinaje(task.id, 'tarea'); }}
                style={{
                  padding: '0.75rem', borderRadius: 14,
                  background: isSelected ? RB : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isSelected ? R : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', flexDirection: 'column', gap: '0.4rem',
                  cursor: isFilterModeActive ? 'pointer' : 'default',
                  opacity: isFilterModeActive && !isSelected && linajeActivo.some(l => l.entidad === 'tarea') ? 0.3 : 1,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', flex: 1 }}>
                    {task.name}
                  </span>
                  {task.difficulty > 0 && <EstrellaDificultad nota={task.difficulty} size={24} />}
                </div>

                {/* Branch name */}
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {task.branch?.isHashtag ? '#' : '📋 '}{task.branch?.name || 'Rama'}
                </span>

                {/* Evidence preview */}
                {(task.startPhotoUrl || task.completionPhotoUrl || task.completionComment) && (
                  <div style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {task.isRedacted ? (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem' }}>
                        {t('m.tarea.medir.evidence_hidden')}
                      </div>
                    ) : (
                      <>
                        {/* Before/after grid */}
                        {(task.startPhotoUrl || task.completionPhotoUrl) && (() => {
                          const startUrls = parsePhotoUrls(task.startPhotoUrl);
                          const endUrls = parsePhotoUrls(task.completionPhotoUrl);
                          const hasBoth = startUrls.length > 0 && endUrls.length > 0;
                          return (
                            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: task.completionComment ? 6 : 0 }}>
                              {startUrls.length > 0 && (
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 3, textAlign: 'center' }}>
                                    Inicio
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {startUrls.map((url: string, i: number) => (
                                      <EvidencePreview key={i} url={url} label="Inicio" width={startUrls.length > 1 ? 'calc(50% - 2px)' : '100%'} />
                                    ))}
                                  </div>
                                </div>
                              )}
                              {endUrls.length > 0 && (
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', marginBottom: 3, textAlign: hasBoth ? 'center' : 'left' }}>
                                    Final
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {endUrls.map((url: string, i: number) => (
                                      <EvidencePreview key={i} url={url} label="Final" width={endUrls.length > 1 ? 'calc(50% - 2px)' : '100%'} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}
                    {task.completionComment && !task.isRedacted && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                        "{task.completionComment}"
                      </p>
                    )}
                  </div>
                )}

                {/* Tags */}
                {task.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                    {task.tags.map((t: any) => (
                      <span key={t.skillName} style={{ fontSize: '0.6rem', fontWeight: 700, color: R, background: RL, padding: '1px 5px', borderRadius: 8 }}>
                        @{t.skillName}
                      </span>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  {task.auditorias?.length > 0 && (
                    <span>🗳 {task.auditorias.length} {task.auditorias.length > 1 ? t('m.tarea.medir.audit_plural') : t('m.tarea.medir.audit_singular')}</span>
                  )}
                  {!task.auditada && autoValidateIn > 0 && (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      ⏱ {t('m.tarea.medir.auto_validation', { days: Math.ceil(autoValidateIn) })}
                    </span>
                  )}
                  {task.auditada && (
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>{t('m.tarea.hacer.audited')}</span>
                  )}
                </div>

                {/* Audit button */}
                {!isFilterModeActive && !showHistory && canAudit && !task.auditada && (
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAuditModal(task);
                      setAuditNote(5);
                      setAuditError('');
                    }}
                    style={{
                      padding: '0.5rem', borderRadius: 12,
                      background: RB, border: `1px solid ${R}`,
                      color: R, fontWeight: 700, fontSize: '0.82rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      cursor: 'pointer', marginTop: '0.25rem',
                    }}
                  >
                    <Shield size={15} /> {t('m.tarea.medir.audit_btn')}
                  </motion.button>
                )}

                {/* Author's own completed task — XP info */}
                {isAuthor && task.difficulty > 0 && treeId && (
                  <div style={{
                    background: 'rgba(34,197,94,0.08)', borderRadius: 10, padding: '0.5rem',
                    fontSize: '0.72rem', color: '#22c55e', fontWeight: 600,
                  }}>
                    <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    XP Base estimado: ~{Math.round(task.difficulty * 5)} | {t('m.tarea.medir.bonus_tags')}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── History FAB ──────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: isInstallPromptVisible ? '10rem' : '5rem',
        right: '1.5rem', zIndex: 100,
        transition: 'bottom 0.3s ease-in-out',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowHistory(!showHistory)}
          style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: showHistory ? R : 'var(--bg-card)',
            color: showHistory ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${showHistory ? R : 'var(--border-color)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer',
          }}
          title={showHistory ? t('m.tarea.medir.view_active') : t('m.tarea.medir.view_history')}
        >
          <Hourglass size={22} />
        </motion.button>
      </div>

      {/* ── Audit Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {auditModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAuditModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420, maxHeight: '80vh',
                background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
                padding: '1.25rem', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: R }}>
                  <Shield size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  {t('m.tarea.medir.audit_title')}
                </h3>
                <button onClick={() => setAuditModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {auditModal.name}
              </p>

              {/* Evidence review */}
              {(auditModal.startPhotoUrl || auditModal.completionPhotoUrl || auditModal.completionComment) && (
                <div style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '0.75rem',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {t('m.tarea.medir.evidence_section')}
                  </div>
                  {/* Before / After multi-photo comparison */}
                  {(() => {
                    const startUrls = parsePhotoUrls(auditModal.startPhotoUrl);
                    const endUrls = parsePhotoUrls(auditModal.completionPhotoUrl);
                    const hasBoth = startUrls.length > 0 && endUrls.length > 0;
                    return (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: auditModal.completionComment ? 8 : 0 }}>
                        {startUrls.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 4, textAlign: hasBoth ? 'center' : 'left' }}>Inicio</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {startUrls.map((url: string, i: number) => (
                                <EvidencePreview key={i} url={url} label="Inicio" width={startUrls.length > 1 ? 'calc(50% - 2px)' : '100%'} />
                              ))}
                            </div>
                          </div>
                        )}
                        {endUrls.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', marginBottom: 4, textAlign: hasBoth ? 'center' : 'left' }}>Final</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {endUrls.map((url: string, i: number) => (
                                <EvidencePreview key={i} url={url} label="Final" width={endUrls.length > 1 ? 'calc(50% - 2px)' : '100%'} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {auditModal.completionComment && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic', lineHeight: 1.4 }}>
                      "{auditModal.completionComment}"
                    </p>
                  )}
                </div>
              )}

              {/* Check: ¿Se hizo el trabajo? */}
              <div style={{
                background: 'rgba(34,197,94,0.08)', borderRadius: 12, padding: '0.75rem',
                border: '1px solid rgba(34,197,94,0.15)',
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>
                  <ThumbsUp size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('m.tarea.medir.work_done')}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {t('m.tarea.medir.review_instruction')}
                </p>
              </div>

              {/* Bonus ethics check */}
              {auditModal.tags?.length > 0 && (
                <div style={{
                  background: 'rgba(234,179,8,0.08)', borderRadius: 12, padding: '0.75rem',
                  border: '1px solid rgba(234,179,8,0.15)',
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#eab308', marginBottom: 6 }}>
                    <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {t('m.tarea.medir.bonus_question')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {auditModal.tags.map((t: any) => (
                      <span key={t.skillName} style={{
                        fontSize: '0.68rem', fontWeight: 700, color: '#eab308',
                        background: 'rgba(234,179,8,0.15)', padding: '2px 8px', borderRadius: 10,
                      }}>
                        @{t.skillName}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                    {t('m.tarea.medir.bonus_instruction')}
                  </p>
                </div>
              )}

              {/* Note slider */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  {t('m.tarea.medir.suggested_grade')} <span style={{ color: DIFFICULTY_COLORS[auditNote], fontWeight: 800 }}>{auditNote} — {t(`m.difficulty.${auditNote}`)}</span>
                </label>
                <input
                  type="range"
                  min={1} max={10} step={1}
                  value={auditNote}
                  onChange={e => setAuditNote(Number(e.target.value))}
                  style={{ width: '100%', accentColor: DIFFICULTY_COLORS[auditNote] }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  <span>{t('m.tarea.medir.deficient')}</span><span>{t('m.tarea.medir.exceptional')}</span>
                </div>
              </div>

              {/* Error */}
              {auditError && (
                <div style={{ padding: '0.5rem', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> {auditError}
                </div>
              )}

              {/* Submit */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleAuditSubmit}
                disabled={auditSubmitting}
                style={{
                  padding: '0.85rem', borderRadius: 14,
                  background: R, color: '#fff', fontWeight: 800, fontSize: '0.92rem',
                  border: 'none', cursor: 'pointer',
                  opacity: auditSubmitting ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {auditSubmitting ? <Loader2 size={18} className="spin" /> : <Shield size={18} />}
                {auditSubmitting ? t('m.tarea.hacer.submitting') : t('m.tarea.medir.confirm_audit')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
