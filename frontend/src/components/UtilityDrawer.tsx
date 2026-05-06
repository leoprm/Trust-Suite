import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, User, Users, ChevronLeft, Crosshair, Globe, LogOut, Eye, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMatrixStore } from '../store/matrixStore';
import type { UtilityPanel } from '../store/matrixStore';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from 'react-i18next';
import NotificationCenter from './NotificationCenter';
import ProfilePage from './ProfilePage';
import MisPersonas from './MisPersonas';
import PrivacySettingsPanel from './PrivacySettingsPanel';
import { appConfig, type DrawerPanelKey } from '../config/appConfig';

const OptimizedText = ({ text, style }: { text: string; style?: React.CSSProperties }) => (
  <span style={style}>{text}</span>
);

const MENU_KEYS: { key: DrawerPanelKey; icon: typeof Bell; labelKey: string; descKey: string }[] = [
  { key: 'notifications', icon: Bell,  labelKey: 'm.drawer.notifications', descKey: 'm.drawer.notifications_desc' },
  { key: 'profile',       icon: User,  labelKey: 'm.drawer.profile',       descKey: 'm.drawer.profile_desc' },
  { key: 'privacy',       icon: ShieldCheck, labelKey: 'm.drawer.privacy', descKey: 'm.drawer.privacy_desc' },
  { key: 'directory',     icon: Users, labelKey: 'm.drawer.my_people',     descKey: 'm.drawer.my_people_desc' },
];

interface UtilityDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function UtilityDrawer({ open, onClose }: UtilityDrawerProps) {
  const { utilityPanel, setUtilityPanel, notificationCount, colorMode, toggleColorMode } = useMatrixStore();
  const logoutStore = useAuthStore((state: any) => state.logout);
  const backdropRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const menuKeys = MENU_KEYS.filter(item => appConfig.drawerPanels.includes(item.key));

  useEffect(() => {
    if (utilityPanel && !appConfig.drawerPanels.includes(utilityPanel as DrawerPanelKey)) {
      setUtilityPanel(null);
    }
  }, [utilityPanel, setUtilityPanel]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleItemClick = (key: UtilityPanel) => {
    setUtilityPanel(key);
  };

  const handleBack = () => {
    setUtilityPanel(null);
  };

  const handleLogout = () => {
    logoutStore();
    onClose();
    navigate('/login');
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('trust-lite-lang', newLang);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            ref={backdropRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 900,
              background: 'rgba(0,0,0,0.4)',
            }}
          />

          {/* Drawer panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 'min(82vw, 340px)',
              zIndex: 950,
              background: 'rgba(15, 15, 28, 0.72)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <OptimizedText
                text={utilityPanel ? t(menuKeys.find(m => m.key === utilityPanel)?.labelKey || '') : t('m.drawer.utilities')}
                style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}
              />
              <button
                onClick={utilityPanel ? handleBack : onClose}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.08)', border: 'none',
                  cursor: 'pointer', color: '#fff',
                }}
              >
                {utilityPanel ? <ChevronLeft size={18} /> : <X size={18} />}
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {!utilityPanel ? (
                /* ── Menu list ──────────────────────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {menuKeys.map(item => {
                    const Icon = item.icon;
                    const badge = item.key === 'notifications' && notificationCount > 0;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleItemClick(item.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.85rem 0.9rem', borderRadius: 14,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onPointerDown={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
                        onPointerUp={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                        onPointerLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      >
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <Icon size={22} color="rgba(255,255,255,0.7)" />
                          {badge && (
                            <div style={{
                              position: 'absolute', top: -4, right: -6,
                              minWidth: 16, height: 16, borderRadius: 8,
                              background: '#ef4444', color: '#fff',
                              fontSize: 10, fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 4px',
                            }}>
                              {notificationCount > 99 ? '99+' : notificationCount}
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <OptimizedText
                            text={t(item.labelKey)}
                            style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', display: 'block' }}
                          />
                          <OptimizedText
                            text={t(item.descKey)}
                            style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 2 }}
                          />
                        </div>
                      </button>
                    );
                  })}

                  {/* ── Buscar Talento link ────────────────────── */}
                  {appConfig.features.talentSearch && (
                  <button
                    onClick={() => { onClose(); navigate('/talent'); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.85rem 0.9rem', borderRadius: 14,
                      background: 'rgba(251,191,36,0.06)',
                      border: '1px solid rgba(251,191,36,0.15)',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onPointerDown={e => (e.currentTarget.style.background = 'rgba(251,191,36,0.14)')}
                    onPointerUp={e => (e.currentTarget.style.background = 'rgba(251,191,36,0.06)')}
                    onPointerLeave={e => (e.currentTarget.style.background = 'rgba(251,191,36,0.06)')}
                  >
                    <Crosshair size={22} color="#fbbf24" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fbbf24', display: 'block' }}>
                        {t('m.drawer.search_talent')}
                      </span>
                      <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 2 }}>
                        {t('m.drawer.search_talent_desc')}
                      </span>
                    </div>
                  </button>
                  )}
                </div>
              ) : utilityPanel === 'notifications' ? (
                /* ── Notification Center ───────────────────────── */
                <NotificationCenter onClose={onClose} />
              ) : utilityPanel === 'profile' ? (
                /* ── Profile Page ──────────────────────────────── */
                <ProfilePage onClose={onClose} />
              ) : utilityPanel === 'privacy' ? (
                <PrivacySettingsPanel />
              ) : utilityPanel === 'directory' ? (
                /* ── Mis Personas ──────────────────────────────── */
                <MisPersonas onClose={onClose} />
              ) : (
                /* ── Panel content placeholder ─────────────────── */
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  height: '100%', gap: '0.75rem', opacity: 0.4,
                }}>
                  {(() => {
                    const item = menuKeys.find(m => m.key === utilityPanel);
                    const Icon = item?.icon || Bell;
                    return (
                      <>
                        <Icon size={36} color="#fff" />
                        <OptimizedText
                          text={t(item?.labelKey || '')}
                          style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}
                        />
                        <OptimizedText
                          text={t('m.drawer.coming_soon')}
                          style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Bottom actions (mobile drawer footer) */}
            {!utilityPanel && (
              <div style={{
                flexShrink: 0,
                padding: '0.7rem 0.75rem 0.9rem',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'linear-gradient(180deg, rgba(15,15,28,0), rgba(15,15,28,0.65))',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}>
              <button
                onClick={toggleColorMode}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 12,
                  background: 'rgba(250,250,250,0.08)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  color: 'rgba(255,255,255,0.88)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Eye size={16} />
                  {colorMode === 'modern' ? t('m.drawer.new_colors') : t('m.drawer.old_colors')}
                </span>
                <span>{colorMode === 'modern' ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={toggleLanguage}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 12,
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.25)',
                  color: '#7dd3fc',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Globe size={16} /> {t('m.drawer.language')}
                </span>
                <span>{i18n.language === 'en' ? 'EN' : 'ES'}</span>
              </button>

              <button
                onClick={handleLogout}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 12,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.28)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <LogOut size={16} /> {t('m.drawer.logout')}
                </span>
              </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
