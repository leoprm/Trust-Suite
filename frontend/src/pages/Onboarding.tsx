import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { Check, ArrowRight, TreePine, Lightbulb } from 'lucide-react';
import './Onboarding.css';

const STEPS = [
  { id: 'subscribe', title: 'Subscribe to a Tree', description: 'Find and join a tree that matches your interests.', icon: TreePine },
  { id: 'need', title: 'Propose a Need', description: 'Identify something your tree community should solve.', icon: Lightbulb },
  { id: 'complete', title: "You're All Set", description: 'Start collaborating with your tree community.', icon: Check },
];

function Onboarding() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [joinCode, setJoinCode] = useState('');
  const [needTitle, setNeedTitle] = useState('');
  const [needDescription, setNeedDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) return <Navigate to="/login" replace />;

  const isLastStep = step === STEPS.length - 1;

  const handleNext = async () => {
    if (step === 0) {
      if (!joinCode.trim()) { setError('Enter an invite code to join a tree'); return; }
      setLoading(true); setError('');
      try { await api.post('/trees/join', { code: joinCode.trim() }); setStep(1); }
      catch (err: any) { setError(err.response?.data?.message ?? 'Failed to join tree'); }
      finally { setLoading(false); }
    } else if (step === 1) {
      if (needTitle.trim()) {
        setLoading(true); setError('');
        try { await api.post('/needs', { title: needTitle.trim(), description: needDescription.trim() }); }
        catch (err: any) { setError(err.response?.data?.message ?? 'Failed to create need'); setLoading(false); return; }
        finally { setLoading(false); }
      }
      setStep(2);
    } else { navigate('/'); }
  };

  const skip = () => setStep(2);
  const StepIcon = STEPS[step].icon;

  return (
    <div className="onboarding">
      <div className="onboarding-card glass-panel">
        <div className="onboarding-progress">
          {STEPS.map((s, i) => <div key={s.id} className={`onboarding-dot ${i <= step ? 'active' : ''}`} />)}
        </div>
        <div className="onboarding-step-icon"><StepIcon size={32} /></div>
        <h1 className="onboarding-title">{STEPS[step].title}</h1>
        <p className="onboarding-desc">{STEPS[step].description}</p>
        {error && <div className="onboarding-error">{error}</div>}
        {step === 0 && (
          <div className="input-group">
            <label>Tree Invite Code</label>
            <input className="input-field" placeholder="e.g. abc123" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} autoFocus />
          </div>
        )}
        {step === 1 && (
          <>
            <div className="input-group">
              <label>Need Title (optional)</label>
              <input className="input-field" placeholder="e.g. Improve community safety" value={needTitle} onChange={(e) => setNeedTitle(e.target.value)} autoFocus />
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea className="input-field" placeholder="Describe the need in a few words..." value={needDescription} onChange={(e) => setNeedDescription(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
            </div>
          </>
        )}
        {step === 2 && (
          <div className="onboarding-complete">
            <div className="onboarding-check">✓</div>
            <p>Your profile is ready. Start exploring your tree and collaborating with the community.</p>
          </div>
        )}
        <div className="onboarding-actions">
          {step === 1 && !needTitle.trim() && <button className="btn btn-outline" onClick={skip}>Skip</button>}
          <button className="btn btn-primary" onClick={handleNext} disabled={loading}>
            {loading ? 'Please wait...' : isLastStep ? 'Go to App' : 'Continue'}
            {!loading && !isLastStep && <ArrowRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
