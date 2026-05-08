import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let toastIdCounter = 0;
const listeners: Set<(item: ToastItem) => void> = new Set();

export function toast(message: string, type: ToastType = 'error') {
  const id = ++toastIdCounter;
  listeners.forEach(fn => fn({ id, message, type }));
}

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const COLORS: Record<ToastType, { bg: string; border: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  info: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
};

function ToastCard({ item, onRemove }: { item: ToastItem; onRemove: () => void }) {
  const Icon = ICONS[item.type];
  const color = COLORS[item.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="glass-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.75rem 1rem',
        background: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: 'var(--radius-md)',
        backdropFilter: 'blur(16px)',
        fontSize: '0.85rem',
        color: 'var(--text-primary)',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <Icon size={18} style={{ flexShrink: 0, color: `var(--accent-${item.type === 'info' ? 'primary' : item.type === 'success' ? 'success' : 'danger'})` }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{item.message}</span>
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const addToast = useCallback((item: ToastItem) => {
    setToasts(prev => [...prev, item]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== item.id));
    }, 4000);
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => { listeners.delete(addToast); };
  }, [addToast]);

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: isMobile ? '80px' : '24px',
        right: isMobile ? '50%' : '24px',
        transform: isMobile ? 'translateX(50%)' : 'none',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        pointerEvents: 'none',
        maxWidth: isMobile ? 'calc(100vw - 2rem)' : '380px',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <ToastCard key={t.id} item={t} onRemove={() => removeToast(t.id)} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
