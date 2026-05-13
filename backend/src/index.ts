import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import { corsOptions, logCorsConfiguration, isProduction, allowedOrigins, allowAllInDev } from './config/cors';

import authRoutes from './routes/authRoutes';
import { authenticateJWT } from './middleware/authMiddleware';
import userRoutes from './routes/userRoutes';
import treeRoutes from './routes/treeRoutes';
import needRoutes from './routes/needRoutes';
import taskRoutes from './routes/taskRoutes';
import assetRoutes from './routes/assetRoutes';
import branchRoutes from './routes/branchRoutes';
import deliverableRoutes from './routes/deliverableRoutes';
import adminRoutes from './routes/adminRoutes';
import fiatRoutes from './routes/fiatRoutes';
import fiatTransactionRoutes from './routes/fiatTransactionRoutes';
import contactRoutes from './routes/contactRoutes';
import uploadRoutes from './routes/uploadRoutes';
import plantillaRoutes from './routes/plantillaArbolRoutes';
import geoRoutes from './routes/geoRoutes';
import p2pRoutes from './routes/p2pRoutes';
import discoveryRoutes from './routes/discoveryRoutes';
import bonusRoutes from './routes/bonusRoutes';
import notificationRoutes from './routes/notificationRoutes';
import migrationRoutes from './routes/migrationRoutes';
import skillRoutes from './routes/skillRoutes';
import recruitmentRoutes from './routes/recruitmentRoutes';
import privacySettingsRoutes from './routes/privacySettingsRoutes';
import fileRoutes from './routes/fileRoutes';
import evidenceRoutes from './routes/evidenceRoutes';
import exportRoutes from './routes/exportRoutes';
import externalNeedRoutes from './routes/externalNeedRoutes';
import autosustentoBranchRoutes from './routes/autosustentoBranchRoutes';
import autosustentoIdeaRoutes from './routes/autosustentoIdeaRoutes';
import sustainabilityCycleRoutes from './routes/sustainabilityCycleRoutes';
import branchOsLedgerRoutes from './routes/branchOsLedgerRoutes';
import berryFlowRoutes from './routes/berryFlowRoutes';
import insightRoutes from './routes/insightRoutes';
import externalCandidateRoutes from './routes/externalCandidateRoutes';
import financingRoutes from './routes/financingRoutes';
import receiptRoutes from './routes/receiptRoutes';
import publicRoutes from './routes/publicRoutes';
import pingRoutes from './routes/pingRoutes';
import { listMyEvaluations } from './controllers/externalCandidateController';
import { startCronJobs } from './cron/weeklyResolution';
import { startMonthlyJob } from './cron/monthlyEconomy';
import { startMaterialFallbackJob } from './cron/materialFallback';
import { startXpDecayCron } from './cron/xpDecay';
import { startCorruptionCheckCron } from './cron/corruptionCheck';
import { startSkillPercentileCron } from './cron/skillPercentile';
import { startTaskMatcherCron } from './cron/taskMatcherCron';
import { startAIExecutorCron } from './cron/aiExecutorCron';
import { startMonthlyNeedPointsCron } from './cron/monthlyNeedPointsCron';
import { startCareerPathGraphCron } from './cron/careerPathGraphCron';
import { startSubscriptionCron } from './cron/subscriptionCron';
import aiTaskRoutes from './routes/aiTaskRoutes';
import aiExecutorRoutes from './routes/aiExecutorRoutes';
import aiReputationRoutes from './routes/aiReputationRoutes';
import { aiLeaderboard } from './controllers/aiReputationController';
import conciergeRoutes from './routes/conciergeRoutes';
import trustCoreRoutes from './routes/trustCoreRoutes';
import careerPathRoutes from './routes/careerPathRoutes';
import byoRoutes from './routes/byoRoutes';
import billingRoutes from './routes/billingRoutes';
import { stripeWebhook, paddleWebhook, createCheckout, cancelSubscription, currentCost, mySubscription } from './controllers/billingController';
import modelRoutes from './routes/modelRoutes';
import inferenceRoutes from './routes/inferenceRoutes';
import finetuneRoutes from './routes/finetuneRoutes';

const app = express();
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

// Public routes BEFORE global CORS
app.use('/api/public', publicRoutes);

// Stripe webhook: raw body BEFORE JSON parser (Stripe signature verification)
app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Paddle webhook: raw body BEFORE JSON parser (Paddle signature verification)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), paddleWebhook);

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

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
  res.json({ status: 'ok', message: 'Trust Lite API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trees', treeRoutes);
app.use('/api/needs', needRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/deliverables', deliverableRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fiat', fiatRoutes);
app.use('/api/fiat-transactions', fiatTransactionRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/plantillas', plantillaRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/p2p', p2pRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/privacy-settings', privacySettingsRoutes);
app.use('/api/exports', exportRoutes);

// ── Billing — mounted BEFORE /api catch-all routers ──
app.use('/api/billing', billingRoutes);

app.use('/api/ping', pingRoutes);

app.use('/api', autosustentoBranchRoutes);
app.use('/api', autosustentoIdeaRoutes);
app.use('/api', sustainabilityCycleRoutes);
app.use('/api', branchOsLedgerRoutes);
app.use('/api', berryFlowRoutes);
app.use('/api', insightRoutes);
app.use('/api/external-candidates', externalCandidateRoutes);
app.use('/api/trees/:id/financing', authenticateJWT, financingRoutes);
app.use('/api/payments', authenticateJWT, receiptRoutes);
app.use('/api/ping', pingRoutes);
app.get('/api/evaluations/mine', authenticateJWT, listMyEvaluations);
app.use('/api', externalNeedRoutes);
app.use('/api/trees/:treeId', authenticateJWT, aiTaskRoutes);
app.use('/api/ai', aiExecutorRoutes);
app.use('/api/ai', authenticateJWT, aiReputationRoutes);
app.get('/api/trees/:id/ai/leaderboard', authenticateJWT, aiLeaderboard);
app.use('/api/concierge', conciergeRoutes);
app.use('/api', trustCoreRoutes);
app.use('/api/career-path', careerPathRoutes);
app.use('/api/byo', authenticateJWT, byoRoutes);

app.use('/api/models', modelRoutes);
app.use('/api/inference', inferenceRoutes);
app.use('/api/finetune', authenticateJWT, finetuneRoutes);

startCronJobs();
startMonthlyJob();
startMaterialFallbackJob();
startXpDecayCron();
startCorruptionCheckCron();
startSkillPercentileCron();
startTaskMatcherCron();
startAIExecutorCron();
startMonthlyNeedPointsCron();
startCareerPathGraphCron();
startSubscriptionCron();

bootstrapDatabase().then(() => {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
  });
});
