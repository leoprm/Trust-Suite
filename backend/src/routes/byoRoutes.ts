import { Router } from 'express';
import { createKey, listKeys, deleteKey, decryptKey } from '../controllers/byoController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// POST /api/byo/keys — create a new BYO API key
router.post('/keys', authenticateJWT, createKey);

// GET /api/byo/keys — list user's BYO API keys (masked)
router.get('/keys', authenticateJWT, listKeys);

// GET /api/byo/keys/:id/decrypt — reveal full decrypted key
router.get('/keys/:id/decrypt', authenticateJWT, decryptKey);

// DELETE /api/byo/keys/:id — delete a key
router.delete('/keys/:id', authenticateJWT, deleteKey);

export default router;
