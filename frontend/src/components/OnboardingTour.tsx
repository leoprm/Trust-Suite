import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  X,
  TreePine,
  Users,
  TrendingUp,
  Wallet,
} from 'lucide-react';

const STORAGE_KEY = 'onboarding_completed';

interface TourStep {
  targetAttr: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  navigateTo?: string;
}

const STEPS: TourStep[] = [
  {
    targetAttr: 'tour-new-tree',
    title: 'Crea tu primer Árbol',
    description: 'Cada Tree representa un gremio, empresa o comunidad. Haz clic en + para crear el tuyo y empezar a medir tu Trust.',
    icon: <TreePine size={24} />,
  },
  {
    targetAttr: 'tour-people',
    title: 'Invita miembros',
    description: 'En la sección Personas puedes invitar colaboradores y ver quién ya forma parte de tu red.',
    icon: <Users size={24} />,
    navigateTo: '/people',
  },
  {
    targetAttr: 'tour-metrics',
    title: 'Mide tu impacto',
    description: 'El dashboard financiero muestra ingresos, gastos, inversiones y saldo neto externo de tu red completa.',
    icon: <TrendingUp size={24} />,
  },
  {
    targetAttr: 'tour-ebitda',
    title: 'Recibe financiamiento',
    description: 'El EBITDA externo y el porcentaje de inversión muestran la salud financiera de tus Trees. Úsalos para atraer financiamiento real.',
    icon: <Wallet size={24} />,
  },
];

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

type TooltipPosition = {
  top: number;
  left: number;
  width: number;
  arrow: 'top' | 'bottom' | 'left' | 'right';
};

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function computeTooltip(
  targetRect: DOMRect,
  isMobile: boolean,
): TooltipPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW = isMobile ? Math.min(vw * 0.88, 360) : 380;
  const tooltipH = isMobile ? 200 : 220;
  const gap = 16;
  const margin = isMobile ? 12 : 24;

  let top = targetRect.bottom + gap;
  let left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
  let arrow: TooltipPosition['arrow'] = 'top';

  if (left < margin) left = margin;
  if (left + tooltipW > vw - margin) left = vw - tooltipW - margin;

  if (top + tooltipH > vh - margin) {
    top = targetRect.top - tooltipH - gap;
    arrow = 'bottom';
  }

  if (top < margin) {
    top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
    left = targetRect.right + gap;
    arrow = 'left';

    if (left + tooltipW > vw - margin) {
      left = targetRect.left - tooltipW - gap;
      arrow = 'right';
    }

    if (left < margin) left = margin;
    if (left + tooltipW > vw - margin) left = vw - tooltipW - margin;
    if (top < margin) top = margin;
    if (top + tooltipH > vh - margin) top = vh - tooltipH - margin;
  }

  return { top, left, width: tooltipW, arrow };
}

export function isOnboardingCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function markOnboardingCompleted(): void {
  localStorage.setItem(STORAGE_KEY, 'true');
}

