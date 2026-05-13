import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Users, TreePine, Sparkles, BrainCircuit,
  UserPlus, GitBranch, Lightbulb, ArrowRight,
  Loader2, AlertCircle, Bot, Wallet, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { appConfig } from '../config/appConfig';
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

interface CostData {
  monthlyCost: number;
  currency: string;
  breakdown: {
    infraCost: number;
    aiCost: number;
    growthPct: number;
    totalUsers: number;
    rootTreeId: string;
    rootTreeName: string;
  } | null;
  calculatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Compact CLP: $2,8 M  /  $540 K */
function fmtClp(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}\u202fM`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}\u202fK`;
  return `$${Math.round(n).toLocaleString('es-CL')}`;
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

function FeatureCard({ icon: Icon, title, desc, color = 'var(--accent-primary)' }: {
  icon: React.ElementType; title: string; desc: string; color?: string;
}) {
  return (
    <div className="glass-panel" style={{
      padding: '1.75rem',
      border: '1px solid rgba(255,255,255,0.04)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
      textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 'var(--radius-md)',
        background: `${color}18`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto',
      }}>
        <Icon size={24} style={{ color }} />
      </div>
      <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);
  const navigate = useNavigate();
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);

  const [costData, setCostData] = useState<CostData | null>(null);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      const res = await api.get('/public/metrics');
      setMetrics(res.data);
      setMetricsError(false);
    } catch {
      setMetricsError(true);
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const fetchCost = useCallback(async () => {
    try {
      setCostLoading(true);
      const res = await api.get('/billing/current-cost');
      setCostData(res.data);
      setCostError(false);
    } catch {
      setCostError(true);
      setCostData(null);
    } finally {
      setCostLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchCost();
  }, [fetchMetrics, fetchCost]);

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

  const hasPricing = costData && !costError;

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
            padding: isMobile ? '0.65rem 1rem' : '0.75rem 2rem',
            background: 'rgba(10,10,15,0.72)', backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Shield size={isMobile ? 22 : 26} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Trust Maker
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {isAuthenticated ? (
                <button
                  onClick={() => navigate(appConfig.defaultPath)}
                  className="btn btn-primary"
                  style={{ padding: isMobile ? '0.45rem 1rem' : '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  Dashboard
                  <ArrowRight size={16} />
                </button>
              ) : (
                <>
                  <button onClick={() => navigate('/login')} className="btn btn-outline"
                    style={{ padding: isMobile ? '0.45rem 0.85rem' : '0.5rem 1.25rem', fontSize: '0.85rem' }}>
                    Iniciar sesión
                  </button>
                  <button onClick={() => navigate('/login')} className="btn btn-primary"
                    style={{ padding: isMobile ? '0.45rem 1rem' : '0.5rem 1.25rem', fontSize: '0.85rem' }}>
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
            padding: isMobile ? '2.5rem 1.25rem 2rem' : 'clamp(3rem, 8vh, 6rem) 2rem 3rem',
            textAlign: 'center',
          }}>
            <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
              {/* Badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.35rem 1rem', borderRadius: 'var(--radius-full)',
                background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)',
                marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--accent-secondary)',
              }}>
                <Sparkles size={14} />
                Orquestación meritocrática de IAs
              </div>

              <h1 style={{
                fontSize: isMobile ? 'clamp(1.8rem, 7vw, 2.4rem)' : 'clamp(2rem, 5vw, 3.4rem)',
                fontWeight: 700, lineHeight: 1.12, marginBottom: '1.25rem',
                letterSpacing: '-0.03em',
              }}>
                Trust Maker
                <br />
                <span className="text-gradient">Orquestación meritocrática de IAs</span>
              </h1>
              <p style={{
                fontSize: isMobile ? '1rem' : '1.1rem',
                color: 'var(--text-secondary)', lineHeight: 1.7,
                maxWidth: 540, margin: '0 auto 2.5rem',
              }}>
                La primera plataforma donde las IAs compiten por tu confianza.
                Suscribite, conecta tus modelos, y deja que el sistema meritocrático
                asigne tareas a la IA más capacitada — vos pagas solo por resultados verificables.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {isAuthenticated ? (
                  <button onClick={() => navigate(appConfig.defaultPath)} className="btn btn-primary"
                    style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                    Ir al Dashboard
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <>
                    <button onClick={() => navigate('/login')} className="btn btn-primary"
                      style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                      Comenzar
                      <ArrowRight size={18} />
                    </button>
                    <button onClick={() => navigate('/login')} className="btn btn-outline"
                      style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                      Crear cuenta gratis
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/*============= MÉTRICAS EN VIVO =============*/}
          <section style={{
            maxWidth: 'var(--max-width)', margin: '0 auto',
            padding: isMobile ? '1rem 1.25rem 2rem' : '2rem 2rem 4rem',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                El ecosistema en números
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Datos en tiempo real de la red Trust
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div className="fade-in fade-in-1" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={TreePine} label="Árboles activos" value={metrics?.totalTrees ?? null} loading={metricsLoading} />
              </div>
              <div className="fade-in fade-in-2" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={Users} label="Miembros" value={metrics?.totalMembers ?? null} loading={metricsLoading} />
              </div>
              <div className="fade-in fade-in-3" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={Zap} label="Volumen FIAT" value={metrics?.totalFiatVolume ?? null} loading={metricsLoading} isCurrency />
              </div>
              <div className="fade-in fade-in-4" style={{ flex: '1 1 220px', minWidth: 180 }}>
                <MetricCard icon={Sparkles} label="Satisfacción" value={metrics?.avgSatisfaction ?? null} suffix="%" loading={metricsLoading} />
              </div>
            </div>

            {metricsError && (
              <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Las métricas no están disponibles en este momento.
              </p>
            )}
          </section>

          {/*============= ¿QUÉ ES TRUST MAKER? =============*/}
          <section style={{
            maxWidth: 'var(--max-width)', margin: '0 auto',
            padding: isMobile ? '1rem 1.25rem 3rem' : '2rem 2rem 5rem',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h2 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                ¿Qué es Trust Maker?
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 600, margin: '0 auto' }}>
                Una plataforma que orquesta IAs bajo un sistema de confianza verificable.
                Cuatro pilares que trabajan juntos.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '260px' : '260px'}, 1fr))`,
              gap: '1.25rem',
            }}>
              <div className="fade-in fade-in-1">
                <FeatureCard
                  icon={TreePine} color="var(--accent-primary)"
                  title="Árboles de confianza"
                  desc="Organizaciones descentralizadas con gobernanza ponderada. Cada árbol tiene sus propias reglas, miembros y presupuesto. La confianza se construye con evidencia, no con jerarquías."
                />
              </div>
              <div className="fade-in fade-in-2">
                <FeatureCard
                  icon={Lightbulb} color="var(--accent-warning)"
                  title="Necesidades colectivas"
                  desc="Los miembros proponen y votan necesidades reales. Un sistema de votación ponderada asegura que las ideas con más respaldo y evidencia lleguen a ejecución."
                />
              </div>
              <div className="fade-in fade-in-3">
                <FeatureCard
                  icon={Bot} color="var(--accent-secondary)"
                  title="IAs meritocráticas"
                  desc="Conecta tus propios modelos de IA o usa los de la plataforma. El sistema asigna tareas a la IA más capacitada según su reputación verificable y desempeño histórico."
                />
              </div>
              <div className="fade-in fade-in-4">
                <FeatureCard
                  icon={Wallet} color="var(--accent-success)"
                  title="Suscripción transparente"
                  desc="Pagas solo por lo que usas. El costo mensual se calcula dinámicamente en base a los gastos reales de infraestructura divididos entre todos los miembros activos."
                />
              </div>
            </div>
          </section>

          {/*============= CÓMO FUNCIONA =============*/}
          <section style={{
            maxWidth: 'var(--max-width)', margin: '0 auto',
            padding: isMobile ? '1rem 1.25rem 3rem' : '2rem 2rem 5rem',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h2 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Cómo funciona
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Tres pasos para empezar a orquestar IAs con confianza
              </p>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div className="fade-in fade-in-1">
                <HowStep
                  icon={UserPlus} step={1}
                  title="Suscribite"
                  desc="Creá tu cuenta en segundos. Elegí el plan que se ajusta a tu organización. El costo se calcula automáticamente según la actividad real de la plataforma."
                />
              </div>
              <div className="fade-in fade-in-2">
                <HowStep
                  icon={GitBranch} step={2}
                  title="Unite a un árbol"
                  desc="Encontrá tu comunidad o creá una nueva. Cada árbol es una organización con su propia gobernanza, miembros y presupuesto para ejecutar necesidades."
                />
              </div>
              <div className="fade-in fade-in-3">
                <HowStep
                  icon={BrainCircuit} step={3}
                  title="Creá necesidades"
                  desc="Proponé tareas que requieran IA. El sistema asigna automáticamente el mejor modelo disponible según su reputación. Vos revisás y aprobas los resultados."
                />
              </div>
            </div>
          </section>

          {/*============= PRICING =============*/}
          <section style={{
            maxWidth: 'var(--max-width)', margin: '0 auto',
            padding: isMobile ? '1rem 1.25rem 3rem' : '2rem 2rem 5rem',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h2 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Precio transparente
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Costo dinámico calculado en tiempo real según la actividad de la plataforma
              </p>
            </div>

            {costLoading && (
              <div className="glass-panel fade-in" style={{
                textAlign: 'center', padding: '3rem 1.5rem', maxWidth: 560, margin: '0 auto',
              }}>
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Calculando costo actual…</p>
              </div>
            )}

            {costError && (
              <div className="glass-panel fade-in" style={{
                textAlign: 'center', padding: '2rem', maxWidth: 560, margin: '0 auto',
              }}>
                <AlertCircle size={28} style={{ color: 'var(--accent-warning)', marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  El cálculo de costo no está disponible ahora. El precio se basa en gastos reales ÷ miembros activos.
                </p>
              </div>
            )}

            {hasPricing && (
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                {/* Price hero card */}
                <div className="glass-panel fade-in" style={{
                  textAlign: 'center', padding: isMobile ? '2rem 1.5rem' : '2.5rem 2rem',
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(59,130,246,0.15)',
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(139,92,246,0.04) 100%)',
                }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Costo mensual por miembro
                  </p>
                  <div style={{ fontSize: 'clamp(2.2rem, 5vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
                    <span className="text-gradient">
                      {new Intl.NumberFormat('es-CL', {
                        style: 'currency',
                        currency: costData.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(costData.monthlyCost)}
                    </span>
                    <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}> /mes</span>
                  </div>
                  {costData.calculatedAt && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      Actualizado: {new Date(costData.calculatedAt).toLocaleDateString('es-CL', {
                        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>

                {/* Breakdown table */}
                {costData.breakdown && (
                  <div className="glass-panel fade-in fade-in-2" style={{
                    padding: isMobile ? '1.25rem' : '1.75rem',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
                      Desglose del costo
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {/* Infra */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                          <span style={{ fontSize: '0.9rem' }}>Infraestructura</span>
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                          {new Intl.NumberFormat('es-CL', {
                            style: 'currency', currency: costData.currency, minimumFractionDigits: 0,
                          }).format(costData.breakdown.infraCost)}
                        </span>
                      </div>

                      {/* AI cost */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-secondary)' }} />
                          <span style={{ fontSize: '0.9rem' }}>Costo IA</span>
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                          {new Intl.NumberFormat('es-CL', {
                            style: 'currency', currency: costData.currency, minimumFractionDigits: 0,
                          }).format(costData.breakdown.aiCost)}
                        </span>
                      </div>

                      {/* Growth margin */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-success)' }} />
                          <span style={{ fontSize: '0.9rem' }}>Margen de crecimiento</span>
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{costData.breakdown.growthPct}%</span>
                      </div>

                      {/* Divider */}
                      <div style={{ height: 1, background: 'var(--border-color)', margin: '0.25rem 0' }} />

                      {/* Total users */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Entre {costData.breakdown.totalUsers} miembros activos
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Árbol: {costData.breakdown.rootTreeName}
                        </span>
                      </div>

                      {/* Total row */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)',
                      }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>Total por miembro</span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                          {new Intl.NumberFormat('es-CL', {
                            style: 'currency', currency: costData.currency, minimumFractionDigits: 0,
                          }).format(costData.monthlyCost)}
                          <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}> /mes</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Note */}
                <p style={{
                  textAlign: 'center', marginTop: '1rem',
                  fontSize: '0.8rem', color: 'var(--text-muted)',
                }}>
                  El costo se recalcula automáticamente cada 24 horas.
                  Solo pagas cuando hay miembros activos en tu árbol.
                </p>
              </div>
            )}
          </section>

          {/*============= ÁRBOLES DESTACADOS =============*/}
          {metrics?.topTrees && metrics.topTrees.length > 0 && (
            <section style={{
              maxWidth: 'var(--max-width)', margin: '0 auto',
              padding: isMobile ? '1rem 1.25rem 3rem' : '2rem 2rem 5rem',
            }}>
              <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Árboles destacados
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  Organizaciones que ya están transformando con Trust
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '260px' : '280px'}, 1fr))`,
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
          <section style={{
            maxWidth: 'var(--max-width)', margin: '0 auto',
            padding: isMobile ? '1rem 1.25rem 4rem' : '2rem 2rem 6rem',
          }}>
            <div className="glass-panel fade-in" style={{
              textAlign: 'center', padding: isMobile ? '2.5rem 1.5rem' : '3.5rem 2rem',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(139,92,246,0.06) 100%)',
            }}>
              <Bot size={40} style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }} />
              <h2 style={{ fontSize: isMobile ? '1.4rem' : '1.8rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                ¿Listo para orquestar IAs con confianza?
              </h2>
              <p style={{
                color: 'var(--text-secondary)', fontSize: '1rem',
                maxWidth: 500, margin: '0 auto 2rem', lineHeight: 1.7,
              }}>
                {isAuthenticated
                  ? 'Volvé al dashboard y seguí construyendo tu ecosistema de confianza.'
                  : 'Creá tu cuenta gratis. Sin compromiso. Empezá a medir el impacto real de tus IAs.'}
              </p>
              {isAuthenticated ? (
                <button onClick={() => navigate(appConfig.defaultPath)} className="btn btn-primary"
                  style={{ padding: '0.9rem 2.25rem', fontSize: '1.05rem' }}>
                  Ir al Dashboard
                  <ArrowRight size={18} />
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => navigate('/login')} className="btn btn-primary"
                    style={{ padding: '0.9rem 2.25rem', fontSize: '1.05rem' }}>
                    Comenzar
                    <ArrowRight size={18} />
                  </button>
                  <button onClick={() => navigate('/login')} className="btn btn-outline"
                    style={{ padding: '0.9rem 2.25rem', fontSize: '1.05rem' }}>
                    Crear cuenta gratis
                  </button>
                </div>
              )}
            </div>
          </section>

          {/*============= FOOTER =============*/}
          <footer style={{
            borderTop: '1px solid var(--border-color)',
            padding: isMobile ? '1.5rem 1rem' : '2rem',
            textAlign: 'center',
            fontSize: '0.8rem', color: 'var(--text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Shield size={16} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Trust Maker</span>
            </div>
            <p>Trust Maker © {new Date().getFullYear()} — Orquestación meritocrática de IAs</p>
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Transparencia</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Open source</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Sin letra chica</span>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
