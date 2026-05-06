import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Star, Users, CheckCircle, Clock, Award, ChevronRight } from 'lucide-react';
import api from '../lib/api';

const API_BASE = `http://${window.location.hostname}:3000`;

const TIER_BADGE: Record<string, { bg: string; border: string; text: string; label: string; glow?: boolean }> = {
  INTERNO:      { bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af', label: 'Interno' },
  ESPECIALISTA: { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e', label: 'Especialista' },
  ELITE:        { bg: 'rgba(234,179,8,0.12)',    border: 'rgba(234,179,8,0.35)',  text: '#eab308', label: 'Élite' },
  ELITE_DORADO: { bg: 'rgba(234,179,8,0.18)',    border: 'rgba(234,179,8,0.5)',   text: '#fbbf24', label: 'Élite Dorada', glow: true },
};

const TIER_DOT: Record<string, string> = {
  INTERNO: '#60a5fa',
  ESPECIALISTA: '#22c55e',
  ELITE_DORADO: '#fbbf24',
};

// ── Star helpers ────────────────────────────────────────────────────────────
const STAR_SIZE = 200;
const STAR_CX = STAR_SIZE / 2;
const STAR_CY = STAR_SIZE / 2;
const STAR_R = 70;
const STAR_MAX = 10;

function polarXY(angle: number, radius: number): [number, number] {
  const rad = (angle - 90) * (Math.PI / 180);
  return [STAR_CX + radius * Math.cos(rad), STAR_CY + radius * Math.sin(rad)];
}

function starPolygon(levels: number[], maxR: number): string {
  const step = 360 / levels.length;
  return levels.map((lv, i) => {
    const r = (lv / STAR_MAX) * maxR;
    const [x, y] = polarXY(i * step, r);
    return `${x},${y}`;
  }).join(' ');
}

export default function PublicProfile() {
  const { code } = useParams<{ code: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) return;
    api.get(`/users/public/${code}`)
      .then(({ data }) => setProfile(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.loader}>
        <div style={styles.pulse} />
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Cargando perfil…</span>
      </div>
    </div>
  );

  if (error || !profile) return (
    <div style={styles.page}>
      <div style={styles.errorCard}>
        <Shield size={40} color="rgba(255,255,255,0.15)" />
        <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Perfil no encontrado</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: 0 }}>
          Este perfil público no existe o no está habilitado.
        </p>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={styles.header}>
          <div style={styles.glowOrb} />
          {profile.profilePic ? (
            <img
              src={`${API_BASE}${profile.profilePic}`}
              alt={profile.username}
              style={styles.avatar}
            />
          ) : (
            <div style={styles.avatarFallback}>
              <Shield size={32} color="rgba(255,255,255,0.3)" />
            </div>
          )}
          <h1 style={styles.username}>{profile.username}</h1>
          <div style={styles.verifiedBadge}>
            <Shield size={12} color="#3b82f6" />
            <span style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 600 }}>
              Reputación Verificada en Trust Lite
            </span>
          </div>
        </div>

        {/* ── Estrella de Ejecución (Public — static, no interactivity) ─ */}
        {profile.skillStar && (() => {
          const { star, goldenAura, pretext } = profile.skillStar;
          const step = 360 / star.length;
          const polyFill = goldenAura ? 'rgba(251,191,36,0.14)' : 'rgba(59,130,246,0.12)';
          const polyStroke = goldenAura ? 'rgba(251,191,36,0.6)' : 'rgba(59,130,246,0.5)';

          return (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>
                <Star size={14} /> Estrella de Ejecución
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <svg width={STAR_SIZE} height={STAR_SIZE} viewBox={`0 0 ${STAR_SIZE} ${STAR_SIZE}`}>
                  <defs>
                    {goldenAura && (
                      <filter id="publicGoldenGlow" x="-50%" y="-50%" width="200%" height="200%">
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

                  {/* Grid rings */}
                  {[2.5, 5, 7.5, 10].map(lv => (
                    <polygon key={lv}
                      points={starPolygon(Array(star.length).fill(lv), STAR_R)}
                      fill="none"
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={lv === 5 ? 0.8 : 0.4}
                    />
                  ))}

                  {/* Axis lines */}
                  {star.map((_: any, i: number) => {
                    const [x, y] = polarXY(i * step, STAR_R);
                    return <line key={i} x1={STAR_CX} y1={STAR_CY} x2={x} y2={y}
                      stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />;
                  })}

                  {/* Filled polygon */}
                  <polygon
                    points={starPolygon(star.map((d: any) => d.level), STAR_R)}
                    fill={polyFill} stroke={polyStroke}
                    strokeWidth={1.5} strokeLinejoin="round"
                    filter={goldenAura ? 'url(#publicGoldenGlow)' : undefined}
                  />

                  {/* Golden aura ring animation */}
                  {goldenAura && (
                    <polygon
                      points={starPolygon(star.map((d: any) => d.level), STAR_R)}
                      fill="none" stroke="rgba(251,191,36,0.2)"
                      strokeWidth={4} strokeLinejoin="round"
                    >
                      <animate attributeName="stroke-opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
                    </polygon>
                  )}

                  {/* Vertex dots + labels */}
                  {star.map((d: any, i: number) => {
                    const r = (d.level / STAR_MAX) * STAR_R;
                    const [dx, dy] = polarXY(i * step, r);
                    const [lx, ly] = polarXY(i * step, STAR_R + 16);
                    const color = TIER_DOT[d.tier] || TIER_DOT.INTERNO;

                    return (
                      <g key={i}>
                        <circle cx={dx} cy={dy} r={3.5} fill={color}
                          stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
                        {d.tier === 'ELITE_DORADO' && (
                          <circle cx={dx} cy={dy} r={7} fill="none"
                            stroke="rgba(251,191,36,0.35)" strokeWidth={1}>
                            <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.7;0.15;0.7" dur="2s" repeatCount="indefinite" />
                          </circle>
                        )}
                        <text x={lx} y={ly}
                          textAnchor="middle" dominantBaseline="middle"
                          fill={color} fontSize={7.5} fontWeight={700}>
                          {d.skill.length > 12 ? d.skill.slice(0, 11) + '…' : d.skill}
                        </text>
                        <text x={lx} y={ly + 9}
                          textAnchor="middle" dominantBaseline="middle"
                          fill="rgba(255,255,255,0.3)" fontSize={6}>
                          {d.points > 0 ? `Nv ${d.level} · ${d.points}pts` : ''}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Pretext */}
                <div style={{
                  maxWidth: 280, textAlign: 'center',
                  fontSize: '0.62rem', fontStyle: 'italic',
                  color: goldenAura ? 'rgba(251,191,36,0.7)' : 'rgba(255,255,255,0.4)',
                  lineHeight: 1.4, padding: '0 0.5rem',
                }}>
                  {pretext}
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── Trees / Organizations ───────────────────────────────── */}
        {profile.trees.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <Users size={14} /> Árboles
            </h2>
            <div style={styles.treeGrid}>
              {profile.trees.map((t: any, i: number) => (
                <div key={i} style={styles.treeCard}>
                  <span style={{ fontSize: '1.4rem' }}>{t.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '0.5rem', marginTop: 2 }}>
                      <span>{t.population} miembros</span>
                      {t.level !== undefined && <span>Nivel {t.level}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Skills / Hashtags ───────────────────────────────────── */}
        {profile.skills.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <Star size={14} /> Especialidades
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {profile.skills.map((s: any, i: number) => {
                const badge = TIER_BADGE[s.tier] || TIER_BADGE.INTERNO;
                return (
                  <div key={i} style={{
                    ...styles.skillCard,
                    border: `1px solid ${badge.border}`,
                    ...(badge.glow ? { boxShadow: '0 0 20px rgba(234,179,8,0.15)' } : {}),
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: 3 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>{s.name}</span>
                        {s.isTopTier && (
                          <span style={{
                            fontSize: '0.55rem', padding: '1px 6px', borderRadius: 4,
                            background: 'rgba(234,179,8,0.15)', color: '#fbbf24', fontWeight: 700,
                            ...(badge.glow ? { animation: 'goldPulse 2s ease-in-out infinite' } : {}),
                          }}>
                            ✨ Top 20%
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)' }}>
                        {s.treeIcon} {s.treeName} · {s.completedTasks} tareas · Nivel {s.level}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.58rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`,
                    }}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Task History (Proof of Work) ────────────────────────── */}
        {profile.taskHistory.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <Award size={14} /> Proof of Work
            </h2>
            <div style={styles.timeline}>
              {profile.taskHistory.map((t: any, i: number) => (
                <div key={t.id} style={styles.taskCard}>
                  {/* Timeline connector */}
                  <div style={styles.timelineDot}>
                    <CheckCircle size={14} color="#22c55e" />
                    {i < profile.taskHistory.length - 1 && <div style={styles.timelineLine} />}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>{t.name}</span>
                      <span style={{
                        fontSize: '0.55rem', padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(59,130,246,0.1)', color: '#60a5fa', fontWeight: 600,
                      }}>
                        Dificultad {t.difficulty?.toFixed(1) || '—'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4 }}>
                      {t.branch && (
                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
                          #{t.branch}
                        </span>
                      )}
                      <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Clock size={10} />
                        {t.completedAt ? new Date(t.completedAt).toLocaleDateString('es-CL') : '—'}
                      </span>
                    </div>

                    {/* Audit seal */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      marginTop: 6, padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
                    }}>
                      <Shield size={10} color="#22c55e" />
                      <span style={{ fontSize: '0.55rem', color: '#22c55e', fontWeight: 600 }}>
                        Auditado por la Comunidad
                      </span>
                    </div>

                    {/* Evidence thumbnail */}
                    {t.evidence && (
                      <div style={{ marginTop: 8 }}>
                        <img
                          src={`${API_BASE}${t.evidence}`}
                          alt="Evidencia"
                          style={{
                            width: 120, height: 80, borderRadius: 8, objectFit: 'cover',
                            border: '1px solid rgba(255,255,255,0.06)',
                            opacity: 0.85,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA ─────────────────────────────────────────────────── */}
        <div style={styles.ctaSection}>
          <a
            href="/"
            style={styles.ctaButton}
          >
            Únete al Árbol de {profile.username} en Trust Lite
            <ChevronRight size={16} />
          </a>
          <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', margin: 0 }}>
            Gestión cooperativa con reputación verificable
          </p>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div style={styles.footer}>
          <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>
            Trust Lite · Perfil Público Verificado
          </span>
        </div>
      </div>

      {/* Gold pulse animation */}
      <style>{`
        @keyframes goldPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; text-shadow: 0 0 8px rgba(234,179,8,0.5); }
        }
      `}</style>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0a0a0f 0%, #0d1117 40%, #0a0a0f 100%)',
    display: 'flex', justifyContent: 'center',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    width: '100%', maxWidth: 520,
    display: 'flex', flexDirection: 'column', gap: '1.2rem',
  },
  loader: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '1rem', marginTop: '30vh',
  },
  pulse: {
    width: 48, height: 48, borderRadius: '50%',
    border: '2px solid rgba(59,130,246,0.3)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  errorCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem',
    marginTop: '25vh', textAlign: 'center',
  },
  header: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
    padding: '2rem 1.5rem',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.05)',
    backdropFilter: 'blur(20px)',
    position: 'relative', overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
    width: 200, height: 200, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  avatar: {
    width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
    border: '3px solid rgba(59,130,246,0.3)',
    boxShadow: '0 0 30px rgba(59,130,246,0.1)',
    position: 'relative', zIndex: 1,
  },
  avatarFallback: {
    width: 80, height: 80, borderRadius: '50%',
    background: 'rgba(255,255,255,0.04)', border: '3px solid rgba(255,255,255,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 1,
  },
  username: {
    margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#fff',
    letterSpacing: '-0.02em', position: 'relative', zIndex: 1,
  },
  verifiedBadge: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '4px 10px', borderRadius: 20,
    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
  },
  section: {
    padding: '1.2rem',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.05)',
    backdropFilter: 'blur(20px)',
  },
  sectionTitle: {
    margin: '0 0 0.8rem 0', fontSize: '0.75rem', fontWeight: 700,
    color: 'var(--text-secondary, rgba(255,255,255,0.5))',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    display: 'flex', alignItems: 'center', gap: '0.4rem',
  },
  treeGrid: {
    display: 'flex', flexDirection: 'column', gap: '0.35rem',
  },
  treeCard: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.6rem', borderRadius: 10,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)',
  },
  skillCard: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.6rem 0.7rem', borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
  },
  timeline: {
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  taskCard: {
    display: 'flex', gap: '0.6rem',
    padding: '0.7rem 0',
  },
  timelineDot: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    paddingTop: 2, position: 'relative',
  },
  timelineLine: {
    width: 2, flex: 1, minHeight: 20,
    background: 'rgba(34,197,94,0.15)',
    marginTop: 4,
  },
  ctaSection: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    padding: '1.5rem',
    background: 'rgba(59,130,246,0.04)',
    borderRadius: 16,
    border: '1px solid rgba(59,130,246,0.1)',
  },
  ctaButton: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.7rem 1.5rem', borderRadius: 12,
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#fff', fontWeight: 700, fontSize: '0.8rem',
    textDecoration: 'none',
    boxShadow: '0 4px 15px rgba(59,130,246,0.25)',
    transition: 'transform 0.15s',
  },
  footer: {
    display: 'flex', justifyContent: 'center', padding: '1rem 0',
  },
};
