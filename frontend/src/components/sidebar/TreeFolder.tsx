import { useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Folder } from 'lucide-react';
import api from '../../lib/api';
import { NeedItem } from './NeedItem';
import type { Need } from '../../types';

interface Tree {
  id: string;
  name: string;
  memberCount?: number;
}

interface TreeFolderProps {
  tree: Tree;
  onSelectNeed: (needId: string, treeId: string) => void;
}

export function TreeFolder({ tree, onSelectNeed }: TreeFolderProps) {
  const [expanded, setExpanded] = useState(false);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (!expanded && needs.length === 0) {
      setLoading(true);
      api.get(`/trees/${tree.id}/needs`)
        .then(({ data }) => setNeeds(data.needs ?? data))
        .catch(() => setNeeds([]))
        .finally(() => setLoading(false));
    }
    setExpanded(!expanded);
  };

  return (
    <div className="tree-folder">
      <button className="tree-folder-btn" onClick={toggle}>
        <span className="tree-folder-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="tree-folder-icon">
          {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
        </span>
        <span className="tree-folder-name">{tree.name}</span>
      </button>

      {expanded && (
        <div className="tree-folder-children">
          {loading ? (
            <div className="sidebar-loading">Loading needs...</div>
          ) : needs.length === 0 ? (
            <div className="sidebar-empty-sm">No needs</div>
          ) : (
            needs.map((need) => (
              <NeedItem
                key={need.id}
                need={need}
                onClick={() => onSelectNeed(need.id, tree.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