export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export default function OnboardingTour({ isOpen, onClose, isMobile }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const [targetVisible, setTargetVisible] = useState(true);
  const targetRef = useRef<HTMLElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  const findAndPosition = useCallback(
    (stepIndex: number) => {
      const attr = STEPS[stepIndex]?.targetAttr;
      if (!attr) return;

      const el = document.querySelector(`[data-tour="${attr}"]`) as HTMLElement | null;
      targetRef.current = el;

      if (!el) {
        setTargetVisible(false);
        setTooltipPos(null);
        setHighlightRect(null);
        return;
      }

      setTargetVisible(true);
      const rect = el.getBoundingClientRect();
      setTooltipPos(computeTooltip(rect, Boolean(isMobile)));
      setHighlightRect({
        top: rect.top - 5,
        left: rect.left - 5,
        width: rect.width + 10,
        height: rect.height + 10,
      });
    },
    [isMobile],
  );

  // Position on step change, resize, or scroll
  useEffect(() => {
    if (!isOpen) return;

    const reposition = () => {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => findAndPosition(step), 50);
    };

    findAndPosition(step);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true });

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition);
      clearTimeout(debounceTimer.current);
    };
  }, [isOpen, step, findAndPosition]);

  // Scroll target into view if off-screen
  useEffect(() => {
    if (!isOpen || !targetRef.current) return;
    const rect = targetRef.current.getBoundingClientRect();
    const margin = 120;
    if (
      rect.top < margin ||
      rect.bottom > window.innerHeight - margin ||
      rect.left < margin ||
      rect.right > window.innerWidth - margin
    ) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isOpen, step, tooltipPos]);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  };

  const goPrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const finish = () => {
    markOnboardingCompleted();
    onClose();
  };

  const skip = () => {
    markOnboardingCompleted();
    onClose();
  };

  if (!isOpen) return null;

  const current = STEPS[step];
  const pos = tooltipPos;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) skip();
        }}
      >
        {/* Highlight ring */}
        {highlightRect && targetVisible && (
          <div
            style={{
              position: 'fixed',
              top: highlightRect.top,
              left: highlightRect.left,
              width: highlightRect.width,
              height: highlightRect.height,
              borderRadius: '12px',
              border: '2px solid var(--accent-primary)',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.4), 0 0 60px rgba(59, 130, 246, 0.15)',
              pointerEvents: 'none',
              zIndex: 10001,
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Tooltip */}
        {pos && targetVisible && (
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 10002,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: isMobile ? '1.25rem' : '1.5rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Arrow */}
            <div
              style={{
                position: 'absolute',
                width: 0,
                height: 0,
                ...(pos.arrow === 'top'
                  ? {
                      top: '-8px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                      borderBottom: '8px solid var(--bg-secondary)',
                    }
                  : pos.arrow === 'bottom'
                  ? {
                      bottom: '-8px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                      borderTop: '8px solid var(--bg-secondary)',
                    }
                  : pos.arrow === 'left'
                  ? {
                      left: '-8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      borderTop: '8px solid transparent',
                      borderBottom: '8px solid transparent',
                      borderRight: '8px solid var(--bg-secondary)',
                    }
                  : {
                      right: '-8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      borderTop: '8px solid transparent',
                      borderBottom: '8px solid transparent',
                      borderLeft: '8px solid var(--bg-secondary)',
                    }),
              }}
            />

            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: 'var(--accent-primary)' }}>{current.icon}</span>
                <h3 style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: 700 }}>
                  {current.title}
                </h3>
              </div>
              <button
                onClick={skip}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Description */}
            <p
              style={{
                margin: 0,
                color: 'var(--text-secondary)',
                fontSize: isMobile ? '0.8rem' : '0.9rem',
                lineHeight: 1.55,
              }}
            >
              {current.description}
            </p>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '0.25rem',
              }}
            >
              <div style={{ display: 'flex', gap: '6px' }}>
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: i === step ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    marginRight: '0.25rem',
                  }}
                >
                  {step + 1} / {STEPS.length}
                </span>

                {step > 0 && (
                  <button
                    onClick={goPrev}
                    className="btn btn-outline"
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                )}

                <button
                  onClick={goNext}
                  className="btn btn-primary"
                  style={{
                    padding: '0.4rem 0.9rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  {step === STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
                  {step < STEPS.length - 1 && <ChevronRight size={16} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation fallback when target not visible */}
        {!targetVisible && STEPS[step]?.navigateTo && (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10002,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem',
              textAlign: 'center',
              maxWidth: '380px',
              width: '90%',
            }}
          >
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Vamos a la sección donde puedes {current.title.toLowerCase()}.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                navigate(STEPS[step].navigateTo!);
              }}
            >
              Ir a {current.title}
            </button>
            <button
              onClick={skip}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                marginTop: '0.75rem',
                fontSize: '0.8rem',
                display: 'block',
                width: '100%',
              }}
            >
              Omitir tour
            </button>
          </div>
        )}

        {/* Fallback for step 4 when EBITDA data not available (global dashboard) */}
        {!targetVisible && !STEPS[step]?.navigateTo && (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10002,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem',
              textAlign: 'center',
              maxWidth: '380px',
              width: '90%',
            }}
          >
            <div style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>{current.icon}</div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>{current.title}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              {current.description}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              {step > 0 && (
                <button onClick={goPrev} className="btn btn-outline" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>
                  <ChevronLeft size={16} /> Anterior
                </button>
              )}
              <button onClick={goNext} className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>
                {step === STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
                {step < STEPS.length - 1 && <ChevronRight size={16} />}
              </button>
            </div>
            <button
              onClick={skip}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                marginTop: '0.75rem',
                fontSize: '0.8rem',
                display: 'block',
                width: '100%',
              }}
            >
              Omitir tour
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
