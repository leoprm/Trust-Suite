import { useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, ArrowDownLeft, Coins, Wallet, Filter, TreePine, ChevronDown, Loader2, AlertCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import { useTreeStore } from '../store/treeStore';

interface Transaction {
  id: string;
  treeId: string;
  treeName: string;
  kind: 'fiat' | 'berries';
  type: string;
  category?: string;
  amount: number;
  currency?: string;
  description?: string;
  createdAt: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  FIAT_INCOME: { label: 'Ingreso', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  FIAT_EXPENSE: { label: 'Gasto', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  FIAT_INVESTMENT: { label: 'Inversión', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  FIAT_SALARY: { label: 'Salario', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  FIAT_MATERIALS: { label: 'Materiales', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  BERRY_TASK_REWARD: { label: 'Recompensa tarea', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  BERRY_AUDIT_REWARD: { label: 'Recompensa auditoría', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  BERRY_LEVEL_REWARD: { label: 'Recompensa nivel', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  BERRY_P2P_TRANSFER_IN: { label: 'Transferencia recibida', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  BERRY_P2P_TRANSFER_OUT: { label: 'Transferencia enviada', color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
};

function getTypeInfo(type: string) {
  return TYPE_LABELS[type] || { label: type, color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(tx: Transaction) {
  if (tx.kind === 'fiat') {
    const sign = tx.type.includes('EXPENSE') || tx.type.includes('MATERIALS') ? '−' : '+';
    return `${sign}${tx.amount.toLocaleString('es-CL')} ${tx.currency || 'CLP'}`;
  }
  const sign = tx.type.includes('OUT') ? '−' : '+';
  return `${sign}${Math.round(tx.amount).toLocaleString()} 🫐`;
}

export default function WalletTransactions() {
  const { trees, fetchTrees } = useTreeStore();

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [filterType, setFilterType] = useState<string>(''); // '' = all, 'fiat', 'berry'
  const [filterTreeId, setFilterTreeId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchTrees();
  }, []);

  const fetchPage = useCallback(async (append: boolean) => {
    const currentOffset = append ? offset : 0;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError('');
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('offset', String(currentOffset));
      if (filterType) params.set('types', filterType);
      if (filterTreeId) params.set('treeId', filterTreeId);

      const { data } = await api.get<TransactionsResponse>(`/wallet/transactions?${params}`);

      if (append) {
        setTxs((prev) => [...prev, ...data.transactions]);
        setOffset((prev) => prev + data.transactions.length);
      } else {
        setTxs(data.transactions);
        setOffset(data.transactions.length);
      }
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al cargar transacciones');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset, filterType, filterTreeId]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchPage(false);
  }, [filterType, filterTreeId]);

  const handleLoadMore = () => fetchPage(true);

  const availableTrees = trees.filter((t: any) => t.name);
  const hasFilters = filterType || filterTreeId;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        padding: '0.8rem',
        maxWidth: 640,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Wallet size={20} color="#8b5cf6" />
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
            Historial de transacciones
          </h1>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{
            background: showFilters ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
            border: showFilters ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            color: showFilters ? '#a78bfa' : 'rgba(255,255,255,0.6)',
            padding: '0.4rem 0.6rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.72rem',
          }}
        >
          <Filter size={14} />
          Filtros
          {hasFilters && (
            <span style={{
              background: '#8b5cf6',
              color: '#fff',
              borderRadius: '50%',
              width: 16,
              height: 16,
              fontSize: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {(filterType ? 1 : 0) + (filterTreeId ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '0.7rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              {/* Type toggles */}
              <div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Tipo de transacción
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { value: '', label: 'Todos' },
                    { value: 'fiat', label: 'Fiat' },
                    { value: 'berry', label: 'Berries' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterType(opt.value)}
                      style={{
                        background: filterType === opt.value ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                        border: filterType === opt.value ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '6px',
                        color: filterType === opt.value ? '#c4b5fd' : 'rgba(255,255,255,0.6)',
                        padding: '0.3rem 0.7rem',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        fontWeight: filterType === opt.value ? 600 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tree dropdown */}
              <div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Árbol
                </div>
                <div style={{ position: 'relative' }}>
                  <select
                    value={filterTreeId}
                    onChange={(e) => setFilterTreeId(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.7rem',
                      appearance: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Todos los árboles</option>
                    {availableTrees.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: '0.6rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'rgba(255,255,255,0.4)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Clear filters */}
              {hasFilters && (
                <button
                  onClick={() => {
                    setFilterType('');
                    setFilterTreeId('');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    padding: 0,
                    alignSelf: 'flex-end',
                    textDecoration: 'underline',
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Summary bar ─────────────────────────────────────────── */}
      {!loading && !error && (
        <div
          style={{
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.35)',
            paddingLeft: '0.2rem',
          }}
        >
          {total} transacción{total !== 1 ? 'es' : ''}
          {hasFilters && ' (filtradas)'}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 0',
            gap: '0.8rem',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <Loader2 className="animate-spin" size={28} />
          <span style={{ fontSize: '0.75rem' }}>Cargando transacciones...</span>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 0',
            gap: '0.6rem',
          }}
        >
          <AlertCircle size={32} color="#ef4444" />
          <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</span>
          <button
            onClick={() => fetchPage(false)}
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '6px',
              color: '#a78bfa',
              padding: '0.35rem 0.9rem',
              fontSize: '0.7rem',
              cursor: 'pointer',
              marginTop: '0.3rem',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── Empty ───────────────────────────────────────────────── */}
      {!loading && !error && txs.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 0',
            gap: '0.6rem',
          }}
        >
          <FileText size={36} color="rgba(255,255,255,0.15)" />
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', textAlign: 'center' }}>
            {hasFilters
              ? 'No hay transacciones con los filtros actuales'
              : 'Aún no tienes transacciones'}
          </span>
        </div>
      )}

      {/* ── Transaction list ────────────────────────────────────── */}
      {!loading && !error && txs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <AnimatePresence>
            {txs.map((tx, i) => {
              const info = getTypeInfo(tx.type);
              const isCredit = !tx.type.includes('EXPENSE') && !tx.type.includes('OUT') && tx.type !== 'FIAT_MATERIALS';

              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                    padding: '0.65rem 0.75rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '8px',
                      background: info.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isCredit ? (
                      <ArrowDownLeft size={18} color={info.color} />
                    ) : (
                      <ArrowUpRight size={18} color={info.color} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 600,
                            color: info.color,
                            background: info.bg,
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {info.label}
                        </span>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: isCredit ? '#22c55e' : '#f87171',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatAmount(tx)}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.6rem',
                          color: 'rgba(255,255,255,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                        }}
                      >
                        <TreePine size={10} />
                        {tx.treeName}
                      </span>
                      <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>
                        {formatDate(tx.createdAt)}
                      </span>
                    </div>

                    {tx.description && (
                      <div
                        style={{
                          fontSize: '0.62rem',
                          color: 'rgba(255,255,255,0.35)',
                          marginTop: '0.25rem',
                          lineHeight: 1.3,
                          wordBreak: 'break-word',
                        }}
                      >
                        {tx.description}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Load more ───────────────────────────────────────────── */}
      {hasMore && !loading && !error && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          style={{
            background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.15)',
            borderRadius: '8px',
            color: '#a78bfa',
            padding: '0.6rem',
            fontSize: '0.75rem',
            cursor: loadingMore ? 'default' : 'pointer',
            width: '100%',
            opacity: loadingMore ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          {loadingMore ? (
            <>
              <Loader2 className="animate-spin" size={14} />
              Cargando...
            </>
          ) : (
            <>Cargar más ({total - txs.length} restantes)</>
          )}
        </button>
      )}
    </div>
  );
}
