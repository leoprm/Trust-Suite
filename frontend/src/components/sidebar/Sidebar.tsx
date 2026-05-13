import { TreeList } from './TreeList';
import './Sidebar.css';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onSelectNeed: (needId: string, treeId: string) => void;
}

function Sidebar({ open, onClose, onSelectNeed }: SidebarProps) {
  return (
    <aside className={`sidebar glass-panel ${open ? 'sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">Trees</h2>
      </div>
      <nav className="sidebar-nav">
        <TreeList onSelectNeed={(needId, treeId) => {
          onSelectNeed(needId, treeId);
          onClose();
        }} />
      </nav>
    </aside>
  );
}

export default Sidebar;
