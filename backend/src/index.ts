import dotenv from 'dotenv';
dotenv.config();

// ── Fix: force IPv4 for all outbound connections ─────────────────────────
// Node.js defaults to IPv6 for api.telegram.org, which is unreachable.
// This sets IPv4-first for both the https module (Grammy) and undici (fetch).
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import https from 'https';
const origRequest = https.request;

// Helper: convert URL string or object to a plain options object
function urlToOpts(u: string | URL): Record<string, any> {
  const url = typeof u === 'string' ? new URL(u) : u;
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
  };
}

(https as any).request = function(opts: any, ...args: any[]) {
  if (typeof opts === 'string' || opts instanceof URL) {
    opts = urlToOpts(opts);
  }
  opts = { ...opts, family: 4 };
  return origRequest.call(this, opts, ...args);
};

// https.get(url, options?, callback) — Node.js accepts 1-3 args
(https as any).get = function(opts: any, ...args: any[]) {
  // Separate options object from callback
  let options: any = {};
  let callback: any;
  if (args.length === 2) {
    options = args[0] || {};
    callback = args[1];
  } else if (args.length === 1) {
    if (typeof args[0] === 'function') {
      callback = args[0];
    } else {
      options = args[0] || {};
    }
  }

  if (typeof opts === 'string' || opts instanceof URL) {
    opts = urlToOpts(opts);
  }
  opts = { ...opts, ...options, family: 4 };

  const req = origRequest.call(this, opts, callback as any);
  req.end();
  return req;
};
// ──────────────────────────────────────────────────────────────────────────

import express from 'express';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import { authLimiter, globalLimiter, conciergeLimiter } from './config/rateLimiter';

const isProduction = process.env.NODE_ENV === 'production';

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
import userRoutes from './routes/userRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import memberRoutes from './routes/memberRoutes';
import stripeRoutes from './routes/stripeRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import audioRoutes from './routes/audioRoutes';
import sandboxRoutes from './routes/sandboxRoutes';
import costRoutes from './routes/costRoutes';
import solutionRoutes from './routes/solutionRoutes';
import serverRoutes from './routes/serverRoutes';
import botRoutes from './routes/botRoutes';
import teamRoutes from './routes/teamRoutes';
import adminRoutes from './routes/adminRoutes';
import structureRoutes from './routes/structureRoutes';
import investmentRoutes from './routes/investmentRoutes';
import externalTaskRoutes from './routes/externalTasks';
import hooksRoutes from './routes/hooks';
import candidatesRoutes from './routes/candidatesRoutes';
import cancelledPlansRoutes from './routes/cancelledPlansRoutes';
import hiringRoutes from './routes/hiringRoutes';
// Note: roleRoutes is registered inline below to avoid circular dependency with eventLogService
import { createBot } from './bot/index';
import { initTrustManagerBot } from './bot/trustManagerBot';
import { startScheduler } from './bot/scheduler';
import { initDisputeService } from './services/telegramBotService';
import { startTreeCleanupCron } from './services/treeCleanupService';
import { startTreeClassifierCron } from './services/treeClassifier';
import { startCrossTreeSkillCron } from './services/crossTreeSkillAggregator';
import { startSurveyCloseCron } from './cron/surveyCloseCron';
import { stripeWebhook, paddleWebhook, createCheckout, cancelSubscription, currentCost, mySubscription } from './controllers/billingController';
import { whatsappReceive } from './controllers/whatsappController';
import { getTreeAgents, assignTreeAgent } from './controllers/agentController';

const app = express();
export { app }; // exported for integration tests
app.disable('x-powered-by');
const port = process.env.PORT || 3000;
export const prisma = new PrismaClient();

// ── Telegram Bot ───────────────────────────────────────────────────────────────
// createBot is async (initializes i18n before starting polling).
// Returns null gracefully when TELEGRAM_BOT_TOKEN is not configured.
let telegramBot: ReturnType<typeof createBot> extends Promise<infer T> ? T : never = null as any;
export { telegramBot }; // exported for satisfaction poll trigger
let trustManagerBot: any = null;

