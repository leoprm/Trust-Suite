import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';

interface ConciergeBubbleProps {
  isOpen: boolean;
  onClick: () => void;
  hasUnread?: boolean;
  pendingWelcome?: boolean;
}

const ConciergeBubble: React.FC<ConciergeBubbleProps> = ({
  isOpen,
  onClick,
  hasUnread,
  pendingWelcome,
}) => {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      animate={{
        rotate: isOpen ? 90 : 0,
        boxShadow: isOpen
          ? '0 4px 20px rgba(255,215,0,0.25)'
          : pendingWelcome
            ? '0 4px 24px rgba(255,215,0,0.35), 0 0 16px rgba(255,215,0,0.15)'
            : '0 4px 20px rgba(0,0,0,0.4)',
      }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      style={{
        position: 'fixed',
        bottom: '5rem',
        right: '1.2rem',
        zIndex: 99998,
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        background: isOpen
          ? 'rgba(13,13,26,0.95)'
          : pendingWelcome
            ? 'linear-gradient(135deg, #FFD700, #FF8C00)'
            : 'linear-gradient(135deg, #FFD700, #FFA500)',
        border: isOpen
          ? '1.5px solid rgba(255,215,0,0.4)'
          : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        backdropFilter: 'blur(12px)',
        animation: pendingWelcome ? 'pulse-welcome 2s ease-in-out infinite' : 'none',
      }}
    >
      {isOpen ? (
        <X size={22} color="#FFF8DC" />
      ) : (
        <>
          <MessageCircle size={24} color="#0D0D1A" fill="#0D0D1A" />
          {hasUnread && (
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#EF4444',
                border: '2px solid #0D0D1A',
              }}
            />
          )}
          {!hasUnread && pendingWelcome && (
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#FFD700',
                border: '2px solid #0D0D1A',
                boxShadow: '0 0 8px rgba(255,215,0,0.5)',
              }}
            />
          )}
        </>
      )}
    </motion.button>
  );
};

export default ConciergeBubble;
