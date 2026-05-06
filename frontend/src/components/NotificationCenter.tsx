import { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, TrendingUp, Award, ChevronRight, CheckCheck } from 'lucide-react';
import { useMatrixStore } from '../store/matrixStore';
import type { Entidad, Accion } from '../store/matrixStore';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';

// ── Color maps ────────────────────────────────────────────────────────────────
const ENTITY_COLOR: Record<string, string> = {
  arbol: '#22c55e', necesidad: '#eab308', rama: '#3b82f6', tarea: '#ef4444',
};

const TYPE_ICON: Record<string, typeof Bell> = {
  TASK_AUDIT: AlertTriangle,
  BUDGET_COMPLETE: TrendingUp,
  LEVEL_UP: Award,
  XP_GAIN: Award,
  SKILL_UNLOCK: Award,
  AVAL_RISK: AlertTriangle,
  TASK_ASSIGNED: Bell,
  TASK_COMPLETED: CheckCheck,
  BRANCH_VOTE: TrendingUp,
  GENERAL: Bell,
};

const CATEGORY_COLOR: Record<string, string> = {
  URGENTE: '#ef4444',
  FLUJO: '#3b82f6',
  MERITO: '#eab308',
};

type FilterMode = 'all' | 'URGENTE' | 'FLUJO' | 'MERITO';

// ── Time-ago helper ───────────────────────────────────────────────────────────
function timeAgo(iso: string, t: (key: string, opts?: any) => string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('m.notif.now');
  if (diff < 3600) return t('m.notif.minutes_ago', { m: Math.floor(diff / 60) });
  if (diff < 86400) return t('m.notif.hours_ago', { h: Math.floor(diff / 3600) });
  return t('m.notif.days_ago', { d: Math.floor(diff / 86400) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NotificationCenter — replaces placeholder in UtilityDrawer
// ═══════════════════════════════════════════════════════════════════════════════
export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { setEntidad, setAccion, setNotificationCount } = useMatrixStore();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const params: any = { limit: 50 };
      if (filter !== 'all') params.category = filter;
      const { data } = await api.get('/notifications', { params });
      setNotifications(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // ── Mark single as read ─────────────────────────────────────────────
  const handleTap = async (notif: any) => {
    // Mark read
    if (!notif.isRead) {
      try {
        await api.patch(`/notifications/${notif.id}/read`);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
        // Update global badge
        const { data } = await api.get('/notifications/unread-count');
        setNotificationCount(data.count);
      } catch { /* silent */ }
    }

    // Deep-link navigation
    if (notif.entityType && notif.entityAction) {
      setEntidad(notif.entityType as Entidad);
      setAccion(notif.entityAction as Accion);
      onClose();
    }
  };

  // ── Mark all as read ────────────────────────────────────────────────
  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setNotificationCount(0);
    } catch { /* silent */ }
    setMarkingAll(false);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const FILTERS: { key: FilterMode; label: string; color: string }[] = [
    { key: 'all',     label: t('m.notif.all'),    color: '#fff' },
    { key: 'URGENTE', label: t('m.notif.urgent'), color: '#ef4444' },
    { key: 'FLUJO',   label: t('m.notif.flow'),    color: '#3b82f6' },
    { key: 'MERITO',  label: t('m.notif.merit'),   color: '#eab308' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.5rem' }}>

      {/* ── Filter pills ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '0.25rem 0.6rem', borderRadius: 16,
                background: active ? `${f.color}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? f.color : 'rgba(255,255,255,0.08)'}`,
                color: active ? f.color : 'rgba(255,255,255,0.5)',
                fontSize: '0.62rem', fontWeight: active ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}

        {/* Mark all read */}
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={markingAll}
            style={{
              marginLeft: 'auto', padding: '0.25rem 0.5rem',
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
              fontSize: '0.58rem', cursor: 'pointer',
            }}
          >
            <CheckCheck size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
            {markingAll ? '…' : t('m.notif.mark_all')}
          </button>
        )}
      </div>

      {/* ── Feed ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {loading && (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'center', paddingTop: '2rem' }}>
            {t('m.notif.loading')}
          </p>
        )}

        {!loading && notifications.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '3rem', opacity: 0.35 }}>
            <Bell size={28} color="#fff" style={{ marginBottom: 8 }} />
            <p style={{ color: '#fff', fontSize: '0.75rem' }}>{t('m.notif.empty')}</p>
          </div>
        )}

        {notifications.map(notif => {
          const Icon = TYPE_ICON[notif.type] || Bell;
          const accentColor = notif.entityType
            ? ENTITY_COLOR[notif.entityType] || CATEGORY_COLOR[notif.category] || '#888'
            : CATEGORY_COLOR[notif.category] || '#888';
          const isUnread = !notif.isRead;
          const isUrgent = notif.category === 'URGENTE';

          return (
            <button
              key={notif.id}
              onClick={() => handleTap(notif)}
              style={{
                display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                padding: '0.65rem 0.7rem', borderRadius: 12,
                background: isUnread ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isUnread ? accentColor + '30' : 'rgba(255,255,255,0.04)'}`,
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'background 0.15s',
              }}
              onPointerDown={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
              onPointerUp={e => (e.currentTarget.style.background = isUnread ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)')}
              onPointerLeave={e => (e.currentTarget.style.background = isUnread ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)')}
            >
              {/* Icon */}
              <div style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                background: `${accentColor}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                <Icon size={15} color={accentColor} />
              </div>

              {/* Body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {isUnread && (
                    <div style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: accentColor, flexShrink: 0,
                    }} />
                  )}
                  <span style={{
                    fontSize: '0.72rem', fontWeight: isUnread ? 700 : 500,
                    color: isUrgent ? accentColor : '#fff',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {notif.title}
                  </span>
                </div>

                <p style={{
                  fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)',
                  margin: '2px 0 0', lineHeight: 1.35,
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {notif.body}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 3 }}>
                  <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>
                    {timeAgo(notif.createdAt, t)}
                  </span>
                  {notif.entityType && (
                    <span style={{
                      fontSize: '0.52rem', color: accentColor, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 2,
                    }}>
                      {isUrgent ? t('m.notif.tap_to_act') : t('m.notif.view')} <ChevronRight size={10} />
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
