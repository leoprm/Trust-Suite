import { useEffect, useState } from 'react';
import { Eye, Lock, Search, BarChart3, ShieldCheck, Save, AlertTriangle, Download } from 'lucide-react';
import api from '../lib/api';
import { downloadJsonExport } from '../lib/downloadExport';

type VisibilityLevel = 'PRIVATE' | 'TREE_ONLY' | 'TRUST_NETWORK' | 'PUBLIC';

interface PrivacySettings {
  traceProfileVisibility: VisibilityLevel;
  taskHistoryVisibility: VisibilityLevel;
  evidenceVisibility: VisibilityLevel;
  showInTalentSearch: boolean;
  allowAggregatedMetrics: boolean;
}

const VISIBILITY_OPTIONS: { value: VisibilityLevel; label: string; description: string }[] = [
  { value: 'PRIVATE', label: 'Privado', description: 'Solo tu puedes verlo.' },
  { value: 'TREE_ONLY', label: 'Solo mi Tree', description: 'Visible para miembros de tus Arboles.' },
  { value: 'TRUST_NETWORK', label: 'Red Trust', description: 'Visible para usuarios autenticados.' },
  { value: 'PUBLIC', label: 'Publico', description: 'Visible mediante enlace publico o perfil compartible.' },
];

const DEFAULT_SETTINGS: PrivacySettings = {
  traceProfileVisibility: 'TREE_ONLY',
  taskHistoryVisibility: 'PRIVATE',
  evidenceVisibility: 'PRIVATE',
  showInTalentSearch: false,
  allowAggregatedMetrics: true,
};

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 46,
        height: 26,
        borderRadius: 13,
        border: `1px solid ${checked ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.12)'}`,
        background: checked ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.06)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 3,
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        opacity: disabled ? 0.6 : 1,
      }}
      aria-pressed={checked}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          background: checked ? '#22c55e' : 'rgba(255,255,255,0.45)',
          display: 'block',
        }}
      />
    </button>
  );
}

