import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Leaf, AlertCircle, ArrowRight, Loader, Mail, Lock, User } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function GuestJoin() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { login, isAuthenticated, isInitialLoading } = useAuthStore();
  
  const [isLoginView, setIsLoginView] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success' | 'already_member'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // 1. SILENT AUTO-JOIN (Si ya hay una sesión activa en el dispositivo)
  useEffect(() => {
    if (isInitialLoading || !isAuthenticated || status !== 'idle') return;

    const performAutoJoin = async () => {
      setStatus('loading');
      try {
        const { data } = await api.post('/trees/consume-guest-token', { token });
        
        if (data.message === 'Ya eres miembro del árbol') {
          setStatus('already_member');
          setTimeout(() => navigate('/'), 1500);
          return;
        }

        setStatus('success');
        setTimeout(() => {
          navigate(`/trees/${data.treeId}`);
        }, 1000);
      } catch (error: any) {
        console.error('Error in auto-join:', error);
        setStatus('error');
        setErrorMessage(error.response?.data?.error || 'No se pudo procesar la invitación. Puede haber expirado.');
      }
    };

    performAutoJoin();
  }, [isAuthenticated, isInitialLoading, token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginView && !username.trim()) return;
    if (isLoginView && (!email.trim() || !password.trim())) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      if (isLoginView) {
        // FLUJO 1: Iniciar sesión existente y consumir token
        const loginRes = await api.post('/auth/login', { email: email.trim(), password });
        login(loginRes.data.user, loginRes.data.accessToken, loginRes.data.refreshToken);
        
        // El useEffect de Auto-Join debería encargarse ahora, pero por si acaso, 
        // disparamos manualmente el consumo del token aquí para evitar race conditions antes del render:
        const { data: joinData } = await api.post('/trees/consume-guest-token', { token });
        
        if (joinData.message === 'Ya eres miembro del árbol') {
          setStatus('already_member');
          setTimeout(() => navigate('/'), 1500);
          return;
        }

        setStatus('success');
        setTimeout(() => navigate(`/trees/${joinData.treeId}`), 1000);

      } else {
        // FLUJO 2: Unirse como invitado (apodo)
        const { data } = await api.post('/auth/guest-join', {
          token,
          username: username.trim()
        });
        login(data.user, data.accessToken, data.refreshToken);
        setStatus('success');
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (error: any) {
      console.error('Error al unirse:', error);
      setStatus('error');
      setErrorMessage(error.response?.data?.error || 'No se pudo procesar tu entrada. Verifica tus credenciales o el enlace.');
    }
  };

  if (isInitialLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
        <Loader className="spin" size={32} color="var(--accent-primary)" />
      </div>
    );
  }

  if (isAuthenticated && status !== 'error' && status !== 'idle' && status !== 'loading' && status !== 'already_member' && status !== 'success') {
    // Para simplificar la condición original en refactor
  }

  // Si isAuthenticated es true, la pantalla mostrará el Loader de success/loading "Uniéndote al árbol..." o el mensaje de que ya es miembro.
  if (isAuthenticated && status !== 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
         <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '2rem', color: 'var(--accent-primary)' }}
          >
            {status === 'already_member' ? (
              <>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                  <Leaf size={24} />
                </div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Ya eres parte del árbol</h3>
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Redirigiendo a tu inicio...</p>
              </>
            ) : (
              <>
                <Loader className="spin" size={32} style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ margin: 0 }}>Uniéndote al árbol...</h3>
              </>
            )}
         </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', padding: '1rem' }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel"
        style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-full)', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Leaf size={32} />
          </div>
        </div>

        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          {isLoginView ? 'Inicia sesión para unirte' : 'Únete al Árbol'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          {isLoginView 
            ? 'Ingresa tus credenciales para reclamar esta invitación.'
            : 'Has sido invitado a colaborar. Ingresa un apodo para entrar directamente.'}
        </p>

        {status === 'error' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-md)', color: 'var(--accent-danger)', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', textAlign: 'left', fontSize: '0.9rem' }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMessage}</span>
          </motion.div>
        )}

        {status === 'already_member' ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: '2rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-md)', color: 'var(--accent-primary)' }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Enlace Verificado</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Ya eres parte del árbol. Redirigiendo a tu inicio...</p>
          </motion.div>
        ) : status === 'success' ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: '2rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 'var(--radius-md)', color: 'var(--accent-success)' }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0' }}>¡Excelente!</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Entrando al ecosistema...</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!isLoginView ? (
              <div className="input-group" style={{ textAlign: 'left' }}>
                <label>Tu nombre o apodo</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ej. Juan Pérez"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    disabled={status === 'loading'}
                    autoFocus
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="input-group" style={{ textAlign: 'left' }}>
                  <label>Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="email" 
                      className="input-field" 
                      placeholder="tu@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      disabled={status === 'loading'}
                      autoFocus
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </div>
                <div className="input-group" style={{ textAlign: 'left' }}>
                  <label>Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="password" 
                      className="input-field" 
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={status === 'loading'}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ textAlign: 'center', marginBottom: '-0.5rem' }}>
              <button 
                type="button"
                onClick={() => {
                  setIsLoginView(!isLoginView);
                  setErrorMessage(''); 
                  setStatus('idle');
                }}
                disabled={status === 'loading'}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent-primary)',
                  cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                  textDecoration: 'underline'
                }}
              >
                {isLoginView ? "¿No tienes cuenta? Entra como invitado" : "¿Ya eres usuario? Inicia sesión"}
              </button>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full" 
              disabled={status === 'loading'}
              style={{ padding: '1rem', fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
            >
              {status === 'loading' ? (
                <>
                  <Loader size={20} className="spin" /> Procesando...
                </>
              ) : (
                <>
                  {isLoginView ? 'Iniciar sesión y Entrar' : 'Entrar al Árbol'} <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
