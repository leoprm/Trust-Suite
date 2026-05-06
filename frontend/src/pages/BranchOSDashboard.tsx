import { useEffect, useState } from 'react';
import { CalendarDays, CheckSquare, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import MobileShell from '../components/MobileShell';
import { TareaCrear, TareaHacer, TareaMedir } from '../components/TareaViews';
import { useAuthStore } from '../store/authStore';
import { useMatrixStore, type Accion } from '../store/matrixStore';

const ACTIONS: Accion[] = ['crear', 'hacer', 'medir'];
const ACTION_LABELS: Record<Accion, string> = {
  crear: 'Crear',
  hacer: 'Hacer',
  medir: 'Medir',
};

export default function BranchOSDashboard() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [, setRefreshKey] = useState(0);
  const { accionActiva, setAccion, setEntidad } = useMatrixStore();

  useEffect(() => {
    setEntidad('tarea');
  }, [setEntidad]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  if (isInitialLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando Branch OS...</div>;
  }

  if (!user) return null;

  const renderTaskAction = () => {
    switch (accionActiva) {
      case 'crear': return <TareaCrear onCreated={() => setRefreshKey(k => k + 1)} />;
      case 'hacer': return <TareaHacer />;
      case 'medir': return <TareaMedir />;
    }
  };

  if (isMobile) {
    return (
      <MobileShell>
        <AnimatePresence mode="wait">
          <motion.div
            key={accionActiva}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {renderTaskAction()}
          </motion.div>
        </AnimatePresence>
      </MobileShell>
    );
  }

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CheckSquare size={28} color="var(--accent-primary)" />
            Branch OS
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>
            Tareas tomadas, ejecucion y medicion operativa.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Clock size={16} />
          Calendario dinamico proximamente
          <CalendarDays size={16} />
        </div>
      </header>

      <nav style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '0.6rem',
      }}>
        {ACTIONS.map(action => {
          const isActive = accionActiva === action;
          return (
            <button
              key={action}
              onClick={() => setAccion(action)}
              className={isActive ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ justifyContent: 'center' }}
            >
              {ACTION_LABELS[action]}
            </button>
          );
        })}
      </nav>

      <section className="glass-panel" style={{ padding: '1rem' }}>
        {renderTaskAction()}
      </section>
    </main>
  );
}
