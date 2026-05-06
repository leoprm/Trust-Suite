import { Router } from 'express';
import { getSuggestedHashtags, searchProviders, createRequestTask } from '../controllers/discoveryController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/hashtags', getSuggestedHashtags);
router.get('/providers', searchProviders);
router.post('/request', createRequestTask);

export default router;
