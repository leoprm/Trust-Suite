import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, UserRound } from 'lucide-react';
import ProfilePage from '../components/ProfilePage';
import { useAuthStore } from '../store/authStore';

export default function TraceProfile() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  if (isInitialLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando Trace Lite...</div>;
  }

  if (!user) return null;

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <UserRound size={28} color="var(--accent-primary)" />
            Perfil ciudadano
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>
            Historial verificable, habilidades y portafolio publico.
          </p>
        </div>
        <button className="btn btn-outline" onClick={() => navigate('/talent')}>
          <Briefcase size={18} />
          Buscar talento
        </button>
      </header>

      <section className="glass-panel" style={{ padding: '1rem' }}>
        <ProfilePage onClose={() => {}} />
      </section>
    </main>
  );
}
