import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, TrendingUp, Users, Star, Smile,
  TreePine, BarChart3, HandCoins,
  ArrowRight, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface PublicMetrics {
  totalTrees: number;
  totalMembers: number;
  totalFiatVolume: number;
  avgSatisfaction: number;
  topTrees: Array<{
    id: string;
    name: string;
    sector: string;
    memberCount: number;
    monthlyProfit: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Compact CLP: $2,8 M  /  $540 K  */
function fmtClp(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}\u202fM`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}\u202fK`;
  return `$${n}`;
}

/** Animate a number from 0 to target */
function useCountUp(target: number, duration = 1200): number {
  const [val, setVal] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      setVal(Math.round(progress * (2 - progress) * target));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return val;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function MetricCard({
  icon: Icon, label, value, suffix = '', loading, isCurrency,
}: {
  icon: React.ElementType; label: string; value: number | null;
  suffix?: string; loading: boolean; isCurrency?: boolean;
}) {
  const animated = useCountUp(value ?? 0);
  const display = loading
    ? null
    : value == null
      ? '---'
      : isCurrency
        ? fmtClp(animated)
        : `${animated}${suffix}`;

  return (
    <div
      className="glass-panel"
      style={{
        flex: '1 1 220px',
        minWidth: 180,
        padding: '1.5rem',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {loading ? (
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
      ) : (
        <Icon size={28} style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
      )}
      <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em', minHeight: '2.2rem' }}>
        {loading ? (
          <div style={{ width: '60%', height: '1.6rem', background: 'rgba(255,255,255,0.06)', borderRadius: 8, margin: '0 auto' }} />
        ) : (
          display
        )}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
        {label}
      </div>
    </div>
  );
}

function HowStep({ icon: Icon, step, title, desc }: { icon: React.ElementType; step: number; title: string; desc: string }) {
  return (
    <div style={{ textAlign: 'center', flex: '1 1 250px', minWidth: 200 }}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 1rem',
        borderRadius: 'var(--radius-full)',
        background: 'rgba(59,130,246,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <Icon size={28} style={{ color: 'var(--accent-primary)' }} />
        <span style={{
          position: 'absolute', top: -6, right: -6,
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--grad-primary)',
          fontSize: '0.7rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{step}</span>
      </div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/public/metrics');
      setMetrics(res.data);
      setError(false);
    } catch {
      setError(true);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  /* ---- Metaballs background ---- */
  const metaballStyle = `
    @keyframes float1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-30px) scale(1.08); } 66% { transform: translate(-20px,20px) scale(0.95); } }
    @keyframes float2 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-40px,20px) scale(1.1); } 66% { transform: translate(25px,-25px) scale(0.92); } }
    @keyframes float3 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(20px,40px) scale(1.06); } 66% { transform: translate(-35px,-15px) scale(0.97); } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.6s ease-out both; }
    .fade-in-1 { animation-delay: 0.1s; }
    .fade-in-2 { animation-delay: 0.2s; }
    .fade-in-3 { animation-delay: 0.3s; }
    .fade-in-4 { animation-delay: 0.4s; }
  `;

  return (
    <>
      <style>{metaballStyle}</style>

      <div style={{
        position: 'fixed', inset: 0, overflowY: 'auto', overflowX: 'hidden',
        background: 'var(--bg-primary)',
      }}>
        {/*============= METABALLS BG =============*/}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '-10%', left: '10%',
            width: '40vw', height: '40vw', maxWidth: 600, maxHeight: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float1 12s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', top: '20%', right: '5%',
            width: '35vw', height: '35vw', maxWidth: 500, maxHeight: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float2 15s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', bottom: '0%', left: '0%',
            width: '50vw', height: '50vw', maxWidth: 700, maxHeight: 700,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float3 18s ease-in-out infinite',
          }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/*============= HEADER =============*/}
          <header style={{
            position: 'sticky', top: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 2rem',
            background: 'rgba(10,10,15,0.72)', backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Shield size={26} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Trust
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {isAuthenticated ? (
                <button
                  onClick={() => navigate('/')}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  Ir al Dashboard
                  <ArrowRight size={16} />
                </button>
              ) : (
                <>
                  <button onClick={() => navigate('/login')} className="btn btn-outline" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
                    Iniciar sesión
                  </button>
                  <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
                    Comenzar
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
            </div>
          </header>

          {/*============= HERO =============*/}
          <section style={{
            maxWidth: 'var(--max-width)', margin: '0 auto',
            padding: 'clamp(3rem, 8vh, 6rem) 2rem 3rem', textAlign: 'center',
          }}>
            <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
              <h1 style={{
                fontSize: 'clamp(2rem, 5vw, 3.4rem)', fontWeight: 700,
                lineHeight: 1.12, marginBottom: '1.25rem', letterSpacing: '-0.03em',
              }}>
                Confianza que
                <br />
                <span className="text-gradient">Transforma</span>
              </h1>
              <p style={{
                fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.7,
                maxWidth: 540, margin: '0 auto 2.5rem',
              }}>
                Un sistema operativo para organizaciones que quieren medir su impacto real.
                Crea tu árbol de confianza, evalúa necesidades colectivas y recibe financiamiento basado en evidencia — todo en un ecosistema descentralizado.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {isAuthenticated ? (
                  <button onClick={() => navigate('/')} className="btn btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                    Ir al Dashboard
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <>
                    <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                      Comenzar
                      <ArrowRight size={18} />
                    </button>
                    <button onClick={() => navigate('/login')} className="btn btn-outline" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                      Crear cuenta gratis
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/*============= MÉTRICAS EN VIVO =============*/}
          <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                El ecosistema en números
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Datos en tiempo real de la red Trust
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div className="fade-in fade-in-1" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={TreePine} label="Árboles activos" value={metrics?.totalTrees ?? null} loading={loading} />
              </div>
              <div className="fade-in fade-in-2" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={Users} label="Miembros" value={metrics?.totalMembers ?? null} loading={loading} />
              </div>
              <div className="fade-in fade-in-3" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={TrendingUp} label="Volumen FIAT" value={metrics?.totalFiatVolume ?? null} loading={loading} isCurrency />
              </div>
              <div className="fade-in fade-in-4" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={Smile} label="Satisfacción" value={metrics?.avgSatisfaction ?? null} suffix="%" loading={loading} />
              </div>
            </div>

            {error && (
              <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Las métricas no están disponibles en este momento. Se mostrarán cuando el servicio se restablezca.
              </p>
            )}
          </section>

          {/*============= CÓMO FUNCIONA =============*/}
          <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '2rem 2rem 5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Cómo funciona
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Tres pasos para transformar la confianza en acción
              </p>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div className="fade-in fade-in-1">
                <HowStep
                  icon={TreePine} step={1}
                  title="Crea tu árbol"
                  desc="Define tu organización como un árbol de confianza. Invita miembros, establece capacidades y estructura tu gobernanza."
                />
              </div>
              <div className="fade-in fade-in-2">
                <HowStep
                  icon={BarChart3} step={2}
                  title="Mide el impacto"
                  desc="Identifica necesidades colectivas mediante votación ponderada. Las ideas con más evidencia y respaldo suben al podio."
                />
              </div>
              <div className="fade-in fade-in-3">
                <HowStep
                  icon={HandCoins} step={3}
                  title="Recibe financiamiento"
                  desc="Las ramas priorizadas reciben presupuesto FIAT. Ejecuta tareas, audita resultados y construye reputación verificable."
                />
              </div>
            </div>
          </section>

          {/*============= ÁRBOLES DESTACADOS =============*/}
          {metrics?.topTrees && metrics.topTrees.length > 0 && (
            <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '2rem 2rem 5rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Árboles destacados
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  Organizaciones que ya están transformando con Trust
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1.25rem',
              }}>
                {metrics.topTrees.map((tree, i) => (
                  <div
                    key={tree.id}
                    className={`glass-panel fade-in fade-in-${(i % 4) + 1}`}
                    style={{ padding: '1.5rem', border: '1px solid rgba(255,255,255,0.04)', cursor: 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-md)',
                        background: 'rgba(59,130,246,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <TreePine size={20} style={{ color: 'var(--accent-primary)' }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{tree.name}</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{tree.sector}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Miembros</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{tree.memberCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Profit mensual</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-success)' }}>{fmtClp(tree.monthlyProfit)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/*============= CTA FINAL =============*/}
          {!isAuthenticated && (
            <section style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '2rem 2rem 6rem' }}>
              <div className="glass-panel fade-in" style={{
                textAlign: 'center', padding: '3.5rem 2rem',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(139,92,246,0.06) 100%)',
              }}>
                <Star size={40} style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }} />
                <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                  ¿Listo para transformar tu organización?
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: 500, margin: '0 auto 2rem', lineHeight: 1.7 }}>
                  Únete al ecosistema de confianza descentralizada. Comienza gratis, sin compromiso.
                </p>
                <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ padding: '0.9rem 2.25rem', fontSize: '1.05rem' }}>
                  Comenzar ahora
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
          )}

          {/*============= FOOTER =============*/}
          <footer style={{
            borderTop: '1px solid var(--border-color)',
            padding: '2rem', textAlign: 'center',
            fontSize: '0.8rem', color: 'var(--text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Shield size={16} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Trust</span>
            </div>
            <p>Trust © 2026 — Tecnología para la economía del cuidado</p>
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
              <button onClick={() => navigate('/login')} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>Iniciar sesión</button>
              <button onClick={() => navigate('/login')} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>Registrarse</button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
