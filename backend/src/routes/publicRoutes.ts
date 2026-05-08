import { Router } from 'express';
import cors from 'cors';
import { optionalAuth } from '../middleware/authMiddleware';
import { getPublicMetrics } from '../controllers/publicController';

const router = Router();

// Permissive CORS: landing page is standalone — allow any origin
router.use(cors({ origin: true, methods: ['GET', 'OPTIONS'], credentials: false }));

// optionalAuth: req.user may be undefined — endpoint works for both guests and authenticated users
router.get('/metrics', optionalAuth, getPublicMetrics);

export default router;
