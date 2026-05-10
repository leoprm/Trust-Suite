import { Link } from 'react-router-dom';
import {
  Zap, Users, TrendingUp, Shield, Eye, GitBranch, BrainCircuit, Workflow,
  Building2, Globe, BarChart3, ArrowRight, Sparkles, ChevronRight,
} from 'lucide-react';
import { appConfig } from '../config/appConfig';

const products = [
  {
    icon: Zap,
    title: 'Trust Lite',
    tagline: 'Gobernanza descentralizada',
    description: 'Vota necesidades, propone ideas y construye ramas de trabajo con gobernanza ponderada. Pipeline completo de decisión colectiva.',
    color: 'var(--accent-primary)',
  },
  {
    icon: GitBranch,
    title: 'Branch OS',
    tagline: 'Ejecución y tareas',
    description: 'Convierte ramas en tareas concretas. Asigna, completa y audita trabajo con evidencia verificable y XP por habilidades.',
    color: 'var(--accent-secondary)',
  },
  {
    icon: Eye,
    title: 'Trace Lite',
    tagline: 'Identidad y reputación',
    description: 'Perfil verificable de habilidades con endorsements cruzados. Encuentra talento o sé encontrado con trazabilidad completa.',
    color: 'var(--accent-success)',
  },
  {
    icon: BrainCircuit,
    title: 'Trust Insight',
    tagline: 'Radar de oportunidades',
    description: 'Señales de insight multi-árbol. Matcheo interno y aperturas externas con referidos corporativos.',
    color: 'var(--accent-warning)',
  },
];

const useCases = [
  {
    icon: Building2,
    title: 'Empresas',
    description: 'Coordina equipos multidisciplinarios con gobernanza transparente. Mide contribuciones reales con XP verificable.',
  },
  {
    icon: Globe,
    title: 'Comunidades',
    description: 'Toma decisiones colectivas sin burocracia. Escala de 10 a 10,000 miembros con economía de incentivos.',
  },
  {
    icon: BarChart3,
    title: 'Freelancers y consultores',
    description: 'Construye reputación portátil entre organizaciones. Tus habilidades viajan contigo, verificadas por pares.',
  },
];

export default function Landing() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--bg-primary)',
        backgroundImage: `radial-gradient(ellipse at 20% 0%, rgba(139,92,246,0.12) 0%, transparent 50%),
                          radial-gradient(ellipse at 80% 100%, rgba(59,130,246,0.08) 0%, transparent 50%)`,
      }}
    >
      {/*============= HEADER =============*/}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 2rem',
          background: 'rgba(10,10,15,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={26} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Trust Suite
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link
            to="/login"
            className="btn btn-outline"
            style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/*============= HERO =============*/}
      <section
        style={{
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
          padding: '5rem 2rem 4rem',
          textAlign: 'center',
        }}
      >
        <div
          className="glass-panel"
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '3rem 2.5rem',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 1rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(139,92,246,0.12)',
              border: '1px solid rgba(139,92,246,0.2)',
              marginBottom: '1.5rem',
              fontSize: '0.8rem',
              color: 'var(--accent-purple-light)',
            }}
          >
            <Sparkles size={14} />
            Plataforma abierta de confianza organizacional
          </div>

          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3.2rem)',
              fontWeight: 700,
              lineHeight: 1.15,
              marginBottom: '1.25rem',
              letterSpacing: '-0.03em',
            }}
          >
            Gobernanza que escala.
            <br />
            <span className="text-gradient">Confianza que se verifica.</span>
          </h1>

          <p
            style={{
              fontSize: '1.1rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              maxWidth: 560,
              margin: '0 auto 2.5rem',
            }}
          >
            Un sistema operativo para organizaciones descentralizadas.
            Vota necesidades, ejecuta tareas, audita resultados y construye reputación verificable — todo en un solo lugar.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="mailto:acceso@trustsuite.io" className="btn btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
              Solicitar acceso
              <ArrowRight size={18} />
            </a>
            <Link
              to="/login"
              className="btn btn-outline"
              style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            justifyContent: 'center',
            marginTop: '3rem',
            flexWrap: 'wrap',
          }}
        >
          {[
            { value: '10K+', label: 'miembros para economía' },
            { value: '4', label: 'herramientas integradas' },
            { value: '100%', label: 'open source' },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div className="text-gradient" style={{ fontSize: '1.8rem', fontWeight: 700 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/*============= PRODUCTOS =============*/}
      <section
        style={{
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
          padding: '2rem 2rem 5rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Cuatro herramientas, un ecosistema
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
            Cada PWA está diseñada para un propósito específico. Juntas forman el ciclo completo de confianza.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {products.map((p) => (
            <div
              key={p.title}
              className="glass-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '2rem',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: `${p.color}18`,
                  border: `1px solid ${p.color}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <p.icon size={24} style={{ color: p.color }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  {p.title}
                </h3>
                <p style={{ fontSize: '0.8rem', color: p.color, fontWeight: 500, marginBottom: '0.75rem' }}>
                  {p.tagline}
                </p>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>
                {p.description}
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--accent-primary)',
                  fontWeight: 500,
                  marginTop: 'auto',
                }}
              >
                Saber más
                <ChevronRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/*============= CASOS DE USO =============*/}
      <section
        style={{
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
          padding: '2rem 2rem 5rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Diseñado para el mundo real
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
            Trust Suite se adapta a cómo tu organización ya funciona.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {useCases.map((uc) => (
            <div
              key={uc.title}
              className="glass-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '2rem',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <uc.icon size={22} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{uc.title}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {uc.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/*============= CTA FINAL =============*/}
      <section
        style={{
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
          padding: '2rem 2rem 6rem',
        }}
      >
        <div
          className="glass-panel"
          style={{
            textAlign: 'center',
            padding: '3.5rem 2rem',
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(139,92,246,0.06) 100%)',
          }}
        >
          <Workflow size={40} style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            ¿Listo para organizar la confianza?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: 500, margin: '0 auto 2rem', lineHeight: 1.7 }}>
            Solicita acceso temprano. Te contactaremos para configurar tu espacio de trabajo.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="mailto:acceso@trustsuite.io" className="btn btn-primary" style={{ padding: '0.9rem 2.25rem', fontSize: '1.05rem' }}>
              Solicitar acceso
              <ArrowRight size={18} />
            </a>
            <Link
              to="/login"
              className="btn btn-outline"
              style={{ padding: '0.9rem 2.25rem', fontSize: '1.05rem' }}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </section>

      {/*============= FOOTER =============*/}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '2rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Shield size={16} style={{ color: 'var(--accent-primary)' }} />
          Trust Suite
        </div>
        <p>{new Date().getFullYear()} Trust Suite · Gobernanza descentralizada verificable</p>
      </footer>
    </div>
  );
}
