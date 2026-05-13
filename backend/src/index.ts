import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import { corsOptions, logCorsConfiguration, isProduction, allowedOrigins, allowAllInDev } from './config/cors';
import { authLimiter, globalLimiter, conciergeLimiter } from './config/rateLimiter';

import authRoutes from './routes/authRoutes';
import { authenticateJWT } from './middleware/authMiddleware';
import treeRoutes from './routes/treeRoutes';
import needRoutes from './routes/needRoutes';
import ideaRoutes from './routes/ideaRoutes';
import resultRoutes from './routes/resultRoutes';
import conciergeRoutes from './routes/conciergeRoutes';
import billingRoutes from './routes/billingRoutes';
import ratingRoutes from './routes/ratingRoutes';
import agentRoutes from './routes/agentRoutes';
import byoRoutes from './routes/byoRoutes';
import taskRoutes from './routes/taskRoutes';
import { stripeWebhook, paddleWebhook, createCheckout, cancelSubscription, currentCost, mySubscription } from './controllers/billingController';

const app = express();
app.disable('x-powered-by');
const port = process.env.PORT || 3000;
export const prisma = new PrismaClient();

// ── Database Bootstrap ────────────────────────────────────────────────────────
async function bootstrapDatabase(): Promise<void> {
  const sqlPath = path.resolve(__dirname, '../../database/init.sql');
  if (!fs.existsSync(sqlPath)) {
    console.warn('[DB Bootstrap] init.sql not found at', sqlPath, '— skipping.');
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[DB Bootstrap] DATABASE_URL not set — skipping.');
    return;
  }

  try {
    const separator = dbUrl.includes('?') ? '&' : '?';
    const conn = await mysql.createConnection(dbUrl + separator + 'multipleStatements=true');
    const fullSql = fs.readFileSync(sqlPath, 'utf-8');

    const fkMarker = '-- FOREIGN KEYS';
    const markerIdx = fullSql.indexOf(fkMarker);

    if (markerIdx === -1) {
      await conn.query(fullSql);
    } else {
      const createSection = fullSql.substring(0, markerIdx);
      await conn.query(createSection);

      const fkSection = fullSql.substring(markerIdx);
      const fkStatements = fkSection
        .split(';')
        .map(s => s.trim())
        .filter(s => s.toUpperCase().startsWith('ALTER TABLE'));

      for (const stmt of fkStatements) {
        try {
          await conn.query(stmt);
        } catch (fkErr: any) {
          if (fkErr.errno !== 1826 && fkErr.errno !== 121 && fkErr.errno !== 1005) {
            console.warn('[DB Bootstrap] FK warning:', fkErr.message);
          }
        }
      }
    }

    await conn.end();
    console.log('[DB Bootstrap] init.sql executed successfully — schema verified.');
  } catch (err: any) {
    console.error('[DB Bootstrap] Warning:', err.message || err);
  }
}

logCorsConfiguration();

if (isProduction && allowedOrigins.length === 0 && !allowAllInDev) {
  console.error('[CORS] FATAL: production mode requires CORS_ALLOWED_ORIGINS to be set.');
  console.error('[CORS] Add CORS_ALLOWED_ORIGINS=https://your-domain.com to your .env file.');
  process.exit(1);
}

// Stripe webhook: raw body BEFORE JSON parser (Stripe signature verification)
app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Paddle webhook: raw body BEFORE JSON parser (Paddle signature verification)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), paddleWebhook);

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

// Security headers via Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "api.paddle.com"],
    },
  },
  frameguard: { action: 'deny' },
}));

// HSTS only in production
if (isProduction) {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}

// Uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', (_req, res) => {
  res.status(404).json({ error: 'File access must use protected API routes' });
});

app.get('/api/profile-pics/:filename', (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!filename.startsWith('profile_') || filename.includes('..')) {
    return res.status(404).json({ error: 'File not found' });
  }
  const profilePath = path.resolve(uploadsDir, filename);
  if (!profilePath.startsWith(path.resolve(uploadsDir)) || !fs.existsSync(profilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=0, no-store');
  res.type('image/webp');
  res.sendFile(profilePath);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Trust Maker V3 API is running' });
});

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/trees', treeRoutes);
app.use('/api/needs', needRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/concierge', conciergeLimiter, conciergeRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/byo', byoRoutes);
app.use('/api/tasks', taskRoutes);

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.stack || err.message || err);
  if (isProduction) {
    res.status(err.status || 500).json({ error: 'Internal server error' });
  } else {
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      stack: err.stack,
    });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
bootstrapDatabase().then(() => {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
  });
});
