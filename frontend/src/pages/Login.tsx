import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { appConfig } from '../config/appConfig';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((state: any) => state.login);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin && password !== confirmPassword) {
      setError(t('login.passwords_mismatch'));
      return;
    }

    try {
      if (isLogin) {
        const { data } = await api.post('/auth/login', { email, password });
        login(data.user, data.token);
        navigate('/');
      } else {
        const { data } = await api.post('/auth/register', { username, email, password });
        login(data.user, data.token);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    }
  };

  return (
    <div className="container flex justify-center items-center" style={{ minHeight: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '2rem', right: '2rem' }}>
        <span 
          style={{ cursor: 'pointer', opacity: i18n.language === 'en' ? 1 : 0.5, marginRight: '1rem' }}
          onClick={() => i18n.changeLanguage('en')}>EN</span>
        <span 
          style={{ cursor: 'pointer', opacity: i18n.language === 'es' ? 1 : 0.5 }}
          onClick={() => i18n.changeLanguage('es')}>ES</span>
      </div>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel"
        style={{ width: '100%', maxWidth: '400px' }}
      >
        <h2 className="text-gradient text-center mb-8">
          {isLogin ? t('login.welcome') : t('login.join')}
        </h2>

        {error && (
          <div style={{ color: 'var(--accent-danger)', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-col">
          {!isLogin && (
            <div className="input-group">
              <label>{t('login.username')}</label>
              <input 
                type="text" 
                className="input-field" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
          )}
          <div className="input-group">
            <label>{isLogin ? `${t('login.email')} / ${t('login.username')}` : t('login.email')}</label>
            <input 
              type={isLogin ? "text" : "email"} 
              className="input-field" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>{t('login.password')}</label>
            <input 
              type="password" 
              className="input-field" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {!isLogin && (
            <div className="input-group">
              <label>{t('login.confirm_password')}</label>
              <input
                type="password"
                className="input-field"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full mt-4">
            {isLogin ? t('login.signin_btn') : t('login.create_btn')}
          </button>
        </form>

        <p className="text-center mt-4" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {isLogin ? `${t('login.no_account')} ` : `${t('login.has_account')} `}
          <span 
            style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => { setIsLogin(!isLogin); setConfirmPassword(''); setError(''); }}
          >
            {isLogin ? t('login.signup_link') : t('login.signin_link')}
          </span>
        </p>

        {appConfig.features.talentSearch && (
          <Link
            to="/talent"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              marginTop: '0.8rem', padding: '0.6rem', borderRadius: 10,
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
              textDecoration: 'none', color: '#fbbf24', fontSize: '0.82rem', fontWeight: 600,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(251,191,36,0.12)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(251,191,36,0.06)')}
          >
            Buscar Talento
          </Link>
        )}
      </motion.div>
    </div>
  );
}
