import { useState, useEffect } from 'react';
import { Shield, UserPlus, UserMinus, X, Search, Loader2, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';

type SignerUser = { id: string; username: string; email: string | null };

type Signer = {
  id: string;
  userId: string;
  status: string;
  addedAt: string;
  removedAt: string | null;
  user: SignerUser;
};

type TreeMember = {
  userId: string;
  username: string;
};

type Props = {
  treeId: string;
  isAdmin: boolean;
  financingMode: string;
  multiSigThreshold: number;
  minSigners: number;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none',
};

export default function SignerManagementPanel({
  treeId,
  isAdmin,
  financingMode,
  multiSigThreshold,
  minSigners,
}: Props) {
  const [signers, setSigners] = useState<Signer[]>([]);
  const [members, setMembers] = useState<TreeMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetchSigners();
  }, [treeId]);

  // Fetch members when modal opens
  useEffect(() => {
    if (showAddModal) {
      fetchMembers();
    }
  }, [showAddModal]);

  const fetchSigners = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/trees/${treeId}/signers`);
      setSigners(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar firmantes');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data } = await api.get(`/trees/${treeId}/members`);
      setMembers(data);
    } catch (_) {
      // silently fail — signers list is more important
    }
  };

  const handleAdd = async (userId: string) => {
    setAddingId(userId);
    setError('');
    try {
      await api.post(`/trees/${treeId}/signers`, { userId });
      await fetchSigners();
      setShowAddModal(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al agregar firmante');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setError('');
    setWarnings([]);
    try {
      const { data } = await api.delete(`/trees/${treeId}/signers/${userId}`);
      await fetchSigners();
      if (data.warnings?.length) setWarnings(data.warnings);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al remover firmante');
    } finally {
      setRemovingId(null);
    }
  };

  // Calculate status
  const activeCount = signers.filter(s => s.status === 'ACTIVE').length;
  const thresholdMet = activeCount >= (multiSigThreshold || 2);
  const minimumMet = activeCount >= (minSigners || 3);

  let statusColor: string;
  let statusLabel: string;
  let StatusIcon: typeof Shield | typeof AlertTriangle;

  if (thresholdMet && minimumMet) {
    statusColor = '#10b981';
    statusLabel = `Multi-sig activo (${activeCount}/${minSigners} firmantes)`;
    StatusIcon = Shield;
  } else if (activeCount > 0) {
    statusColor = '#f59e0b';
    statusLabel = `Incompleto (${activeCount}/${minSigners})`;
    StatusIcon = AlertTriangle;
  } else {
    statusColor = '#ef4444';
    statusLabel = 'Desactivado';
    StatusIcon = AlertTriangle;
  }

  // Filter members not already signers
  const signerIds = new Set(signers.filter(s => s.status === 'ACTIVE').map(s => s.userId));
  const availableMembers = members
    .filter(m => !signerIds.has(m.userId))
    .filter(m => !searchQuery || m.username.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 20);

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <Shield size={22} stroke={statusColor} />
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Firmantes Multi-sig</h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Umbral de ejecución: {multiSigThreshold || 2} · Mínimo requerido: {minSigners || 3}
          </p>
        </div>

        {/* Status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '100px',
            background: `${statusColor}15`,
            border: `1px solid ${statusColor}33`,
            color: statusColor,
            fontSize: '0.8rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <StatusIcon size={16} />
          {statusLabel}
        </div>
      </div>

      {/* Error / Warnings */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertTriangle size={15} />
            {error}
          </motion.div>
        )}
        {warnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.25)',
              color: '#fcd34d',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              fontSize: '0.78rem',
            }}
          >
            {warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: i < warnings.length - 1 ? '0.25rem' : 0 }}>
                <AlertTriangle size={14} /> {w}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : signers.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
          <Shield size={40} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 500 }}>Sin firmantes designados</p>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.78rem', opacity: 0.7 }}>
            {isAdmin
              ? 'Agrega firmantes para habilitar la aprobación multi-sig de pagos.'
              : 'El administrador aún no ha designado firmantes.'}
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <UserPlus size={16} /> Agregar firmante
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Signer list */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {signers.map(signer => (
              <div
                key={signer.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: signer.status === 'ACTIVE' ? 'var(--accent-primary)' : 'var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'white',
                    flexShrink: 0,
                    opacity: signer.status === 'ACTIVE' ? 1 : 0.5,
                  }}
                >
                  {signer.user.username.substring(0, 1).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{signer.user.username}</div>
                  {signer.user.email && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {signer.user.email}
                    </div>
                  )}
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    Agregado {new Date(signer.addedAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Remove button (admin only) */}
                {isAdmin && signer.status === 'ACTIVE' && (
                  <button
                    onClick={() => {
                      if (activeCount <= (minSigners || 3) && !confirm(
                        `¿Remover a ${signer.user.username}?\n\nEl número de firmantes activos bajará de ${activeCount} a ${activeCount - 1}, quedando por debajo del mínimo (${minSigners || 3}). Esto puede desactivar la multi-sig.`
                      )) return;
                      handleRemove(signer.userId);
                    }}
                    disabled={removingId === signer.userId}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: 'var(--accent-error)',
                      cursor: removingId === signer.userId ? 'not-allowed' : 'pointer',
                      padding: '0.35rem',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: removingId === signer.userId ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                    title="Remover firmante"
                  >
                    {removingId === signer.userId ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <UserMinus size={16} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add button */}
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-outline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#bfdbfe',
                borderColor: 'rgba(59,130,246,0.28)',
              }}
            >
              <UserPlus size={16} /> Agregar firmante
            </button>
          )}
        </>
      )}

      {/* Add Signer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              padding: '1rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel p-6 w-full"
              style={{ maxWidth: '420px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            >
              {/* Modal header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserPlus size={18} /> Agregar firmante
                </h3>
                <button
                  onClick={() => { setShowAddModal(false); setSearchQuery(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {activeCount >= 5 && (
                <div style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  color: '#fcd34d',
                  padding: '0.6rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.78rem',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}>
                  <AlertTriangle size={14} /> Máximo 5 firmantes alcanzado
                </div>
              )}

              {/* Search */}
              <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.7rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Buscar miembro..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: '2.3rem' }}
                  autoFocus
                />
              </div>

              {/* Member list */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                {availableMembers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {searchQuery ? 'No se encontraron miembros.' : 'No hay miembros disponibles.'}
                  </div>
                ) : (
                  availableMembers.map(member => (
                    <div
                      key={member.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.02)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--accent-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: 'white',
                          }}
                        >
                          {member.username[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{member.username}</span>
                      </div>
                      <button
                        onClick={() => handleAdd(member.userId)}
                        disabled={addingId === member.userId || activeCount >= 5}
                        className="btn btn-primary"
                        style={{
                          padding: '0.3rem 0.85rem',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          opacity: activeCount >= 5 ? 0.5 : 1,
                          cursor: activeCount >= 5 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {addingId === member.userId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Agregar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
