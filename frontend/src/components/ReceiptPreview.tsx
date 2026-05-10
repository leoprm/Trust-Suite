import { useState, useEffect } from 'react';
import { X, Loader2, FileText, AlertCircle, ShieldCheck } from 'lucide-react';
import api from '../lib/api';

interface OCRData {
  mode: string;
  extracted: {
    amount?: number | null;
    date?: string | null;
    reference?: string | null;
  };
  matched?: boolean;
  comparedAt?: string;
}

interface PaymentDetail {
  id: string;
  amount: number;
  currency: string;
  period: string;
  status: string;
  paidAt: string;
  receiptPath: string | null;
  receiptFileName: string | null;
  receiptJSON: OCRData | null;
}

interface Props {
  paymentId: string;
  expectedAmount: number;
  onClose: () => void;
}

function formatCurrency(amount: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function ReceiptPreview({ paymentId, expectedAmount, onClose }: Props) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    return () => {
      if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    };
  }, [paymentId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch payment metadata (includes OCR data)
      const { data: info } = await api.get(`/payments/${paymentId}`);

      // Fetch receipt file
      if (info.receiptPath) {
        const fileRes = await api.get(`/payments/${paymentId}/receipt`, {
          responseType: 'blob',
        });
        const url = URL.createObjectURL(fileRes.data);
        setReceiptUrl(url);
      }

      setDetail(info);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar el comprobante');
    } finally {
      setLoading(false);
    }
  };

  const ocrData = detail?.receiptJSON;
  const isManual = ocrData?.mode === 'manual';

  // ── Loading ──
  if (loading) {
    return (
      <div style={backdropStyle}>
        <div className="glass-panel" style={modalStyle}>
          <button onClick={onClose} style={closeBtn}>
            <X size={20} />
          </button>
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--text-secondary)' }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>Cargando comprobante...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !detail) {
    return (
      <div style={backdropStyle}>
        <div className="glass-panel" style={modalStyle}>
          <button onClick={onClose} style={closeBtn}>
            <X size={20} />
          </button>
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <AlertCircle size={48} style={{ color: 'var(--accent-warning)' }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>{error || 'Sin datos'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isPDF = detail.receiptFileName?.toLowerCase().endsWith('.pdf');

  return (
    <div style={backdropStyle}>
      <div className="glass-panel" style={modalStyle}>
        <button onClick={onClose} style={closeBtn}>
          <X size={20} />
        </button>

        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700 }}>
          Comprobante de pago
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
          Período: {detail.period} · {formatCurrency(detail.amount, detail.currency)}
        </p>

        {/* Receipt image/PDF */}
        {receiptUrl ? (
          <div style={{
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            background: 'rgba(0,0,0,0.3)',
            marginBottom: '1rem',
            position: 'relative',
          }}>
            {isPDF ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                <FileText size={48} style={{ marginBottom: '0.75rem' }} />
                <p style={{ fontSize: '0.9rem', margin: 0 }}>{detail.receiptFileName || 'comprobante.pdf'}</p>
                <a
                  href={receiptUrl}
                  download={detail.receiptFileName || 'comprobante.pdf'}
                  style={{
                    color: 'var(--accent-primary)',
                    fontSize: '0.85rem',
                    marginTop: '0.5rem',
                    display: 'inline-block',
                  }}
                >
                  Descargar PDF
                </a>
              </div>
            ) : (
              <img
                src={receiptUrl}
                alt="Comprobante de pago"
                style={{
                  width: '100%',
                  maxHeight: '320px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            )}

            {/* Verified badge */}
            {detail.status === 'PAID' && (
              <div style={{
                position: 'absolute',
                top: '0.5rem',
                left: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.3rem 0.7rem',
                borderRadius: '100px',
                background: isManual ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: isManual ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: isManual ? '#eab308' : '#22c55e',
              }}>
                {isManual ? (
                  <>
                    <ShieldCheck size={14} />
                    Verificado manualmente
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    Verificado por OCR
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            marginBottom: '1rem',
          }}>
            <FileText size={32} style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '0.85rem', margin: 0 }}>Comprobante no disponible</p>
          </div>
        )}

        {/* OCR Data overlay */}
        {ocrData && (
          <div style={{
            padding: '0.75rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: '0.75rem',
            marginBottom: detail.status === 'PAID' ? 0 : '1rem',
          }}>
            {ocrData.extracted?.amount !== undefined && ocrData.extracted?.amount !== null && (
              <div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.2rem',
                }}>
                  Monto detectado
                </div>
                <div style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: ocrData.matched ? '#22c55e' : 'var(--text-primary)',
                }}>
                  {formatCurrency(ocrData.extracted.amount)}
                </div>
              </div>
            )}

            {ocrData.extracted?.date && (
              <div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.2rem',
                }}>
                  Fecha
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {formatDate(ocrData.extracted.date)}
                </div>
              </div>
            )}

            {ocrData.extracted?.reference && (
              <div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.2rem',
                }}>
                  Referencia
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {ocrData.extracted.reference}
                </div>
              </div>
            )}

            <div>
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.2rem',
              }}>
                Método
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {ocrData.mode === 'ocr' ? 'OCR automático' : 'Manual (monto cercano)'}
              </div>
            </div>
          </div>
        )}

        {/* Payment metadata footer */}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          padding: ocrData ? '0.5rem 0 0' : '0.5rem 0',
          borderTop: ocrData ? '1px solid var(--border-color)' : 'none',
          marginTop: ocrData ? '0' : '0',
        }}>
          <span>Estado: <strong style={{ color: 'var(--text-primary)' }}>{detail.status}</strong></span>
          <span>Pagado: <strong style={{ color: 'var(--text-primary)' }}>{formatDate(detail.paidAt)}</strong></span>
        </div>
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
  maxWidth: '480px',
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
