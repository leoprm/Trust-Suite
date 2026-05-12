import { motion } from 'framer-motion';
import { Zap, TrendingUp, Target, CheckCircle } from 'lucide-react';
import { formatCompactCurrency } from '../lib/format';

export interface PathStep {
  skillTag: string;
  difficulty: number;
  avgIncome: number;
  estimatedTasks: number;
  percentile: number;
  hasSkill: boolean;
}

interface SkillNodeProps {
  step: PathStep;
  index: number;
  isLast: boolean;
}

const difficultyColor = (d: number): string => {
  if (d <= 3) return 'var(--accent-success)';
  if (d <= 6) return 'var(--accent-warning)';
  return 'var(--accent-danger)';
};

export default function SkillNode({ step, index, isLast }: SkillNodeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.35, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 160,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Connector line */}
      {!isLast && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 'calc(50% + 20px)',
            width: 'calc(100% - 40px)',
            height: 2,
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
            zIndex: 0,
          }}
        />
      )}

      {/* Node circle */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `2px solid ${step.hasSkill ? 'var(--accent-success)' : 'var(--accent-primary)'}`,
          background: step.hasSkill
            ? 'rgba(16, 185, 129, 0.15)'
            : 'rgba(59, 130, 246, 0.12)',
          zIndex: 1,
          position: 'relative',
        }}
      >
        {step.hasSkill ? (
          <CheckCircle size={20} color="var(--accent-success)" />
        ) : (
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            {index + 1}
          </span>
        )}
      </div>

      {/* Skill tag */}
      <span
        style={{
          marginTop: 8,
          fontWeight: 700,
          fontSize: '0.85rem',
          color: 'var(--text-primary)',
          textAlign: 'center',
          maxWidth: 140,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        #{step.skillTag}
      </span>

      {/* Badge "Ya lo tienes" */}
      {step.hasSkill && (
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: 'var(--accent-success)',
            background: 'rgba(16, 185, 129, 0.12)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            marginTop: 4,
          }}
        >
          Ya lo tienes
        </span>
      )}

      {/* Stats */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: difficultyColor(step.difficulty) }}>
          <Zap size={11} />
          <span>Dif {step.difficulty.toFixed(1)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-accent)' }}>
          <TrendingUp size={11} />
          <span>{formatCompactCurrency(step.avgIncome)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <Target size={11} />
          <span>P{step.percentile}</span>
        </div>

        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
          ~{step.estimatedTasks} tareas
        </div>
      </div>
    </motion.div>
  );
}
