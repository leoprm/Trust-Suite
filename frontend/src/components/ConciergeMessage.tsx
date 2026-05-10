import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Plus, Settings2 } from 'lucide-react';

export interface ConciergeActionItem {
  label: string;
  action: string; // 'view_need' | 'create_need' | 'configure_tree' | etc.
  payload?: any;
}

interface ConciergeMessageProps {
  content: string;
  sender: 'user' | 'concierge';
  actions?: ConciergeActionItem[];
  onAction?: (item: ConciergeActionItem) => void;
  timestamp?: number;
}

const COLORS = {
  user: '#1A1A2E',
  concierge: '#16213E',
} as const;

const ACTION_ICONS: Record<string, React.ElementType> = {
  view_need: ArrowRight,
  create_need: Plus,
  configure_tree: Settings2,
};

const ConciergeMessage: React.FC<ConciergeMessageProps> = ({
  content,
  sender,
  actions,
  onAction,
}) => {
  const isUser = sender === 'user';
  const bg = COLORS[sender];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '0.6rem',
        padding: isUser ? '0 0 0 2rem' : '0 2rem 0 0',
      }}
    >
      {/* Sender label */}
      <span
        style={{
          fontSize: '0.65rem',
          color: 'rgba(255,248,220,0.35)',
          marginBottom: '0.2rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        {isUser ? 'Tú' : 'Hermes Concierge'}
      </span>

      {/* Message bubble */}
      <div
        style={{
          background: bg,
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          padding: '0.65rem 0.85rem',
          maxWidth: '100%',
          border: '1px solid rgba(255,248,220,0.06)',
          fontSize: '0.82rem',
          lineHeight: 1.55,
          color: '#FFF8DC',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>

      {/* Action buttons (concierge only) */}
      {!isUser && actions && actions.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            marginTop: '0.5rem',
          }}
        >
          {actions.map((item, i) => {
            const Icon = ACTION_ICONS[item.action] || ArrowRight;
            return (
              <motion.button
                key={i}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onAction?.(item)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.7rem',
                  background: 'rgba(255,215,0,0.1)',
                  border: '1px solid rgba(255,215,0,0.2)',
                  borderRadius: '8px',
                  color: '#FFD700',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <Icon size={13} />
                {item.label}
              </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default ConciergeMessage;
