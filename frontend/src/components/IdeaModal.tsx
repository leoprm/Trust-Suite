import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, X, ChevronDown, ChevronUp, Users, DollarSign, Package, Wrench, GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTreeStore } from '../store/treeStore';

interface IdeaModalProps {
  needTitle: string;
  onSubmit: (title: string, description: string, resources: ResourceData) => Promise<void>;
  onClose: () => void;
}

interface ResourceData {
  requiredPeople?: number;
  requiredSkills?: string[];
  estimatedMaterials?: string;
  estimatedFiatCost?: number;
  proposedPhases?: string[];
}

export default function IdeaModal({ needTitle, onSubmit, onClose }: IdeaModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResources, setShowResources] = useState(false);
  const [requiredPeople, setRequiredPeople] = useState<string>('');
  const [skillInput, setSkillInput] = useState('');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [estimatedMaterials, setEstimatedMaterials] = useState('');
  const [estimatedFiatCost, setEstimatedFiatCost] = useState<string>('');
  const [proposedPhases, setProposedPhases] = useState<string[]>(['INVESTIGATION']);
  const titleRef = useRef<HTMLInputElement>(null);

  const settings = useTreeStore(state => state.settings);
  const PHASES = settings.phases;

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const addSkill = () => {
    const skill = skillInput.trim();
    if (skill && !requiredSkills.includes(skill)) setRequiredSkills(prev => [...prev, skill]);
    setSkillInput('');
  };

  const removeSkill = (skill: string) => setRequiredSkills(prev => prev.filter(s => s !== skill));

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setError('');
    setLoading(true);
    try {
      const resources: ResourceData = {};
      if (requiredPeople) resources.requiredPeople = Number(requiredPeople);
      if (requiredSkills.length > 0) resources.requiredSkills = requiredSkills;
      if (estimatedMaterials.trim()) resources.estimatedMaterials = estimatedMaterials.trim();
      if (estimatedFiatCost) resources.estimatedFiatCost = Number(estimatedFiatCost);
      if (proposedPhases.length > 0) resources.proposedPhases = proposedPhases;
      
      await onSubmit(title.trim(), description.trim(), resources);
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || t('idea_modal.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) handleSubmit();
  };

  return ReactDOM.createPortal(
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
          overflowY: 'auto',
        }}
      >
        {/* Modal card */}
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="glass-panel"
          style={{ width: '100%', maxWidth: '540px', padding: '2rem', position: 'relative' }}
        >
          {/* Close */}
          <button onClick={onClose} className="btn btn-outline"
            style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}>
            <X size={16} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-2" style={{ marginBottom: '0.4rem' }}>
            <Lightbulb size={20} stroke="var(--accent-warning)" />
            <h2 className="text-gradient" style={{ margin: 0, fontSize: '1.3rem' }}>{t('idea_modal.title')}</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.75rem' }}>
            {t('idea_modal.need_label')}:{' '}
            <span style={{ color: 'var(--text-accent)', fontWeight: 500 }}>{needTitle}</span>
          </p>

          {/* Form */}
          <div onKeyDown={handleKeyDown}>
            <div className="input-group">
              <label>{t('idea_modal.title_label')}</label>
              <input ref={titleRef} className="input-field" value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('idea_modal.title_placeholder')} maxLength={120} />
            </div>

            <div className="input-group">
              <label>{t('idea_modal.desc_label')}</label>
              <textarea className="input-field" style={{ minHeight: '100px', resize: 'vertical' }}
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder={t('idea_modal.desc_placeholder')} />
            </div>

            {/* Optional resources section */}
            <div style={{ marginBottom: '1.25rem' }}>
              <button type="button" onClick={() => setShowResources(v => !v)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500,
                  padding: '0.75rem 0 0.4rem 0', width: '100%',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                {showResources ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                {t('idea_modal.resources.toggle')}
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 400 }}>
                  {t('idea_modal.resources.optional')}
                </span>
              </button>

              <AnimatePresence>
                {showResources && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Proposed Phases */}
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <GitBranch size={13} /> Fases requeridas de la {settings.dictionary.branchName}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
                          {PHASES.map(phase => {
                            const isSelected = proposedPhases.includes(phase);
                            return (
                              <button
                                key={phase}
                                type="button"
                                onClick={() => {
                                  if (isSelected) setProposedPhases(p => p.filter(x => x !== phase));
                                  else setProposedPhases(p => [...p, phase]);
                                }}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  fontSize: '0.75rem',
                                  borderRadius: 'var(--radius-sm)',
                                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                  background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
                                  color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                  cursor: 'pointer'
                                }}
                              >
                                {t(`branches.phases.${phase}.name`, phase)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* People */}
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Users size={13} /> {t('idea_modal.resources.people_label')}
                        </label>
                        <input className="input-field" type="number" min={1} value={requiredPeople}
                          onChange={e => setRequiredPeople(e.target.value)}
                          placeholder={t('idea_modal.resources.people_placeholder')} />
                      </div>

                      {/* Skills */}
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Wrench size={13} /> {t('idea_modal.resources.skills_label')}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input className="input-field" style={{ flex: 1 }} value={skillInput}
                            onChange={e => setSkillInput(e.target.value)}
                            onKeyDown={handleSkillKeyDown}
                            placeholder={t('idea_modal.resources.skills_placeholder')} />
                          <button type="button" className="btn btn-outline" onClick={addSkill}
                            style={{ padding: '0.5rem 0.8rem', flexShrink: 0 }}>+</button>
                        </div>
                        {requiredSkills.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                            {requiredSkills.map(skill => (
                              <span key={skill} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                background: 'rgba(59,130,246,0.15)', color: 'var(--accent-primary)',
                                borderRadius: 'var(--radius-full)', padding: '0.2rem 0.6rem', fontSize: '0.8rem'
                              }}>
                                {skill}
                                <button type="button" onClick={() => removeSkill(skill)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', lineHeight: 1, padding: 0 }}>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Materials */}
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Package size={13} /> {t('idea_modal.resources.materials_label')}
                        </label>
                        <textarea className="input-field" style={{ minHeight: '70px', resize: 'vertical' }}
                          value={estimatedMaterials} onChange={e => setEstimatedMaterials(e.target.value)}
                          placeholder={t('idea_modal.resources.materials_placeholder')} />
                      </div>

                      {/* FIAT cost */}
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <DollarSign size={13} /> {t('idea_modal.resources.fiat_label')}
                        </label>
                        <input className="input-field" type="number" min={0} step="0.01"
                          value={estimatedFiatCost} onChange={e => setEstimatedFiatCost(e.target.value)}
                          placeholder={t('idea_modal.resources.fiat_placeholder')} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {error && (
              <p style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>
            )}

            <div className="flex gap-4" style={{ marginTop: '0.5rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
                {t('idea_modal.cancel_btn')}
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSubmit}
                disabled={loading || !title.trim() || !description.trim()}>
                <Lightbulb size={16} />
                {loading ? '...' : t('idea_modal.submit_btn')}
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.75rem', textAlign: 'center' }}>
              {t('idea_modal.hint')}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
