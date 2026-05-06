import React, { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = "qr-reader";

  useEffect(() => {
    // Initialize scanner
    const html5QrCode = new Html5Qrcode(regionId);
    scannerRef.current = html5QrCode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // Start scanning with back camera by default
    html5QrCode.start(
      { facingMode: "environment" }, 
      config, 
      (decodedText) => {
        // Handle success
        onScanSuccess(decodedText);
        stopScanner();
      },
      () => {
        // Low priority error (e.g. no QR code in frame) - just ignore
      }
    ).catch(err => {
      console.error("Unable to start scanning", err);
    });

    return () => {
      stopScanner();
    };
  }, []);

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().then(() => {
        scannerRef.current?.clear();
      }).catch(err => console.error("Failed to stop scanner", err));
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.9)',
      zIndex: 3000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '400px', 
        position: 'relative',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Camera size={20} color="var(--accent-primary)" />
            <span style={{ fontWeight: 600 }}>Escanear Código QR</span>
          </div>
          <button onClick={onClose} className="btn-outline" style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>
        
        <div id={regionId} style={{ width: '100%', background: 'black' }}></div>
        
        <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Apunta la cámara al código QR de la otra persona.
        </div>
      </div>
      
      <button 
        onClick={onClose} 
        className="btn btn-outline mt-8" 
        style={{ color: 'white', borderColor: 'white' }}
      >
        Cancelar
      </button>
    </div>
  );
};

export default QRScanner;
