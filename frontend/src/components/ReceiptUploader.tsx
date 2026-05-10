import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Loader2, CheckCircle, AlertTriangle, Image, FileText } from 'lucide-react';
import api from '../lib/api';

interface OCRMatch {
  match: boolean;
  payment: {
    id: string;
    status: string;
    attempts?: number;
    maxAttempts?: number;
  };
  ocr: {
    mode: string;
    extracted: {
      amount?: number | null;
      date?: string | null;
      reference?: string | null;
    };
    rawText?: string;
  };
  reasons?: string[];
}

interface Props {
  paymentId: string;
  expectedAmount: number;
  onSuccess: () => void;
  onClose: () => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function ReceiptUploader({ paymentId, expectedAmount, onSuccess, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const validateFile = useCallback((f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return 'Formato no permitido. Usa PNG, JPG o PDF.';
    }
    if (f.size > MAX_SIZE) {
      return 'El archivo excede el tamaño máximo de 5MB.';
    }
    return null;
  }, []);

  const handleFile = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setOcrResult(null);
    setFile(f);

    if (preview) URL.revokeObjectURL(preview);
    if (f.type === 'application/pdf') {
      setPreview(null);
    } else {
      setPreview(URL.createObjectURL(f));
    }
  }, [validateFile, preview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setOcrResult(null);

    try {
      const formData = new FormData();
      formData.append('receipt', file);

      const { data } = await api.post(`/payments/${paymentId}/receipt`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setOcrResult(data);
      if (data.match) {
        // Success — wait a moment then trigger parent refresh
        setTimeout(onSuccess, 1500);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Error al subir el comprobante';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleRetry = () => {
    setOcrResult(null);
    setError(null);
  };

  const isPDF = file?.type === 'application/pdf';
  const maxAttempts = ocrResult?.payment?.maxAttempts || 3;
  const currentAttempts = ocrResult?.payment?.attempts || 0;
  const attemptsLeft = maxAttempts - currentAttempts;

  // ── State: max attempts reached ──
  if (ocrResult && !ocrResult.match && attemptsLeft <= 0) {
    return (
      <div style={backdropStyle}>
        <div className="glass-panel" style={modalStyle}>
          <button onClick={onClose} style={closeBtn}>
            <X size={20} />
          </button>
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <AlertTriangle size={48} style={{ color: 'var(--accent-warning)' }} />
            <h3 style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}>Máximo de intentos alcanzado</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Has usado los {maxAttempts} intentos disponibles para este pago. Contacta a un administrador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── State: success ──
  if (ocrResult?.match) {
    const amt = ocrResult.ocr.extracted?.amount;
    return (
      <div style={backdropStyle}>
        <div className="glass-panel" style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <CheckCircle size={56} style={{ color: '#22c55e' }} />
            <h3 style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem', color: '#22c55e' }}>
              Comprobante verificado
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>
              {amt !== undefined && amt !== null
                ? `${formatCurrency(amt)} detectado${ocrResult.ocr.mode === 'manual' ? ' (verificado por monto cercano)' : ''} — coincide con el pago esperado`
                : 'Monto detectado coincide con el pago esperado'}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Estado actualizado a PAID
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── State: failure (no match, retry possible) ──
  if (ocrResult && !ocrResult.match) {
    const detected = ocrResult.ocr.extracted?.amount;
    return (
      <div style={backdropStyle}>
        <div className="glass-panel" style={modalStyle}>
          <button onClick={onClose} style={closeBtn}>
            <X size={20} />
          </button>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <X size={48} style={{ color: '#ef4444' }} />
            <h3 style={{ margin: '0.75rem 0 0.5rem', fontSize: '1.05rem', color: '#ef4444' }}>
              No coincide
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
              Detectado: {detected !== undefined && detected !== null ? formatCurrency(detected) : 'no detectado'}
              {' · '}Esperado: {formatCurrency(expectedAmount)}
            </p>
            {ocrResult.reasons && ocrResult.reasons.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {ocrResult.reasons.map((r, i) => (
                  <li key={i} style={{ padding: '0.2rem 0' }}>• {r}</li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
              Intentos restantes: {attemptsLeft}
            </p>
            <button
              onClick={handleRetry}
              className="btn"
              style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1.5rem',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              <Upload size={16} />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── States: idle | file_selected | uploading ──
  return (
    <div style={backdropStyle}>
      <div className="glass-panel" style={modalStyle}>
        <button onClick={onClose} style={closeBtn}>
          <X size={20} />
        </button>

        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700 }}>
          Subir comprobante
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 1.25rem' }}>
          Monto esperado: {formatCurrency(expectedAmount)}
        </p>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '0.6rem 0.75rem',
            marginBottom: '1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-md)',
            color: '#ef4444',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Drop zone or preview */}
        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: dragOver ? 'rgba(59, 130, 246, 0.06)' : 'rgba(255,255,255,0.02)',
            }}
          >
            <Upload size={36} style={{ color: dragOver ? 'var(--accent-primary)' : 'var(--text-secondary)', marginBottom: '0.75rem' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
              Arrastra tu comprobante aquí o haz clic para seleccionar
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
              PNG, JPG o PDF · Máximo 5MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        ) : (
          <div>
            {/* File preview */}
            <div style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              marginBottom: '1rem',
              background: 'rgba(0,0,0,0.3)',
              minHeight: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {isPDF ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  <FileText size={40} style={{ marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.85rem', margin: 0, wordBreak: 'break-all' }}>{file.name}</p>
                  <p style={{ fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              ) : (
                <img
                  src={preview!}
                  alt="Vista previa del comprobante"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '240px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              )}
              <button
                onClick={() => {
                  if (preview) URL.revokeObjectURL(preview);
                  setFile(null);
                  setPreview(null);
                  setError(null);
                  setOcrResult(null);
                }}
                style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* File info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}>
              {isPDF ? <FileText size={16} /> : <Image size={16} />}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <span>{(file.size / 1024).toFixed(0)} KB</span>
            </div>

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn"
              style={{
                width: '100%',
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
                opacity: uploading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Analizando comprobante...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Verificar comprobante
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ──
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  maxHeight: '90vh',
  overflowY: 'auto',
  position: 'relative',
};

const closeBtn: React.CSSProperties = {
  position: 'absolute',
  top: '0.75rem',
  right: '0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border-color)',
  borderRadius: '50%',
  color: 'var(--text-secondary)',
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};
