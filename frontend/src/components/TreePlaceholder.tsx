import { TreePine, Plus, Search } from 'lucide-react';

export default function TreePlaceholder() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100%', 
      color: 'var(--text-secondary)',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{ 
        width: '80px', 
        height: '80px', 
        borderRadius: '50%', 
        background: 'rgba(59, 130, 246, 0.1)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginBottom: '1.5rem'
      }}>
        <TreePine size={40} stroke="var(--accent-primary)" />
      </div>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Selecciona un Árbol</h2>
      <p style={{ maxWidth: '300px' }}>
        Selecciona un árbol de la lista de la izquierda para ver sus finanzas, miembros y necesidades activas.
      </p>
      
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
        <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <Search size={16} /> Buscar por nombre
        </div>
        <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <Plus size={16} /> Crear nuevo
        </div>
      </div>
    </div>
  );
}
