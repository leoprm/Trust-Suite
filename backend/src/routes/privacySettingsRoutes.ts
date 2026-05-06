import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { getMyPrivacySettings, updateMyPrivacySettings } from '../controllers/privacySettingsController';

const router = Router();

router.use(authenticateJWT);

router.get('/me', getMyPrivacySettings);
router.put('/me', updateMyPrivacySettings);

export default router;
