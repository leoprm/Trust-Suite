import { motion, AnimatePresence } from 'framer-motion';
import { GitMerge, Briefcase, DollarSign, Compass, ChevronRight } from 'lucide-react';
import PathTimeline from './PathTimeline';
import type { PathStep } from './SkillNode';
import { formatCompactCurrency } from '../lib/format';

export interface CareerPathData {
  path: PathStep[];
  totalHops: number;
  totalEstimatedTasks: number;
  totalExpectedIncome: number;
  alternatives?: CareerPathData[];
}

interface CareerPathResultProps {
  result: CareerPathData;
  onSelectAlternative?: (mode: string) => void;
}

const modeColors: Record<number, string> = {
  0: 'var(--accent-primary)',
  1: 'var(--accent-secondary)',
  2: 'var(--accent-success)',
};

export default function CareerPathResult({ result, onSelectAlternative }: CareerPathResultProps) {
  if (!result?.path?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
    >
      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: 'center',
        }}
      >
        <StatBadge
          icon={<GitMerge size={16} />}
          label="Saltos"
          value={result.totalHops}
          color="var(--accent-primary)"
        />
        <StatBadge
          icon={<Briefcase size={16} />}
          label="Tareas est."
          value={result.totalEstimatedTasks}
          color="var(--accent-warning)"
        />
        <StatBadge
          icon={<DollarSign size={16} />}
          label="Ingreso est."
          value={formatCompactCurrency(result.totalExpectedIncome)}
          color="var(--accent-success)"
        />
      </div>

      {/* Main path timeline */}
      <div className="glass-panel" style={{ padding: '1rem' }}>
        <div
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textAlign: 'center',
            marginBottom: '0.5rem',
          }}
        >
          RUTA ÓPTIMA
        </div>
        <PathTimeline steps={result.path} />
      </div>

      {/* Alternatives */}
      {result.alternatives && result.alternatives.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <Compass size={16} />
            Rutas alternativas
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {result.alternatives.map((alt, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${modeColors[i] || 'var(--border-color)'}`,
                  cursor: onSelectAlternative ? 'pointer' : 'default',
                }}
                onClick={() => onSelectAlternative?.(`alt-${i}`)}
              >
                {/* Skill path preview */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    flexWrap: 'wrap',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {alt.path.map((s, j) => (
                    <span key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: s.hasSkill
                            ? 'rgba(16,185,129,0.15)'
                            : 'rgba(255,255,255,0.06)',
                          color: s.hasSkill ? 'var(--accent-success)' : 'var(--text-secondary)',
                        }}
                      >
                        #{s.skillTag}
                      </span>
                      {j < alt.path.length - 1 && (
                        <ChevronRight size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      )}
                    </span>
                  ))}
                </div>

                {/* Mini stats */}
                <div
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  <span>{alt.totalHops} saltos</span>
                  <span>~{alt.totalEstimatedTasks} tareas</span>
                  <span style={{ color: 'var(--text-accent)' }}>
                    {formatCompactCurrency(alt.totalExpectedIncome)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* Mini stat badge */
function StatBadge({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border-color)',
      }}
    >
      <span style={{ color }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{value}</span>
      </div>
    </div>
  );
}
