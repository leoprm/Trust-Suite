import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, Lock, Plus, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import api from '../lib/api';
import TransactionModal from './TransactionModal';
import { formatCompactCurrency } from '../lib/format';

interface FinancialDashboardProps {
  treeId?: string;
  isGlobal?: boolean;
  isTreeAdmin?: boolean;
}

const ECONOMY_MODE_LABELS: Record<string, string> = {
  NO_ECONOMY: 'Sin economia activa',
  LEGACY_FIAT: 'Legacy Fiat: ledger externo',
  BERRIES_LATENT: 'Berries latentes',
  BERRIES_ACTIVE: 'Berries activas',
  TRUST_FULL: 'Trust completo',
};

export default function FinancialDashboard({ treeId, isGlobal, isTreeAdmin }: FinancialDashboardProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ income: 0, expense: 0, investment: 0, balance: 0 });
  const [ebitda, setEbitda] = useState<{ ebitda: number; inversionPct: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  useEffect(() => {
    fetchFinancialData();
  }, [treeId, period, isGlobal]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      const summaryUrl = isGlobal ? '/fiat/global/summary' : `/trees/${treeId}/fiat-ledger/summary`;
      const transactionsUrl = isGlobal ? '/fiat/global/transactions' : `/trees/${treeId}/fiat-ledger`;
      const requests: Promise<any>[] = [api.get(transactionsUrl), api.get(summaryUrl)];
      if (!isGlobal && treeId) requests.push(api.get(`/fiat/ebitda/${treeId}`));

      const results = await Promise.all(requests);
      const transactionsData = results[0].data || [];
      const summaryData = results[1].data;
      const fiatLedger = summaryData?.fiatLedger;

      setTransactions(transactionsData);
      setSummary(fiatLedger ? {
        ...summaryData,
        income: fiatLedger.income,
        expense: fiatLedger.expenses,
        investment: fiatLedger.investment,
        balance: fiatLedger.net,
      } : summaryData);
      if (results[2]) setEbitda(results[2].data);
      processChartData(transactionsData);
    } catch (error) {
      console.error('Failed to fetch fiat ledger data', error);
    } finally {
      setLoading(false);
    }
  };

  const processChartData = (items: any[]) => {
    const grouped: Record<string, any> = {};
    items.forEach((transaction) => {
      const dateStr = transaction.createdAt ? transaction.createdAt.split('T')[0] : (transaction.date ? transaction.date.split('T')[0] : 'N/A');
      if (!grouped[dateStr]) grouped[dateStr] = { name: dateStr, income: 0, expense: 0, investment: 0 };
      if (transaction.type === 'INCOME') grouped[dateStr].income += Number(transaction.amount || 0);
      else if (transaction.type === 'EXPENSE') grouped[dateStr].expense += Number(transaction.amount || 0);
      else if (transaction.type === 'INVESTMENT') grouped[dateStr].investment += Number(transaction.amount || 0);
    });
    setChartData(Object.values(grouped));
  };

  const updateEconomyMode = async (economyMode: string) => {
    if (!treeId) return;
    setSavingMode(true);
    try {
      await api.patch(`/trees/${treeId}/economy-mode`, { economyMode });
      await fetchFinancialData();
    } catch (error: any) {
      alert(error?.response?.data?.error || 'No se pudo actualizar el modo economico.');
    } finally {
      setSavingMode(false);
    }
  };

  const formatCLP = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(value || 0));

  if (loading) return <div className="text-secondary">Cargando Ledger Fiat...</div>;

  const fiatLedger = summary.fiatLedger || {
    economyMode: 'NO_ECONOMY',
    note: 'Fiat is an external ledger. It does not grant XP, levels, votes, authority or Trace reputation.',
  };
  const berries = summary.berries || {
    enabled: false,
    note: 'Berries are internal circulation, not equivalent to fiat.',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.7rem 1rem',
        borderRadius: 12,
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.15)',
      }}>
        <Lock size={16} color="#3b82f6" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
          Ledger Fiat externo: registra materiales, pagos, ventas, impuestos, infraestructura o encargos. El fiat no otorga XP, nivel ni autoridad dentro del Tree.
        </span>
      </div>

      {!isGlobal && (
        <div className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <ShieldCheck size={18} color="#93c5fd" />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>Modo economico del Tree</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Fiat financia recursos externos; Berries coordinan circulacion interna; XP certifica contribucion.</div>
            </div>
          </div>
          {isTreeAdmin ? (
            <select
              className="input-field"
              value={fiatLedger.economyMode || 'NO_ECONOMY'}
              disabled={savingMode}
              onChange={(event) => updateEconomyMode(event.target.value)}
              style={{ width: 230 }}
            >
              {Object.entries(ECONOMY_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#bfdbfe' }}>{ECONOMY_MODE_LABELS[fiatLedger.economyMode] || fiatLedger.economyMode}</span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <Metric title="Saldo neto externo" value={formatCompactCurrency(summary.balance)} tone={Number(summary.balance) >= 0 ? 'success' : 'danger'} icon={<Wallet size={18} />} />
        <Metric title="Ingresos externos" value={formatCompactCurrency(summary.income)} tone="success" />
        <Metric title="Gastos externos" value={formatCompactCurrency(summary.expense)} tone="danger" />
        <Metric title="Inversiones externas" value={formatCompactCurrency(summary.investment)} tone="primary" />
        {ebitda && (
          <div>
            <Metric title="EBITDA externo" value={formatCLP(ebitda.ebitda)} tone={ebitda.ebitda >= 0 ? 'success' : 'danger'} icon={<TrendingUp size={18} />} caption="Ingresos - gastos operativos" />
            <Metric title="Inversion externa %" value={`${ebitda.inversionPct.toFixed(1)}%`} tone="info" caption="Ramas activas / flujo total" />
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <h2 style={{ margin: 0 }}>Flujo Ledger Fiat</h2>
            <div className="flex gap-2" style={{ background: 'var(--bg-input)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
              {(['day', 'week', 'month'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setPeriod(option)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: period === option ? 'var(--accent-primary)' : 'transparent',
                    color: period === option ? 'white' : 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {option === 'day' ? 'Dia' : option === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ width: '100%', height: 350 }}>
          <ResponsiveContainer width="99%" height={350}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-success)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-success)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-danger)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-danger)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }} itemStyle={{ fontSize: 13 }} />
              <Area type="monotone" dataKey="income" stroke="var(--accent-success)" fillOpacity={1} fill="url(#colorIncome)" />
              <Area type="monotone" dataKey="expense" stroke="var(--accent-danger)" fillOpacity={1} fill="url(#colorExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!isGlobal && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Registro Fiat externo</h2>
              <Lock size={14} color="var(--text-secondary)" />
            </div>
            {isTreeAdmin && (
              <button className="btn btn-primary" onClick={() => setShowTransactionModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Plus size={16} /> Registrar movimiento externo
              </button>
            )}
          </div>
          <p style={{ marginTop: 0, marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            La reputacion se genera por tareas verificadas, no por dinero recibido. {berries.note}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Descripcion</th>
                  <th style={th}>Verificacion</th>
                  <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                  <th style={{ ...th, textAlign: 'center' }}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No hay movimientos externos registrados.
                    </td>
                  </tr>
                ) : (
                  transactions.slice().reverse().map((transaction) => (
                    <tr key={transaction.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={td}>{transaction.createdAt ? transaction.createdAt.split('T')[0].split('-').reverse().join('/') : (transaction.date ? transaction.date.split('T')[0].split('-').reverse().join('/') : '-')}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                          {transaction.type === 'INCOME' ? <ArrowUpRight size={14} color="var(--accent-success)" /> :
                           transaction.type === 'EXPENSE' ? <ArrowDownLeft size={14} color="var(--accent-danger)" /> :
                           <TrendingUp size={14} color="var(--accent-primary)" />}
                          {transaction.type === 'INCOME' ? 'Ingreso' : transaction.type === 'EXPENSE' ? 'Gasto' : 'Inversion'}
                        </div>
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{transaction.description}</td>
                      <td style={{ ...td, color: '#bfdbfe', fontSize: '0.75rem' }}>{transaction.verificationStatus || 'DECLARED'}</td>
                      <td style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 600,
                        color: transaction.type === 'INCOME' ? 'var(--accent-success)' : transaction.type === 'EXPENSE' ? 'var(--accent-danger)' : 'var(--accent-primary)',
                      }}>
                        {formatCLP(transaction.amount)}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 6, background: transaction.isAutomatic ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)', color: transaction.isAutomatic ? '#3b82f6' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {transaction.isAutomatic ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {treeId && (
        <TransactionModal
          treeId={treeId}
          isOpen={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
          onSuccess={fetchFinancialData}
        />
      )}
    </div>
  );
}

function Metric({ title, value, tone, icon, caption }: { title: string; value: string; tone: 'success' | 'danger' | 'primary' | 'info'; icon?: React.ReactNode; caption?: string }) {
  const color = tone === 'success' ? 'var(--accent-success)' : tone === 'danger' ? 'var(--accent-danger)' : tone === 'info' ? '#38bdf8' : 'var(--accent-primary)';
  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{title}</span>
        {icon && <span style={{ color }}>{icon}</span>}
      </div>
      <h3 style={{ margin: 0, fontSize: '1.5rem', color }}>{value}</h3>
      {caption && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{caption}</span>}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '1rem',
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

const td: React.CSSProperties = {
  padding: '1rem',
  fontSize: '0.9rem',
};
