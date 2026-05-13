import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/sidebar/Sidebar';
import ProfilePanel from '../components/profile/ProfilePanel';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { LogOut, User as UserIcon, Settings, Home } from 'lucide-react';
import { useState } from 'react';
import './MainLayout.css';

function MainLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const setActiveNeedAndTree = useUIStore((s) => s.setActiveNeedAndTree);

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header glass-panel">
        <button
          className="hamburger-btn mobile-only"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen
              ? <path d="M18 6L6 18M6 6l12 12" />
              : <path d="M3 12h18M3 6h18M3 18h18" />
            }
          </svg>
        </button>

        {!isHome && (
          <button
            className="home-btn"
            onClick={() => navigate('/')}
            aria-label="Ir al chat"
            title="Home"
          >
            <Home size={20} />
          </button>
        )}

        <div className="header-brand">
          <span className="header-logo">◆</span>
          <span className="header-title">Trust Maker</span>
        </div>

        <div className="header-right">
          <button
            className={`header-user-btn ${profileOpen ? 'header-user-btn--active' : ''}`}
            onClick={() => setProfileOpen(!profileOpen)}
            title="Perfil"
          >
            <UserIcon size={18} />
            <span>{user?.username ?? 'User'}</span>
          </button>
          <button
            className="btn btn-outline header-settings"
            onClick={() => navigate('/settings')}
            title="Configuración"
          >
            <Settings size={16} />
          </button>
          <button className="btn btn-outline header-logout" onClick={logout}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="app-body">
        {/* Sidebar backdrop (mobile) */}
        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onSelectNeed={setActiveNeedAndTree} />

        <main className="app-main">
          <Outlet />
        </main>

        {/* Profile panel (right slide-in) */}
        <ProfilePanel
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
        />
      </div>
    </div>
  );
}

export default MainLayout;
