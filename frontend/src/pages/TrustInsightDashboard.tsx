import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Loader2, Search, Filter, Trees, Lightbulb,
  Globe, Building2, TrendingUp, Clock, Tag, ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface Tree {
  id: string;
  name: string;
  description: string;
  visibility: string;
  _count?: { members: number };
}

interface Need {
  id: string;
  title: string;
  description: string;
  status: string;
  tags: string[];
  createdAt: string;
  creator?: { username: string };
  treeId?: string;
  tree?: { name: string };
}

export default function TrustInsightDashboard() {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch user's trees
      const { data: treeData } = await api.get('/trees');
      const myTrees: Tree[] = Array.isArray(treeData) ? treeData : (treeData?.trees ?? []);
      setTrees(myTrees);

      // Fetch needs across trees
      try {
        const { data: needData } = await api.get('/needs');
        const allNeeds: Need[] = Array.isArray(needData) ? needData : (needData?.needs ?? []);
        setNeeds(allNeeds);
      } catch {
        setNeeds([]);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Error loading insight data');
    }
    setLoading(false);
  };

  const filteredNeeds = useMemo(() => {
    let result = [...needs];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(term) ||
        n.description?.toLowerCase().includes(term) ||
        n.tags?.some(t => t.toLowerCase().includes(term))
      );
    }
    if (filter === 'open') result = result.filter(n => n.status === 'OPEN' || n.status === 'ACTIVE');
    if (filter === 'completed') result = result.filter(n => n.status === 'COMPLETED' || n.status === 'CLOSED');
    return result;
  }, [needs, searchTerm, filter]);

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
        <h2 style={{ marginBottom: '0.5rem' }}>Error loading data</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
        <button className="btn btn-primary" onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '1.5rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <div style={{ background: 'var(--accent-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <Activity size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Insight Signals</h1>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Cross-tree needs and opportunities — read-only view
            </p>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
      >
        <SummaryCard icon={<Trees size={18} />} label="My Trees" value={String(trees.length)} color="#8b5cf6" />
        <SummaryCard icon={<Lightbulb size={18} />} label="Total Signals" value={String(needs.length)} color="#3b82f6" />
        <SummaryCard icon={<Globe size={18} />} label="Open Needs" value={String(needs.filter(n => n.status === 'OPEN' || n.status === 'ACTIVE').length)} color="#10b981" />
        <SummaryCard icon={<TrendingUp size={18} />} label="Completed" value={String(needs.filter(n => n.status === 'COMPLETED' || n.status === 'CLOSED').length)} color="#f59e0b" />
      </motion.div>

      {/* Search & filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
      >
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search needs, tags, descriptions..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: '2.25rem', width: '100%', height: 40 }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'open', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 500 }}
            >
              {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Completed'}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Needs grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {filteredNeeds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Lightbulb size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>{searchTerm ? 'No needs match your search.' : 'No needs detected yet.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {filteredNeeds.map(need => (
              <NeedCard key={need.id} need={need} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div className="glass-panel" style={{
      padding: '1rem 1.25rem', borderRadius: 14,
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      flex: '1 1 140px', minWidth: 0,
      border: `1px solid ${color}33`,
      background: `linear-gradient(135deg, ${color}11 0%, ${color}08 100%)`,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${color}33 0%, ${color}18 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</p>
        <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</p>
      </div>
    </div>
  );
}

function NeedCard({ need }: { need: Need }) {
  const statusColor = need.status === 'OPEN' || need.status === 'ACTIVE' ? '#10b981'
    : need.status === 'COMPLETED' || need.status === 'CLOSED' ? '#f59e0b'
    : '#9ca3af';

  return (
    <div className="glass-panel" style={{
      padding: '1.25rem', borderRadius: 14,
      border: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, flex: 1 }}>{need.title}</h3>
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontSize: '0.65rem', fontWeight: 600,
          background: `${statusColor}18`, color: statusColor, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {need.status}
        </span>
      </div>

      {need.description && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {need.description.length > 200 ? need.description.slice(0, 200) + '...' : need.description}
        </p>
      )}

      {/* Tags */}
      {need.tags && need.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {need.tags.map(tag => (
            <span key={tag} style={{
              padding: '2px 8px', borderRadius: 6,
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Tag size={10} /> {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {need.creator && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Building2 size={10} /> {need.creator.username}
            </span>
          )}
          {need.tree && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Trees size={10} /> {need.tree.name}
            </span>
          )}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} /> {new Date(need.createdAt).toLocaleDateString('es-CL')}
        </span>
      </div>
    </div>
  );
}
