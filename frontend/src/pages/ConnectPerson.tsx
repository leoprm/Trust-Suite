import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function ConnectPerson() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [connectedWith, setConnectedWith] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Token inválido'); return; }
    if (!isAuthenticated) {
      // Redirect to login, then back here
      navigate(`/login?redirect=/add/${token}`);
      return;
    }

    api.post('/contacts/connect', { token })
      .then(({ data }) => {
        setStatus('success');
        setMessage(data.message || 'Conexión establecida');
        setConnectedWith(data.connectedWith || '');
      })
      .catch(e => {
        setStatus('error');
        setMessage(e?.response?.data?.error || 'Error al conectar');
      });
  }, [token, isAuthenticated, navigate]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a14', padding: '1rem',
    }}>
      <div style={{
        width: 'min(90vw, 360px)', padding: '2rem',
        background: 'rgba(255,255,255,0.04)', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
        textAlign: 'center',
      }}>
        {status === 'loading' && (
          <>
            <Loader2 size={40} style={{ color: '#22c55e', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Estableciendo conexión…</span>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={28} color="#22c55e" />
            </div>
            <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 700 }}>{message}</span>
            {connectedWith && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>
                con <strong style={{ color: '#22c55e' }}>{connectedWith}</strong>
              </span>
            )}
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '0.65rem 1.5rem', borderRadius: 12,
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                cursor: 'pointer', color: '#22c55e', fontSize: '0.8rem', fontWeight: 600,
                marginTop: '0.5rem',
              }}
            >
              Ir al inicio
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={28} color="#ef4444" />
            </div>
            <span style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 600 }}>{message}</span>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '0.65rem 1.5rem', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                marginTop: '0.5rem',
              }}
            >
              Ir al inicio
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
