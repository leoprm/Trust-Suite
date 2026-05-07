import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Plus, TreePine, Activity, GitBranch } from 'lucide-react';
import Feed from '../components/Feed';
import BranchFeed from '../components/BranchFeed';
import FinancialDashboard from '../components/FinancialDashboard';
import EvaluatorDashboard from '../components/EvaluatorDashboard';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import MobileShell from '../components/MobileShell';
import { useMatrixStore } from '../store/matrixStore';
import { ArbolCrear, ArbolHacer, ArbolMedir } from '../components/ArbolViews';
import { NecesidadCrear, NecesidadHacer, NecesidadMedir } from '../components/NecesidadViews';
import { RamaCrear, RamaHacer, RamaMedir } from '../components/RamaViews';

export default function Dashboard() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [, setRefreshKey] = useState(0);
  const { accionActiva, entidadActiva } = useMatrixStore();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  if (isInitialLoading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('dashboard.loading')}</div>;
  if (!user) return null;

  if (isMobile) {
    const renderBody = () => {
      if (entidadActiva === 'arbol') {
        switch (accionActiva) {
          case 'crear': return <ArbolCrear onCreated={() => setRefreshKey(k => k + 1)} />;
          case 'hacer': return <ArbolHacer />;
          case 'medir': return <ArbolMedir />;
        }
      }

      if (entidadActiva === 'necesidad') {
        switch (accionActiva) {
          case 'crear': return <NecesidadCrear onCreated={() => setRefreshKey(k => k + 1)} />;
          case 'hacer': return <NecesidadHacer />;
          case 'medir': return <NecesidadMedir />;
        }
      }

      if (entidadActiva === 'rama') {
        switch (accionActiva) {
          case 'crear': return <RamaCrear onCreated={() => setRefreshKey(k => k + 1)} />;
          case 'hacer': return <RamaHacer />;
          case 'medir': return <RamaMedir />;
        }
      }

      return null;
    };

    return (
      <MobileShell onSettingsPress={() => navigate('/trees/list')}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${entidadActiva}-${accionActiva}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {renderBody()}
          </motion.div>
        </AnimatePresence>
      </MobileShell>
    );
  }

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('dashboard.title')}</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>{t('dashboard.welcome')}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={() => navigate('/trees')}>
            <TreePine size={18} /> {t('dashboard.my_trees')}
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/needs/new')}>
            <Plus size={18} /> {t('dashboard.new_need')}
          </button>
        </div>
      </header>

      <section>
        <FinancialDashboard isGlobal={true} />
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <EvaluatorDashboard />
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Activity stroke="var(--accent-success)" />
          <h3 style={{ margin: 0 }}>{t('dashboard.active_needs')}</h3>
        </div>
        <Feed />
      </section>

      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <GitBranch stroke="var(--accent-primary)" />
          <h3 style={{ margin: 0 }}>{t('branches.title')}</h3>
        </div>
        <BranchFeed />
      </section>
    </main>
  );
}
