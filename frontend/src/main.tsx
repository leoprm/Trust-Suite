import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { appConfig } from './config/appConfig';

document.title = appConfig.name;

// Capture beforeinstallprompt BEFORE React mounts
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__pwaInstallPrompt = e;
  window.dispatchEvent(new Event('pwaInstallPromptReady'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(appConfig.serviceWorker).then(
      (registration) => console.log('SW registered: ', registration),
      (err) => console.log('SW registration failed: ', err),
    );
  });
}
