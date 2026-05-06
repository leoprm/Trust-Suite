import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Users, Activity, Lock, Wallet, Smile, ArrowRight } from 'lucide-react';

interface InvitationModalProps {
  tree: any;
  settings: any;
  onAccept: () => void;
  onReject: () => void;
  healthData: {
    fiatIncome: number;
    fiatExpense: number;
    satisfactionAverage: number;
    estimatedWeeks: number;
  };
}

export default function InvitationModal({ tree, settings, onAccept, onReject, healthData = { fiatIncome: 0, fiatExpense: 0, satisfactionAverage: 4.5, estimatedWeeks: 1 } }: InvitationModalProps) {
  const data = healthData || { fiatIncome: 0, fiatExpense: 0, satisfactionAverage: 4.5, estimatedWeeks: 1 };
  const isCentralized = !settings.governance.anyoneCanInvite || !settings.governance.inviterCanDelete;
  const isHierarchical = settings.governance.powerAssignment === 'HIERARCHICAL';

  const activeModules = [
    settings.modules.points.enabled && settings.modules.points.name,
    settings.modules.fiat.enabled && settings.modules.fiat.name,
    settings.modules.levels.enabled && settings.modules.levels.name,
    settings.modules.effort.enabled && settings.modules.effort.name,
    settings.modules.satisfaction.enabled && settings.modules.satisfaction.name,
  ].filter(Boolean);

  return (
    <AnimatePresence>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem'
      }}>
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="glass-panel"
          style={{ width: '100%', maxWidth: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {/* Header */}
          <div style={{ padding: '2rem 2rem 1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <ShieldCheck size={32} stroke="var(--accent-primary)" />
            </div>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>{tree.name}</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Has sido invitado a participar en este ecosistema.</p>
          </div>

          <div style={{ padding: '1.5rem 2rem', overflowY: 'auto', maxHeight: '60vh', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Rules Section */}
            <div>
              <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Users size={18} /> Reglas del Grupo
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estructura</span>
                  <div style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: '0.25rem' }}>
                    {isCentralized ? 'Centralizada' : 'Comunitaria'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asignación de Poder</span>
                  <div style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: '0.25rem', color: isHierarchical ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                    {isHierarchical ? 'Jerárquico (Admin)' : 'Igualitario'}
                  </div>
                </div>
              </div>
              
              {activeModules.length > 0 && (
                <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                   <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>Métricas Activas en este Entorno</span>
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                     {activeModules.map((mod, i) => (
                       <span key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '0.25rem 0.6rem', borderRadius: '100px', fontSize: '0.8rem' }}>{mod as string}</span>
                     ))}
                   </div>
                </div>
              )}
            </div>

            {/* Ecosystem Health Section */}
            {(settings.modules.fiat.enabled || settings.modules.satisfaction.enabled) && (
              <div>
                <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <Activity size={18} /> Salud del Ecosistema
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {settings.modules.fiat.enabled && (
                    <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <Wallet size={16} stroke="var(--accent-success)" />
                        <span style={{ fontWeight: 600 }}>Economía ({settings.modules.fiat.name}) - Último Trimestre</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ingresos</span>
                          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-success)' }}>${data.fiatIncome.toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Egresos</span>
                          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-danger)' }}>${data.fiatExpense.toLocaleString()}</div>
                        </div>
                      </div>
                      
                      <button disabled style={{ 
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
                        padding: '0.75rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
                        cursor: 'not-allowed', fontSize: '0.85rem'
                      }}>
                        <Lock size={14} /> Acepta la invitación para ver el historial detallado
                      </button>
                    </div>
                  )}

                  {settings.modules.satisfaction.enabled && (
                    <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <Smile size={16} stroke="var(--accent-primary)" />
                        <span style={{ fontWeight: 600 }}>Aprobación Promedio ({settings.modules.satisfaction.name})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ fontSize: data.satisfactionAverage === null ? '1rem' : '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                          {data.satisfactionAverage !== null ? `${data.satisfactionAverage.toFixed(1)}/5.0` : 'Aún sin datos'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${(data.satisfactionAverage / 5) * 100}%`, height: '100%', background: 'var(--accent-primary)' }} />
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.5rem' }}>
                            Tiempo estimado para meta: {data.estimatedWeeks} semanas
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div style={{ padding: '1.5rem 2rem', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '1rem' }}>
            <button 
              onClick={onReject}
              className="btn btn-outline" 
              style={{ flex: 1, padding: '1rem', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
            >
              Rechazar
            </button>
            <button 
              onClick={onAccept}
              className="btn btn-primary" 
              style={{ flex: 3, padding: '1rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              Aceptar Invitación y Entrar <ArrowRight size={18} />
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
