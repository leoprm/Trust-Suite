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
import ideaRoutes from './routes/ideaRoutes';
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
import eventLogRoutes from './routes/eventLogRoutes';
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
import expertEndorsementRoutes from './routes/expertEndorsementRoutes';
import externalCandidateRoutes from './routes/externalCandidateRoutes';
import publicRoutes from './routes/publicRoutes';
import { listMyEvaluations } from './controllers/externalCandidateController';
import { startCronJobs } from './cron/weeklyResolution';
import { startMonthlyJob } from './cron/monthlyEconomy';
import { startMaterialFallbackJob } from './cron/materialFallback';
import { startXpDecayCron } from './cron/xpDecay';
import { startCorruptionCheckCron } from './cron/corruptionCheck';
import { startSkillPercentileCron } from './cron/skillPercentile';
import { startSkillInfluenceCron } from './cron/skillInfluenceCron';
import { startQuorumTimeoutCron } from './cron/quorumTimeoutCron';
import { getInfluenceWeight, getTreeInfluences } from './services/skillInfluenceService';

const app = express();
const port = process.env.PORT || 3000;
export const prisma = new PrismaClient();

// ── Database Bootstrap ────────────────────────────────────────────────────────
// Reads ../database/init.sql and executes it against MySQL to ensure all tables
// exist. Safe to run on every startup (uses CREATE TABLE IF NOT EXISTS).
// In Docker, this file will be mounted as the MySQL init script instead.
// ──────────────────────────────────────────────────────────────────────────────
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

    // Split: CREATE TABLE section (safe as batch) vs ALTER TABLE FK section (run individually)
    const fkMarker = '-- FOREIGN KEYS';
    const markerIdx = fullSql.indexOf(fkMarker);

    if (markerIdx === -1) {
      // No FK section — execute everything as one batch
      await conn.query(fullSql);
    } else {
      // Execute CREATE TABLE batch
      const createSection = fullSql.substring(0, markerIdx);
      await conn.query(createSection);

      // Execute FK ALTER TABLEs individually, ignoring "already exists" errors
      const fkSection = fullSql.substring(markerIdx);
      const fkStatements = fkSection
        .split(';')
        .map(s => s.trim())
        .filter(s => s.toUpperCase().startsWith('ALTER TABLE'));

      for (const stmt of fkStatements) {
        try {
          await conn.query(stmt);
        } catch (fkErr: any) {
          // errno 1005 = Can't create table (FK already exists), 1826 = Duplicate FK name — safe to ignore
          if (fkErr.errno !== 1826 && fkErr.errno !== 121 && fkErr.errno !== 1005) {
            console.warn('[DB Bootstrap] FK warning:', fkErr.message);
          }
        }
      }
    }

    await conn.end();
    console.log('[DB Bootstrap] init.sql executed successfully — schema verified.');
  } catch (err: any) {
    // Non-fatal: Prisma may still work if tables already exist
    console.error('[DB Bootstrap] Warning:', err.message || err);
  }
}

logCorsConfiguration();

// Production safety guard: refuse to start with empty CORS allowlist
if (isProduction && allowedOrigins.length === 0 && !allowAllInDev) {
  console.error('[CORS] FATAL: production mode requires CORS_ALLOWED_ORIGINS to be set.');
  console.error('[CORS] Add CORS_ALLOWED_ORIGINS=https://your-domain.com to your .env file.');
  process.exit(1);
}

// Public routes BEFORE global CORS — permissive origins for standalone landing page
// The public routes router has its own cors({ origin: true }) so any origin is allowed.
// It must be mounted first so the response is sent before global corsOptions runs.
app.use('/api/public', publicRoutes);

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

// Security headers (production-ready)
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

// Uploads are intentionally not served as public static files.
// Evidence files must go through /api/files/:fileId for permission checks.
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
app.use('/api/ideas', ideaRoutes);
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
app.use('/api/event-logs', eventLogRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api', autosustentoBranchRoutes);
app.use('/api', autosustentoIdeaRoutes);
app.use('/api', sustainabilityCycleRoutes);
app.use('/api', branchOsLedgerRoutes);
app.use('/api', berryFlowRoutes);
app.use('/api', insightRoutes);
app.use('/api/expert-endorsements', expertEndorsementRoutes);
app.use('/api/external-candidates', externalCandidateRoutes);
app.get('/api/evaluations/mine', authenticateJWT, listMyEvaluations);
app.get('/api/trees/:treeId/influence', authenticateJWT, async (req: any, res: any) => {
  try {
    const influences = await getTreeInfluences(req.params.treeId);
    res.json(influences);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch influences' });
  }
});
app.get('/api/trees/:treeId/influence/:skillTag', authenticateJWT, async (req: any, res: any) => {
  try {
    const weight = await getInfluenceWeight(req.params.treeId, req.params.skillTag);
    res.json({ treeId: req.params.treeId, skillTag: req.params.skillTag, finalInfluence: weight });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch influence' });
  }
});
app.use('/api', externalNeedRoutes);

startCronJobs();
startMonthlyJob();
startMaterialFallbackJob();
startXpDecayCron();
startCorruptionCheckCron();
startSkillPercentileCron();
startSkillInfluenceCron();
startQuorumTimeoutCron();

// Bootstrap database schema, then start server
bootstrapDatabase().then(() => {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
  });
});
