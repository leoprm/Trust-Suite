import { Star } from 'lucide-react';

interface EstrellaDificultadProps {
  nota: number;
  size?: number;
  onClick?: () => void;
}

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#10b981', 2: '#10b981', 3: '#34d399',
  4: '#6ee7b7', 5: '#f59e0b', 6: '#fb923c',
  7: '#f97316', 8: '#ef4444', 9: '#dc2626', 10: '#991b1b'
};

export default function EstrellaDificultad({ nota, size = 40, onClick }: EstrellaDificultadProps) {
  // Normalize note to 1-10 range just in case
  const safeNota = Math.max(1, Math.min(10, Math.round(nota)));
  const color = DIFFICULTY_COLORS[safeNota] || '#f59e0b';

  return (
    <div 
      className={`difficulty-star-container ${onClick ? 'interactive' : ''}`}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
        transition: 'transform 0.2s ease-out',
        cursor: onClick ? 'pointer' : 'default'
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.15)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <Star 
        size={size} 
        fill={color} 
        stroke={color}
        strokeWidth={1}
        style={{
          filter: safeNota >= 8 ? `drop-shadow(0 0 8px ${color}66)` : 'none'
        }}
      />
      <span 
        style={{
          position: 'absolute',
          top: '52%', // Slight adjustment for optical centering in the star
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#000000',
          fontWeight: 800,
          fontSize: size * 0.35,
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: 1
        }}
      >
        {safeNota}
      </span>
    </div>
  );
}
