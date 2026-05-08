import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import NewNeed from './pages/NewNeed';
import AdminDashboard from './pages/AdminDashboard';
import TreeDetail from './pages/TreeDetail';
import People from './pages/People';
import CreateTree from './pages/CreateTree';
import Dashboard from './pages/Dashboard';
import TreeNetwork from './pages/TreeNetwork';
import MyTreesList from './pages/MyTreesList';
import GuestJoin from './pages/GuestJoin';
import ConnectPerson from './pages/ConnectPerson';
import PublicProfile from './pages/PublicProfile';
import TalentHunter from './pages/TalentHunter';
import BranchOSDashboard from './pages/BranchOSDashboard';
import TraceProfile from './pages/TraceProfile';
import PrivacyPage from './pages/PrivacyPage';
import TrustInsightDashboard from './pages/TrustInsightDashboard';
import LandingPage from './pages/LandingPage';

import MainLayout from './layouts/MainLayout';
import { useEffect } from 'react';
import { appConfig, isBranchOS, isTraceLite, isTrustLite, isTrustInsight, isTrustLanding } from './config/appConfig';

function App() {
  const isAuthenticated = useAuthStore((state: any) => state.isAuthenticated);
  const crossLogin = useAuthStore((state: any) => state.crossLogin);

  // SSO cross-app login: interceptar ?token en URL
  useEffect(() => {
    if (isTrustLanding) return; // landing es pública, sin auth
    const params = new URLSearchParams(window.location.search);
    const crossToken = params.get('token');
    if (crossToken) {
      crossLogin(crossToken).then((ok: boolean) => {
        // Limpiar token de la URL (ocultar de historial/compartir)
        window.history.replaceState({}, document.title, window.location.pathname);
        if (!ok) {
          console.warn('[SSO] cross-login falló — token expirado o inválido');
        }
      });
    }
  }, []); // solo al montar

  useEffect(() => {
    const lockOrientation = async () => {
      try {
        if (typeof screen !== 'undefined' && screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('portrait');
        }
      } catch (e) {
        console.log('Orientation lock not supported or failed:', e);
      }
    };
    lockOrientation();

    const preventPullToRefresh = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const target = e.target as HTMLElement;
      let el: HTMLElement | null = target;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        // Allow touch scrolling inside any scrollable container, even if content hasn't overflowed yet
        // (content may grow after data loads, and we don't want to miss the scroll window)
        if (overflowY === 'auto' || overflowY === 'scroll') {
          return; // let native scroll handle it
        }
        el = el.parentElement;
      }
      // Only prevent if we're not inside any scrollable container
      e.preventDefault();
    };

    document.body.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    return () => document.body.removeEventListener('touchmove', preventPullToRefresh);
  }, []);

  return (
    <>
      <div id="orientation-guard">
        <svg className="rotate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <path d="M12 18h.01"/>
        </svg>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Por favor, gira tu dispositivo</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{appConfig.name} esta optimizado para modo vertical.</p>
      </div>

      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={appConfig.defaultPath} />} />

          {isTrustLite && (
            <>
              <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/people" element={<People />} />
                <Route path="/trees" element={<TreeNetwork />} />
                <Route path="/trees/new" element={<CreateTree />} />
                <Route path="/trees/list" element={<MyTreesList />} />
                <Route path="/needs/new" element={<NewNeed />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/privacy" element={<PrivacyPage />} />
              </Route>

              <Route element={<MainLayout />}>
                <Route path="/trees/:id" element={<TreeDetail />} />
              </Route>
            </>
          )}

          {isBranchOS && (
            <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
              <Route path="/" element={<BranchOSDashboard />} />
              <Route path="/tasks" element={<BranchOSDashboard />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Route>
          )}

          {isTraceLite && (
            <>
              <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
                <Route path="/" element={<Navigate to="/profile" />} />
                <Route path="/profile" element={<TraceProfile />} />
                <Route path="/talent" element={<TalentHunter />} />
                <Route path="/privacy" element={<PrivacyPage />} />
              </Route>

              <Route path="/p/:code" element={<PublicProfile />} />
            </>
          )}

          {isTrustInsight && (
            <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
              <Route path="/" element={<TrustInsightDashboard />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Route>
          )}

          {isTrustLanding && (
            <>
              <Route path="/" element={<LandingPage />} />
              {/* landing no maneja auth — redirige a Trust Lite */}
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}

          <Route path="/join/:token" element={<GuestJoin />} />
          <Route path="/add/:token" element={<ConnectPerson />} />

          <Route path="*" element={<Navigate to={appConfig.defaultPath} />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
