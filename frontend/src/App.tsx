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
import WalletPage from './pages/Wallet';
import WalletDashboard from './pages/WalletDashboard';
import DepositPage from './pages/DepositPage';
import WithdrawPage from './pages/WithdrawPage';
import WalletTransactions from './pages/WalletTransactions';
import TransferPage from './pages/TransferPage';
import TrustCoreAdminDashboard from './pages/TrustCoreAdminDashboard';

import MainLayout from './layouts/MainLayout';
import ConciergeChat from './components/ConciergeChat';
import type { AutoOpenContext } from './components/ConciergeChat';
import { useEffect, useState } from 'react';
import { appConfig, isBranchOS, isTraceLite, isTrustLite, isTrustInsight, isTrustLanding, isTrustWallet } from './config/appConfig';

function App() {
  const isAuthenticated = useAuthStore((state: any) => state.isAuthenticated);
  const crossLogin = useAuthStore((state: any) => state.crossLogin);
  const [ssoChecking, setSsoChecking] = useState(() => {
    if (isTrustLanding) return false;
    const params = new URLSearchParams(window.location.search);
    return !!params.get('token') && !isAuthenticated;
  });

  // Detect invite params for temporary participant mode
  const [autoOpenContext, setAutoOpenContext] = useState<AutoOpenContext | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    const branch = params.get('branch');
    const invite = params.get('invite');
    const task = params.get('task');
    if (branch) return { type: 'branch', id: branch };
    if (invite) return { type: 'invite', id: invite };
    if (task) return { type: 'task', id: task };
    return undefined;
  });

  // SSO cross-app login: interceptar ?token en URL ANTES del redirect
  useEffect(() => {
    if (isTrustLanding || !ssoChecking) return;
    const params = new URLSearchParams(window.location.search);
    const crossToken = params.get('token');
    if (crossToken) {
      crossLogin(crossToken).then((ok: boolean) => {
        window.history.replaceState({}, document.title, window.location.pathname);
        setSsoChecking(false);
      });
    } else {
      setSsoChecking(false);
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
      {/* SSO loading — no redirigir a /login mientras se verifica el crossToken */}
      {ssoChecking && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: 'var(--bg-primary)', gap: '1rem'
        }}>
          <div className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Verificando sesión...</p>
        </div>
      )}

      {!ssoChecking && (
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
                <Route path="/admin/trustcore" element={<TrustCoreAdminDashboard />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/wallet" element={<WalletPage />} />
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
              <Route path="/wallet" element={<WalletPage />} />
            </Route>
          )}

          {isTraceLite && (
            <>
              <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
                <Route path="/" element={<Navigate to="/profile" />} />
                <Route path="/profile" element={<TraceProfile />} />
                <Route path="/talent" element={<TalentHunter />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/wallet" element={<WalletPage />} />
              </Route>

              <Route path="/p/:code" element={<PublicProfile />} />
            </>
          )}

          {isTrustInsight && (
            <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
              <Route path="/" element={<TrustInsightDashboard />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/wallet" element={<WalletPage />} />
            </Route>
          )}

          {isTrustLanding && (
            <>
              <Route path="/" element={<LandingPage />} />
              {/* landing no maneja auth — redirige a Trust Lite */}
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}

          {isTrustWallet && (
            <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
              <Route path="/" element={<WalletDashboard />} />
              <Route path="/transactions" element={<WalletTransactions />} />
              <Route path="/deposit" element={<DepositPage />} />
              <Route path="/withdraw" element={<WithdrawPage />} />
              <Route path="/transfer" element={<TransferPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Route>
          )}

          <Route path="/join/:token" element={<GuestJoin />} />
          <Route path="/add/:token" element={<ConnectPerson />} />

          <Route path="*" element={<Navigate to={appConfig.defaultPath} />} />
        </Routes>
        {isAuthenticated && <ConciergeChat autoOpenContext={autoOpenContext} />}
        {!isAuthenticated && autoOpenContext && <ConciergeChat autoOpenContext={autoOpenContext} />}
      </BrowserRouter>
    </>
      )}
    </>
  );
}

export default App;
