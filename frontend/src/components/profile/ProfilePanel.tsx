import { X, User, TreePine, Coins } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './ProfilePanel.css';

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
}

function ProfilePanel({ open, onClose }: ProfilePanelProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <>
      {/* Backdrop */}
      {open && <div className="profile-backdrop" onClick={onClose} />}

      {/* Panel */}
      <aside className={`profile-panel glass-panel ${open ? 'profile-panel--open' : ''}`}>
        <div className="profile-panel-header">
          <h3 className="profile-panel-title">Perfil</h3>
          <button className="profile-close-btn" onClick={onClose} aria-label="Cerrar perfil">
            <X size={20} />
          </button>
        </div>

        <div className="profile-panel-body">
          {/* Avatar + name */}
          <div className="profile-avatar-section">
            <div className="profile-avatar">
              <User size={40} />
            </div>
            <h2 className="profile-name">{user?.username ?? 'Usuario'}</h2>
            <span className="profile-role">{user?.role ?? 'member'}</span>
          </div>

          {/* Stats */}
          <div className="profile-stats">
            <div className="profile-stat">
              <Coins size={18} />
              <div>
                <span className="profile-stat-value">{user?.totalWeeklyPoints ?? 0}</span>
                <span className="profile-stat-label">puntos semanales</span>
              </div>
            </div>
          </div>

          {/* Trees / Memberships */}
          <div className="profile-section">
            <h4 className="profile-section-title">
              <TreePine size={16} />
              Mis Árboles
            </h4>
            {user?.memberships && user.memberships.length > 0 ? (
              <ul className="profile-tree-list">
                {user.memberships.map((m) => (
                  <li key={m.id} className="profile-tree-item">
                    <div className="profile-tree-info">
                      <span className="profile-tree-name">Árbol {m.treeId.slice(0, 8)}</span>
                      <span className={`profile-tree-badge ${m.status === 'ACTIVE' ? 'badge-active' : ''}`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="profile-tree-meta">
                      <span>Nivel {m.level}</span>
                      <span>{m.xp} XP</span>
                      <span>{m.weeklyNeedPoints} pts</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="profile-empty">No tienes árboles aún. ¡Crea o únete a uno!</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default ProfilePanel;
