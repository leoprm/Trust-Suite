import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function NewNeed() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [trees, setTrees] = useState<any[]>([]);
  const [selectedTreeIds, setSelectedTreeIds] = useState<string[]>([]);
  const [proposesHashtag, setProposesHashtag] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchTrees();
    const params = new URLSearchParams(location.search);
    const treeId = params.get('treeId');
    const isHashtag = params.get('hashtag') === 'true';
    if (treeId) {
      setSelectedTreeIds([treeId]);
    }
    if (isHashtag) {
      setProposesHashtag(true);
    }
  }, [location]);

  const fetchTrees = async () => {
    try {
      const { data } = await api.get('/trees');
      setTrees(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async () => {
    if (selectedTreeIds.length === 0) {
      alert(t('new_need.select_trees'));
      return;
    }
    try {
      await api.post('/needs', { title, description, treeIds: selectedTreeIds, proposesHashtag });
      navigate('/');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to create need');
    }
  };

  const toggleTree = (id: string) => {
    setSelectedTreeIds(prev => {
      const newIds = prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id];
      // Adjust hashtag toggle if needed based on new selection
      if (newIds.length === 1) {
        const tree = trees.find(t => t.id === newIds[0]);
        if (tree) {
          if (!tree.allowTraditionalBranches) setProposesHashtag(true);
          if (!tree.allowHashtags) setProposesHashtag(false);
        }
      }
      return newIds;
    });
  };

  const selectedTrees = trees.filter(t => selectedTreeIds.includes(t.id));
  const anyHashtagAllowed = selectedTrees.length === 0 || selectedTrees.some(t => t.allowHashtags);
  const allHashtagOnly = selectedTrees.length > 0 && selectedTrees.every(t => !t.allowTraditionalBranches);
  const allTraditionalOnly = selectedTrees.length > 0 && selectedTrees.every(t => !t.allowHashtags);

  return (
    <div className="container mt-8 flex justify-center" style={{ paddingBottom: '4rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem' }}>
        <header className="flex items-center gap-4 mb-8">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} /> {t('trees.back')}
          </button>
          <h2 style={{ margin: 0 }}>{t('new_need.title')}</h2>
        </header>

        <div className="flex-col gap-6">
          <div className="input-group">
            <label>{t('new_need.title_label')}</label>
            <input 
              className="input-field" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder={t('new_need.title_placeholder')}
            />
          </div>

          <div className="input-group">
            <label>{t('new_need.desc_label')}</label>
            <textarea 
              className="input-field" 
              style={{ minHeight: '120px', resize: 'vertical' }}
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder={t('new_need.desc_placeholder')}
            />
          </div>

          <div className="input-group">
            <label>{t('new_need.select_trees')}</label>
            <div className="flex-col gap-2 mt-2">
              {trees.map(tree => (
                <label key={tree.id} className="flex items-center gap-2 cursor-pointer" style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedTreeIds.includes(tree.id)}
                    onChange={() => toggleTree(tree.id)}
                    style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                  />
                  <span>{tree.name}</span>
                </label>
              ))}
              {trees.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('trees.no_trees')}</span>}
            </div>
          </div>

          {anyHashtagAllowed && !allTraditionalOnly && (
            <div className="input-group">
              <label className="flex items-center gap-2 cursor-pointer" style={{ 
                padding: '0.75rem', 
                background: proposesHashtag ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.02)', 
                borderRadius: '8px', 
                border: '1px solid',
                borderColor: proposesHashtag ? 'rgba(245,158,11,0.2)' : 'var(--border-color)',
                opacity: allHashtagOnly ? 0.8 : 1
              }}>
                <input 
                  type="checkbox" 
                  checked={proposesHashtag}
                  onChange={(e) => setProposesHashtag(e.target.checked)}
                  disabled={allHashtagOnly}
                  style={{ accentColor: 'var(--accent-warning)', width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--accent-warning)', fontSize: '0.95rem' }}>
                    Proponer como Hashtag (#) {allHashtagOnly && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>(Requerido en este árbol)</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Crea una categoría global para tareas rápidas. Salta el proceso de votación de ideas.
                  </div>
                </div>
              </label>
            </div>
          )}

          <button className="btn btn-primary w-full mt-4" onClick={handleCreate} disabled={!title || !description || selectedTreeIds.length === 0}>
            <Plus size={18} /> {t('new_need.publish_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
