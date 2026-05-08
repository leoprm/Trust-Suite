import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { exportMyProfile, exportTreeData, exportTreePdf } from '../controllers/exportController';

const router = Router();

router.use(authenticateJWT);

router.get('/me/profile', exportMyProfile);
router.get('/tree/:treeId', exportTreeData);
router.get('/tree/:treeId/pdf', exportTreePdf);

export default router;
