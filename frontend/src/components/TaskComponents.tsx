import { useState, useRef } from 'react';
import { Hammer, User, HelpCircle, Send, Camera, CheckCircle, Lock, Loader2, Upload, Clock } from 'lucide-react';
import api from '../lib/api';
import { isProtectedFileUrl, openProtectedFile } from '../lib/files';
import { useTreeStore } from '../store/treeStore';
import { useAuthStore } from '../store/authStore';

export function TaskCard({ task, onUpdate }: { task: any, onUpdate: () => void }) {
  if (!task) return null;
  const [questioning, setQuestioning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'compressing' | 'uploading' | 'done'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hours, setHours] = useState<number | ''>('');
  const [difficulty, setDifficulty] = useState<number | ''>('');
  
  const user = useAuthStore(s => s.user);
  const isAssignee = user && task?.assignedTo === user?.id;

  // Since task has branch->idea->need->treeLinks OR branch->treeId for hashtags
  const getTaskMembership = () => {
    if (!user?.memberships) return null;
    const treeIds = task?.branch?.idea?.need?.treeLinks?.map((tl: any) => tl.treeId) || [];
    if (task?.branch?.treeId) treeIds.push(task?.branch?.treeId);
    return user.memberships.find((m: any) => treeIds.includes(m.treeId));
  };
  const isVerified = getTaskMembership()?.status === 'VERIFIED';

  const settings = useTreeStore(s => s.settings);
  const effortMode = (settings?.modules?.effort?.mode || 'DIFFICULTY_AND_TIME') as any;
  const effortName = settings?.modules?.effort?.name || 'Esfuerzo';

  const handleQuestion = async () => {
    setQuestioning(true);
    try {
      await api.post(`/tasks/${task.id}/evaluations/question`);
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setQuestioning(false);
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effortMode !== 'DIFFICULTY_ONLY' && hours === '') return;
    if (effortMode !== 'TIME_ONLY' && difficulty === '') return;
    setEvaluating(true);
    try {
      await api.post(`/tasks/${task.id}/evaluations/submit`, {
        requiredHours: effortMode !== 'DIFFICULTY_ONLY' ? Number(hours) : null,
        difficulty: effortMode !== 'TIME_ONLY' ? Number(difficulty) : null
      });
      onUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  // Compress image using Canvas API (no extra library needed)
  const compressImage = (file: File, maxPx = 1200, quality = 0.78): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')), 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = objectUrl;
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setEvidenceFile(file);
    // Show compressed preview
    try {
      const compressed = await compressImage(file);
      const previewUrl = URL.createObjectURL(compressed);
      setEvidencePreview(previewUrl);
    } catch {
      setEvidencePreview(URL.createObjectURL(file));
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setErrorMsg('');
    try {
      let uploadedUrl: string | undefined;

      if (evidenceFile) {
        setUploadProgress('compressing');
        const compressed = await compressImage(evidenceFile);
        setUploadProgress('uploading');
        const formData = new FormData();
        formData.append('file', compressed, 'evidence.jpg');
        formData.append('visibility', 'TASK_PARTICIPANTS');
        const { data } = await api.post(`/tasks/${task.id}/evidence`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        uploadedUrl = data.downloadUrl || data.url;
        setUploadProgress('done');
      }

      await api.post(`/tasks/${task.id}/complete`, { evidenceUrl: uploadedUrl });
      onUpdate();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error || 'Error completando tarea');
      setUploadProgress('idle');
    } finally {
      setCompleting(false);
    }
  };

  const isQuestionable = !task?.isAnonymous && !task?.requiresVoting && task?.status === 'OPEN';
  const needsEvaluation = task?.requiresVoting && task?.status === 'OPEN'; 

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: '1.25rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Hammer size={16} stroke="var(--accent-primary)" />
            {task?.name}
            {task?.isAnonymous && (
               <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)' }}>
                 Anonymous
               </span>
            )}
          </h4>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {task?.description}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {task?.tags?.map((tag: any) => (
          <span key={tag.id} style={{
            fontSize: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
            padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)'
          }}>
            {tag.skillName}
          </span>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)',
        paddingTop: '0.75rem', marginTop: '0.5rem', alignItems: 'center'
      }}>
        {!task.isAnonymous && task.creatorId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <User size={14} /> Created by Tree Member
          </div>
        )}

        {(task?.requiredHours != null || task?.difficulty != null) && (
          <>
            {effortMode !== 'DIFFICULTY_ONLY' && task?.requiredHours != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tiempo Estimado:</span>
                <strong style={{ color: 'var(--accent-warning)' }}>{task?.requiredHours}h</strong>
              </div>
            )}
            {effortMode !== 'TIME_ONLY' && task?.difficulty != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{effortName}:</span>
                <strong style={{ color: 'var(--accent-danger)' }}>{task?.difficulty}/7.0</strong>
              </div>
            )}
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          {isQuestionable && isVerified && (
             <button onClick={handleQuestion} disabled={questioning} style={{
               background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
               color: '#fb923c', padding: '0.3rem 0.75rem', borderRadius: 'var(--radius-sm)',
               fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer'
             }}>
               {questioning ? '...' : <><HelpCircle size={14} /> Cuestionar Reparto</>}
             </button>
          )}
          {isQuestionable && !isVerified && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Solo los ciudadanos Verificados pueden cuestionar tareas">
              Reparto Cuestionable <Lock size={14} />
            </span>
          )}
        </div>
      </div>

      {needsEvaluation && (
        <form onSubmit={handleEvaluate} style={{
          marginTop: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem',
          borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(255,255,255,0.1)'
        }}>
          <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Evaluate Task {effortName}</h5>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            This task requires community evaluation to determine its impact.
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            {effortMode !== 'DIFFICULTY_ONLY' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Horas Requeridas</label>
                <input type="number" step="0.5" required={effortMode !== 'DIFFICULTY_ONLY'} value={hours} onChange={e => setHours(e.target.value ? Number(e.target.value) : '')} className="input" placeholder="e.g. 4.5" />
              </div>
            )}
            {effortMode !== 'TIME_ONLY' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{effortName} (1.0-7.0)</label>
                <input type="number" min="1" max="7" step="0.1" required={effortMode !== 'TIME_ONLY'} value={difficulty} onChange={e => setDifficulty(e.target.value ? Number(e.target.value) : '')} className="input" placeholder="e.g. 3.2" />
              </div>
            )}
            <button type="submit" disabled={evaluating} className="btn btn-primary" style={{ padding: '0.6rem 1rem' }}>
              {evaluating ? '...' : <Send size={16} />}
            </button>
          </div>
        </form>
      )}

      {task?.status === 'IN_PROGRESS' && isAssignee && task?.evidenceStatus !== 'PENDING' && (
         <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(59,130,246,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59,130,246,0.3)' }}>
           <h5 style={{ margin: '0 0 0.75rem 0', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
             <Camera size={16} /> Completar Tarea
           </h5>
           {errorMsg && <p style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>{errorMsg}</p>}
           <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
             
             {/* File picker */}
             <input
               ref={fileInputRef}
               type="file"
               accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
               style={{ display: 'none' }}
               onChange={handleFileSelect}
             />
             <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               className="btn btn-outline"
               style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
             >
               <Camera size={16} />
               {evidenceFile ? 'Cambiar foto' : 'Seleccionar foto de evidencia'}
             </button>

             {/* Thumbnail preview */}
             {evidencePreview && (
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                 <img
                   src={evidencePreview}
                   alt="Preview"
                   style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.1)' }}
                 />
                 <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                   <div style={{ color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                     <CheckCircle size={14} /> Imagen seleccionada
                   </div>
                   <div style={{ marginTop: '0.2rem', opacity: 0.7 }}>Se comprimirá antes de subir</div>
                 </div>
               </div>
             )}

             <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0' }}>
               Si eres un ciudadano <strong>No Verificado</strong>, esta foto es <strong>obligatoria</strong> para tu Rito de Iniciación.
             </p>

             <button
               onClick={handleComplete}
               disabled={completing}
               className="btn btn-primary"
               style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
             >
               {completing
                 ? uploadProgress === 'compressing' ? <><Loader2 size={16} className="animate-spin" /> Comprimiendo...</>
                 : uploadProgress === 'uploading' ? <><Upload size={16} className="animate-spin" /> Subiendo...</>
                 : '...'
                 : 'Marcar como Completada'
               }
             </button>
           </div>
         </div>
      )}

      {task.status === 'IN_PROGRESS' && task.evidenceStatus === 'PENDING' && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(249,115,22,0.1)', border: '1px dashed rgba(249,115,22,0.3)', borderRadius: 'var(--radius-sm)', color: '#fb923c', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} />
              <span>Esta tarea fue realizada, pero su evidencia (Rito de Iniciación) está pendiente de aprobación por un ciudadano Verificado. No se otorgará progreso final hasta ser aprobada.</span>
            </div>
            {task.evidenceUrl && (
              <div style={{ marginLeft: '1.5rem' }}>
                {isProtectedFileUrl(task.evidenceUrl) ? (
                  <button onClick={() => openProtectedFile(task.evidenceUrl)} style={{ color: '#fb923c', textDecoration: 'underline', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>Ver Evidencia Subida</button>
                ) : (
                  <a href={task.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#fb923c', textDecoration: 'underline' }}>Ver Evidencia Subida</a>
                )}
              </div>
            )}
          </div>
      )}
    </div>
  );
}

export function TaskForm({ branchId, phase, onSubmit, onCancel }: { branchId: string, phase: string, onSubmit: () => void, onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [hours, setHours] = useState<number | ''>('');
  const [difficulty, setDifficulty] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const settings = useTreeStore(s => s.settings);
  const effortMode = (settings?.modules?.effort?.mode || 'DIFFICULTY_AND_TIME') as any;
  const effortName = settings?.modules?.effort?.name || 'Esfuerzo';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effortMode !== 'DIFFICULTY_ONLY' && hours === '') return;
    if (effortMode !== 'TIME_ONLY' && difficulty === '') return;
    
    setSubmitting(true);
    try {
      await api.post('/tasks', {
        branchId,
        phase,
        name,
        description,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        requiredHours: effortMode !== 'DIFFICULTY_ONLY' ? Number(hours) : null,
        difficulty: effortMode !== 'TIME_ONLY' ? Number(difficulty) : null
      });
      onSubmit();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem'
    }}>
      <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Crear Tarea para {phase}</h4>
      
      <div className="form-group">
        <label className="label">Nombre de la Tarea</label>
        <input type="text" required value={name} onChange={e => setName(e.target.value)} className="input" placeholder="¿Qué se debe hacer?" />
      </div>

      <div className="form-group">
        <label className="label">Descripción</label>
        <textarea required value={description} onChange={e => setDescription(e.target.value)} className="input" rows={3} placeholder="Detalles..." />
      </div>

      <div className="form-group">
        <label className="label">Tags/Habilidades (separadas por coma)</label>
        <input type="text" value={tags} onChange={e => setTags(e.target.value)} className="input" placeholder="ej: diseño, programación" />
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        {effortMode !== 'DIFFICULTY_ONLY' && (
          <div style={{ flex: 1 }}>
            <label className="label">Horas Estimadas</label>
            <input type="number" step="0.5" required={effortMode !== 'DIFFICULTY_ONLY'} value={hours} onChange={e => setHours(e.target.value ? Number(e.target.value) : '')} className="input" placeholder="4.0" />
          </div>
        )}
        {effortMode !== 'TIME_ONLY' && (
          <div style={{ flex: 1 }}>
            <label className="label">{effortName} (1.0 a 7.0)</label>
            <input type="number" min="1" max="7" step="0.1" required={effortMode !== 'TIME_ONLY'} value={difficulty} onChange={e => setDifficulty(e.target.value ? Number(e.target.value) : '')} className="input" placeholder="3.5" />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Cancelar</button>
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? 'Creando...' : 'Crear Tarea'}
        </button>
      </div>
    </form>
  );
}
