import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import api from '../lib/api';

/**
 * Estrella de Ejecución — Hexagonal radar chart fed by the top 6 @Skills
 * from the user's last-year audited tasks.
 *
 * Features:
 *  • Scale 1-10 per axis
 *  • Blue polygon (standard) or Golden aura (≥3 ELITE_DORADO skills)
 *  • Interactive: tap a vertex → card with last 3 tasks for that skill
 *  • Pretext sentence below the star
 */

const TIER_DOT: Record<string, string> = {
  INTERNO: '#60a5fa',
  ESPECIALISTA: '#22c55e',
  ELITE_DORADO: '#fbbf24',
};

interface RecentTask {
  name: string;
  difficulty: number;
  completedAt: string;
}

interface SkillAxis {
  skill: string;
  points: number;
  tasks: number;
  level: number;       // 1-10
  percentile: number;
  tier: string;
  recentTasks: RecentTask[];
}

interface StarResponse {
  star: SkillAxis[];
  goldenAura: boolean;
  pretext: string;
}

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 78; // max radius
const MAX_LEVEL = 10;

function polarToXY(angle: number, radius: number): [number, number] {
  const rad = (angle - 90) * (Math.PI / 180);
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function buildPolygon(levels: number[], maxR: number): string {
  const step = 360 / levels.length;
  return levels
    .map((lv, i) => {
      const r = (lv / MAX_LEVEL) * maxR;
      const [x, y] = polarToXY(i * step, r);
      return `${x},${y}`;
    })
    .join(' ');
}

export default function SkillStarChart() {
  const [resp, setResp] = useState<StarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    api.get('/users/skill-star')
      .then(({ data }) => setResp(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !resp) return null;

  const { star, goldenAura, pretext } = resp;
  const hasPoints = star.some(d => d.points > 0);
  if (!hasPoints) return null;

  const step = 360 / star.length;
  const gridLevels = [2.5, 5, 7.5, 10];

  // Polygon colors
  const polyFill = goldenAura
    ? 'rgba(251,191,36,0.14)'
    : 'rgba(59,130,246,0.12)';
  const polyStroke = goldenAura
    ? 'rgba(251,191,36,0.6)'
    : 'rgba(59,130,246,0.5)';

  const selectedSkill = selected !== null ? star[selected] : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
      padding: '0.5rem 0',
    }}>
      {/* Title */}
      <span style={{
        fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-secondary)',
      }}>
        Estrella de Ejecución
      </span>

      {/* SVG Radar */}
      <div style={{ position: 'relative' }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            {/* Golden glow filter */}
            {goldenAura && (
              <filter id="goldenGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feFlood floodColor="#fbbf24" floodOpacity="0.25" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
          </defs>

          {/* Grid rings (at levels 2.5, 5, 7.5, 10) */}
          {gridLevels.map(lv => (
            <polygon
              key={lv}
              points={buildPolygon(Array(star.length).fill(lv), R)}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={lv === 5 ? 0.8 : 0.4}
            />
          ))}

          {/* Axis lines */}
          {star.map((_, i) => {
            const [x, y] = polarToXY(i * step, R);
            return (
              <line key={i} x1={CX} y1={CY} x2={x} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
            );
          })}

          {/* Level tick labels on first axis */}
          {[2, 4, 6, 8, 10].map(lv => {
            const [x, y] = polarToXY(0, (lv / MAX_LEVEL) * R);
            return (
              <text key={lv} x={x + 5} y={y + 1}
                fill="rgba(255,255,255,0.15)" fontSize={5.5} fontWeight={500}
              >
                {lv}
              </text>
            );
          })}

          {/* Filled polygon */}
          <polygon
            points={buildPolygon(star.map(d => d.level), R)}
            fill={polyFill}
            stroke={polyStroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            filter={goldenAura ? 'url(#goldenGlow)' : undefined}
          />

          {/* Golden outer aura ring */}
          {goldenAura && (
            <polygon
              points={buildPolygon(star.map(d => d.level), R)}
              fill="none"
              stroke="rgba(251,191,36,0.2)"
              strokeWidth={4}
              strokeLinejoin="round"
            >
              <animate attributeName="stroke-opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
            </polygon>
          )}

          {/* Vertex dots + labels */}
          {star.map((d, i) => {
            const r = (d.level / MAX_LEVEL) * R;
            const [dx, dy] = polarToXY(i * step, r);
            const [lx, ly] = polarToXY(i * step, R + 18);
            const color = TIER_DOT[d.tier] || TIER_DOT.INTERNO;
            const isActive = selected === i;

            return (
              <g key={i} style={{ cursor: d.points > 0 ? 'pointer' : 'default' }}
                onClick={() => d.points > 0 && setSelected(isActive ? null : i)}>

                {/* Tap-target (invisible larger circle) */}
                <circle cx={dx} cy={dy} r={12} fill="transparent" />

                {/* Dot */}
                <circle cx={dx} cy={dy} r={isActive ? 5 : 3.5}
                  fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />

                {d.tier === 'ELITE_DORADO' && (
                  <circle cx={dx} cy={dy} r={7} fill="none"
                    stroke="rgba(251,191,36,0.35)" strokeWidth={1}>
                    <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.7;0.15;0.7" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Skill label */}
                <text x={lx} y={ly}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={isActive ? '#fff' : color} fontSize={7.5} fontWeight={700}
                >
                  {d.skill.length > 12 ? d.skill.slice(0, 11) + '…' : d.skill}
                </text>

                {/* Level / points sub-label */}
                <text x={lx} y={ly + 9}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.3)" fontSize={6}
                >
                  {d.points > 0 ? `Nv ${d.level} · ${d.points}pts` : ''}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── Interactive skill card overlay ────────────────────────────── */}
        <AnimatePresence>
          {selectedSkill && selectedSkill.recentTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 6 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 185,
                background: 'rgba(15,18,28,0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '0.6rem',
                zIndex: 10,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700,
                  color: TIER_DOT[selectedSkill.tier] || '#60a5fa',
                }}>
                  @{selectedSkill.skill}
                </span>
                <X size={12} color="rgba(255,255,255,0.4)" style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setSelected(null); }} />
              </div>

              {/* Stats row */}
              <div style={{
                display: 'flex', gap: '0.5rem', marginBottom: '0.35rem',
                fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)',
              }}>
                <span>Nv {selectedSkill.level}/10</span>
                <span>{selectedSkill.tasks} tareas</span>
                <span>{selectedSkill.points} pts</span>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 -0.2rem 0.35rem' }} />

              {/* Last 3 tasks */}
              <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '0.25rem' }}>
                Últimas tareas
              </span>
              {selectedSkill.recentTasks.map((t, idx) => (
                <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.2rem 0',
                  borderBottom: idx < selectedSkill.recentTasks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </span>
                  <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    +{t.difficulty}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Pretext ──────────────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 260,
        textAlign: 'center',
        fontSize: '0.58rem',
        fontStyle: 'italic',
        color: goldenAura ? 'rgba(251,191,36,0.7)' : 'rgba(255,255,255,0.4)',
        lineHeight: 1.4,
        padding: '0 0.5rem',
      }}>
        {pretext}
      </div>
    </div>
  );
}
