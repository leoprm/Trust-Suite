import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, GitBranch, Lightbulb, Package, Trash2, Edit, Plus, X, Search, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../lib/api';

type Tab = 'USERS' | 'TREES' | 'NEEDS' | 'BRANCHES' | 'DELIVERABLES';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('USERS');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    setSearchTerm('');
    setSelectedIds(new Set());
    setSortConfig(null);
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const endpoint = `/admin/${activeTab.toLowerCase()}`;
      const response = await api.get(endpoint);
      setData(response.data);
    } catch (error) {
      console.error(`Failed to fetch ${activeTab}`, error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this ${activeTab.substring(0, activeTab.length - 1)}? This action is irreversible.`)) return;
    
    try {
      await api.delete(`/admin/${activeTab.toLowerCase()}/${id}`);
      fetchData();
    } catch (error) {
      alert('Failed to delete item');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} items? This action is irreversible.`)) return;
    
    try {
      setLoading(true);
      await Promise.all(
        Array.from(selectedIds).map(id => api.delete(`/admin/${activeTab.toLowerCase()}/${id}`))
      );
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      console.error(error);
      alert('Failed to delete some items. They may be referenced by other records.');
      fetchData();
    }
  };

  const openModal = (item: any = null) => {
    setEditingItem(item);
    if (item) {
      setFormData({ ...item });
      if (activeTab === 'USERS') setFormData((prev: any) => ({ ...prev, password: '' }));
    } else {
      // Default initial states for creation
      if (activeTab === 'USERS') setFormData({ username: '', email: '', password: '', role: 'PERSON' });
      else if (activeTab === 'TREES') setFormData({ name: '', description: '' });
      else if (activeTab === 'NEEDS') setFormData({ title: '', description: '' });
      else setFormData({});
    }
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.patch(`/admin/${activeTab.toLowerCase()}/${editingItem.id}`, formData);
      } else {
        await api.post(`/admin/${activeTab.toLowerCase()}`, formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Operation failed');
    }
  };

  const filteredData = data.filter(row => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(row).some(val => 
      String(val).toLowerCase().includes(term)
    );
  });

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        // Handle nulls
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (aVal < bVal) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aVal > bVal) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      setSortConfig(null);
      return;
    }
    setSortConfig({ key, direction });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredData.map(row => row.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const renderTable = () => {
    if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>;

    const keysToDisplay = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'id' && !k.startsWith('_') && k !== 'password') : [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Search & Bulk Actions Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder={`Search ${activeTab.toLowerCase()}...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '2.5rem', width: '100%' }}
            />
          </div>
          
          {selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} className="btn btn-primary" style={{ background: 'var(--accent-danger)', border: 'none' }}>
              <Trash2 size={16} /> Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>

        {filteredData.length === 0 ? (
           <p style={{ color: 'var(--text-secondary)' }}>No records found matching your search.</p>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '1rem', width: '40px' }}>
                     <input 
                       type="checkbox" 
                       checked={filteredData.length > 0 && selectedIds.size === filteredData.length} 
                       onChange={handleSelectAll} 
                       style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                     />
                  </th>
                  <th 
                    onClick={() => requestSort('id')}
                    style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', transition: 'color 0.2s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      ID
                      {sortConfig?.key === 'id' && (
                        sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      )}
                    </div>
                  </th>
                  {keysToDisplay.map(key => (
                    <th 
                      key={key} 
                      onClick={() => requestSort(key)}
                      style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer', transition: 'color 0.2s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {key}
                        {sortConfig?.key === key && (
                          sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row: any) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)', background: selectedIds.has(row.id) ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                    <td style={{ padding: '1rem' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(row.id)}
                        onChange={() => handleSelectRow(row.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {row.id.substring(0, 8)}...
                    </td>
                    {keysToDisplay.map(key => {
                      let val = row[key];
                      if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                      return (
                        <td key={key} style={{ padding: '1rem', fontSize: '0.9rem' }}>
                          {String(val)}
                        </td>
                      );
                    })}
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none' }} onClick={() => openModal(row)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn btn-outline" style={{ padding: '0.4rem', border: 'none', color: 'var(--accent-danger)' }} onClick={() => handleDelete(row.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderFormFields = () => {
    switch (activeTab) {
      case 'USERS':
        return (
          <>
            <div className="input-group">
              <label>Username</label>
              <input type="text" className="input-field" value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })} required />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input type="email" className="input-field" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
            </div>
            <div className="input-group">
              <label>{editingItem ? 'New Password (optional)' : 'Password'}</label>
              <input type="password" className="input-field" value={formData.password || ''} onChange={e => setFormData({ ...formData, password: e.target.value })} required={!editingItem} />
            </div>
            <div className="input-group">
              <label>Role</label>
              <select className="input-field" value={formData.role || 'PERSON'} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                <option value="PERSON">PERSON</option>
                <option value="ADMINISTRATOR">ADMINISTRATOR</option>
              </select>
            </div>
          </>
        );
      case 'TREES':
        return (
          <>
            <div className="input-group">
              <label>Name</label>
              <input type="text" className="input-field" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea className="input-field" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} />
            </div>
          </>
        );
      case 'NEEDS':
        return (
          <>
            <div className="input-group">
              <label>Title</label>
              <input type="text" className="input-field" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} required />
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea className="input-field" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} />
            </div>
            <div className="input-group">
              <label>Creator ID (UUID)</label>
              <input type="text" className="input-field" value={formData.creatorId || ''} onChange={e => setFormData({ ...formData, creatorId: e.target.value })} required />
            </div>
          </>
        );
      case 'BRANCHES':
        return (
          <>
            <div className="input-group">
              <label>Phase</label>
              <input type="text" className="input-field" value={formData.phase || ''} onChange={e => setFormData({ ...formData, phase: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Current Phase Index</label>
              <input type="number" className="input-field" value={formData.currentPhaseIndex || 0} onChange={e => setFormData({ ...formData, currentPhaseIndex: e.target.value })} />
            </div>
            <div className="input-group">
              <label>XP Pool</label>
              <input type="number" className="input-field" value={formData.xpPool || 0} onChange={e => setFormData({ ...formData, xpPool: e.target.value })} />
            </div>
          </>
        );
      case 'DELIVERABLES':
        return (
          <>
            <div className="input-group">
              <label>URL</label>
              <input type="text" className="input-field" value={formData.deliverableUrl || ''} onChange={e => setFormData({ ...formData, deliverableUrl: e.target.value })} required />
            </div>
            <div className="input-group">
              <label>Status</label>
              <select className="input-field" value={formData.status || 'PENDING_REVIEW'} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'USERS', label: 'Users', icon: Users },
    { id: 'TREES', label: 'Trees', icon: GitBranch },
    { id: 'NEEDS', label: 'Needs', icon: Lightbulb },
    { id: 'BRANCHES', label: 'Branches', icon: GitBranch },
    { id: 'DELIVERABLES', label: 'Deliverables', icon: Package },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--accent-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <Shield size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Admin Dashboard</h1>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              System-wide administration and data management.
            </p>
          </div>
        </div>
        
        {activeTab !== 'BRANCHES' && activeTab !== 'DELIVERABLES' && (
          <button className="btn btn-primary" onClick={() => openModal()}>
            <Plus size={18} /> Add {activeTab.substring(0, activeTab.length - 1)}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-full)',
                background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {renderTable()}
      </motion.div>

      {/* Global CRUD Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel"
              style={{ width: '100%', maxWidth: '500px', position: 'relative' }}
            >
              <button onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
              
              <h2 style={{ marginBottom: '1.5rem' }}>
                {editingItem ? 'Edit' : 'Add'} {activeTab.substring(0, activeTab.length - 1)}
              </h2>
              
              <form onSubmit={handleModalSubmit} className="flex-col" style={{ gap: '1.25rem' }}>
                {renderFormFields()}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-outline w-full" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary w-full">
                    {editingItem ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
