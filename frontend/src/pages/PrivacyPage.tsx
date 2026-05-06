import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PrivacySettingsPanel from '../components/PrivacySettingsPanel';
import { useAuthStore } from '../store/authStore';

export default function PrivacyPage() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  if (isInitialLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando privacidad...</div>;
  }

  if (!user) return null;

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: 760 }}>
      <PrivacySettingsPanel />
    </main>
  );
}
