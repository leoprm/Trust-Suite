import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { TreeFolder } from './TreeFolder';

interface Tree {
  id: string;
  name: string;
  memberCount?: number;
}

interface TreeListProps {
  onSelectNeed: (needId: string, treeId: string) => void;
}

export function TreeList({ onSelectNeed }: TreeListProps) {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/trees/')
      .then(({ data }) => setTrees(data.trees ?? data))
      .catch(() => setTrees([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="sidebar-loading">Loading trees...</div>;
  }

  if (trees.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>No trees yet.</p>
        <p>Join or create one to start.</p>
      </div>
    );
  }

  return (
    <div className="tree-list">
      {trees.map((tree) => (
        <TreeFolder key={tree.id} tree={tree} onSelectNeed={onSelectNeed} />
      ))}
    </div>
  );
}
