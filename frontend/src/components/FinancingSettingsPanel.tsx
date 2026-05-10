import { useState, useEffect } from 'react';
import { DollarSign, Save, Loader2 } from 'lucide-react';
import api from '../lib/api';

type Props = {
  treeId: string;
};

type FinancingConfig = {
  id: string;
  name: string;
  financingMode: 'GRATUITO' | 'SUBSCRIPCION';
  subscriptionAmount: number | null;
  subscriptionCurrency: string | null;
  subscriptionDayOfMonth: number | null;
  subscriptionBillingMode: string | null;
};

type SelectedMode = 'GRATUITO' | 'FIJA' | 'VARIABLE';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  fontWeight: 700,
  textTransform: 'uppercase',
};

function configToSelectedMode(c: FinancingConfig | null): SelectedMode {
  if (!c || c.financingMode === 'GRATUITO') return 'GRATUITO';
  if (c.subscriptionBillingMode === 'PROPORTIONAL') return 'VARIABLE';
  return 'FIJA';
}

const MODE_CARDS: { id: SelectedMode; title: string; desc: string; color: string; icon: string }[] = [
  {
    id: 'GRATUITO',
    title: 'Gratuito',
    desc: 'Acceso sin costo para miembros. Sin facturación.',
    color: 'var(--accent-success)',
    icon: '🆓',
  },
  {
    id: 'FIJA',
    title: 'Subscripción Fija',
    desc: 'Monto fijo mensual por miembro. Predecible y simple.',
    color: 'var(--accent-primary)',
    icon: '💰',
  },
  {
    id: 'VARIABLE',
    title: 'Subscripción Variable',
    desc: 'Gastos divididos entre miembros. Se ajusta cada mes.',
    color: 'var(--accent-warning)',
    icon: '📊',
  },
];

export default function FinancingSettingsPanel({ treeId }: Props) {
  const [config, setConfig] = useState<FinancingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedMode, setSelectedMode] = useState<SelectedMode>('GRATUITO');

  // Form state
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CLP');
  const [dayOfMonth, setDayOfMonth] = useState('1');

  useEffect(() => {
    fetchConfig();
  }, [treeId]);

  const fetchConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/trees/${treeId}/financing`);
      setConfig(data);
      setSelectedMode(configToSelectedMode(data));
      setAmount(data.subscriptionAmount?.toString() || '');
      setCurrency(data.subscriptionCurrency || 'CLP');
      setDayOfMonth((data.subscriptionDayOfMonth || 1).toString());
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: any = {};

      if (selectedMode === 'GRATUITO') {
        payload.financingMode = 'GRATUITO';
      } else if (selectedMode === 'FIJA') {
        payload.financingMode = 'SUBSCRIPCION';
        payload.subscriptionBillingMode = 'FIXED';
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) {
          setError('El monto debe ser mayor a 0');
          setSaving(false);
          return;
        }
        payload.subscriptionAmount = amt;
        payload.subscriptionCurrency = currency;
        payload.subscriptionDayOfMonth = parseInt(dayOfMonth);
      } else {
        payload.financingMode = 'SUBSCRIPCION';
        payload.subscriptionBillingMode = 'PROPORTIONAL';
        payload.subscriptionCurrency = currency;
        payload.subscriptionDayOfMonth = parseInt(dayOfMonth);
      }

      const { data } = await api.put(`/trees/${treeId}/financing`, payload);
      setConfig(data);
      setSelectedMode(configToSelectedMode(data));
      setAmount(data.subscriptionAmount?.toString() || '');
      setCurrency(data.subscriptionCurrency || 'CLP');
      setDayOfMonth((data.subscriptionDayOfMonth || 1).toString());
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <Loader2 className="animate-spin" size={24} color="var(--text-secondary)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <DollarSign size={20} color="var(--accent-primary)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Modo de Financiamiento</h3>
        </div>

        {/* Three equal mode cards */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {MODE_CARDS.map((card) => {
            const isSelected = selectedMode === card.id;
            return (
              <button
                key={card.id}
                onClick={() => setSelectedMode(card.id)}
                style={{
                  flex: '1 1 180px',
                  minWidth: 160,
                  padding: '1rem',
                  borderRadius: 12,
                  border: isSelected ? `2px solid ${card.color}` : '1px solid var(--border-color)',
                  background: isSelected ? `${card.color}11` : 'rgba(255,255,255,0.02)',
                  color: isSelected ? card.color : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{card.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{card.title}</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, lineHeight: 1.4 }}>{card.desc}</div>
              </button>
            );
          })}
        </div>

        {/* FIJA: amount + currency + day */}
        {selectedMode === 'FIJA' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Monto mensual por miembro</label>
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ej: 5000"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle}>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="ARS">ARS</option>
                <option value="MXN">MXN</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Día de cobro</label>
              <select value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} style={selectStyle}>
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* VARIABLE: info + currency + day */}
        {selectedMode === 'VARIABLE' && (
          <div>
            <div style={{
              padding: '1rem',
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              fontSize: '0.85rem',
              color: 'var(--accent-warning)',
              marginBottom: '1rem',
            }}>
              Los gastos se dividen automáticamente entre todos los miembros cada mes. El monto varía según los gastos declarados.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Moneda</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle}>
                  <option value="CLP">CLP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="ARS">ARS</option>
                  <option value="MXN">MXN</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Día de cobro</label>
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} style={selectStyle}>
                  {Array.from({ length: 28 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            opacity: saving ? 0.7 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin" /> Guardando...</>
          ) : (
            <><Save size={18} /> Guardar Configuración</>
          )}
        </button>
      </div>
    </div>
  );
}
