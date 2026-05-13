import type { Need } from '../../types';
import { useUIStore } from '../../store/uiStore';
import './NeedItem.css';

interface NeedItemProps {
  need: Need;
  onClick: () => void;
}

export function NeedItem({ need, onClick }: NeedItemProps) {
  const setActiveNeedAndTree = useUIStore((s) => s.setActiveNeedAndTree);

  const badgeColor = (importance: number): string => {
    if (importance >= 8) return 'var(--accent-danger)';
    if (importance >= 6) return 'var(--accent-warning)';
    if (importance >= 4) return 'var(--accent-primary)';
    return 'var(--accent-success)';
  };

  const handleClick = () => {
    setActiveNeedAndTree(need.id, need.treeId);
    onClick(); // close mobile sidebar
  };

  return (
    <button className="need-item" onClick={handleClick}>
      <span className="need-item-title">{need.title}</span>
      <span
        className="need-item-badge"
        style={{ background: badgeColor(need.importance ?? 0) }}
      >
        {need.importance ?? '—'}
      </span>
    </button>
  );
}
