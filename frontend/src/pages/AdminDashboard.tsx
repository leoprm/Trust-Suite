import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Users, Cpu, DollarSign, CheckSquare,
  Search, ArrowUp, ArrowDown, TrendingUp, Loader2, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../lib/api';

interface Subscription {
  userId: string;
  status: string;
  monthlyCost: number | null;
  currentPeriodEnd: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  subscriptionActive: boolean;
  createdAt: string;
  subscription: Subscription | null;
}

interface AdminStats {
  activeUsers: number;
  registeredIAs: number;
  monthlyCost: number;
  completedTasks: number;
  totalUsers: number;
  users: UserRow[];
  monthlyTasks: { name: string; count: number }[];
}

function formatCLP(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function KpiCard({ icon, label, value, suffix, color }: {
  icon: React.ReactNode; label: string; value: string; suffix?: string; color: string;
}) {
  return (
    <div className="glass-panel" style={{
      padding: '1.15rem 1.25rem', borderRadius: 14,
      display: 'flex', alignItems: 'center', gap: '0.9rem',
      flex: '1 1 160px', minWidth: 0,
      border: `1px solid ${color}33`,
      background: `linear-gradient(135deg, ${color}11 0%, ${color}08 100%)`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${color}33 0%, ${color}18 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {value}
          {suffix && <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>{suffix}</span>}
        </p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load admin stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const filteredUsers = useMemo(() => {
    if (!stats?.users) return [];
    if (!searchTerm) return stats.users;
    const term = searchTerm.toLowerCase();
    return stats.users.filter(u =>
      u.username.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  }, [stats, searchTerm]);

  const sortedUsers = useMemo(() => {
    const items = [...filteredUsers];
    if (sortConfig) {
      items.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (typeof aVal === 'boolean') aVal = aVal ? 1 : 0;
        if (typeof bVal === 'boolean') bVal = bVal ? 1 : 0;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [filteredUsers, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUp size={12} style={{ opacity: 0.3 }} />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: '4rem auto', textAlign: 'center', padding: '2rem' }}>
        <Shield size={48} style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }} />
        <h2 style={{ marginBottom: '0.5rem' }}>Error loading admin data</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
        <button className="btn btn-primary" onClick={fetchStats}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const isMobile = window.innerWidth <= 768;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '1rem' : '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--accent-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <Shield size={isMobile ? 20 : 24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? '1.35rem' : '1.75rem' }}>Admin Dashboard</h1>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Trust Maker — Platform Overview
            </p>
          </div>
        </div>
        <button className="btn btn-outline" onClick={fetchStats} style={{ padding: '0.5rem 1rem' }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
      >
        <KpiCard icon={<Users size={18} />} label="Active Users" value={String(stats.activeUsers)} color="#3b82f6" />
        <KpiCard icon={<Cpu size={18} />} label="Registered IAs" value={String(stats.registeredIAs)} color="#8b5cf6" />
        <KpiCard icon={<DollarSign size={18} />} label="Monthly Cost" value={formatCLP(stats.monthlyCost)} color="#10b981" />
        <KpiCard icon={<CheckSquare size={18} />} label="Tasks Completed" value={String(stats.completedTasks)} color="#f59e0b" />
      </motion.div>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel"
        style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <TrendingUp size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Monthly Task Completion</h3>
        </div>
        {stats.monthlyTasks.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthlyTasks}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                }}
              />
              <Bar dataKey="count" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} name="Tasks" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No task data yet.</p>
        )}
      </motion.div>

      {/* User Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-panel"
        style={{ padding: '1.5rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Users ({stats.totalUsers})</h3>
          <div style={{ position: 'relative', flex: '0 1 320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '2.25rem', width: '100%', height: 36, fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            {searchTerm ? 'No users match your search.' : 'No users found.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <ThSort label="User" column="username" sortConfig={sortConfig} requestSort={requestSort} />
                  <ThSort label="Email" column="email" sortConfig={sortConfig} requestSort={requestSort} />
                  <ThSort label="Role" column="role" sortConfig={sortConfig} requestSort={requestSort} />
                  <ThSort label="Subscription" column="subscriptionActive" sortConfig={sortConfig} requestSort={requestSort} />
                  <ThSort label="Sub Status" column="subscription" sortConfig={sortConfig} requestSort={requestSort} />
                  <ThSort label="Joined" column="createdAt" sortConfig={sortConfig} requestSort={requestSort} />
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map(user => {
                  const sub = user.subscription;
                  const subStatus = user.subscriptionActive
                    ? (sub?.status || 'ACTIVE')
                    : 'INACTIVE';
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{user.username}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.email}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600,
                          background: user.role === 'ADMINISTRATOR' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                          color: user.role === 'ADMINISTRATOR' ? '#ef4444' : '#3b82f6',
                        }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600,
                          background: user.subscriptionActive ? 'rgba(16,185,129,0.15)' : 'rgba(156,163,175,0.15)',
                          color: user.subscriptionActive ? '#10b981' : '#9ca3af',
                        }}>
                          {user.subscriptionActive ? 'Subscribed' : 'Free'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600,
                          background: subStatus === 'ACTIVE' ? 'rgba(16,185,129,0.15)'
                            : subStatus === 'CANCELED' ? 'rgba(239,68,68,0.15)'
                            : 'rgba(156,163,175,0.15)',
                          color: subStatus === 'ACTIVE' ? '#10b981'
                            : subStatus === 'CANCELED' ? '#ef4444'
                            : '#9ca3af',
                        }}>
                          {subStatus}
                        </span>
                        {sub?.monthlyCost && (
                          <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {formatCLP(sub.monthlyCost)}/mo
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(user.createdAt).toLocaleDateString('es-CL')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ThSort({ label, column, sortConfig, requestSort }: {
  label: string; column: string;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  requestSort: (key: string) => void;
}) {
  const active = sortConfig?.key === column;
  return (
    <th
      onClick={() => requestSort(column)}
      style={{
        padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem',
        fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
        letterSpacing: '0.05em', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (sortConfig!.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}
