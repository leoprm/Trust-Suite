import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft, ArrowDownCircle, Upload, X, Image, FileText,
  Loader2, AlertCircle, CheckCircle, Building2,
} from 'lucide-react';
import api from '../lib/api';

// ── Constants ──────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// ── Helpers ────────────────────────────────────────────────────────────────

function formatClp(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DepositPage() {
  const { user, isInitialLoading } = useAuthStore();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Form state
  const [amount, setAmount] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  // Success state
  const [success, setSuccess] = useState<{ amount: number; txId: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isInitialLoading && !user) navigate('/login');
  }, [user, isInitialLoading, navigate]);

  // Clean up preview URL
  useEffect(() => {
    return () => {
      if (filePreview?.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  // ── File handling ────────────────────────────────────────────────────
  const validateFile = useCallback((f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return 'Formato no permitido. Usa PNG, JPG o PDF.';
    }
    if (f.size > MAX_FILE_SIZE) {
      return 'El archivo excede 2MB. Comprime la imagen e intenta de nuevo.';
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setFileError(err); return; }
    setFileError(null);
    setFile(f);

    if (filePreview?.startsWith('blob:')) URL.revokeObjectURL(filePreview);

    if (f.type === 'application/pdf') {
      setFilePreview(null);
    } else {
      setFilePreview(URL.createObjectURL(f));
    }
  }, [validateFile, filePreview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  const clearFile = () => {
    if (filePreview?.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Validation ───────────────────────────────────────────────────────
  const validate = (): string | null => {
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return 'Ingresa un monto válido mayor a 0.';
    }
    if (!file) {
      return 'Debes adjuntar un comprobante de pago.';
    }
    return null;
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

      // Convert file to base64 for receiptFileId
      let receiptFileId: string | null = null;
      if (file) {
        receiptFileId = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Error al leer el archivo'));
          reader.readAsDataURL(file);
        });
      }

      const { data } = await api.post('/wallet/deposit', {
        amount: parsedAmount,
        receiptFileId,
        bankInfo: bankInfo.trim() || null,
        description: description.trim() || null,
      });

      setSuccess({ amount: parsedAmount, txId: data.transaction?.id });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Error al procesar el depósito';
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

  // ── Success state ────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{
        padding: isMobile ? '1rem' : '2rem', maxWidth: 560, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '1.5rem',
        background: '#0D0D1A', minHeight: '100%', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
      }}>
        <CheckCircle size={64} style={{ color: 'var(--accent-success)' }} />
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
          Depósito registrado
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: 1.6 }}>
          {formatClp(success.amount)} enviados a revisión.<br />
          Serán acreditados cuando un administrador apruebe el comprobante.
        </p>
        {filePreview && (
          <div style={{
            borderRadius: 'var(--radius-md)', overflow: 'hidden',
            border: '1px solid var(--border-color)', maxWidth: 300,
          }}>
            <img src={filePreview} alt="Comprobante" style={{ width: '100%', display: 'block' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/')} className="btn" style={{
            background: 'var(--accent-primary)', color: '#fff', border: 'none',
            padding: '0.65rem 1.5rem', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
          }}>
            Volver al inicio
          </button>
          <button onClick={() => {
            setSuccess(null); setAmount(''); setBankInfo(''); setDescription('');
            clearFile(); setError(null);
          }} className="btn" style={{
            background: 'transparent', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)', padding: '0.65rem 1.5rem',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.9rem',
          }}>
            Nuevo depósito
          </button>
        </div>
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
        <ArrowDownCircle size={isMobile ? 22 : 26} style={{ color: 'var(--accent-success)' }} />
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Depositar CLP
        </h1>
      </div>

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

        {/* Amount */}
        <div style={cardStyle}>
          <label style={labelStyle}>Monto (CLP)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej: 50000"
            min={1}
            step={1}
            required
            style={inputStyle}
            autoFocus
          />
          {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--accent-success)', fontWeight: 600 }}>
              {formatClp(parseFloat(amount))}
            </p>
          )}
        </div>

        {/* Receipt upload */}
        <div style={cardStyle}>
          <label style={labelStyle}>Comprobante de pago *</label>

          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${fileError ? 'var(--accent-danger)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '2rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <Upload size={32} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.25rem' }}>
                Arrastra el comprobante o haz clic para seleccionar
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: 0 }}>
                PNG, JPG o PDF · Máximo 2MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          ) : (
            <div>
              <div style={{
                position: 'relative', borderRadius: 'var(--radius-md)',
                overflow: 'hidden', border: '1px solid var(--border-color)',
                background: 'rgba(0,0,0,0.3)', minHeight: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {file.type === 'application/pdf' ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    <FileText size={36} style={{ marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.85rem', margin: 0, wordBreak: 'break-all' }}>{file.name}</p>
                    <p style={{ fontSize: '0.7rem', margin: '0.25rem 0 0' }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                ) : (
                  <img
                    src={filePreview!}
                    alt="Comprobante"
                    style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', display: 'block' }}
                  />
                )}
                <button type="button" onClick={clearFile} style={removeFileBtn}>
                  <X size={16} />
                </button>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)',
              }}>
                {file.type === 'application/pdf' ? <FileText size={14} /> : <Image size={14} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </span>
                <span>{(file.size / 1024).toFixed(0)} KB</span>
              </div>
            </div>
          )}

          {fileError && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--accent-danger)' }}>
              {fileError}
            </p>
          )}
        </div>

        {/* Bank info */}
        <div style={cardStyle}>
          <label style={labelStyle}>Banco de origen</label>
          <div style={{ position: 'relative' }}>
            <Building2 size={16} style={{
              position: 'absolute', left: '0.75rem', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-secondary)',
            }} />
            <input
              type="text"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              placeholder="Ej: Banco Estado, Santander..."
              style={{ ...inputStyle, paddingLeft: '2.5rem' }}
            />
          </div>
        </div>

        {/* Description */}
        <div style={cardStyle}>
          <label style={labelStyle}>Descripción (opcional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Depósito por transferencia"
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', padding: '0.9rem',
            background: submitting ? 'rgba(16,185,129,0.4)' : 'var(--accent-success)',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-md)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Procesando depósito...
            </>
          ) : (
            <>
              <ArrowDownCircle size={20} />
              Depositar {amount && !isNaN(parseFloat(amount)) ? formatClp(parseFloat(amount)) : ''}
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

const removeFileBtn: React.CSSProperties = {
  position: 'absolute', top: '0.5rem', right: '0.5rem',
  background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff',
  borderRadius: '50%', width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0,
};