(async () => {
  telegramBot = await createBot(prisma);
  trustManagerBot = await initTrustManagerBot(prisma);

  // ── Initialize dispute broadcast service ──────────────────────────────────────
  initDisputeService(prisma, telegramBot);

  // ── Tree cleanup cron: procesa pendingDeletionAt expirados ───────────────────
  startTreeCleanupCron(prisma);

  // ── Tree classifier cron: sincroniza tree-classification.json de sandboxes ──
  startTreeClassifierCron(prisma);

  // ── Cross-tree skill aggregator: promedia TreeSkill → WorkerSkill cada 24h ──
  startCrossTreeSkillCron(prisma);

  // ── Survey close cron: cierra encuestas vencidas cada hora ──────────────
  startSurveyCloseCron(prisma, telegramBot);

  // ── Scheduler: cierre diario a medianoche ──────────────────────────────────────
  if (telegramBot) {
    startScheduler(prisma, telegramBot);
  } else {
    console.warn(
      "[Scheduler] Bot no disponible — el cierre diario se ejecutará sin notificaciones de Telegram."
    );
    startScheduler(prisma, null);
  }
})();

// ── Scheduler: cierre diario, cuota mensual, resolución de disputas ────────
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

// Stripe webhook: raw body BEFORE JSON parser (Stripe signature verification)
app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Paddle webhook: raw body BEFORE JSON parser (Paddle signature verification)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), paddleWebhook);

// WhatsApp Cloud API webhook: requiere raw body para validación de firma (opcional)
// POST con raw parser debe estar ANTES de express.json()
app.post('/api/whatsapp/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Parse raw buffer back into JSON body for whatsappReceive
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : String(req.body ?? '');
    req.body = JSON.parse(raw);
  } catch {
    req.body = {};
  }
  // Delegate to the full controller (message normalization + concierge forwarding)
  whatsappReceive(req, res);
});

app.use(express.json());

// Uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Sandbox base directory — bootstrapped for TreeSandbox service
// Wrapped in try/catch: non-blocking — TreeSandbox.create() handles per-tree dirs
try {
  const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || '/home/leo/trees';
  if (!fs.existsSync(SANDBOX_BASE)) {
    fs.mkdirSync(SANDBOX_BASE, { recursive: true });
    console.log(`[Bootstrap] Sandbox base created: ${SANDBOX_BASE}`);
  }
} catch (err: any) {
  console.warn(`[Bootstrap] Sandbox base skipped: ${err.message}`);
}
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
app.use('/api/trees', sandboxRoutes); // sandbox sub-routes: GET/DELETE /:id/sandbox
app.use('/api/needs', needRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/concierge', conciergeLimiter, conciergeRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/byo', byoRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/solutions', solutionRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/structure', structureRoutes);
app.use('/api/investment', investmentRoutes);
app.use('/api/external-tasks', externalTaskRoutes);
app.use('/api/hooks', hooksRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/cancelled-plans', cancelledPlansRoutes);
app.use('/api/internal', hiringRoutes);

// Role recommendation endpoints
import { recommendRoles, feedbackRoles } from './controllers/roleRecommendationController';
app.post('/api/roles/recommend', recommendRoles);
app.post('/api/roles/feedback', authenticateJWT, feedbackRoles);

// Tree-scoped agent endpoints
app.get('/api/trees/:id/agents', getTreeAgents);
app.post('/api/trees/:id/agents/assign', authenticateJWT, assignTreeAgent);

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
if (process.env.NODE_ENV !== 'test') {
  bootstrapDatabase().then(() => {
    // ── Sandbox isolation: bloquea outbound MySQL para el user trustmaker ──
    try {
      const isolateScript = path.resolve(__dirname, '..', 'scripts', 'isolate-sandbox.sh');
      const output = execSync(`bash "${isolateScript}"`, {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      console.log('[Sandbox Isolation]', output.trim());
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message || String(err);
      console.warn('[Sandbox Isolation] Non-blocking warning — iptables rules not applied:', msg.trim());
    }

    app.listen(Number(port), '0.0.0.0', () => {
      console.log(`Server is running on http://0.0.0.0:${port}`);
    });
  });
}
