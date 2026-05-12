import SkillNode from './SkillNode';
import type { PathStep } from './SkillNode';

interface PathTimelineProps {
  steps: PathStep[];
}

export default function PathTimeline({ steps }: PathTimelineProps) {
  if (!steps.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: steps.length <= 3 ? 'center' : 'flex-start',
        gap: '2rem',
        padding: '1.5rem 1rem',
        overflowX: 'auto',
        overflowY: 'visible',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
      }}
      className="path-timeline-container"
    >
      {steps.map((step, i) => (
        <SkillNode
          key={`${step.skillTag}-${i}`}
          step={step}
          index={i}
          isLast={i === steps.length - 1}
        />
      ))}
    </div>
  );
}
