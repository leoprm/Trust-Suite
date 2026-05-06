import { CorsOptions } from 'cors';

export function parseOrigins(value?: string): string[] {
  return (value || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

export const allowedOrigins = parseOrigins(process.env.CORS_ALLOWED_ORIGINS);
export const allowAllInDev = process.env.CORS_ALLOW_ALL_IN_DEV === 'true';
export const isProduction = process.env.NODE_ENV === 'production';

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Requests without Origin are common for curl, Postman, server-to-server and same-origin flows.
    if (!origin) {
      return callback(null, true);
    }

    // Development escape hatch. Never honored in production.
    if (!isProduction && allowAllInDev) {
      return callback(null, true);
    }

    // Keep local PWA and LAN testing ergonomic even when CORS_ALLOW_ALL_IN_DEV=false.
    if (!isProduction && isLocalDevelopmentOrigin(origin)) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200,
};

export function logCorsConfiguration() {
  if (isProduction && allowedOrigins.length === 0) {
    console.warn('[CORS] WARNING: production mode without CORS_ALLOWED_ORIGINS. Browser clients will be blocked.');
  }

  if (isProduction && allowAllInDev) {
    console.warn('[CORS] WARNING: CORS_ALLOW_ALL_IN_DEV=true is ignored in production.');
  }

  if (!isProduction && allowAllInDev) {
    console.warn('[CORS] Development flexible mode enabled. Do not use this setting in production.');
    return;
  }

  if (!isProduction) {
    console.log(`[CORS] Development mode. Localhost/LAN origins allowed. Explicit origins: ${allowedOrigins.join(', ') || '(none)'}`);
    return;
  }

  console.log(`[CORS] Production allowlist: ${allowedOrigins.join(', ') || '(empty)'}`);
}
