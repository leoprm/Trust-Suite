import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, User, Coins, Wallet, TreePine, Loader2, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface UserResult {
  id: string;
  username: string;
  email: string;
}

interface TreeBalance {
  treeId: string;
  treeName: string;
  balance: number;
}

interface WalletData {
  wallet: {
    availableClp: number;
    availableBerries: number;
  };
  berriesBalance: {
    total: number;
    byTree: TreeBalance[];
  };
}

type Currency = 'CLP' | 'BERRIES';
type TransferState = 'idle' | 'confirming' | 'sending' | 'success' | 'error';

const MIN_SEARCH_LEN = 2;
const DEBOUNCE_MS = 300;

export default function TransferPage() {
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Wallet data
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState('');

  // Transfer form
  const [currency, setCurrency] = useState<Currency>('CLP');
  const [amount, setAmount] = useState('');
  const [treeId, setTreeId] = useState('');
  const [description, setDescription] = useState('');

  // Recipient search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<UserResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Transfer state
  const [transferState, setTransferState] = useState<TransferState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState<{
    amount: number;
    currency: Currency;
    toUsername: string;
    newBalance: number;
    feeAmount?: number;
    feePercent?: number;
    netAmount?: number;
  } | null>(null);

  // Fee info (from public stats)
  const [feePercent, setFeePercent] = useState<number | null>(null);
  useEffect(() => {
    api.get('/public/fee-stats')
      .then((res) => setFeePercent(res.data.currentFeePercent))
      .catch(() => setFeePercent(null));
  }, []);

  // Load wallet data
  useEffect(() => {
    let cancelled = false;
    api.get('/wallet/me')
      .then((res) => {
        if (!cancelled) {
          setWalletData(res.data);
          // Default tree to first one with berry balance
          if (res.data.berriesBalance?.byTree?.length > 0) {
            setTreeId(res.data.berriesBalance.byTree[0].treeId);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setWalletError(err?.response?.data?.error ?? 'Error al cargar la wallet');
      })
      .finally(() => {
        if (!cancelled) setWalletLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < MIN_SEARCH_LEN) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get('/users/search', { params: { query: q } });
      setSearchResults(data || []);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, doSearch]);

  // Computed
  const availableBalance = currency === 'CLP'
    ? Math.round((walletData?.wallet?.availableClp ?? 0) * 100) / 100
    : (currency === 'BERRIES' && treeId
      ? walletData?.berriesBalance?.byTree?.find((t) => t.treeId === treeId)?.balance ?? 0
      : walletData?.wallet?.availableBerries ?? 0);

  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const balanceSufficient = amountValid && amountNum <= availableBalance;
  const canConfirm = selectedRecipient && amountValid && balanceSufficient
    && (currency === 'CLP' || (currency === 'BERRIES' && treeId));

  const formatBalance = (n: number) =>
    currency === 'CLP'
      ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n)
      : `${Math.round(n).toLocaleString('es-CL')} 🫐`;

  const handleConfirm = async () => {
    if (!canConfirm || !selectedRecipient) return;
    setTransferState('sending');
    setErrorMessage('');

    try {
      const body: any = {
        toUserId: selectedRecipient.id,
        amount: amountNum,
        currency,
        description: description || undefined,
      };
      if (currency === 'BERRIES') body.treeId = treeId;

      const { data } = await api.post('/wallet/transfer', body);

      setSuccessData({
        amount: amountNum,
        currency,
        toUsername: selectedRecipient.username,
        newBalance: data.newBalance,
        feeAmount: data.feeAmount,
        feePercent: data.feePercent,
        netAmount: data.netAmount,
      });
      setTransferState('success');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Error al realizar la transferencia';
      setErrorMessage(msg);
      setTransferState('error');
    }
  };

  const handleReset = () => {
    setAmount('');
    setDescription('');
    setSelectedRecipient(null);
    setSearchQuery('');
    setSearchResults([]);
    setTransferState('idle');
    setErrorMessage('');
    setSuccessData(null);
    // Reload wallet data to get fresh balance
    api.get('/wallet/me').then((res) => setWalletData(res.data)).catch(() => {});
  };

  // ── Styles ──
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const containerStyle: React.CSSProperties = {
    maxWidth: 500,
    margin: '0 auto',
    padding: isMobile ? '1rem' : '1.5rem',
    minHeight: '100%',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 45, 0.6)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    padding: isMobile ? '1.25rem' : '1.5rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    padding: '0.75rem 1rem',
    color: 'var(--text-primary)',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
    fontFamily: 'Inter, sans-serif',
  };

  const buttonBase: React.CSSProperties = {
    width: '100%',
    padding: '0.9rem',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all var(--transition-fast)',
    fontFamily: 'Inter, sans-serif',
    color: '#fff',
  };

  // ── Loading ──
  if (walletLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (walletError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', gap: '0.75rem' }}>
        <AlertCircle size={40} style={{ color: 'var(--accent-danger)' }} />
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{walletError}</p>
      </div>
    );
  }

  // ── Success state ──
  if (transferState === 'success' && successData) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={containerStyle}
      >
        <div style={{
          ...cardStyle,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
        }}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <CheckCircle2 size={56} style={{ color: 'var(--accent-success)' }} />
          </motion.div>
          <div>
            <h2 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Transferencia enviada
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {successData.currency === 'CLP'
                ? `${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(successData.netAmount || successData.amount)}`
                : `${Math.round(successData.amount).toLocaleString('es-CL')} 🫐`}{' '}
              a <strong style={{ color: 'var(--text-primary)' }}>{successData.toUsername}</strong>
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Nuevo saldo: {formatBalance(successData.newBalance)}
            </p>
            {/* Fee breakdown */}
            {successData.feeAmount != null && successData.feeAmount > 0 && (
              <div style={{
                marginTop: '0.75rem', padding: '0.6rem 0.9rem',
                background: 'rgba(245,158,11,0.08)', borderRadius: 8,
                border: '1px solid rgba(245,158,11,0.15)',
              }}>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Comisión TrustCore ({successData.feePercent?.toFixed(2)}%):{' '}
                  <strong style={{ color: '#fbbf24' }}>
                    {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(successData.feeAmount)}
                  </strong>
                </p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Monto original: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(successData.amount)}{' '}
                  → Neto: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(successData.netAmount || 0)}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleReset}
            style={{
              ...buttonBase,
              background: 'var(--accent-primary)',
              maxWidth: 250,
            }}
          >
            Nueva transferencia
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Main form ──
  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
          }}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Transferir
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Envía CLP o Berries a otro miembro
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={transferState}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <div style={cardStyle}>
            {/* ── Currency selector ── */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <Coins size={15} /> Moneda
              </label>
              <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                {(['CLP', 'BERRIES'] as Currency[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCurrency(c);
                      if (c === 'CLP') setTreeId('');
                    }}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      fontFamily: 'Inter, sans-serif',
                      background: currency === c ? 'var(--accent-primary)' : 'transparent',
                      color: currency === c ? '#fff' : 'var(--text-secondary)',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {c === 'CLP' ? '$ CLP' : '🫐 Berries'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Recipient search ── */}
            <div style={{ marginBottom: '1.25rem', position: 'relative' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <User size={15} /> Destinatario
              </label>

              {selectedRecipient ? (
                <div style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderColor: 'var(--accent-success)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.85rem', fontWeight: 600, color: '#fff',
                    }}>
                      {selectedRecipient.username.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedRecipient.username}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>{selectedRecipient.email}</span>
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedRecipient(null);
                      setSearchQuery('');
                    }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.25rem',
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Buscar por username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    style={{
                      ...inputStyle,
                      paddingLeft: '2.5rem',
                    }}
                  />
                  <Search
                    size={16}
                    style={{
                      position: 'absolute', left: '0.75rem', top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--text-secondary)',
                    }}
                  />

                  {/* Dropdown */}
                  <AnimatePresence>
                    {showDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          marginTop: 4,
                          background: 'var(--bg-secondary)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          zIndex: 50,
                          maxHeight: 200,
                          overflowY: 'auto',
                        }}
                      >
                        {searching && (
                          <div style={{ padding: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                            <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: '0.5rem' }} />
                            Buscando...
                          </div>
                        )}
                        {!searching && searchQuery.length >= MIN_SEARCH_LEN && searchResults.length === 0 && (
                          <div style={{ padding: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                            Sin resultados
                          </div>
                        )}
                        {searchResults.map((u) => (
                          <button
                            key={u.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedRecipient(u);
                              setSearchQuery('');
                              setSearchResults([]);
                              setShowDropdown(false);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.65rem 0.75rem',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontFamily: 'Inter, sans-serif',
                              fontSize: '0.9rem',
                              color: 'var(--text-primary)',
                              borderBottom: '1px solid var(--border-color)',
                            }}
                          >
                            <span style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--accent-secondary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.75rem', fontWeight: 600, color: '#fff',
                              flexShrink: 0,
                            }}>
                              {u.username.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <span style={{ fontWeight: 500, display: 'block' }}>{u.username}</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{u.email}</span>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* ── Amount input ── */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <Wallet size={15} /> Monto
              </label>
              <input
                type="number"
                placeholder={currency === 'CLP' ? '0' : '0'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: amount && !balanceSufficient
                    ? 'var(--accent-danger)'
                    : amount && balanceSufficient
                      ? 'var(--accent-success)'
                      : 'var(--border-color)',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Disponible: {formatBalance(availableBalance)}
                </span>
                {amount && !balanceSufficient && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-danger)' }}>
                    Saldo insuficiente
                  </span>
                )}
              </div>
            </div>

            {/* ── Tree selector (Berries only) ── */}
            {currency === 'BERRIES' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginBottom: '1.25rem', overflow: 'hidden' }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  <TreePine size={15} /> Árbol
                </label>
                <select
                  value={treeId}
                  onChange={(e) => setTreeId(e.target.value)}
                  style={{
                    ...inputStyle,
                    appearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {walletData?.berriesBalance?.byTree?.map((t) => (
                    <option key={t.treeId} value={t.treeId}>
                      {t.treeName} ({Math.round(t.balance).toLocaleString('es-CL')} 🫐)
                    </option>
                  ))}
                  {(!walletData?.berriesBalance?.byTree?.length) && (
                    <option value="">Sin árboles con berries</option>
                  )}
                </select>
              </motion.div>
            )}

            {/* ── Description (optional) ── */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Descripción <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>(opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Motivo de la transferencia"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* ── Summary ── */}
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
              }}
            >
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Resumen
              </p>
              {selectedRecipient && amountValid ? (
                <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  <p style={{ margin: '0 0 0.25rem' }}>
                    Transferirás{' '}
                    <strong style={{ color: 'var(--accent-primary)' }}>
                      {currency === 'CLP'
                        ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amountNum)
                        : `${Math.round(amountNum).toLocaleString('es-CL')} 🫐`}
                    </strong>{' '}
                    a <strong>{selectedRecipient.username}</strong>
                  </p>
                  {/* Fee estimate (CLP only) */}
                  {currency === 'CLP' && feePercent != null && feePercent > 0 && (
                    <div style={{ marginTop: '0.35rem', padding: '0.5rem 0.65rem', background: 'rgba(245,158,11,0.08)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.15)' }}>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Comisión TrustCore ({feePercent.toFixed(2)}%):{' '}
                        <strong style={{ color: '#fbbf24' }}>
                          {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Math.round(amountNum * feePercent) / 100)}
                        </strong>
                      </p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Destinatario recibirá:{' '}
                        <strong style={{ color: '#34d399' }}>
                          {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amountNum - Math.round(amountNum * feePercent) / 100)}
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>Selecciona un destinatario y un monto</span>
              )}
            </div>

            {/* ── Error ── */}
            <AnimatePresence>
              {transferState === 'error' && errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                    color: 'var(--accent-danger)',
                  }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Confirm button ── */}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || transferState === 'sending'}
              style={{
                ...buttonBase,
                background: canConfirm
                  ? 'var(--grad-primary)'
                  : 'rgba(255,255,255,0.06)',
                color: canConfirm ? '#fff' : 'var(--text-secondary)',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                opacity: transferState === 'sending' ? 0.7 : 1,
              }}
            >
              {transferState === 'sending' ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Confirmar transferencia
                </>
              )}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
