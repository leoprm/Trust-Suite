import { useState, useEffect, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  TreePine,
  LayoutDashboard,
  Crosshair,
  UserRound,
  ListTodo,
  LockKeyhole,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useTreeStore } from '../store/treeStore';
import { appConfig } from '../config/appConfig';

const TreeSidebar = ({ isMobile }: { isMobile?: boolean }) => {
  const { trees, loadingTrees: loading, fetchTrees } = useTreeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = location.pathname.split('/trees/')[1];
  const { t } = useTranslation();
  const user = useAuthStore((state: any) => state.user);

  useEffect(() => {
    if (appConfig.features.treeList) fetchTrees();
  }, [fetchTrees]);

  const filteredTrees = trees.filter((tree: any) =>
    tree.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sidebarWidth = isMobile ? '100%' : (isCollapsed ? '80px' : '320px');
  const navItems = [
    appConfig.id === 'trust-lite' ? { icon: LayoutDashboard, label: 'Resumen Global', path: '/' } : null,
    appConfig.id === 'branch-os' ? { icon: ListTodo, label: 'Tareas', path: '/' } : null,
    appConfig.features.people ? { icon: Users, label: 'Personas', path: '/people' } : null,
    appConfig.features.citizenProfile ? { icon: UserRound, label: 'Perfil ciudadano', path: '/profile' } : null,
    appConfig.drawerPanels.includes('privacy') ? { icon: LockKeyhole, label: 'Privacidad', path: '/privacy' } : null,
    appConfig.features.admin && user?.role === 'ADMINISTRATOR' ? { icon: ShieldCheck, label: 'Admin', path: '/admin' } : null,
    appConfig.features.talentSearch ? { icon: Crosshair, label: 'Buscar Talento', path: '/talent' } : null,
  ].filter((item): item is { icon: typeof LayoutDashboard; label: string; path: string } => Boolean(item));

  const NavItem = ({ icon: Icon, label, path, active }: any) => {
    const isExternal = path.startsWith('http');

    const content = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: isMobile ? '1.25rem 1.5rem' : '0.75rem 1rem',
          cursor: 'pointer',
          borderBottom: isMobile ? '1px solid rgba(255,255,255,0.03)' : 'none',
          borderRadius: isMobile ? '0' : 'var(--radius-md)',
          marginBottom: isMobile ? '0' : '0.25rem',
          background: active ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
          color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
          transition: 'all 0.2s',
          justifyContent: (isCollapsed && !isMobile) ? 'center' : 'flex-start',
        }}
        title={(isCollapsed && !isMobile) ? label : ''}
      >
        {Icon && <Icon size={isMobile ? 24 : 20} />}
        {(!isCollapsed || isMobile) && <span style={{ fontSize: isMobile ? '1.05rem' : '0.9rem', fontWeight: active ? 600 : 400 }}>{label}</span>}
      </div>
    );

    if (isExternal) return <a href={path} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{content}</a>;
    return <Link to={path} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{content}</Link>;
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: sidebarWidth }}
      style={{
        height: '100%',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(15, 23, 42, 0.3)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        zIndex: 20,
      }}
    >
      {!isMobile && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            position: 'absolute',
            right: '-12px',
            top: '24px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            color: 'white',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 30,
          }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}

      <div style={{ padding: '0.5rem 0.5rem 0 0.5rem' }}>
        {navItems.map(item => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            path={item.path}
            active={location.pathname === item.path}
          />
        ))}
      </div>

      {appConfig.features.treeList && (
        <div style={{ padding: '0 1rem 0.5rem 1rem', overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            {!isCollapsed ? (
              <motion.div
                key="expanded-header"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderBottom: '1px solid var(--border-color)',
                    marginBottom: '0.5rem',
                  }}
                >
                  <Link
                    to="/trees"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.5rem',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      flex: 1,
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    <TreePine size={20} stroke="currentColor" />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'inherit' }}>Arboles</span>
                  </Link>
                  <button
                    onClick={() => navigate('/trees/new')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={t('trees.create_title')}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div style={{ position: 'relative', padding: '0 0.5rem' }}>
                  <Search size={16} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder={t('dashboard.search') || 'Buscar...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', paddingLeft: '2.5rem', fontSize: '0.85rem', height: '36px' }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed-header"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => navigate('/trees')}
                title="Arboles"
              >
                <TreePine size={24} color="var(--accent-primary)" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {appConfig.features.treeList ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', overflowX: 'hidden' }}>
          <AnimatePresence mode="wait">
            {!isCollapsed && !loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {filteredTrees.map((tree: any) => (
                  <NavItem
                    key={tree.id}
                    label={tree.name}
                    path={`/trees/${tree.id}`}
                    active={activeId === tree.id}
                  />
                ))}
              </motion.div>
            )}

            {isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                {trees.slice(0, 8).map((tree: any) => (
                  <Link
                    key={tree.id}
                    to={`/trees/${tree.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: activeId === tree.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: activeId === tree.id ? 'white' : 'var(--text-secondary)',
                      }}
                      title={tree.name}
                    >
                      {tree.name.substring(0, 1).toUpperCase()}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}
    </motion.div>
  );
};

export default memo(TreeSidebar);
