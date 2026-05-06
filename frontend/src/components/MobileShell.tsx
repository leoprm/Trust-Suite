import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  useMatrixStore,
  LEGACY_ENTITY_COLORS,
  MODERN_ENTITY_COLORS,
  LEGACY_ACTION_COLORS,
  MODERN_ACTION_COLORS,
} from '../store/matrixStore';
import type { Accion } from '../store/matrixStore';
import { Filter, Menu } from 'lucide-react';
import MetaballsBackground from './MetaballsBackground';
import UtilityDrawer from './UtilityDrawer';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';

const ACTIONS: Accion[] = ['crear', 'hacer', 'medir'];

interface MobileShellProps {
  children: ReactNode;
  modifiers?: ReactNode;
  onSettingsPress?: () => void;
}

export default function MobileShell({ children, modifiers }: MobileShellProps) {
  const { 
    entidadActiva, 
    accionActiva, 
    ciclarEntidad, 
    setAccion,
    isFilterModeActive,
    linajeActivo,
    toggleFilterMode,
    notificationCount,
    setNotificationCount,
    setUtilityPanel,
    colorMode,
  } = useMatrixStore();
  const { t } = useTranslation();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Poll unread notification count ─────────────────────────────────
  const fetchUnread = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      if (typeof data.count === 'number') setNotificationCount(data.count);
    } catch { /* silent */ }
  }, [setNotificationCount]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const entityColors = colorMode === 'legacy' ? LEGACY_ENTITY_COLORS : MODERN_ENTITY_COLORS;
  const actionColors = colorMode === 'legacy' ? LEGACY_ACTION_COLORS : MODERN_ACTION_COLORS;
  const entityColor = entityColors[entidadActiva];

  // ── Funnel Styling ────────────────────────────────────────────────────────
  const isSelected = linajeActivo.length > 0;
  const lastSelection = linajeActivo[linajeActivo.length - 1];
  
  const funnelBg = !isFilterModeActive 
    ? 'transparent' 
    : (isSelected ? entityColors[lastSelection.entidad] : '#ffffff');
  
  const funnelIconColor = !isFilterModeActive
    ? 'rgba(255,255,255,0.4)'
    : (isSelected ? '#ffffff' : entityColor);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
    }}>

      {/* ── Metaballs Liquid Background ─────────────────────────────────── */}
      <MetaballsBackground />

      {/* ── Content wrapper (above canvas) ─────────────────────────────── */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}>

      {/* ── Level 1: Header — solid entity color bar ─────────────────────── */}
      <header
        onClick={ciclarEntidad}
        style={{
          flexShrink: 0,
          height: '52px',
          background: entityColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'background 0.2s',
          userSelect: 'none',
          cursor: 'pointer',
        }}
        title={t('m.shell.tap_entity')}
      >
        {/* ── Hamburger Menu Button (left) ─────────────────────────────── */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setUtilityPanel(null);
            setDrawerOpen(true);
          }}
          style={{
            position: 'absolute',
            left: '12px',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Menu size={22} style={{ color: 'rgba(255,255,255,0.8)' }} />
          {notificationCount > 0 && (
            <div style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '9px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              border: `2px solid ${entityColor}`,
            }}>
              {notificationCount > 99 ? '99+' : notificationCount}
            </div>
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <span style={{
            fontSize: '0.98rem',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '0.01em',
          }}>
            {t(`m.entities.${entidadActiva}`)}
          </span>
        </div>

        {/* ── Relational Funnel Button ──────────────────────────────────── */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFilterMode();
          }}
          style={{
            position: 'absolute',
            right: '12px',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: funnelBg,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isFilterModeActive ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          <Filter 
            size={20} 
            fill={isFilterModeActive ? 'currentColor' : 'none'}
            style={{ color: funnelIconColor, transition: 'color 0.2s' }} 
          />
          {isSelected && (
            <div style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#000',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid',
              borderColor: funnelBg,
            }}>
              {linajeActivo.length}
            </div>
          )}
        </button>
      </header>

      {/* ── Level 2: Modifiers slot ──────────────────────────────────────── */}
      {modifiers && (
        <div style={{ flexShrink: 0, padding: '0.5rem 1rem' }}>
          {modifiers}
        </div>
      )}

      {/* ── Level 3: Body — scrollable content ──────────────────────────── */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {children}
      </main>

      {/* ── Footer: 3 Action Tabs ────────────────────────────────────────── */}
      <nav style={{
        flexShrink: 0,
        display: 'flex',
        height: '60px',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'rgba(15, 15, 25, 0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        {ACTIONS.map(accion => {
          const isActive = accionActiva === accion;
          const color = actionColors[accion];
          return (
            <button
              key={accion}
              onClick={() => setAccion(accion)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                background: isActive ? color : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <span style={{
                fontSize: '0.67rem',
                fontWeight: 700,
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                transition: 'color 0.15s',
              }}>
                {t(`m.actions.${accion}`)}
              </span>
            </button>
          );
        })}
      </nav>
      </div>

      {/* ── Utility Drawer ─────────────────────────────────────────────── */}
      <UtilityDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
