import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GenericVoteModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: (value: number) => void;
  initialValue?: number;
}

export default function GenericVoteModal({ isOpen, title, description, onClose, onConfirm, initialValue = 5 }: GenericVoteModalProps) {
  const [value, setValue] = useState(initialValue);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        key="backdrop"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(8px)', padding: '1rem'
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          style={{
            background: 'var(--bg-card)', padding: '2rem', borderRadius: 'var(--radius-xl)',
            width: '100%', maxWidth: '350px', border: '1px solid var(--border-color)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h2>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.8 }}>{description}</p>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--accent-primary)', textShadow: '0 0 20px rgba(59,130,246,0.3)' }}>
              {value}
            </span>
            
            <input 
              type="range" 
              min="1" 
              max="10" 
              step="1" 
              value={value} 
              onChange={(e) => setValue(parseInt(e.target.value))}
              style={{ 
                width: '100%', cursor: 'pointer', height: '8px', borderRadius: '4px',
                accentColor: 'var(--accent-primary)', background: 'rgba(255,255,255,0.05)'
              }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 0.5rem' }}>
              {[1, 5, 10].map(n => (
                <span key={n} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.5 }}>{n}</span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%' }}>
            <button 
              onClick={onClose}
              style={{
                padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                background: 'transparent', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button 
              onClick={() => onConfirm(value)}
              style={{
                padding: '0.75rem', borderRadius: 'var(--radius-md)', border: 'none',
                background: 'var(--accent-primary)', color: 'white', fontSize: '0.9rem', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
              }}
            >
              Votar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
