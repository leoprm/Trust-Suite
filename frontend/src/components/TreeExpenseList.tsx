import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Save, Loader2, Calendar, Receipt } from 'lucide-react';
import api from '../lib/api';

type Props = {
  treeId: string;
};

type Expense = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  isRecurring: boolean;
  dueDayOfMonth: number | null;
  month: string;
  addedBy: { id: string; username: string } | null;
  createdAt: string;
};

const CATEGORIES: Record<string, string> = {
  WATER: 'Agua',
  ELECTRICITY: 'Electricidad',
  GAS: 'Gas',
  MORTGAGE: 'Hipoteca',
  FUEL: 'Combustible',
  SHOPPING: 'Compras',
  EQUIPMENT: 'Equipamiento',
  MATERIAL: 'Materiales',
  MONEY: 'Dinero',
  OTHER: 'Otros',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.8rem',
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

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export default function TreeExpenseList({ treeId }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [curr, setCurr] = useState('CLP');
  const [cat, setCat] = useState('OTHER');
  const [recurring, setRecurring] = useState(false);
  const [dayDue, setDayDue] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [formError, setFormError] = useState('');

  const thisMonth = currentMonth();

  useEffect(() => {
    fetchExpenses();
  }, [treeId]);

  const fetchExpenses = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/trees/${treeId}/financing/expenses`);
      setExpenses(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDesc('');
    setAmt('');
    setCurr('CLP');
    setCat('OTHER');
    setRecurring(false);
    setDayDue('');
    setMonth(currentMonth());
    setFormError('');
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (exp: Expense) => {
    setDesc(exp.description);
    setAmt(exp.amount.toString());
    setCurr(exp.currency);
    setCat(exp.category);
    setRecurring(exp.isRecurring);
    setDayDue(exp.dueDayOfMonth?.toString() || '');
    setMonth(exp.month);
    setEditingId(exp.id);
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!desc.trim()) {
      setFormError('La descripción es requerida');
      return;
    }
    const amount = parseFloat(amt);
    if (isNaN(amount) || amount <= 0) {
      setFormError('El monto debe ser mayor a 0');
      return;
    }
    if (!month) {
      setFormError('El mes es requerido');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      description: desc.trim(),
      amount,
      currency: curr,
      category: cat,
      isRecurring: recurring,
      dueDayOfMonth: dayDue ? parseInt(dayDue) : null,
      month,
    };

    try {
      if (editingId) {
        await api.put(`/trees/${treeId}/financing/expenses/${editingId}`, payload);
      } else {
        await api.post(`/trees/${treeId}/financing/expenses`, payload);
      }
      await fetchExpenses();
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Error al guardar gasto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, desc: string) => {
    if (!confirm(`¿Eliminar gasto "${desc}"?`)) return;
    try {
      await api.delete(`/trees/${treeId}/financing/expenses/${id}`);
      fetchExpenses();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al eliminar gasto');
    }
  };

  const totalThisMonth = expenses
    .filter(e => e.month === thisMonth)
    .reduce((sum, e) => sum + e.amount, 0);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <Loader2 className="animate-spin" size={24} color="var(--text-secondary)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Receipt size={20} color="var(--accent-primary)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Gastos del Árbol</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.04)',
            padding: '0.35rem 0.75rem',
            borderRadius: 100,
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}>
            <Calendar size={14} />
            {formatMonth(thisMonth)}
          </div>
          <button
            onClick={openAdd}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
            }}
          >
            <Plus size={16} /> Agregar Gasto
          </button>
        </div>
      </div>

      {/* This month summary */}
      {expenses.length > 0 && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.85rem',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total {formatMonth(thisMonth)}</span>
          <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '1rem' }}>
            {totalThisMonth.toLocaleString()} {expenses[0]?.currency || 'CLP'}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5',
          fontSize: '0.8rem',
        }}>
          {error}
        </div>
      )}

      {/* Table */}
      {expenses.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
        }}>
          No hay gastos registrados. Agrega el primer gasto para comenzar.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Monto</th>
                <th style={thStyle}>Categoría</th>
                <th style={thStyle}>Recurrente</th>
                <th style={thStyle}>Mes</th>
                <th style={{ ...thStyle, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id} style={{
                  borderBottom: '1px solid var(--border-color)',
                  transition: 'background 0.15s',
                  background: exp.month === thisMonth ? 'rgba(59, 130, 246, 0.03)' : 'transparent',
                }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{exp.description}</div>
                    {exp.addedBy && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        por {exp.addedBy.username}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {exp.amount.toLocaleString()} {exp.currency}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: 100,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                    }}>
                      {CATEGORIES[exp.category] || exp.category}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {exp.isRecurring ? (
                      <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>Sí</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>No</span>
                    )}
                    {exp.dueDayOfMonth && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 4 }}>
                        día {exp.dueDayOfMonth}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      color: exp.month === thisMonth ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontWeight: exp.month === thisMonth ? 600 : 400,
                    }}>
                      {formatMonth(exp.month)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, padding: '0.35rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={() => openEdit(exp)}
                        style={iconBtnStyle}
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(exp.id, exp.description)}
                        style={{ ...iconBtnStyle, color: 'var(--accent-error)' }}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                {editingId ? 'Editar Gasto' : 'Nuevo Gasto'}
              </h3>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Descripción</label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Ej: Servicio de agua potable"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Monto</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amt}
                    onChange={(e) => setAmt(e.target.value)}
                    placeholder="5000"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Moneda</label>
                  <select value={curr} onChange={(e) => setCurr(e.target.value)} style={selectStyle}>
                    <option value="CLP">CLP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="ARS">ARS</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Categoría</label>
                <select value={cat} onChange={(e) => setCat(e.target.value)} style={selectStyle}>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                  />
                  Gasto recurrente
                </label>
                {recurring && (
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={dayDue}
                    onChange={(e) => setDayDue(e.target.value)}
                    placeholder="Día"
                    style={{ ...inputStyle, width: 70, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                  />
                )}
              </div>

              <div>
                <label style={labelStyle}>Mes</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {formError && (
                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.8rem',
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="btn btn-outline"
                  style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 1.25rem',
                    fontSize: '0.85rem',
                    opacity: saving ? 0.7 : 1,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? (
                    <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                  ) : (
                    <><Save size={16} /> Guardar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.75rem',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  verticalAlign: 'top',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  transition: 'all 0.15s',
};
