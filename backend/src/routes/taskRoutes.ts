import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createTask, getTasks, getTask, getTaskEvidence, submitEvidence, routeTaskEndpoint, verifyTask, disputeTask, previewSplit } from '../controllers/taskController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// ── Multer: evidence file upload ──────────────────────────────────────────────
const uploadsDir = path.resolve(__dirname, '../../uploads');

const evidenceStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Sanitize taskId: only allow alphanumeric + hyphens (UUID-safe)
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || 'unknown');
    const taskId = rawId.replace(/[^a-zA-Z0-9-]/g, '');
    const dir = path.join(uploadsDir, 'evidence', taskId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}_${safeName}`);
  },
});

const ALLOWED_EVIDENCE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
]);

const uploadEvidence = multer({
  storage: evidenceStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_EVIDENCE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Formatos aceptados: JPG, PNG, WEBP, PDF, ZIP (máx 10MB)'));
    }
  },
});

// POST /api/tasks — create task (auto-evaluates difficulty + routes via TaskRouter)
router.post('/', authenticateJWT, createTask);

// POST /api/tasks/:id/route — manual re-routing (JWT required)
router.post('/:id/route', authenticateJWT, routeTaskEndpoint);

// POST /api/tasks/:id/evidence — submit photo/document evidence
router.post('/:id/evidence', authenticateJWT, uploadEvidence.single('evidence'), submitEvidence);

// POST /api/tasks/:id/verify — verify task, assign XP based on complexity
router.post('/:id/verify', authenticateJWT, verifyTask);

// POST /api/tasks/:id/dispute — dispute a task's evidence (tree members only)
router.post('/:id/dispute', authenticateJWT, disputeTask);

// GET /api/tasks/:id/split-preview — preview payment split before verification
router.get('/:id/split-preview', authenticateJWT, previewSplit);

// GET /api/tasks — list tasks (filter by treeId, status, assignedTo)
router.get('/', authenticateJWT, getTasks);

// GET /api/tasks/:id/evidence — download evidence file (tree members only)
router.get('/:id/evidence', authenticateJWT, getTaskEvidence);

// GET /api/tasks/:id — get single task
router.get('/:id', authenticateJWT, getTask);

export default router;
