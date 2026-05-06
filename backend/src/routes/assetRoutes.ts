import { Router } from 'express';
import { addAssetFund } from '../controllers/assetController';
import { authenticateJWT, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

// Only admins or special configured users might add assets, or any user. Let's allow any member to contribute.
router.post('/', addAssetFund);

export default router;