function VisibilitySection({
  icon,
  title,
  description,
  warning,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  warning?: string;
  value: VisibilityLevel;
  onChange: (value: VisibilityLevel) => void;
}) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.iconBox}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={styles.title}>{title}</h3>
          <p style={styles.description}>{description}</p>
        </div>
      </div>

      {warning && (
        <div style={styles.warning}>
          <AlertTriangle size={14} />
          <span>{warning}</span>
        </div>
      )}

      <div style={styles.optionGrid}>
        {VISIBILITY_OPTIONS.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                ...styles.option,
                borderColor: isActive ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)',
                background: isActive ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <span style={{ ...styles.optionLabel, color: isActive ? '#93c5fd' : '#fff' }}>
                {option.label}
              </span>
              <span style={styles.optionDesc}>{option.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function PrivacySettingsPanel() {
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    api.get('/privacy-settings/me')
      .then(({ data }) => {
        const next = {
          traceProfileVisibility: data.traceProfileVisibility || DEFAULT_SETTINGS.traceProfileVisibility,
          taskHistoryVisibility: data.taskHistoryVisibility || DEFAULT_SETTINGS.taskHistoryVisibility,
          evidenceVisibility: data.evidenceVisibility || DEFAULT_SETTINGS.evidenceVisibility,
          showInTalentSearch: !!data.showInTalentSearch,
          allowAggregatedMetrics: data.allowAggregatedMetrics !== false,
        };
        setSettings(next);
        setSavedSettings(next);
      })
      .catch(() => setError('No se pudo cargar tu configuracion de privacidad.'))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const updateSetting = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    setSuccess(false);
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { data } = await api.put('/privacy-settings/me', settings);
      const next = {
        traceProfileVisibility: data.traceProfileVisibility,
        taskHistoryVisibility: data.taskHistoryVisibility,
        evidenceVisibility: data.evidenceVisibility,
        showInTalentSearch: data.showInTalentSearch,
        allowAggregatedMetrics: data.allowAggregatedMetrics,
      };
      setSettings(next);
      setSavedSettings(next);
      setSuccess(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const exportProfile = async () => {
    setExporting(true);
    setError(null);
    setExportSuccess(false);
    try {
      await downloadJsonExport('/exports/me/profile');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo exportar tu perfil.');
      setExportSuccess(false);
    } finally {
      setExporting(false);
    }
  };

  const requestDeletion = async () => {
    if (!window.confirm('¿Estás seguro? Esta acción es irreversible. Se eliminarán tus datos personales (nombre, email, foto). Las contribuciones pasadas quedarán anónimas.')) return;
    setDeleting(true);
    setError(null);
    try {
      await api.post('/users/me/request-deletion');
      setDeleteSuccess(true);
      setTimeout(() => {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }, 2000);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo procesar la solicitud.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        Cargando privacidad...
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <header style={styles.header}>
        <div style={styles.headerIcon}>
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 style={styles.heading}>Privacidad</h2>
          <p style={styles.lead}>
            Controla que informacion de tu actividad en Trust puede ver otras personas.
          </p>
        </div>
      </header>

      <VisibilitySection
        icon={<Eye size={18} />}
        title="Perfil Trace"
        description="Define quien puede ver tu identidad, reputacion y portafolio Trace."
        value={settings.traceProfileVisibility}
        onChange={(value) => updateSetting('traceProfileVisibility', value)}
      />

      <VisibilitySection
        icon={<BarChart3 size={18} />}
        title="Historial de tareas"
        description="Controla si otros pueden ver tareas completadas y auditadas en tu perfil."
        value={settings.taskHistoryVisibility}
        onChange={(value) => updateSetting('taskHistoryVisibility', value)}
      />

      <VisibilitySection
        icon={<Lock size={18} />}
        title="Evidencias"
        description="Controla si fotos, archivos o pruebas asociadas a tus tareas son visibles."
        warning="Las evidencias pueden contener informacion sensible. Mantenerlas privadas es la opcion recomendada."
        value={settings.evidenceVisibility}
        onChange={(value) => updateSetting('evidenceVisibility', value)}
      />

      <section style={styles.section}>
        <div style={styles.row}>
          <div style={styles.iconBox}><Search size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={styles.title}>Busqueda de talento</h3>
            <p style={styles.description}>
              Aparecer en busqueda de talento permite que otros Trees o clientes te encuentren para oportunidades. Puedes desactivarlo cuando quieras.
            </p>
          </div>
          <Toggle
            checked={settings.showInTalentSearch}
            onChange={(value) => updateSetting('showInTalentSearch', value)}
          />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.row}>
          <div style={styles.iconBox}><BarChart3 size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={styles.title}>Metricas agregadas internas</h3>
            <p style={styles.description}>
              Las metricas agregadas ayudan al Tree a entender actividad general sin mostrar tus datos personales de forma individual.
            </p>
          </div>
          <Toggle
            checked={settings.allowAggregatedMetrics}
            onChange={(value) => updateSetting('allowAggregatedMetrics', value)}
          />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.row}>
          <div style={styles.iconBox}><Download size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={styles.title}>Exportar mi perfil</h3>
            <p style={styles.description}>
              Descarga una copia de tu perfil, tareas, XP, habilidades y configuracion. No incluye archivos privados crudos de evidencia, solo metadata y hashes.
            </p>
          </div>
          <button
            type="button"
            onClick={exportProfile}
            disabled={exporting}
            style={{
              ...styles.smallButton,
              opacity: exporting ? 0.6 : 1,
              cursor: exporting ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} />
            {exporting ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </section>

      <section style={styles.section}>
        <div style={{ ...styles.row, alignItems: 'flex-start' }}>
          <div style={styles.iconBox}><AlertTriangle size={18} color="#ef4444" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ ...styles.title, color: '#fca5a5' }}>Derecho al olvido</h3>
            <p style={styles.description}>
              Solicita la eliminacion de tus datos personales. Tu cuenta sera anonimizada: se eliminara tu nombre, email, foto y configuracion. Las tareas y contribuciones pasadas se conservan sin dato personal asociado. Esta accion es irreversible.
            </p>
            {deleteSuccess && <p style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: '#86efac' }}>✅ Solicitud procesada. Seras redirigido al login.</p>}
          </div>
          <button
            type="button"
            onClick={requestDeletion}
            disabled={deleting}
            style={{
              ...styles.smallButton,
              background: 'rgba(239,68,68,0.14)',
              border: '1px solid rgba(239,68,68,0.28)',
              color: '#fca5a5',
              opacity: deleting ? 0.6 : 1,
              cursor: deleting ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {deleting ? 'Procesando...' : 'Eliminar datos'}
          </button>
        </div>
      </section>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>Cambios guardados.</div>}
      {exportSuccess && <div style={styles.success}>Exportacion generada.</div>}

      <button
        type="button"
        onClick={save}
        disabled={!isDirty || saving}
        style={{
          ...styles.saveButton,
          opacity: !isDirty || saving ? 0.55 : 1,
          cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
        }}
      >
        <Save size={16} />
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
    color: '#fff',
  },
  header: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    padding: '0.8rem',
    borderRadius: 12,
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.18)',
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#93c5fd',
    background: 'rgba(59,130,246,0.14)',
    flexShrink: 0,
  },
  heading: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 800,
  },
  lead: {
    margin: '0.25rem 0 0',
    fontSize: '0.68rem',
    lineHeight: 1.45,
    color: 'rgba(255,255,255,0.62)',
  },
  section: {
    padding: '0.8rem',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  sectionHeader: {
    display: 'flex',
    gap: '0.65rem',
    alignItems: 'flex-start',
  },
  row: {
    display: 'flex',
    gap: '0.65rem',
    alignItems: 'center',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.78)',
    background: 'rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '0.8rem',
    fontWeight: 750,
  },
  description: {
    margin: '0.22rem 0 0',
    fontSize: '0.62rem',
    color: 'rgba(255,255,255,0.52)',
    lineHeight: 1.4,
  },
  warning: {
    marginTop: '0.7rem',
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'flex-start',
    padding: '0.55rem',
    borderRadius: 9,
    color: '#fbbf24',
    background: 'rgba(251,191,36,0.08)',
    border: '1px solid rgba(251,191,36,0.16)',
    fontSize: '0.58rem',
    lineHeight: 1.35,
  },
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.45rem',
    marginTop: '0.7rem',
  },
  option: {
    minHeight: 72,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '0.6rem',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'inherit',
    fontFamily: 'inherit',
  },
  optionLabel: {
    display: 'block',
    fontSize: '0.68rem',
    fontWeight: 800,
    marginBottom: '0.25rem',
  },
  optionDesc: {
    display: 'block',
    fontSize: '0.55rem',
    color: 'rgba(255,255,255,0.48)',
    lineHeight: 1.35,
  },
  saveButton: {
    minHeight: 42,
    borderRadius: 12,
    border: '1px solid rgba(59,130,246,0.32)',
    background: 'rgba(59,130,246,0.22)',
    color: '#dbeafe',
    fontSize: '0.78rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.45rem',
    fontFamily: 'inherit',
  },
  smallButton: {
    minHeight: 36,
    borderRadius: 10,
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(59,130,246,0.14)',
    color: '#dbeafe',
    fontSize: '0.68rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  error: {
    padding: '0.65rem 0.75rem',
    borderRadius: 10,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#fca5a5',
    fontSize: '0.66rem',
  },
  success: {
    padding: '0.65rem 0.75rem',
    borderRadius: 10,
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    color: '#86efac',
    fontSize: '0.66rem',
  },
  loading: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    fontSize: '0.82rem',
  },
};
