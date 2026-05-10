import { Lock, Unlock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

type Props = {
  tree: any; // tree object from GET /trees/:id
};

type GateState = {
  mode: string;
  label: string;
  description: string;
  unlocked: boolean;
  requirements: { label: string; met: boolean }[];
  progress: number; // 0-100
};

function deriveGates(tree: any): GateState[] {
  const memberCount = tree._count?.members || 0;
  const branchCount = tree._count?.branches || 0;
  const currentMode = tree.financingMode || 'GRATUITO';

  const gratuito: GateState = {
    mode: 'GRATUITO',
    label: 'Gratuito',
    description: 'Acceso sin costo para todos los miembros. Ideal para comunidades en formación.',
    unlocked: true, // Always unlocked
    requirements: [
      { label: 'Árbol creado', met: true },
    ],
    progress: 100,
  };

  // SUBSCRIPCION: requires 3+ members and at least 1 branch
  const reqMinMembers = memberCount >= 3;
  const reqMinBranches = branchCount >= 1;

  const subscripcion: GateState = {
    mode: 'SUBSCRIPCION',
    label: 'Subscripción',
    description: 'Cobro recurrente a miembros para financiar gastos operativos. Permite gestión de gastos y facturación automática.',
    unlocked: reqMinMembers && reqMinBranches,
    requirements: [
      { label: 'Mínimo 3 miembros', met: reqMinMembers },
      { label: 'Al menos 1 branch completada', met: reqMinBranches },
    ],
    progress: Math.round(
      ((memberCount >= 3 ? 50 : (memberCount / 3) * 50) +
       (branchCount >= 1 ? 50 : 0))
    ),
  };

  return [gratuito, subscripcion];
}

export default function MaturityGatesCard({ tree }: Props) {
  const gates = deriveGates(tree);
  const currentMode = tree.financingMode || 'GRATUITO';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Gate Cards */}
      {gates.map((gate, i) => {
        const isCurrent = gate.mode === currentMode;
        const isNext = !gate.unlocked && gates[i - 1]?.unlocked;

        return (
          <div
            key={gate.mode}
            style={{
              padding: '1.25rem',
              borderRadius: 12,
              border: isCurrent ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
              background: isCurrent
                ? 'rgba(59, 130, 246, 0.06)'
                : gate.unlocked
                  ? 'rgba(110, 231, 183, 0.04)'
                  : 'rgba(255,255,255,0.02)',
              position: 'relative',
              opacity: gate.unlocked || isCurrent ? 1 : 0.6,
            }}
          >
            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {gate.unlocked ? (
                  <Unlock size={18} color="var(--accent-success)" />
                ) : (
                  <Lock size={18} color="var(--text-secondary)" />
                )}
                <h4 style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)',
                }}>
                  {gate.label}
                </h4>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isCurrent && (
                  <span style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: 100,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}>
                    ACTIVO
                  </span>
                )}
                {gate.unlocked && !isCurrent && (
                  <span style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: 100,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'rgba(110, 231, 183, 0.15)',
                    color: 'var(--accent-success)',
                    border: '1px solid rgba(110, 231, 183, 0.2)',
                  }}>
                    Disponible
                  </span>
                )}
                {!gate.unlocked && (
                  <span style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: 100,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                  }}>
                    Bloqueado
                  </span>
                )}
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
              {gate.description}
            </p>

            {/* Requirements */}
            {gate.requirements.length > 1 && (
              <div style={{ marginBottom: gate.unlocked ? '0' : '0.75rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Requisitos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {gate.requirements.map((req, ri) => (
                    <div
                      key={ri}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.78rem',
                        color: req.met ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {req.met ? (
                        <CheckCircle2 size={14} color="var(--accent-success)" />
                      ) : (
                        <AlertCircle size={14} color="var(--text-secondary)" />
                      )}
                      {req.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress bar for locked modes */}
            {!gate.unlocked && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.35rem',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span>Progreso</span>
                  <span>{gate.progress}%</span>
                </div>
                <div style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.05)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${gate.progress}%`,
                    borderRadius: 3,
                    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-warning))',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Arrow between gates */}
            {i < gates.length - 1 && !gate.unlocked && (
              <div style={{
                position: 'absolute',
                bottom: -28,
                left: '50%',
                transform: 'translateX(-50%)',
              }}>
                <ArrowRight size={16} color="var(--text-secondary)" style={{ transform: 'rotate(90deg)' }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
