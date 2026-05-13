import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useTreeStore } from '../../store/treeStore';
import api from '../../lib/api';
import StepSubscription from './StepSubscription';
import StepTeamChoice from './StepTeamChoice';
import StepCreateNeed from './StepCreateNeed';
import StepVoteNeed from './StepVoteNeed';
import { Check, Sparkles } from 'lucide-react';

type TeamChoice = 'create' | 'join' | null;

interface OnboardingState {
  step: number;
  teamChoice: TeamChoice;
  createdTreeId: string | null;
  joinedTreeId: string | null;
  completed: boolean;
}

const STEPS = [
  { id: 1, label: 'Suscripción' },
  { id: 2, label: 'Equipo' },
  { id: 3, label: 'Necesidad' },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [state, setState] = useState<OnboardingState>({
    step: 1,
    teamChoice: null,
    createdTreeId: null,
    joinedTreeId: null,
    completed: false,
  });

  // Detect if user needs onboarding
  useEffect(() => {
    (async () => {
      try {
        const [treesRes, subRes] = await Promise.all([
          api.get('/trees').catch(() => ({ data: [] })),
          api.get('/billing/subscription').catch(() => ({ data: { hasSubscription: false } })),
        ]);
        const hasTrees = Array.isArray(treesRes.data) && treesRes.data.length > 0;
        const hasSub = subRes.data?.hasSubscription && subRes.data?.status === 'ACTIVE';

        if (!hasTrees && !hasSub) {
          setNeedsOnboarding(true);
        } else {
          // Already set up, skip to dashboard
          navigate('/dashboard', { replace: true });
        }
      } catch {
        setNeedsOnboarding(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // Start at step 2 if user already has subscription
  useEffect(() => {
    if (!needsOnboarding) return;
    (async () => {
      try {
        const subRes = await api.get('/billing/subscription');
        if (subRes.data?.hasSubscription && subRes.data?.status === 'ACTIVE') {
          setState((s) => ({ ...s, step: 2 }));
        }
      } catch { /* continue at step 1 */ }
    })();
  }, [needsOnboarding]);

  const nextStep = () => setState((s) => ({ ...s, step: s.step + 1 }));
  const skipStep = () => setState((s) => ({ ...s, step: s.step + 1 }));

  const handleTeamChoice = (choice: TeamChoice, treeId?: string) => {
    setState((s) => ({
      ...s,
      teamChoice: choice,
      createdTreeId: choice === 'create' && treeId ? treeId : s.createdTreeId,
      joinedTreeId: choice === 'join' && treeId ? treeId : s.joinedTreeId,
      step: 3,
    }));
  };

  const handleComplete = () => {
    setState((s) => ({ ...s, completed: true }));
    setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Preparando tu experiencia…</p>
      </div>
    );
  }

  if (!needsOnboarding && !loading) {
    return null;
  }

  if (state.completed) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: '2rem', textAlign: 'center',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--grad-success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '1.5rem', boxShadow: '0 0 30px rgba(16,185,129,0.4)',
        }}>
          <Sparkles size={36} color="white" />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          ¡Todo listo!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 340 }}>
          Tu cuenta está configurada. Redirigiendo al dashboard…
        </p>
      </div>
    );
  }

  const progressPct = Math.round((state.step / STEPS.length) * 100);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div style={{
      maxWidth: 540, margin: '0 auto', padding: isMobile ? '1rem' : '2rem',
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Bienvenido, {user?.username || 'Usuario'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Configura tu cuenta en 3 pasos
        </p>
      </div>

      {/* Stepper */}
      <div style={{ marginBottom: '2rem' }}>
        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.1)',
          marginBottom: '0.75rem', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progressPct}%`,
            background: 'var(--grad-primary)',
            borderRadius: 4, transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Step labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {STEPS.map((s) => {
            const isActive = s.id === state.step;
            const isDone = s.id < state.step;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.8rem', fontWeight: isActive ? 600 : 400,
                  color: isDone ? 'var(--accent-success)' : isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  opacity: isActive || isDone ? 1 : 0.5,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700,
                  background: isDone ? 'var(--accent-success)' : isActive ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                  color: isDone || isActive ? 'white' : 'var(--text-secondary)',
                }}>
                  {isDone ? <Check size={12} /> : s.id}
                </span>
                <span style={{ display: isMobile ? 'none' : 'inline' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div style={{ flex: 1 }}>
        {state.step === 1 && (
          <StepSubscription
            onNext={nextStep}
            onSkip={skipStep}
          />
        )}

        {state.step === 2 && (
          <StepTeamChoice
            onChoose={handleTeamChoice}
            onSkip={skipStep}
          />
        )}

        {state.step === 3 && state.teamChoice === 'create' && (
          <StepCreateNeed
            treeId={state.createdTreeId!}
            onComplete={handleComplete}
            onSkip={handleComplete}
          />
        )}

        {state.step === 3 && state.teamChoice === 'join' && (
          <StepVoteNeed
            treeId={state.joinedTreeId!}
            onComplete={handleComplete}
            onSkip={handleComplete}
          />
        )}

        {/* Fallback: if step 3 but no choice made, show combined */}
        {state.step === 3 && !state.teamChoice && (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>¿Qué te gustaría hacer?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => handleTeamChoice('create')}>
                Crear un equipo
              </button>
              <button className="btn btn-outline" onClick={() => handleTeamChoice('join')}>
                Unirme a uno
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
