import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PORTS: Record<string, number> = {
  'trust-lite': 5173,
  'branch-os': 5174,
  'trace-lite': 5175,
  'trust-insight': 5176,
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const flavor = env.VITE_APP_FLAVOR || 'trust-lite';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: PORTS[flavor] || 5173,
      allowedHosts: ['.trycloudflare.com', 'localhost', '.local'],
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Strip Origin so backend CORS doesn't reject tunnel domains
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          },
        },
      },
    },
    build: {
      outDir: `dist/${flavor}`,
      emptyOutDir: true,
    },
  };
});
