import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Check, Eye } from 'lucide-react';
import { isProtectedFileUrl, openProtectedFile } from '../lib/files';

export default function PendingEvidenceList({ treeId, onUpdate }: { treeId: string; onUpdate?: () => void }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPending();
  }, [treeId]);

  const fetchPending = async () => {
    try {
      const { data } = await api.get(`/trees/${treeId}/pending-evidence`);
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch pending evidence', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (taskId: string) => {
    if (!confirm('¿Aprobar esta evidencia y graduar al miembro como Ciudadano Verificado?')) return;
    try {
      await api.put(`/tasks/${taskId}/approve-evidence`);
      fetchPending();
      if (onUpdate) onUpdate();
    } catch (error) {
      alert('Error al aprobar evidencia');
    }
  };



  if (loading) return null;
  if (tasks.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(234,179,8,0.05)',
      border: '1px solid rgba(234,179,8,0.2)',
      borderRadius: 'var(--radius-md)',
      padding: '1.25rem',
      marginBottom: '1.5rem'
    }}>
      <h3 style={{ margin: '0 0 1rem 0', color: 'var(--accent-warning)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Eye size={18} /> Ritos de Iniciación Pendientes ({tasks.length})
      </h3>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Las siguientes tareas fueron completadas por miembros No Verificados. Revisa la evidencia y apruébalas para otorgarles la ciudadanía plena.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {tasks.map(task => (
          <div key={task.id} style={{
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{task.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Rama: {task.branch?.idea?.title || 'Desconocida'}
              </div>
              <div style={{ marginTop: '0.4rem' }}>
                {isProtectedFileUrl(task.evidenceUrl) ? (
                  <button
                    onClick={() => openProtectedFile(task.evidenceUrl)}
                    style={{ fontSize: '0.85rem', color: '#60a5fa', textDecoration: 'underline', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                  >
                    Ver Evidencia Subida
                  </button>
                ) : (
                  <a 
                    href={task.evidenceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.85rem', color: '#60a5fa', textDecoration: 'underline' }}
                  >
                    Ver Evidencia Subida
                  </a>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => handleApprove(task.id)}
                className="btn btn-primary"
                style={{ background: 'var(--accent-success)', color: 'white', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Check size={14} /> Aprobar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
