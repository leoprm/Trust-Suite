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

export default function FinancingSettingsPanel({ treeId }: Props) {
  const [config, setConfig] = useState<FinancingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [mode, setMode] = useState<'GRATUITO' | 'SUBSCRIPCION'>('GRATUITO');
  const [billingMode, setBillingMode] = useState<'FIXED' | 'PROPORTIONAL'>('FIXED');
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
      setMode(data.financingMode || 'GRATUITO');
      setBillingMode(data.subscriptionBillingMode === 'PROPORTIONAL' ? 'PROPORTIONAL' : 'FIXED');
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
      const payload: any = { financingMode: mode };

      if (mode === 'SUBSCRIPCION') {
        payload.subscriptionBillingMode = billingMode;
        payload.subscriptionCurrency = currency;
        payload.subscriptionDayOfMonth = parseInt(dayOfMonth);

        if (billingMode === 'FIXED') {
          const amt = parseFloat(amount);
          if (isNaN(amt) || amt <= 0) {
            setError('El monto debe ser mayor a 0 en modo FIXED');
            setSaving(false);
            return;
          }
          payload.subscriptionAmount = amt;
        }
      }

      const { data } = await api.put(`/trees/${treeId}/financing`, payload);
      setConfig(data);
      setMode(data.financingMode);
      setBillingMode(data.subscriptionBillingMode === 'PROPORTIONAL' ? 'PROPORTIONAL' : 'FIXED');
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
      {/* Financing Mode */}
      <section className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <DollarSign size={20} color="var(--accent-primary)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Modo de Financiamiento</h3>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setMode('GRATUITO')}
            style={{
              flex: 1,
              padding: '1rem',
              borderRadius: 12,
              border: mode === 'GRATUITO' ? '2px solid var(--accent-success)' : '1px solid var(--border-color)',
              background: mode === 'GRATUITO' ? 'rgba(110, 231, 183, 0.08)' : 'rgba(255,255,255,0.02)',
              color: mode === 'GRATUITO' ? 'var(--accent-success)' : 'var(--text-secondary)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>Gratuito</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Acceso sin costo para miembros</div>
          </button>

          <button
            onClick={() => setMode('SUBSCRIPCION')}
            style={{
              flex: 1,
              padding: '1rem',
              borderRadius: 12,
              border: mode === 'SUBSCRIPCION' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
              background: mode === 'SUBSCRIPCION' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.02)',
              color: mode === 'SUBSCRIPCION' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>Subscripción</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Cobro recurrente a miembros</div>
          </button>
        </div>

        {mode === 'SUBSCRIPCION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Billing Mode */}
            <div>
              <label style={labelStyle}>Tipo de Cobro</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setBillingMode('FIXED')}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: 8,
                    border: billingMode === 'FIXED' ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: billingMode === 'FIXED' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.02)',
                    color: billingMode === 'FIXED' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  Monto Fijo
                </button>
                <button
                  onClick={() => setBillingMode('PROPORTIONAL')}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: 8,
                    border: billingMode === 'PROPORTIONAL' ? '2px solid var(--accent-warning)' : '1px solid var(--border-color)',
                    background: billingMode === 'PROPORTIONAL' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
                    color: billingMode === 'PROPORTIONAL' ? 'var(--accent-warning)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  Proporcional
                </button>
              </div>
            </div>

            {billingMode === 'FIXED' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Monto de subscripción</label>
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
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="CLP">CLP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="ARS">ARS</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Día de cobro</label>
                  <select
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    style={selectStyle}
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '1rem',
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.06)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                fontSize: '0.85rem',
                color: 'var(--accent-warning)',
              }}>
                Los gastos se dividen automáticamente entre todos los miembros del Árbol. Cada mes se calcula el total de gastos y se distribuye proporcionalmente.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Error */}
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

      {/* Save Button */}
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
