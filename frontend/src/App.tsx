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
import CareerPath from './pages/CareerPath';
import ModelsPage from './pages/ModelsPage';
import InferencePage from './pages/InferencePage';
import FinetunePage from './pages/FinetunePage';
import FinetuneDetail from './pages/FinetuneDetail';
import SubscriptionPage from './pages/SubscriptionPage';
import BillingPage from './pages/BillingPage';
import BillingPayout from './pages/BillingPayout';

import MainLayout from './layouts/MainLayout';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import ConciergeChat from './components/ConciergeChat';
import type { AutoOpenContext } from './components/ConciergeChat';
import { useEffect, useState } from 'react';
import { appConfig } from './config/appConfig';

function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state: any) => state.user);
  if (user?.role !== 'ADMINISTRATOR') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  const isAuthenticated = useAuthStore((state: any) => state.isAuthenticated);

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
        if (overflowY === 'auto' || overflowY === 'scroll') {
          return;
        }
        el = el.parentElement;
      }
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
          {/* Public routes */}
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={appConfig.defaultPath} />} />
          <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/join/:token" element={<GuestJoin />} />
          <Route path="/add/:token" element={<ConnectPerson />} />
          <Route path="/p/:code" element={<PublicProfile />} />

          {/* Onboarding wizard — full screen, requires auth */}
          <Route path="/onboarding" element={isAuthenticated ? <OnboardingWizard /> : <Navigate to="/login" />} />

          {/* Authenticated routes with MainLayout */}
          <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/people" element={<People />} />
            <Route path="/trees" element={<TreeNetwork />} />
            <Route path="/trees/new" element={<CreateTree />} />
            <Route path="/trees/list" element={<MyTreesList />} />
            <Route path="/needs/new" element={<NewNeed />} />
            <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
            <Route path="/admin/trustcore" element={<AdminGuard><TrustCoreAdminDashboard /></AdminGuard>} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/career-path/:treeId" element={<CareerPath />} />
            <Route path="/profile" element={<TraceProfile />} />
            <Route path="/profile/:userId" element={<TraceProfile />} />
            <Route path="/talent" element={<TalentHunter />} />
            <Route path="/tasks" element={<BranchOSDashboard />} />
            <Route path="/insight" element={<TrustInsightDashboard />} />
            <Route path="/wallet-dashboard" element={<WalletDashboard />} />
            <Route path="/transactions" element={<WalletTransactions />} />
            <Route path="/deposit" element={<DepositPage />} />
            <Route path="/withdraw" element={<WithdrawPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/models/:id/inference" element={<InferencePage />} />
            <Route path="/finetune" element={<FinetunePage />} />
            <Route path="/finetune/:id" element={<FinetuneDetail />} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/billing/payout" element={<BillingPayout />} />
          </Route>

          {/* Tree detail — accessible with or without auth */}
          <Route element={<MainLayout />}>
            <Route path="/trees/:id" element={<TreeDetail />} />
          </Route>

          <Route path="*" element={<Navigate to={appConfig.defaultPath} />} />
        </Routes>
        {isAuthenticated && <ConciergeChat autoOpenContext={autoOpenContext} />}
        {!isAuthenticated && autoOpenContext && <ConciergeChat autoOpenContext={autoOpenContext} />}
      </BrowserRouter>
    </>
  );
}

export default App;
