import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, ArrowRight, Loader } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function RegistroInvitadoModal({ isOpen, onClose, onReject }: { isOpen: boolean, onClose: () => void, onReject?: () => void }) {
  const { user, fetchUser } = useAuthStore();
  
  // Pre-fill con el nombre del invitado si existe
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Por ahora se envía al endpoint (que luego crearemos en el backend)
      console.log('Enviando datos de registro/upgrade:', formData);
      await api.post('/auth/upgrade-guest', formData);
      
      setSuccess(true);
      
      // Actualizamos el estado global del usuario para quitarle el flag de invitado
      await fetchUser();
      
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Ocurrió un error al registrarte. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000, padding: '1rem'
      }}>
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="glass-panel"
          style={{ width: '100%', maxWidth: '400px', padding: '2rem', position: 'relative' }}
        >
          <button 
            onClick={onClose}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>

          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <User size={24} stroke="var(--accent-primary)" />
            </div>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>¡Regístrate gratis para acceder a las funciones avanzadas!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Crea tu cuenta para poder gestionar el valor del árbol y conectar con otras personas de la comunidad.
            </p>
          </div>

          {error && (
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-danger)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          {success ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--accent-success)' }}
            >
              <h3>¡Registro exitoso!</h3>
              <p style={{ margin: 0 }}>Desbloqueando funciones...</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label>Tu nombre o apodo</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="input-field"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input-field"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="tu@email.com"
                  />
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                <label>Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input-field"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary w-full" 
                disabled={loading}
                style={{ padding: '0.85rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem', marginTop: '0.5rem' }}
              >
                {loading ? <Loader className="spin" size={20} /> : <>Registrar <ArrowRight size={18} /></>}
              </button>

              <button 
                type="button" 
                onClick={() => {
                  if (onReject) onReject();
                  onClose();
                }}
                style={{ 
                  background: 'none', border: 'none', color: 'var(--text-secondary)', 
                  cursor: 'pointer', padding: '0.5rem', fontSize: '0.9rem', marginTop: '0.25rem',
                  textDecoration: 'underline'
                }}
              >
                Seguir como invitado
              </button>
            </form>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
