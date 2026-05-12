import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { HelpCircle, LogOut, Globe, Shield, Eye, CheckSquare, Users, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import TreeSidebar from '../components/TreeSidebar';
import PWAInstallPrompt from '../components/PWAInstallPrompt';
import RegistroInvitadoModal from '../components/RegistroInvitadoModal';
import AppSwitcher from '../components/AppSwitcher';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from 'react-i18next';
import { appConfig, isTrustLanding } from '../config/appConfig';

export default function MainLayout() {
  const user = useAuthStore((state: any) => state.user);
  const isInitialLoading = useAuthStore((state: any) => state.isInitialLoading);
  const logoutStore = useAuthStore((state: any) => state.logout);
  const fetchUser = useAuthStore((state: any) => state.fetchUser);
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutStore();
    navigate('/login');
  };

  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hasRejectedUpsell, setHasRejectedUpsell] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // const isListingPage = location.pathname === '/trees'; // No longer needed
  
  // On mobile, the "Home" is either the Sidebar (Listings) or the Content (Dashboard/Detail)
  // Let's make it so /trees and /people show the sidebar, while / and /trees/:id show the content.
  const showSidebar = !isMobile || (isMobile && isMobileMenuOpen);
  const showContent = !isMobile || (isMobile && !isMobileMenuOpen);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(newLang);
  };

  const handleRestrictedNav = (e: React.MouseEvent, path: string) => {
    // Refuerzo: Si is_guest falla por caché, verificamos que no tenga email (característica única de invitados)
    const isGuest = user?.is_guest || (!user?.email && user?.role === 'PERSON');
    
    if (isGuest) {
      e.preventDefault();
      e.stopPropagation();
      setShowUpgradeModal(true);
    } else {
      navigate(path);
    }
  };

  const isGuestAccount = user?.is_guest || (!user?.email && user?.role === 'PERSON');
  const isGuestVisually = isGuestAccount && hasRejectedUpsell;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Full-Width Global Header */}
      <header style={{ 
        height: isMobile ? '0' : '64px', 
        overflow: 'hidden',
        width: '100%',
        borderBottom: isMobile ? 'none' : '1px solid var(--border-color)', 
        background: 'rgba(15, 23, 42, 0.8)', 
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: isMobile ? '0' : '0 1.5rem',
        zIndex: 100,
        boxShadow: isMobile ? 'none' : '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div 
            onClick={() => navigate('/')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 700 }} className="text-gradient">
              {appConfig.name}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={toggleLanguage} className="btn btn-outline flex items-center gap-2" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', height: '32px' }}>
              <Globe size={14} /> {i18n.language.toUpperCase()}
            </button>
            
            <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.25rem' }} />
            
            {user ? (
              <>
                {!isMobile && <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{user.username}</span>}
                
                {user.role === 'ADMINISTRATOR' && (
                  <button 
                    onClick={() => navigate('/admin')} 
                    className="btn btn-outline" 
                    style={{ padding: '0.4rem', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', width: '36px', height: '36px' }} 
                    title="Admin Panel"
                  >
                    <Shield size={18} />
                  </button>
                )}
                
                <button onClick={() => navigate('/privacy')} className="btn btn-outline" style={{ padding: '0.4rem', width: '36px', height: '36px' }} title="Privacidad">
                  <Eye size={18} />
                </button>

                {!isTrustLanding && <AppSwitcher isMobile={isMobile} />}
                
                <button onClick={handleLogout} className="btn btn-outline" style={{ padding: '0.4rem', width: '36px', height: '36px' }} title={t('nav.logout')}>
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              !isInitialLoading && (
                <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  Iniciar Sesión
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main Container below Header */}
      <div style={{ flex: 1, display: 'flex', width: '100vw', overflow: 'hidden' }}>
        {/* Persistent Global Sidebar */}
        {user && showSidebar && <TreeSidebar isMobile={isMobile} />}

        {/* Dynamic Content */}
        {showContent && (
          <main style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', position: 'relative', background: 'var(--bg-primary)', paddingBottom: isMobile ? '0' : '0' }}>
            <Outlet />
          </main>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar — hidden: MobileShell provides its own */}
      {user && isMobile && false && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '65px', background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 1000,
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          {/* Trees Tab (Valor) */}
          <button 
            onClick={(e) => handleRestrictedNav(e, '/trees/list')}
            style={{ 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer', flex: 1,
              color: location.pathname === '/trees/list' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              opacity: isGuestVisually ? 0.5 : 1
            }}
          >
            <TrendingUp size={22} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, textDecoration: isGuestVisually ? 'line-through' : 'none' }}>Valor</span>
          </button>
          
          {/* Tasks Tab (Home) */}
          <button 
            onClick={() => navigate('/')} 
            style={{ 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer', flex: 1,
              color: location.pathname === '/' ? 'var(--accent-success)' : 'var(--text-secondary)'
            }}
          >
            <CheckSquare size={22} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Tareas</span>
          </button>
          
          {/* People Tab */}
          <button 
            onClick={(e) => handleRestrictedNav(e, '/people')} 
            style={{ 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer', flex: 1,
              color: location.pathname === '/people' ? 'var(--accent-info)' : 'var(--text-secondary)',
              opacity: isGuestVisually ? 0.5 : 1
            }}
          >
            <Users size={22} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, textDecoration: isGuestVisually ? 'line-through' : 'none' }}>Personas</span>
          </button>
        </nav>
      )}

      {/* PWA Install Prompt (Floating) */}
      <PWAInstallPrompt />

      {/* Guest Upgrade Modal */}
      <RegistroInvitadoModal 
        isOpen={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
        onReject={() => setHasRejectedUpsell(true)}
      />
    </div>
  );
}
