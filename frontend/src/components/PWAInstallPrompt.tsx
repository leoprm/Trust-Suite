import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { appConfig } from '../config/appConfig';

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const setInstallPromptVisible = useAuthStore((state: any) => state.setInstallPromptVisible);

  useEffect(() => {
    // Check if the event was already captured before React mounted
    const existing = (window as any).__pwaInstallPrompt;
    if (existing) {
      setDeferredPrompt(existing);
      setIsVisible(true);
      setInstallPromptVisible(true);
      return;
    }

    // Otherwise wait for it (fallback for slow first loads)
    const handler = () => {
      const e = (window as any).__pwaInstallPrompt;
      if (e) {
        setDeferredPrompt(e);
        setIsVisible(true);
        setInstallPromptVisible(true);
      }
    };

    window.addEventListener('pwaInstallPromptReady', handler);
    return () => {
      window.removeEventListener('pwaInstallPromptReady', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, throw it away
    (window as any).__pwaInstallPrompt = null;
    setDeferredPrompt(null);
    setIsVisible(false);
    setInstallPromptVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2000,
      width: 'max-content',
      maxWidth: '90vw'
    }}>
      <button 
        onClick={handleInstallClick}
        className="btn btn-primary shadow-glow"
        style={{ 
          padding: '0.75rem 1.25rem',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <Download size={18} />
        Instalar {appConfig.name}
      </button>
    </div>
  );
};

export default PWAInstallPrompt;
