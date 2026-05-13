import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import StepSubscription from './StepSubscription';
import StepTeamChoice from './StepTeamChoice';
import StepCreateTree from './StepCreateTree';
import StepJoinTree from './StepJoinTree';
import { Check, Sparkles } from 'lucide-react';

type TeamChoice = 'create' | 'join' | null;

interface OnboardingState { step: number; teamChoice: TeamChoice; completed: boolean; }

const STEPS = [{ id: 1, label: 'Suscripción' }, { id: 2, label: 'Elegir' }, { id: 3, label: 'Árbol' }];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [state, setState] = useState<OnboardingState>({ step: 1, teamChoice: null, completed: false });

  useEffect(() => {
    (async () => {
      try {
        const [treesRes, subRes] = await Promise.all([
          api.get('/trees').catch(() => ({ data: [] })),
          api.get('/billing/subscription').catch(() => ({ data: { hasSubscription: false } })),
        ]);
        if (!(Array.isArray(treesRes.data) && treesRes.data.length > 0) && !(subRes.data?.hasSubscription && subRes.data?.status === 'ACTIVE')) {
          setNeedsOnboarding(true);
        } else { navigate('/', { replace: true }); }
      } catch { setNeedsOnboarding(true); }
      finally { setLoading(false); }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!needsOnboarding) return;
    (async () => {
      try { const subRes = await api.get('/billing/subscription'); if (subRes.data?.hasSubscription && subRes.data?.status === 'ACTIVE') setState((s) => ({ ...s, step: 2 })); }
      catch { /* step 1 */ }
    })();
  }, [needsOnboarding]);

  const nextStep = () => setState((s) => ({ ...s, step: s.step + 1 }));
  const skipStep = () => setState((s) => ({ ...s, step: s.step + 1 }));
  const handleTeamChoice = (choice: 'create' | 'join') => setState((s) => ({ ...s, teamChoice: choice, step: 3 }));

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><p style={{ color: 'var(--text-secondary)' }}>Preparando tu experiencia…</p></div>;
  if (!needsOnboarding && !loading) return null;

  if (state.completed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--grad-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 0 30px rgba(16,185,129,0.4)' }}><Sparkles size={36} color="white" /></div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>¡Todo listo!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 340 }}>Tu cuenta está configurada. Redirigiendo al dashboard…</p>
      </div>
    );
  }

  const progressPct = Math.round((state.step / STEPS.length) * 100);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: isMobile ? '1rem' : '2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Bienvenido, {user?.username || 'Usuario'}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Configura tu cuenta en 3 pasos</p>
      </div>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.1)', marginBottom: '0.75rem', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--grad-primary)', borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {STEPS.map((s) => {
            const isActive = s.id === state.step, isDone = s.id < state.step;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: isActive ? 600 : 400, color: isDone ? 'var(--accent-success)' : isActive ? 'var(--text-primary)' : 'var(--text-secondary)', opacity: isActive || isDone ? 1 : 0.5 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, background: isDone ? 'var(--accent-success)' : isActive ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)', color: isDone || isActive ? 'white' : 'var(--text-secondary)' }}>{isDone ? <Check size={12} /> : s.id}</span>
                <span style={{ display: isMobile ? 'none' : 'inline' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {state.step === 1 && <StepSubscription onNext={nextStep} onSkip={skipStep} />}
        {state.step === 2 && <StepTeamChoice onChoose={handleTeamChoice} onSkip={skipStep} />}
        {state.step === 3 && state.teamChoice === 'create' && <StepCreateTree onSkip={skipStep} />}
        {state.step === 3 && state.teamChoice === 'join' && <StepJoinTree onSkip={skipStep} />}
        {state.step === 3 && !state.teamChoice && (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>¿Qué te gustaría hacer?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => handleTeamChoice('create')}>Crear un árbol</button>
              <button className="btn btn-outline" onClick={() => handleTeamChoice('join')}>Unirme a uno</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
