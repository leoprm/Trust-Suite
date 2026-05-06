import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { exportMyProfile, exportTreeData } from '../controllers/exportController';

const router = Router();

router.use(authenticateJWT);

router.get('/me/profile', exportMyProfile);
router.get('/tree/:treeId', exportTreeData);

export default router;
