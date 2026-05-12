import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft, ArrowUpCircle, Building2, CreditCard, Hash,
  User, FileText, Loader2, AlertCircle, CheckCircle, Lock,
} from 'lucide-react';
import api from '../lib/api';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatClp(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function WithdrawPage() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Form state
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState('');
  const [accountType, setAccountType] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [rut, setRut] = useState('');
  const [description, setDescription] = useState('');

  // Wallet balance
  const [availableClp, setAvailableClp] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Success
  const [success, setSuccess] = useState<{ amount: number; txId: string } | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  // Fetch wallet balance
  const fetchBalance = useCallback(() => {
    if (!user) return;
    setLoadingBalance(true);
    api.get('/wallet/me')
      .then((res) => {
        setAvailableClp(res.data?.wallet?.availableClp ?? 0);
      })
      .catch(() => {
        setAvailableClp(0);
      })
      .finally(() => setLoadingBalance(false));
  }, [user]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // ── RUT formatting ───────────────────────────────────────────────────
  const formatRut = (value: string): string => {
    const cleaned = value.replace(/[^0-9kK]/g, '').slice(0, 9);
    if (cleaned.length <= 1) return cleaned;
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    return `${body}-${dv}`;
  };

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9kK]/g, '');
    setRut(raw);
  };

  // ── Validation ───────────────────────────────────────────────────────
  const validate = (): string | null => {
    const parsedAmount = parseInt(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return 'Ingresa un monto válido mayor a 0.';
    }
    if (availableClp !== null && parsedAmount > availableClp) {
      return `Saldo insuficiente. Disponible: ${formatClp(availableClp)}.`;
    }
    if (!bank.trim()) {
      return 'Ingresa el nombre del banco.';
    }
    if (!accountType.trim()) {
      return 'Selecciona el tipo de cuenta.';
    }
    if (!accountNumber.trim()) {
      return 'Ingresa el número de cuenta.';
    }
    if (!rut || rut.length < 2) {
      return 'Ingresa un RUT válido.';
    }
    return null;
  };

  // ── Amount quick-select ──────────────────────────────────────────────
  const setPercentage = (pct: number) => {
    if (availableClp === null || availableClp <= 0) return;
    setAmount(Math.floor(availableClp * pct).toString());
    setBalanceError(null);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setBalanceError(null);
    const val = parseInt(e.target.value);
    if (availableClp !== null && !isNaN(val) && val > availableClp) {
      setBalanceError(`Excede tu saldo disponible de ${formatClp(availableClp)}`);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError(null);
    setRateLimitError(null);

    try {
      const parsedAmount = Math.round(parseFloat(amount));

      const { data } = await api.post('/wallet/withdraw', {
        amount: parsedAmount,
        bankInfo: {
          bank: bank.trim(),
          accountType: accountType.trim(),
          accountNumber: accountNumber.trim(),
          rut: formatRut(rut),
        },
        description: description.trim() || null,
      });

      setSuccess({ amount: parsedAmount, txId: data.transaction?.id });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Error al procesar el retiro';
      if (err?.response?.status === 429) {
        setRateLimitError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const cardStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 45, 0.6)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    padding: isMobile ? '1.25rem' : '1.5rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem',
  };

  // ── Success ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{
        padding: isMobile ? '1rem' : '2rem', maxWidth: 560, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '1.5rem',
        background: '#0D0D1A', minHeight: '100%', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
      }}>
        <CheckCircle size={64} style={{ color: 'var(--accent-warning)' }} />
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
          Retiro solicitado
        </h2>
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem',
          maxWidth: 360,
        }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
            Tu retiro de <strong style={{ color: 'var(--accent-warning)' }}>{formatClp(success.amount)}</strong> será
            revisado por un administrador. Los fondos están bloqueados hasta que se apruebe.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          <Lock size={14} />
          <span>Fondos bloqueados temporalmente</span>
        </div>
        <button onClick={() => navigate('/')} className="btn" style={{
          background: 'var(--accent-primary)', color: '#fff', border: 'none',
          padding: '0.65rem 1.5rem', borderRadius: 'var(--radius-md)',
          cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
          marginTop: '0.5rem',
        }}>
          Volver al inicio
        </button>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding: isMobile ? '1rem' : '2rem', maxWidth: 560, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap: '1.25rem',
      background: '#0D0D1A', minHeight: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => navigate(-1)} aria-label="Volver" style={backBtn}>
          <ArrowLeft size={isMobile ? 20 : 22} />
        </button>
        <ArrowUpCircle size={isMobile ? 22 : 26} style={{ color: 'var(--accent-warning)' }} />
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Retirar CLP
        </h1>
      </div>

      {/* Balance info */}
      {loadingBalance ? (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cargando saldo...</span>
        </div>
      ) : (
        <div style={{
          ...cardStyle, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Saldo disponible
          </span>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-success)' }}>
            {formatClp(availableClp ?? 0)}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Error banners */}
        {error && (
          <div style={errorBanner}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {rateLimitError && (
          <div style={{ ...errorBanner, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
            <AlertCircle size={16} /> {rateLimitError}
          </div>
        )}

        {/* Amount + quick select */}
        <div style={cardStyle}>
          <label style={labelStyle}>Monto a retirar (CLP)</label>
          <input
            type="number"
            value={amount}
            onChange={handleAmountChange}
            placeholder="Ej: 50000"
            min={1}
            step={1}
            required
            style={inputStyle}
            autoFocus
          />
          {availableClp !== null && availableClp > 0 && (
            <div style={{
              display: 'flex', gap: '0.4rem', marginTop: '0.6rem',
              flexWrap: 'wrap',
            }}>
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPercentage(pct)}
                  style={{
                    flex: 1, minWidth: 60,
                    padding: '0.35rem 0.5rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                    transition: 'all 0.15s',
                  }}
                >
                  {pct === 1 ? 'Todo' : `${pct * 100}%`}
                </button>
              ))}
            </div>
          )}
          {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
            <p style={{
              margin: '0.5rem 0 0', fontSize: '0.85rem',
              color: balanceError ? 'var(--accent-danger)' : 'var(--accent-warning)',
              fontWeight: 600,
            }}>
              {balanceError || formatClp(parseFloat(amount))}
            </p>
          )}
        </div>

        {/* Bank details */}
        <div style={cardStyle}>
          <label style={labelStyle}>Datos bancarios</label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            {/* Bank name */}
            <div style={{ position: 'relative' }}>
              <Building2 size={14} style={{
                position: 'absolute', left: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-secondary)',
              }} />
              <input
                type="text"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="Nombre del banco"
                required
                style={{ ...inputStyle, paddingLeft: '2.25rem' }}
              />
            </div>

            {/* Account type */}
            <div style={{ position: 'relative' }}>
              <CreditCard size={14} style={{
                position: 'absolute', left: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-secondary)',
              }} />
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                required
                style={{ ...inputStyle, paddingLeft: '2.25rem', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="">Tipo de cuenta</option>
                <option value="Cuenta Corriente">Cuenta Corriente</option>
                <option value="Cuenta Vista">Cuenta Vista</option>
                <option value="Cuenta de Ahorro">Cuenta de Ahorro</option>
                <option value="Cuenta RUT">Cuenta RUT</option>
              </select>
            </div>

            {/* Account number */}
            <div style={{ position: 'relative' }}>
              <Hash size={14} style={{
                position: 'absolute', left: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-secondary)',
              }} />
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Número de cuenta"
                required
                style={{ ...inputStyle, paddingLeft: '2.25rem' }}
              />
            </div>

            {/* RUT */}
            <div style={{ position: 'relative' }}>
              <User size={14} style={{
                position: 'absolute', left: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-secondary)',
              }} />
              <input
                type="text"
                value={rut ? formatRut(rut) : ''}
                onChange={handleRutChange}
                placeholder="RUT (ej: 12345678-9)"
                required
                style={{ ...inputStyle, paddingLeft: '2.25rem' }}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div style={cardStyle}>
          <label style={labelStyle}>Descripción (opcional)</label>
          <div style={{ position: 'relative' }}>
            <FileText size={14} style={{
              position: 'absolute', left: '0.75rem', top: '0.8rem',
              color: 'var(--text-secondary)',
            }} />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Retiro de fondos acumulados"
              style={{ ...inputStyle, paddingLeft: '2.25rem' }}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || (availableClp !== null && availableClp <= 0)}
          style={{
            width: '100%', padding: '0.9rem',
            background: submitting || (availableClp !== null && availableClp <= 0)
              ? 'rgba(245,158,11,0.3)' : 'var(--accent-warning)',
            color: '#000', border: 'none', borderRadius: 'var(--radius-md)',
            cursor: submitting || (availableClp !== null && availableClp <= 0)
              ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Procesando retiro...
            </>
          ) : availableClp !== null && availableClp <= 0 ? (
            <>
              <Lock size={20} />
              Sin saldo disponible
            </>
          ) : (
            <>
              <ArrowUpCircle size={20} />
              Retirar {amount && !isNaN(parseFloat(amount)) ? formatClp(parseFloat(amount)) : 'CLP'}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-secondary)',
  cursor: 'pointer', padding: '0.25rem', borderRadius: '8px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const errorBanner: React.CSSProperties = {
  padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)',
  color: '#ef4444', fontSize: '0.85rem', display: 'flex',
  alignItems: 'center', gap: '0.5rem',
};
